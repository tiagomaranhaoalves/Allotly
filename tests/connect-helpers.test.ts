import { describe, it, expect } from "vitest";
import {
  ALLOTLY_MCP_PACKAGE,
  ALLOTLY_MCP_URL,
  buildSnippet,
  buildAllSnippets,
  classifyTestResponse,
  cleanPrefix,
  isValidFullKey,
  maskKey,
  runTestConnection,
} from "../client/src/pages/dashboard/connect-helpers";

const SAMPLE_KEY = "allotly_sk_abc123def456ghi789XYZWkey";
const SAMPLE_PREFIX = "allotly_sk_abc123";

describe("maskKey", () => {
  it("masks middle and shows last 4", () => {
    expect(maskKey(SAMPLE_KEY)).toBe(`allotly_sk_•••••${SAMPLE_KEY.slice(-4)}`);
  });

  it("returns a generic placeholder when given empty input", () => {
    expect(maskKey("")).toBe("allotly_sk_•••••");
  });

  it("never includes the middle of the key", () => {
    const masked = maskKey(SAMPLE_KEY);
    expect(masked).not.toContain("abc123def456");
    expect(masked).not.toContain("ghi789");
  });
});

describe("isValidFullKey", () => {
  it("accepts a key whose prefix matches", () => {
    expect(isValidFullKey(SAMPLE_KEY, SAMPLE_PREFIX)).toBe(true);
  });

  it("rejects when the prefix does not match", () => {
    expect(isValidFullKey(SAMPLE_KEY, "allotly_sk_zzz999")).toBe(false);
  });

  it("rejects keys not starting with allotly_sk_", () => {
    expect(isValidFullKey("sk-openai-fake", SAMPLE_PREFIX)).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isValidFullKey("", SAMPLE_PREFIX)).toBe(false);
    expect(isValidFullKey(SAMPLE_KEY, "")).toBe(false);
  });

  it("matches against the server's stored prefix that ends with literal ellipsis", () => {
    // Server stores prefix as key.slice(0,15) + "..."
    const storedPrefix = "allotly_sk_Odra..."; // 15 + 3 dots
    const realKey = "allotly_sk_OdraXYZ123_abcdef";
    expect(isValidFullKey(realKey, storedPrefix)).toBe(true);
  });

  it("rejects a key whose stripped prefix differs", () => {
    const storedPrefix = "allotly_sk_Odra...";
    const wrongKey = "allotly_sk_NotMatchingZZZ";
    expect(isValidFullKey(wrongKey, storedPrefix)).toBe(false);
  });
});

describe("cleanPrefix", () => {
  it("strips trailing dots from the stored prefix", () => {
    expect(cleanPrefix("allotly_sk_Odra...")).toBe("allotly_sk_Odra");
  });
  it("leaves a clean prefix unchanged", () => {
    expect(cleanPrefix("allotly_sk_abc123")).toBe("allotly_sk_abc123");
  });
  it("strips arbitrary numbers of trailing dots", () => {
    expect(cleanPrefix("allotly_sk_Odra....")).toBe("allotly_sk_Odra");
  });
});

describe("buildSnippet", () => {
  it("injects the key into the Cursor snippet (Bearer token)", () => {
    const out = buildSnippet("cursor", { key: SAMPLE_KEY });
    expect(out).toContain(`"Authorization": "Bearer ${SAMPLE_KEY}"`);
    expect(out).toContain(`"url": "${ALLOTLY_MCP_URL}"`);
  });

  it("injects the key into the VS Code snippet with type=http", () => {
    const out = buildSnippet("vscode", { key: SAMPLE_KEY });
    expect(out).toContain(`"Authorization": "Bearer ${SAMPLE_KEY}"`);
    expect(out).toContain(`"type": "http"`);
  });

  it("emits a single-line claude mcp add command for Claude Code", () => {
    const out = buildSnippet("claudeCode", { key: SAMPLE_KEY });
    expect(out).toContain("claude mcp add --transport http allotly");
    expect(out).toContain(`Authorization: Bearer ${SAMPLE_KEY}`);
    expect(out).toContain(ALLOTLY_MCP_URL);
  });

  it("uses the @allotly/mcp bridge for Claude Desktop with ALLOTLY_KEY env", () => {
    const out = buildSnippet("claudeDesktop", { key: SAMPLE_KEY });
    expect(out).toContain(`${ALLOTLY_MCP_PACKAGE}@latest`);
    expect(out).toContain(`"ALLOTLY_KEY": "${SAMPLE_KEY}"`);
    expect(out).toContain(`"command": "npx"`);
  });

  it("emits a TOML config block for OpenAI Codex with HTTP transport + Bearer header", () => {
    const out = buildSnippet("codex", { key: SAMPLE_KEY });
    expect(out).toContain("~/.codex/config.toml");
    expect(out).toContain("[mcp_servers.allotly]");
    expect(out).toContain(`url = "${ALLOTLY_MCP_URL}"`);
    expect(out).toContain(`http_headers = { "Authorization" = "Bearer ${SAMPLE_KEY}" }`);
  });

  it("buildAllSnippets returns one snippet per connector (5 connectors incl. Codex)", () => {
    const all = buildAllSnippets({ key: SAMPLE_KEY });
    expect(Object.keys(all).sort()).toEqual(
      ["claudeCode", "claudeDesktop", "codex", "cursor", "vscode"].sort(),
    );
    for (const v of Object.values(all)) {
      expect(v).toContain(SAMPLE_KEY);
    }
  });

  it("substitutes a placeholder when key is the placeholder string", () => {
    const placeholder = "<paste-your-allotly-key>";
    const out = buildSnippet("cursor", { key: placeholder });
    expect(out).toContain(`Bearer ${placeholder}`);
  });

  it("accepts a voucher code as the bearer (used in pre-redemption email snippets)", () => {
    const voucher = "ALLOT-1234-5678-9ABC";
    const cursor = buildSnippet("cursor", { key: voucher });
    const claudeDesktop = buildSnippet("claudeDesktop", { key: voucher });
    expect(cursor).toContain(`"Authorization": "Bearer ${voucher}"`);
    // The Claude Desktop snippet uses the npm bridge; the voucher rides ALLOTLY_KEY.
    expect(claudeDesktop).toContain(`"ALLOTLY_KEY": "${voucher}"`);
  });
});

describe("classifyTestResponse", () => {
  function mockResponse(status: number, body: unknown): {
    status: number;
    json: () => Promise<unknown>;
  } {
    return { status, json: async () => body };
  }

  it("returns green with the tool count for a successful tools/list", async () => {
    const res = mockResponse(200, {
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "list_models" }, { name: "get_budget" }] },
    });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("green");
    expect(out.toolCount).toBe(2);
  });

  it("returns red on HTTP 401", async () => {
    const res = mockResponse(401, { error: "unauthorized" });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("red");
    expect(out.httpStatus).toBe(401);
  });

  it("returns red on JSON-RPC error code -32001", async () => {
    const res = mockResponse(200, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32001, message: "Invalid key" },
    });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("red");
  });

  it("returns yellow on a non-key JSON-RPC error (server-side problem)", async () => {
    const res = mockResponse(200, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32603, message: "Internal error" },
    });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("yellow");
    expect(out.errorMessage).toBe("rpc_server_error");
  });

  it("returns red on JSON-RPC -32002 (auth-related)", async () => {
    const res = mockResponse(200, {
      jsonrpc: "2.0",
      id: 1,
      error: { code: -32002, message: "Key revoked" },
    });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("red");
    expect(out.errorMessage).toBe("rpc_key_error");
  });

  it("returns yellow on unexpected response shape (server payload, not a key issue)", async () => {
    const res = mockResponse(200, { hello: "world" });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("yellow");
    expect(out.errorMessage).toBe("unexpected_shape");
  });

  it("returns yellow on invalid JSON body (transport/server problem)", async () => {
    const res = {
      status: 200,
      json: async () => {
        throw new Error("not json");
      },
    };
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("yellow");
    expect(out.errorMessage).toBe("invalid_json");
  });

  it("returns yellow on HTTP 500 (server error, not a key issue)", async () => {
    const res = mockResponse(503, { error: "service unavailable" });
    const out = await classifyTestResponse(res);
    expect(out.state).toBe("yellow");
    expect(out.errorMessage).toBe("server_error");
    expect(out.httpStatus).toBe(503);
  });
});

describe("runTestConnection", () => {
  it("returns yellow on a network failure (fetch throws)", async () => {
    const fakeFetch: any = async () => {
      throw new Error("Failed to fetch");
    };
    const out = await runTestConnection(SAMPLE_KEY, fakeFetch);
    expect(out.state).toBe("yellow");
    expect(out.errorMessage).toMatch(/Failed to fetch/);
  });

  it("forwards the Bearer token in the Authorization header", async () => {
    let captured: any = null;
    const fakeFetch: any = async (_url: string, init: RequestInit) => {
      captured = init;
      return {
        status: 200,
        json: async () => ({ result: { tools: [] } }),
      };
    };
    const out = await runTestConnection(SAMPLE_KEY, fakeFetch);
    expect(out.state).toBe("green");
    expect((captured.headers as any).Authorization).toBe(`Bearer ${SAMPLE_KEY}`);
    expect(captured.method).toBe("POST");
    const parsed = JSON.parse(captured.body as string);
    expect(parsed.method).toBe("tools/list");
    expect(parsed.jsonrpc).toBe("2.0");
  });

  it("hits the allotly.ai/mcp URL by default", async () => {
    let calledUrl: string | null = null;
    const fakeFetch: any = async (url: string) => {
      calledUrl = url;
      return { status: 200, json: async () => ({ result: { tools: [] } }) };
    };
    await runTestConnection(SAMPLE_KEY, fakeFetch);
    expect(calledUrl).toBe(ALLOTLY_MCP_URL);
  });
});
