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

function request(
  server: http.Server,
  method: "GET" | "POST" | "OPTIONS",
  headers: Record<string, string>,
  body?: any,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  const addr = server.address() as any;
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        method,
        host: "127.0.0.1",
        port: addr.port,
        path: "/mcp",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode || 0, headers: res.headers, body: data }));
      },
    );
    req.on("error", reject);
    if (body !== undefined) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

describe("mcp transport CORS — Origin allowlist", () => {
  it("OPTIONS with allowed Origin (claude.ai) → 204 + ACAO echoed", async () => {
    const server = makeApp().listen(0);
    try {
      const r = await request(server, "OPTIONS", {
        Origin: "https://claude.ai",
        "Access-Control-Request-Method": "POST",
      });
      expect(r.status).toBe(204);
      expect(r.headers["access-control-allow-origin"]).toBe("https://claude.ai");
      // res.vary("Origin") appends, so the value may include other tokens
      // from upstream middleware — assert the substring rather than equality.
      expect(r.headers["vary"]).toMatch(/Origin/);
      expect(r.headers["access-control-allow-methods"]).toContain("POST");
    } finally {
      server.close();
    }
  });

  it("OPTIONS with disallowed Origin (evil.example.com) → 204, no ACAO", async () => {
    const server = makeApp().listen(0);
    try {
      const r = await request(server, "OPTIONS", {
        Origin: "https://evil.example.com",
        "Access-Control-Request-Method": "POST",
      });
      expect(r.status).toBe(204);
      expect(r.headers["access-control-allow-origin"]).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("OPTIONS with no Origin (CLI client) → 204, no CORS headers", async () => {
    const server = makeApp().listen(0);
    try {
      const r = await request(server, "OPTIONS", {});
      expect(r.status).toBe(204);
      expect(r.headers["access-control-allow-origin"]).toBeUndefined();
      expect(r.headers["access-control-allow-methods"]).toBeUndefined();
    } finally {
      server.close();
    }
  });

  it("POST tools/list with allowed Origin → 200 + ACAO echoed", async () => {
    const server = makeApp().listen(0);
    try {
      const r = await request(
        server,
        "POST",
        { Origin: "https://claude.ai", "Content-Type": "application/json" },
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
      );
      expect(r.status).toBe(200);
      expect(r.headers["access-control-allow-origin"]).toBe("https://claude.ai");
      const parsed = JSON.parse(r.body);
      expect(Array.isArray(parsed.result.tools)).toBe(true);
    } finally {
      server.close();
    }
  });

  it("POST tools/list with no Origin → 200, no CORS headers, body still valid", async () => {
    const server = makeApp().listen(0);
    try {
      const r = await request(
        server,
        "POST",
        { "Content-Type": "application/json" },
        { jsonrpc: "2.0", id: 1, method: "tools/list" },
      );
      expect(r.status).toBe(200);
      expect(r.headers["access-control-allow-origin"]).toBeUndefined();
      const parsed = JSON.parse(r.body);
      expect(Array.isArray(parsed.result.tools)).toBe(true);
      expect(parsed.result.tools.length).toBeGreaterThan(0);
    } finally {
      server.close();
    }
  });

  it("all five allowed origins are echoed (claude.ai, www.claude.ai, chatgpt.com, www.chatgpt.com, gemini.google.com)", async () => {
    const server = makeApp().listen(0);
    try {
      const origins = [
        "https://claude.ai",
        "https://www.claude.ai",
        "https://chatgpt.com",
        "https://www.chatgpt.com",
        "https://gemini.google.com",
      ];
      for (const origin of origins) {
        const r = await request(server, "OPTIONS", {
          Origin: origin,
          "Access-Control-Request-Method": "POST",
        });
        expect(r.status, `OPTIONS ${origin}`).toBe(204);
        expect(r.headers["access-control-allow-origin"], `ACAO for ${origin}`).toBe(origin);
      }
    } finally {
      server.close();
    }
  });
});
