import { describe, it, expect } from "vitest";
import { protectedResourceHandler } from "../../server/lib/oauth/protected-resource";
import { OAUTH_ISSUER } from "../../server/lib/oauth/jwt";
import { MCP_AUDIENCE, SUPPORTED_SCOPES } from "../../server/lib/oauth/scopes";

function mockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
    json(b: any) { this.body = b; return this; },
    send(b: any) { this.body = b; return this; },
  };
  return res;
}

describe("oauth: protected-resource (RFC 9728) discovery", () => {
  it("returns the locked resource-metadata document at HTTP 200", () => {
    const res = mockRes();
    protectedResourceHandler({} as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("application/json");
    expect(res.headers["cache-control"]).toBe("public, max-age=3600");

    expect(res.body.resource).toBe(MCP_AUDIENCE);
    expect(res.body.resource).toBe("https://allotly.ai/mcp");
    expect(res.body.authorization_servers).toEqual([OAUTH_ISSUER]);
    expect(res.body.authorization_servers).toEqual(["https://allotly.ai"]);
    expect(res.body.scopes_supported).toEqual([...SUPPORTED_SCOPES]);
    expect(res.body.scopes_supported).toEqual(["mcp", "mcp:read"]);
    expect(res.body.bearer_methods_supported).toEqual(["header"]);
    expect(res.body.resource_documentation).toBe("https://allotly.ai/docs");
  });
});
