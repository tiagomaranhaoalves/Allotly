import { describe, it, expect } from "vitest";
import express from "express";
import http from "http";
import { mountMcp } from "../../server/lib/mcp/server";

function makeApp() {
  const app = express();
  app.use(express.json());
  mountMcp(app, "/mcp");
  return app;
}

async function rpc(server: http.Server, body: any, headers: Record<string, string> = {}): Promise<any> {
  const addr = server.address() as any;
  const port = addr.port;
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: "POST",
      host: "127.0.0.1",
      port,
      path: "/mcp",
      headers: { "Content-Type": "application/json", ...headers },
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Bad JSON: ${data}`)); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

describe("mcp transport: initialize + tools/list", () => {
  it("responds to initialize with our protocol version + capabilities", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
      expect(r.status).toBe(200);
      expect(r.headers["x-allotly-mcp-version"]).toBe("1.0.0");
      expect(r.headers["cache-control"]).toBe("no-store");
      expect(r.body.result.serverInfo.name).toBe("allotly-mcp");
      expect(r.body.result.capabilities.tools).toBeDefined();
      expect(r.body.result.capabilities.prompts).toBeDefined();
      expect(r.body.result.capabilities.resources).toBeDefined();
    } finally {
      server.close();
    }
  });

  it("tools/list returns 13 tools with input schemas", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      expect(r.body.result.tools).toHaveLength(13);
      for (const t of r.body.result.tools) {
        expect(t.name).toBeTruthy();
        expect(t.description).toBeTruthy();
        expect(t.inputSchema).toBeTruthy();
      }
    } finally {
      server.close();
    }
  });

  it("tools/list includes MCP 2025-03-26 annotations on every tool", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 99, method: "tools/list", params: {} });
      const tools: Array<{ name: string; annotations?: any }> = r.body.result.tools;
      const expectedTitles: Record<string, string> = {
        chat: "Chat with an AI model",
        compare_models: "Compare outputs from multiple models",
        list_available_models: "List available AI models",
        recommend_model: "Recommend the best model for a task",
        diagnose: "Diagnose proxy or routing issues",
        my_budget: "View remaining budget",
        my_recent_usage: "View recent usage history",
        my_status: "View account status, budget, and limits",
        quickstart: "Get a quickstart guide",
        redeem_and_chat: "Redeem a voucher and chat in one call",
        redeem_voucher: "Redeem an Allotly voucher",
        request_topup: "Request a budget top-up",
        voucher_info: "Look up voucher details",
      };
      for (const t of tools) {
        expect(t.annotations, `tool ${t.name} missing annotations`).toBeDefined();
        expect(t.annotations.title, `tool ${t.name} missing title`).toBe(expectedTitles[t.name]);
        expect(typeof t.annotations.readOnlyHint).toBe("boolean");
        expect(typeof t.annotations.destructiveHint).toBe("boolean");
        expect(typeof t.annotations.idempotentHint).toBe("boolean");
        expect(typeof t.annotations.openWorldHint).toBe("boolean");
      }
    } finally {
      server.close();
    }
  });

  it("rejects tools/call without auth for protected tools", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "my_budget", arguments: {} } });
      expect(r.body.error.code).toBe(-32001);
    } finally {
      server.close();
    }
  });

  it("returns -32601 for unknown tool", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "no_such_tool", arguments: {} } });
      expect(r.body.error.code).toBe(-32601);
    } finally {
      server.close();
    }
  });
});
