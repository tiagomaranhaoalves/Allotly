/**
 * OAuth 2.1 + DCR end-to-end acceptance suite (17 assertions).
 *
 * These tests exercise the actual handlers in sequence (register →
 * authorize → consent → token → MCP), with real database persistence,
 * a real PKCE chain, real JWT minting/verification, and a session map
 * that lives across calls. They are NOT helper unit tests.
 *
 * They depend on DATABASE_URL being set (same as the dev DB). Each run
 * uses a unique seed identifier so concurrent runs do not collide,
 * and `afterAll` cleans up the rows it created.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { eq } from "drizzle-orm";

process.env.OAUTH_JWT_SECRET = process.env.OAUTH_JWT_SECRET || crypto.randomBytes(32).toString("base64");

import { db, pool } from "../../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  allotlyApiKeys,
  oauthClients,
  oauthAuthorizationCodes,
  oauthTokens,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { generateAllotlyKey } from "../../server/lib/keys";
import { authorizeHandler, consentHandler, _resetPendingForTest } from "../../server/lib/oauth/authorize";
import { tokenHandler } from "../../server/lib/oauth/token";
import { registerHandler } from "../../server/lib/oauth/register";
import { discoveryHandler } from "../../server/lib/oauth/discovery";
import { pkceS256Transform, hashAuthorizationCode } from "../../server/lib/oauth/pkce";
import { verifyAccessToken, MCP_AUDIENCE } from "../../server/lib/oauth";

// ───── helpers ──────────────────────────────────────────────────────────

interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  redirected?: string;
  status(code: number): MockRes;
  setHeader(k: string, v: string): MockRes;
  json(b: any): MockRes;
  send(b: any): MockRes;
  type(_: string): MockRes;
  redirect(...args: any[]): MockRes;
}
function mockRes(): MockRes {
  const r: any = {
    statusCode: 200,
    headers: {},
    body: undefined,
    redirected: undefined,
    status(c: number) { this.statusCode = c; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
    json(b: any) { this.body = b; return this; },
    send(b: any) { this.body = b; return this; },
    type(_: string) { return this; },
    redirect(...args: any[]) {
      if (args.length === 1) { this.statusCode = 302; this.redirected = args[0]; }
      else { this.statusCode = args[0]; this.redirected = args[1]; }
      return this;
    },
  };
  return r as MockRes;
}

interface MockReq {
  query: Record<string, any>;
  body: any;
  headers: Record<string, string>;
  ip: string;
  session: any;
  originalUrl: string;
  protocol: string;
  socket: { remoteAddress: string };
  get(k: string): string | undefined;
}
function mockReq(opts: Partial<MockReq> = {}): MockReq {
  return {
    query: opts.query || {},
    body: opts.body || {},
    headers: opts.headers || {},
    ip: opts.ip || "127.0.0.1",
    session: opts.session || {},
    originalUrl: opts.originalUrl || "/",
    protocol: "http",
    socket: { remoteAddress: opts.ip || "127.0.0.1" },
    get(k: string) { return this.headers[k.toLowerCase()]; },
  };
}

const seedTag = `e2e-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let testOrgId = "";
let testUserId = "";
let testTeamId = "";
let testMembershipId = "";
let testApiKeyId = "";

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `oauth-e2e-${seedTag}`,
    plan: "FREE",
    maxTeamAdmins: 1,
  } as any);
  testOrgId = org.id;

  const passwordHash = await hashPassword("test-password-123");
  const user = await storage.createUser({
    email: `oauth-e2e-${seedTag}@allotly.local`,
    name: "OAuth Test User",
    passwordHash,
    orgId: org.id,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  });
  testUserId = user.id;

  const team = await storage.createTeam({
    name: `oauth-e2e-team-${seedTag}`,
    orgId: org.id,
    adminId: user.id,
    monthlyBudgetCeilingCents: 100_000,
  });
  testTeamId = team.id;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const membership = await storage.createMembership({
    teamId: team.id,
    userId: user.id,
    accessType: "TEAM",
    monthlyBudgetCents: 50_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);
  testMembershipId = membership.id;

  const { hash, prefix } = generateAllotlyKey();
  const apiKey = await storage.createAllotlyApiKey({
    userId: user.id,
    membershipId: membership.id,
    keyHash: hash,
    keyPrefix: prefix,
  });
  testApiKeyId = apiKey.id;
});

afterAll(async () => {
  // Clean up in reverse FK order. Use raw SQL for the OAuth chain because
  // the codes/tokens tables don't have storage helpers.
  await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, testMembershipId));
  await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.membershipId, testMembershipId));
  await pool.query("DELETE FROM oauth_clients WHERE client_name LIKE $1", [`%${seedTag}%`]);
  await db.delete(allotlyApiKeys).where(eq(allotlyApiKeys.id, testApiKeyId));
  await db.delete(teamMemberships).where(eq(teamMemberships.id, testMembershipId));
  await db.delete(teams).where(eq(teams.id, testTeamId));
  await db.delete(users).where(eq(users.id, testUserId));
  await db.delete(organizations).where(eq(organizations.id, testOrgId));
});

// ───── shared OAuth client + PKCE state for the e2e flow ────────────────

let registeredClientId = "";
let registeredClientSecret = "";
const pkceVerifier = crypto.randomBytes(40).toString("base64url");
let pkceChallenge = "";
const TEST_REDIRECT_URI = "http://localhost:3333/cb";

// ───── 17 ACCEPTANCE ASSERTIONS ─────────────────────────────────────────

describe("oauth e2e: discovery + DCR", () => {
  it("[1] /.well-known/oauth-authorization-server publishes RFC 8414 metadata", () => {
    const res = mockRes();
    discoveryHandler({} as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body.issuer).toBeTruthy();
    expect(res.body.code_challenge_methods_supported).toContain("S256");
    expect(res.body.scopes_supported).toEqual(expect.arrayContaining(["mcp", "mcp:read"]));
    expect(res.headers["cache-control"]).toMatch(/max-age=/);
  });

  it("[2] POST /oauth/register issues a confidential client_id + client_secret", async () => {
    const req = mockReq({
      body: {
        client_name: `e2e-cli-${seedTag}`,
        redirect_uris: [TEST_REDIRECT_URI],
        token_endpoint_auth_method: "client_secret_basic",
        scope: "mcp",
      },
    });
    const res = mockRes();
    await registerHandler(req as any, res as any);
    expect(res.statusCode).toBe(201);
    expect(res.body.client_id).toBeTruthy();
    expect(res.body.client_secret).toBeTruthy();
    expect(res.body.scope).toBe("mcp");
    registeredClientId = res.body.client_id;
    registeredClientSecret = res.body.client_secret;
    pkceChallenge = pkceS256Transform(pkceVerifier);
  });
});

describe("oauth e2e: authorize + consent", () => {
  it("[3] GET /oauth/authorize without a session redirects to /login", async () => {
    _resetPendingForTest();
    const req = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s1",
        resource: MCP_AUDIENCE,
      },
      session: {}, // anonymous
      originalUrl: "/oauth/authorize?client_id=" + registeredClientId,
    });
    const res = mockRes();
    await authorizeHandler(req as any, res as any);
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toMatch(/\/login\?next=/);
  });

  it("[4] GET /oauth/authorize with a voucher-only user redirects to /oauth/claim-account", async () => {
    // Flip the seeded user to voucherUser temporarily
    await storage.updateUser(testUserId, { isVoucherUser: true } as any);
    const req = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s2",
        resource: MCP_AUDIENCE,
      },
      session: { userId: testUserId },
      originalUrl: "/oauth/authorize?...",
    });
    const res = mockRes();
    await authorizeHandler(req as any, res as any);
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toMatch(/\/oauth\/claim-account/);
    await storage.updateUser(testUserId, { isVoucherUser: false } as any);
  });

  it("[5] GET /oauth/authorize with a real user renders the consent screen and shows the user email", async () => {
    const sess: any = { userId: testUserId };
    const req = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s3",
        resource: MCP_AUDIENCE,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    const html = String(res.body || "");
    expect(html).toContain("data-testid=\"consent-client-name\"");
    expect(html).toContain("data-testid=\"consent-user-email\"");
    expect(html).toContain(`oauth-e2e-${seedTag}@allotly.local`);
    // Hidden auth_request_id must be the signed `<nonce>.<expiresAt>.<hmac>` form.
    const m = html.match(/name="auth_request_id" value="([^"]+)"/);
    expect(m).toBeTruthy();
    expect(m![1].split(".").length).toBe(3);
    // CSRF cookie was set
    expect(sess._oauthCsrf).toMatch(/^[a-f0-9]{32}$/);
  });

  it("[6] POST /oauth/consent without a CSRF token is rejected (403)", async () => {
    // Seed a fresh authorize so we have a valid auth_request_id
    const sess: any = { userId: testUserId };
    const aReq = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s6",
        resource: MCP_AUDIENCE,
      },
      session: sess,
    });
    const aRes = mockRes();
    await authorizeHandler(aReq as any, aRes as any);
    const html = String(aRes.body);
    const ridMatch = html.match(/name="auth_request_id" value="([^"]+)"/);
    const rid = ridMatch![1];

    const cReq = mockReq({
      body: { auth_request_id: rid, csrf: "wrong", decision: "approve" },
      session: sess,
    });
    const cRes = mockRes();
    await consentHandler(cReq as any, cRes as any);
    expect(cRes.statusCode).toBe(403);
    expect(String(cRes.body)).toContain("csrf_mismatch");
  });

  it("[7] POST /oauth/consent under a different session is rejected (session_user_mismatch)", async () => {
    const ownerSess: any = { userId: testUserId };
    const aReq = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s7",
        resource: MCP_AUDIENCE,
      },
      session: ownerSess,
    });
    const aRes = mockRes();
    await authorizeHandler(aReq as any, aRes as any);
    const ridMatch = String(aRes.body).match(/name="auth_request_id" value="([^"]+)"/);
    const rid = ridMatch![1];

    const evilSess: any = { userId: "00000000-0000-0000-0000-000000000000", _oauthCsrf: ownerSess._oauthCsrf };
    const cReq = mockReq({
      body: { auth_request_id: rid, csrf: ownerSess._oauthCsrf, decision: "approve" },
      session: evilSess,
    });
    const cRes = mockRes();
    await consentHandler(cReq as any, cRes as any);
    expect(cRes.statusCode).toBe(403);
    expect(String(cRes.body)).toContain("session_user_mismatch");
  });

  it("[8] POST /oauth/consent with a tampered HMAC is rejected (auth_request expired or invalid)", async () => {
    const sess: any = { userId: testUserId };
    const aReq = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s8",
        resource: MCP_AUDIENCE,
      },
      session: sess,
    });
    const aRes = mockRes();
    await authorizeHandler(aReq as any, aRes as any);
    const ridMatch = String(aRes.body).match(/name="auth_request_id" value="([^"]+)"/);
    const rid = ridMatch![1];
    // Replace the hmac segment with garbage of equal length
    const parts = rid.split(".");
    const tampered = `${parts[0]}.${parts[1]}.${"0".repeat(parts[2].length)}`;

    const cReq = mockReq({
      body: { auth_request_id: tampered, csrf: sess._oauthCsrf, decision: "approve" },
      session: sess,
    });
    const cRes = mockRes();
    await consentHandler(cReq as any, cRes as any);
    expect(cRes.statusCode).toBe(400);
    expect(String(cRes.body)).toMatch(/auth_request expired or invalid/);
  });

  it("[9] POST /oauth/consent approve mints an authorization code and 302's back to redirect_uri with state", async () => {
    const sess: any = { userId: testUserId };
    const aReq = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "s9",
        resource: MCP_AUDIENCE,
      },
      session: sess,
    });
    const aRes = mockRes();
    await authorizeHandler(aReq as any, aRes as any);
    const ridMatch = String(aRes.body).match(/name="auth_request_id" value="([^"]+)"/);
    const rid = ridMatch![1];

    const cReq = mockReq({
      body: { auth_request_id: rid, csrf: sess._oauthCsrf, decision: "approve" },
      session: sess,
    });
    const cRes = mockRes();
    await consentHandler(cReq as any, cRes as any);
    expect(cRes.statusCode).toBe(302);
    expect(cRes.redirected).toMatch(/^http:\/\/localhost:3333\/cb\?/);
    expect(cRes.redirected).toMatch(/state=s9/);
    expect(cRes.redirected).toMatch(/code=[A-Za-z0-9_-]+/);
  });
});

// ───── token endpoint flow ──────────────────────────────────────────────

async function obtainAuthorizationCode(): Promise<string> {
  _resetPendingForTest();
  const sess: any = { userId: testUserId };
  const aReq = mockReq({
    query: {
      client_id: registeredClientId,
      redirect_uri: TEST_REDIRECT_URI,
      response_type: "code",
      code_challenge: pkceChallenge,
      code_challenge_method: "S256",
      scope: "mcp",
      state: "tok",
      resource: MCP_AUDIENCE,
    },
    session: sess,
  });
  const aRes = mockRes();
  await authorizeHandler(aReq as any, aRes as any);
  const ridMatch = String(aRes.body).match(/name="auth_request_id" value="([^"]+)"/);
  const rid = ridMatch![1];

  const cReq = mockReq({
    body: { auth_request_id: rid, csrf: sess._oauthCsrf, decision: "approve" },
    session: sess,
  });
  const cRes = mockRes();
  await consentHandler(cReq as any, cRes as any);
  const url = new URL(cRes.redirected!);
  return url.searchParams.get("code")!;
}

function basicAuth(): string {
  return "Basic " + Buffer.from(`${registeredClientId}:${registeredClientSecret}`).toString("base64");
}

describe("oauth e2e: token endpoint", () => {
  it("[10] POST /oauth/token with a wrong PKCE verifier is rejected (invalid_grant)", async () => {
    const code = await obtainAuthorizationCode();
    const req = mockReq({
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: TEST_REDIRECT_URI,
        code_verifier: crypto.randomBytes(40).toString("base64url"), // wrong
      },
      headers: { authorization: basicAuth() },
    });
    const res = mockRes();
    await tokenHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(res.body?.error).toBe("invalid_grant");
  });

  it("[11] POST /oauth/token with the correct PKCE verifier returns access_token + refresh_token", async () => {
    const code = await obtainAuthorizationCode();
    const req = mockReq({
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: TEST_REDIRECT_URI,
        code_verifier: pkceVerifier,
      },
      headers: { authorization: basicAuth() },
    });
    const res = mockRes();
    await tokenHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body.token_type).toBe("Bearer");
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.refresh_token).toBeTruthy();
    expect(res.body.scope).toBe("mcp");
    // Verify the JWT is mintable with the right claims.
    const v = await verifyAccessToken(res.body.access_token);
    expect(v.ok).toBe(true);
    expect(v.claims!.aud).toBe(MCP_AUDIENCE);
    expect(v.claims!.sub).toBe(testUserId);
    expect(v.claims!.client_id).toBe(registeredClientId);
    expect(v.claims!.membership_id).toBe(testMembershipId);
  });

  it("[12] Replaying a consumed authorization code revokes the issued access token chain (RFC 6749 §4.1.2)", async () => {
    const code = await obtainAuthorizationCode();

    // First exchange: succeeds, mints chain.
    const req1 = mockReq({
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: TEST_REDIRECT_URI,
        code_verifier: pkceVerifier,
      },
      headers: { authorization: basicAuth() },
    });
    const res1 = mockRes();
    await tokenHandler(req1 as any, res1 as any);
    expect(res1.statusCode).toBe(200);
    const issuedAccess = res1.body.access_token as string;
    const v1 = await verifyAccessToken(issuedAccess);
    expect(v1.ok).toBe(true);
    const issuedJti = v1.claims!.jti;

    // Replay: must fail.
    const req2 = mockReq({
      body: {
        grant_type: "authorization_code",
        code, // same code reused
        redirect_uri: TEST_REDIRECT_URI,
        code_verifier: pkceVerifier,
      },
      headers: { authorization: basicAuth() },
    });
    const res2 = mockRes();
    await tokenHandler(req2 as any, res2 as any);
    expect(res2.statusCode).toBe(400);
    expect(res2.body?.error).toBe("invalid_grant");

    // The first chain's tokens must now be marked revoked at rest.
    const codeHash = hashAuthorizationCode(code);
    const tokRows = await pool.query(
      "SELECT revoked_at FROM oauth_tokens WHERE authorization_code_hash = $1",
      [codeHash],
    );
    expect(tokRows.rowCount).toBeGreaterThan(0);
    for (const r of tokRows.rows) {
      expect(r.revoked_at).not.toBeNull();
    }
    // And the access token JTI is in the redis revocation set so any
    // in-flight call would be rejected.
    const { redisGet } = await import("../../server/lib/redis");
    const blacklisted = await redisGet(`allotly:oauth:revoked:${issuedJti}`);
    expect(blacklisted).toBeTruthy();
  });

  it("[13] POST /oauth/token grant_type=refresh_token rotates the refresh token and issues a fresh access token", async () => {
    const code = await obtainAuthorizationCode();
    const r1 = mockRes();
    await tokenHandler(
      mockReq({
        body: { grant_type: "authorization_code", code, redirect_uri: TEST_REDIRECT_URI, code_verifier: pkceVerifier },
        headers: { authorization: basicAuth() },
      }) as any,
      r1 as any,
    );
    expect(r1.statusCode).toBe(200);
    const oldRefresh = r1.body.refresh_token as string;
    const oldAccess = r1.body.access_token as string;

    const r2 = mockRes();
    await tokenHandler(
      mockReq({
        body: { grant_type: "refresh_token", refresh_token: oldRefresh },
        headers: { authorization: basicAuth() },
      }) as any,
      r2 as any,
    );
    expect(r2.statusCode).toBe(200);
    expect(r2.body.access_token).toBeTruthy();
    expect(r2.body.refresh_token).toBeTruthy();
    expect(r2.body.refresh_token).not.toBe(oldRefresh);
    expect(r2.body.access_token).not.toBe(oldAccess);
    // Old refresh must now fail (rotated).
    const r3 = mockRes();
    await tokenHandler(
      mockReq({
        body: { grant_type: "refresh_token", refresh_token: oldRefresh },
        headers: { authorization: basicAuth() },
      }) as any,
      r3 as any,
    );
    expect(r3.statusCode).toBe(400);
    expect(r3.body?.error).toBe("invalid_grant");
  });

  it("[14] POST /oauth/token with bad client_secret is rejected (invalid_client)", async () => {
    const code = await obtainAuthorizationCode();
    const req = mockReq({
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: TEST_REDIRECT_URI,
        code_verifier: pkceVerifier,
      },
      headers: {
        authorization: "Basic " + Buffer.from(`${registeredClientId}:wrong-secret`).toString("base64"),
      },
    });
    const res = mockRes();
    await tokenHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe("invalid_client");
  });
});

// ───── MCP bearer acceptance ────────────────────────────────────────────

describe("oauth e2e: MCP /mcp accepts oauth JWT bearers", () => {
  it("[15] resolveBearer accepts a valid OAuth access token whose audience matches MCP_AUDIENCE", async () => {
    const code = await obtainAuthorizationCode();
    const t = mockRes();
    await tokenHandler(
      mockReq({
        body: { grant_type: "authorization_code", code, redirect_uri: TEST_REDIRECT_URI, code_verifier: pkceVerifier },
        headers: { authorization: basicAuth() },
      }) as any,
      t as any,
    );
    const { authenticate } = await import("../../server/lib/mcp/auth");
    const principal = await authenticate("Bearer " + t.body.access_token);
    expect(principal).not.toBeNull();
    expect(principal!.bearerKind).toBe("oauth");
    expect(principal!.userId).toBe(testUserId);
    expect(principal!.membership.id).toBe(testMembershipId);
    // OAuth principals must surface a real apiKeyId so usage-billing works.
    expect(principal!.apiKeyId).toBe(testApiKeyId);
    // D3 identity is verbatim — NOT re-hashed.
    expect(principal!.principalHash).toBe(`oauth:${registeredClientId}:${testUserId}`);
  });

  it("[16] resolveBearer rejects an OAuth token with the wrong audience", async () => {
    const { issueAccessToken } = await import("../../server/lib/oauth/jwt");
    const wrongAud = issueAccessToken({
      userId: testUserId,
      clientId: registeredClientId,
      scope: "mcp",
      resource: "https://example.com/wrong",
      membershipId: testMembershipId,
    });
    const { authenticate } = await import("../../server/lib/mcp/auth");
    await expect(authenticate("Bearer " + wrongAud.token)).rejects.toThrow(/audience mismatch/i);
  });

  it("[17] resolveBearer rejects a revoked OAuth token even before its exp", async () => {
    const code = await obtainAuthorizationCode();
    const t = mockRes();
    await tokenHandler(
      mockReq({
        body: { grant_type: "authorization_code", code, redirect_uri: TEST_REDIRECT_URI, code_verifier: pkceVerifier },
        headers: { authorization: basicAuth() },
      }) as any,
      t as any,
    );
    const accessToken = t.body.access_token as string;
    const v = await verifyAccessToken(accessToken);
    const { redisSet } = await import("../../server/lib/redis");
    await redisSet(`allotly:oauth:revoked:${v.claims!.jti}`, "1", 60);
    const { authenticate } = await import("../../server/lib/mcp/auth");
    await expect(authenticate("Bearer " + accessToken)).rejects.toThrow(/revoked/i);
  });
});
