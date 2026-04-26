import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

process.env.OAUTH_JWT_SECRET = process.env.OAUTH_JWT_SECRET || crypto.randomBytes(32).toString("base64");

import { issueAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL_SECONDS, OAUTH_ISSUER } from "../../server/lib/oauth/jwt";
import { pkceS256Transform, verifyPkceS256, newAuthorizationCode, hashAuthorizationCode, newRefreshToken, hashRefreshToken } from "../../server/lib/oauth/pkce";
import { SUPPORTED_SCOPES, MCP_AUDIENCE, scopeIncludes, parseScopeString, normaliseScopes, isValidScopeSubset } from "../../server/lib/oauth/scopes";
import { hashClientSecret, compareClientSecret } from "../../server/lib/oauth/register";
import { discoveryHandler } from "../../server/lib/oauth/discovery";

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

describe("oauth: discovery metadata", () => {
  it("publishes RFC 8414 fields with the right values", () => {
    const res = mockRes();
    discoveryHandler({} as any, res);
    expect(res.statusCode).toBe(200);
    const meta = res.body;
    expect(meta.issuer).toBe(OAUTH_ISSUER);
    expect(meta.authorization_endpoint).toBe(`${OAUTH_ISSUER}/oauth/authorize`);
    expect(meta.token_endpoint).toBe(`${OAUTH_ISSUER}/oauth/token`);
    expect(meta.registration_endpoint).toBe(`${OAUTH_ISSUER}/oauth/register`);
    expect(meta.revocation_endpoint).toBe(`${OAUTH_ISSUER}/oauth/revoke`);
    expect(meta.code_challenge_methods_supported).toContain("S256");
    expect(meta.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
    expect(meta.response_types_supported).toContain("code");
    expect(meta.scopes_supported).toEqual(expect.arrayContaining(["mcp", "mcp:read"]));
    expect(res.headers["cache-control"]).toMatch(/max-age=/);
  });
});

describe("oauth: scopes", () => {
  it("treats mcp as a superset of mcp:read", () => {
    expect(scopeIncludes(["mcp"], "mcp:read")).toBe(true);
    expect(scopeIncludes(["mcp:read"], "mcp:read")).toBe(true);
    expect(scopeIncludes(["mcp:read"], "mcp")).toBe(false);
    expect(scopeIncludes([], "mcp:read")).toBe(false);
  });

  it("parses and normalises scope strings", () => {
    expect(parseScopeString("mcp mcp:read")).toEqual(["mcp", "mcp:read"]);
    expect(parseScopeString("")).toEqual([]);
    expect(normaliseScopes("mcp mcp:read")).toEqual(["mcp", "mcp:read"]);
    expect(normaliseScopes("bogus")).toEqual(["mcp"]);
    expect(normaliseScopes(undefined)).toEqual(["mcp"]);
  });

  it("rejects scopes outside the supported set", () => {
    expect(isValidScopeSubset(["mcp"], [...SUPPORTED_SCOPES])).toBe(true);
    expect(isValidScopeSubset(["mcp:write"], [...SUPPORTED_SCOPES])).toBe(false);
    expect(isValidScopeSubset([], [...SUPPORTED_SCOPES])).toBe(false);
  });

  it("publishes the canonical MCP audience identifier", () => {
    expect(MCP_AUDIENCE).toBe("https://allotly.ai/mcp");
  });
});

describe("oauth: PKCE S256", () => {
  it("verifies a known good verifier/challenge pair", () => {
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = pkceS256Transform(verifier);
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects a tampered verifier", () => {
    const verifier = crypto.randomBytes(48).toString("base64url");
    const challenge = pkceS256Transform(verifier);
    expect(verifyPkceS256(verifier + "x", challenge)).toBe(false);
    expect(verifyPkceS256("", challenge)).toBe(false);
    expect(verifyPkceS256(verifier, "")).toBe(false);
  });

  it("authorization code hash is sha256 hex of the raw code", () => {
    const { code, codeHash } = newAuthorizationCode();
    const expected = crypto.createHash("sha256").update(code).digest("hex");
    expect(codeHash).toBe(expected);
    expect(hashAuthorizationCode(code)).toBe(codeHash);
  });

  it("refresh token is hashed at rest, never stored raw", () => {
    const { token, tokenHash } = newRefreshToken();
    expect(token).not.toBe(tokenHash);
    expect(hashRefreshToken(token)).toBe(tokenHash);
    expect(tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("oauth: JWT access token", () => {
  it("round-trips a token and accepts the matching audience", () => {
    const { token, jti, claims } = issueAccessToken({
      userId: "u1",
      membershipId: "m1",
      clientId: "c1",
      scope: "mcp",
      resource: MCP_AUDIENCE,
    });
    expect(claims.iss).toBe(OAUTH_ISSUER);
    expect(claims.aud).toBe(MCP_AUDIENCE);
    expect(claims.exp - claims.iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(claims.jti).toBe(jti);

    const v = verifyAccessToken(token, { expectedAud: MCP_AUDIENCE });
    expect(v.ok).toBe(true);
    expect(v.claims?.sub).toBe("u1");
    expect(v.claims?.membership_id).toBe("m1");
    expect(v.claims?.client_id).toBe("c1");
    expect(v.claims?.scope).toBe("mcp");
  });

  it("rejects a token whose audience does not match /mcp", () => {
    const { token } = issueAccessToken({
      userId: "u1",
      membershipId: "m1",
      clientId: "c1",
      scope: "mcp",
      resource: "https://other.example/api",
    });
    const v = verifyAccessToken(token, { expectedAud: MCP_AUDIENCE });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("aud_mismatch");
  });

  it("rejects a token whose signature has been tampered", () => {
    const { token } = issueAccessToken({
      userId: "u1",
      membershipId: "m1",
      clientId: "c1",
      scope: "mcp",
      resource: MCP_AUDIENCE,
    });
    const parts = token.split(".");
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith("aa") ? "bb" : "aa");
    const tampered = parts.join(".");
    const v = verifyAccessToken(tampered, { expectedAud: MCP_AUDIENCE });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("bad_signature");
  });

  it("rejects an expired token", () => {
    const { token } = issueAccessToken({
      userId: "u1",
      membershipId: "m1",
      clientId: "c1",
      scope: "mcp",
      resource: MCP_AUDIENCE,
      ttlSeconds: -10,
    });
    const v = verifyAccessToken(token, { expectedAud: MCP_AUDIENCE });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("expired");
  });

  it("rejects a token with the wrong alg header (alg=none defence)", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: OAUTH_ISSUER, sub: "u1", aud: MCP_AUDIENCE, membership_id: "m1",
      client_id: "c1", scope: "mcp", jti: "x", iat: 0, exp: Math.floor(Date.now() / 1000) + 60,
    })).toString("base64url");
    const v = verifyAccessToken(`${header}.${payload}.`, { expectedAud: MCP_AUDIENCE });
    expect(v.ok).toBe(false);
    expect(v.reason).toBe("alg_mismatch");
  });

  it("rejects a malformed token", () => {
    expect(verifyAccessToken("not.a.jwt", {}).ok).toBe(false);
    expect(verifyAccessToken("", {}).ok).toBe(false);
    expect(verifyAccessToken("only.twoparts", {}).ok).toBe(false);
  });

  it("issues a unique jti per token", () => {
    const a = issueAccessToken({ userId: "u", membershipId: "m", clientId: "c", scope: "mcp", resource: MCP_AUDIENCE });
    const b = issueAccessToken({ userId: "u", membershipId: "m", clientId: "c", scope: "mcp", resource: MCP_AUDIENCE });
    expect(a.jti).not.toBe(b.jti);
  });
});

describe("oauth: client secret hashing", () => {
  it("verifies a correct secret and rejects a wrong one", async () => {
    const stored = await hashClientSecret("super-secret-123");
    expect(stored).toMatch(/^[a-f0-9]{128}\.[a-f0-9]{32}$/);
    expect(await compareClientSecret("super-secret-123", stored)).toBe(true);
    expect(await compareClientSecret("super-secret-124", stored)).toBe(false);
    expect(await compareClientSecret("", stored)).toBe(false);
  });

  it("produces a different hash for the same secret each call (random salt)", async () => {
    const a = await hashClientSecret("same");
    const b = await hashClientSecret("same");
    expect(a).not.toBe(b);
    expect(await compareClientSecret("same", a)).toBe(true);
    expect(await compareClientSecret("same", b)).toBe(true);
  });
});
