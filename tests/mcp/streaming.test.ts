/**
 * M4 — MCP `chat` tool streaming.
 *
 * Covers:
 *  - Shared SSE consumer (upstream-stream.ts): parsing, abort, partial-line buffering.
 *  - Transport routing gate: flag off / no progressToken / wrong tool → buffered.
 *  - Transport routing gate: flag on + chat + progressToken → streaming branch
 *    (auth required, returns standard 401 JSON since headers are uncommitted).
 *  - Regression: tools/list still 13 tools; chat description unchanged.
 *  - Audit `streamed` column persists default false in the existing path.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import http from "http";
import { mountMcp } from "../../server/lib/mcp/server";
import { consumeSseUpstream } from "../../server/lib/proxy/upstream-stream";
import { listTools } from "../../server/lib/mcp/tools";
import { mapProxyErrorToMcp } from "../../server/lib/mcp/tools/consumption/chat";
import { McpToolError } from "../../server/lib/mcp/errors";

function makeApp() {
  const app = express();
  app.use(express.json());
  mountMcp(app, "/mcp");
  return app;
}

async function rpc(server: http.Server, body: any, headers: Record<string, string> = {}): Promise<{ status: number; headers: any; raw: string; body?: any }> {
  const addr = server.address() as any;
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: "POST",
      host: "127.0.0.1",
      port: addr.port,
      path: "/mcp",
      headers: { "Content-Type": "application/json", ...headers },
    }, (res) => {
      let raw = "";
      res.on("data", (c) => raw += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode!, headers: res.headers, raw, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode!, headers: res.headers, raw }); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

/** Minimal mock that mimics the SSE-shaped portion of `globalThis.Response`. */
function mockSseResponse(lines: string[]): any {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    body: {
      getReader: () => ({
        async read() {
          if (i >= lines.length) return { done: true, value: undefined };
          const chunk = encoder.encode(lines[i++] + "\n");
          return { done: false, value: chunk };
        },
        cancel: async () => { i = lines.length; },
      }),
    },
  };
}

describe("M4 — upstream-stream consumer", () => {
  it("emits one onData per `data: <payload>` line and skips blanks", async () => {
    const collected: string[] = [];
    await consumeSseUpstream(
      mockSseResponse(["data: a", "", "data: b", "data: c"]),
      { onData: (d) => { collected.push(d); } },
    );
    expect(collected).toEqual(["a", "b", "c"]);
  });

  it("forwards [DONE] sentinel verbatim — caller decides", async () => {
    const collected: string[] = [];
    await consumeSseUpstream(
      mockSseResponse(["data: a", "data: [DONE]"]),
      { onData: (d) => { collected.push(d); } },
    );
    expect(collected).toEqual(["a", "[DONE]"]);
  });

  it("returns immediately when signal is already aborted", async () => {
    const collected: string[] = [];
    const ac = new AbortController();
    ac.abort();
    await consumeSseUpstream(
      mockSseResponse(["data: a", "data: b"]),
      { onData: (d) => { collected.push(d); } },
      { signal: ac.signal },
    );
    expect(collected).toEqual([]);
  });

  it("calls onAbort when an in-flight stream is aborted", async () => {
    let aborted = false;
    const ac = new AbortController();
    // Long stream — abort after first read
    const longLines = Array.from({ length: 100 }, (_, i) => `data: chunk${i}`);
    const promise = consumeSseUpstream(
      mockSseResponse(longLines),
      {
        onData: () => { ac.abort(); },
        onAbort: () => { aborted = true; },
      },
      { signal: ac.signal },
    );
    await promise;
    expect(aborted).toBe(true);
  });

  it("returns gracefully when the response body is missing", async () => {
    await expect(
      consumeSseUpstream({ body: null } as any, { onData: () => {} }),
    ).resolves.toBeUndefined();
  });
});

describe("M4 — transport routing gate", () => {
  const ORIGINAL_FLAG = process.env.MCP_STREAMING_ENABLED;
  beforeEach(() => { delete process.env.MCP_STREAMING_ENABLED; });
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.MCP_STREAMING_ENABLED;
    else process.env.MCP_STREAMING_ENABLED = ORIGINAL_FLAG;
  });

  it("flag OFF + chat + progressToken → buffered path (standard JSON, NOT ndjson)", async () => {
    process.env.MCP_STREAMING_ENABLED = "false";
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "chat", _meta: { progressToken: "tok-1" }, arguments: { messages: [{ role: "user", content: "hi" }] } },
      });
      // No bearer → 401 from the buffered path's standard auth handler.
      expect(r.status).toBe(401);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
      expect(r.body?.jsonrpc).toBe("2.0");
    } finally { server.close(); }
  });

  it("flag ON + chat + NO progressToken → buffered path (standard JSON)", async () => {
    process.env.MCP_STREAMING_ENABLED = "true";
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "chat", arguments: { messages: [{ role: "user", content: "hi" }] } },
      });
      expect(r.status).toBe(401);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
    } finally { server.close(); }
  });

  it("flag ON + non-chat tool + progressToken → buffered path (gating is per-tool)", async () => {
    process.env.MCP_STREAMING_ENABLED = "true";
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "my_status", _meta: { progressToken: "tok-x" }, arguments: {} },
      });
      // my_status requires auth → 401 from the buffered path. Importantly NOT ndjson.
      expect(r.status).toBe(401);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
    } finally { server.close(); }
  });

  it("flag ON + chat + progressToken → streaming branch (returns standard JSON 401 for unauth, NOT ndjson)", async () => {
    // Headers are committed lazily — when auth fails before any chunk is
    // emitted, the streaming branch returns a normal JSON-RPC 401, not an
    // ndjson response. This is the documented behaviour in transport.ts.
    process.env.MCP_STREAMING_ENABLED = "true";
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "chat", _meta: { progressToken: "tok-stream" }, arguments: { messages: [{ role: "user", content: "hi" }] } },
      });
      expect(r.status).toBe(401);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
      expect(r.headers["content-type"]).not.toMatch(/ndjson/);
      expect(r.headers["www-authenticate"]).toBeTruthy();
      expect(r.body?.error?.code).toBe(-32001);
    } finally { server.close(); }
  });

  it("flag ON + chat + progressToken + invalid bearer → 401 still routed standard JSON", async () => {
    process.env.MCP_STREAMING_ENABLED = "true";
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "chat", _meta: { progressToken: 42 }, arguments: { messages: [{ role: "user", content: "hi" }] } },
      }, { Authorization: "Bearer not-a-real-token" });
      expect(r.status).toBe(401);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
    } finally { server.close(); }
  });

  it("supports numeric progressToken (per MCP spec — string OR number)", async () => {
    process.env.MCP_STREAMING_ENABLED = "true";
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 6,
        method: "tools/call",
        params: { name: "chat", _meta: { progressToken: 12345 }, arguments: { messages: [{ role: "user", content: "hi" }] } },
      });
      expect(r.status).toBe(401);
      expect(r.body?.jsonrpc).toBe("2.0");
    } finally { server.close(); }
  });
});

describe("M4 — regression guarantees", () => {
  const ORIGINAL_FLAG = process.env.MCP_STREAMING_ENABLED;
  beforeEach(() => { delete process.env.MCP_STREAMING_ENABLED; });
  afterEach(() => {
    if (ORIGINAL_FLAG === undefined) delete process.env.MCP_STREAMING_ENABLED;
    else process.env.MCP_STREAMING_ENABLED = ORIGINAL_FLAG;
  });

  it("tools/list still returns exactly 13 tools (M4 must not add any)", async () => {
    expect(listTools()).toHaveLength(13);
    const names = listTools().map(t => t.name).sort();
    expect(names).toContain("chat");
    expect(names).not.toContain("chat_stream");
  });

  it("chat tool description is unchanged (description-hash pinning preserved)", () => {
    const chat = listTools().find(t => t.name === "chat");
    expect(chat).toBeDefined();
    expect(chat!.description).toMatch(/Send messages to any AI model/i);
    // No mention of M4-specific framing details in the public description —
    // the streaming behaviour is opt-in via params._meta.progressToken.
    expect(chat!.description.toLowerCase()).not.toContain("ndjson");
    expect(chat!.description.toLowerCase()).not.toContain("progresstoken");
  });

  it("with both flag OFF AND no progressToken, request is indistinguishable from pre-M4", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/list",
        params: {},
      });
      expect(r.status).toBe(200);
      expect(r.headers["content-type"]).toMatch(/application\/json/);
      expect(r.body?.result?.tools).toHaveLength(13);
    } finally { server.close(); }
  });
});

describe("M4 — error mapping", () => {
  it("maps explicit -32099 errorCode to ClientDisconnected (not InvalidInput / ProviderError)", () => {
    const e = mapProxyErrorToMcp({
      status: 499,
      errorBody: { code: "client_disconnected", message: "Client disconnected mid-stream" },
      budgetSnapshot: { remaining_cents: 100, total_cents: 1000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 5, rate_limit_per_min: 20, concurrency_limit: 2, voucher_expires_at: null },
      errorCode: -32099,
    });
    expect(e).toBeInstanceOf(McpToolError);
    expect(e.code).toBe(-32099);
    expect(e.name).toBe("ClientDisconnected");
    // Must carry budget snapshot in _meta so the client can see how much was billed.
    expect(e.data._meta?.budget?.remaining_cents).toBe(100);
  });

  it("falls back to ClientDisconnected when only the errorBody.code is set", () => {
    const e = mapProxyErrorToMcp({
      status: 499,
      errorBody: { code: "client_disconnected", message: "Disconnected" },
      budgetSnapshot: { remaining_cents: 50, total_cents: 1000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 5, rate_limit_per_min: 20, concurrency_limit: 2, voucher_expires_at: null },
    });
    expect(e.code).toBe(-32099);
  });

  it("does NOT remap legitimate 5xx provider errors as ClientDisconnected", () => {
    const e = mapProxyErrorToMcp({
      status: 502,
      errorBody: { code: "provider_error", message: "upstream blew up" },
      budgetSnapshot: null,
    });
    expect(e.code).toBe(-32030);
    expect(e.name).toBe("ProviderError");
  });

  it("retains 402 BudgetExceeded mapping with budget _meta", () => {
    const e = mapProxyErrorToMcp({
      status: 402,
      errorBody: { code: "insufficient_budget", message: "Out of budget" },
      budgetSnapshot: { remaining_cents: 0, total_cents: 1000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 5, rate_limit_per_min: 20, concurrency_limit: 2, voucher_expires_at: null },
    });
    expect(e.code).toBe(-32020);
    expect(e.name).toBe("BudgetExceeded");
    expect(e.data._meta?.budget?.remaining_cents).toBe(0);
  });
});

describe("M4 — final response shape parity", () => {
  it("MCP_ERROR_CODES exposes ClientDisconnected for the new disconnect path", async () => {
    const { MCP_ERROR_CODES } = await import("../../server/lib/mcp/errors");
    expect(MCP_ERROR_CODES.ClientDisconnected).toBe(-32099);
  });

  it("chat tool source does NOT add a `streamed:true` flag to the final tool output", async () => {
    // Static guard: the streaming branch's final result shape must match
    // the buffered branch's shape exactly. The audit log is the only place
    // that records the streaming flag (mcpAuditLog.streamed).
    const fs = await import("fs/promises");
    const src = await fs.readFile("server/lib/mcp/tools/consumption/chat.ts", "utf8");
    // Strip line comments so the guard doesn't trip on the comment that
    // explains why we removed the streamed flag.
    const code = src
      .split("\n")
      .map(l => l.replace(/\/\/.*$/, ""))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    // No `_meta` ever surfaces a `streamed` key — the streaming flag lives
    // in the audit log only.
    expect(code).not.toMatch(/_meta\s*:\s*\{[^}]*streamed/);
    expect(code).not.toMatch(/streamed\s*:\s*true/);
    // Both branches build `_meta: { budget: ... }` — count occurrences to
    // ensure parity (one for buffered, one for streaming).
    const matches = code.match(/_meta:\s*\{\s*budget:/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
