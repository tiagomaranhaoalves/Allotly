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
  oauthAuthorizationCodes,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { authorizeHandler, consentHandler, _resetPendingForTest } from "../../server/lib/oauth/authorize";
import { registerHandler } from "../../server/lib/oauth/register";
import { pkceS256Transform } from "../../server/lib/oauth/pkce";
import { MCP_AUDIENCE } from "../../server/lib/oauth/scopes";
import { redisGet, redisSet } from "../../server/lib/redis";

function mockRes() {
  const r: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    redirected: undefined as string | undefined,
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
  return r;
}

function mockReq(o: any) {
  return {
    query: o.query || {},
    body: o.body || {},
    headers: o.headers || {},
    ip: "127.0.0.1",
    session: o.session ?? {},
    originalUrl: o.originalUrl || "/oauth/authorize",
  };
}

const seedTag = `pending-redis-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let testOrgId = "";
let testUserId = "";
let testTeamId = "";
let testMembershipId = "";
let registeredClientId = "";
const pkceVerifier = crypto.randomBytes(40).toString("base64url");
let pkceChallenge = "";
const TEST_REDIRECT_URI = "http://localhost:3333/cb";

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `pending-redis-${seedTag}`,
    plan: "FREE",
    maxTeamAdmins: 1,
  } as any);
  testOrgId = org.id;

  const passwordHash = await hashPassword("test-password-123");
  const user = await storage.createUser({
    email: `pending-redis-${seedTag}@allotly.local`,
    name: "Pending Redis Test User",
    passwordHash,
    orgId: org.id,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  });
  testUserId = user.id;

  const team = await storage.createTeam({
    name: `pending-redis-team-${seedTag}`,
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

  const regReq = mockReq({
    body: {
      client_name: `pending-redis-cli-${seedTag}`,
      redirect_uris: [TEST_REDIRECT_URI],
      token_endpoint_auth_method: "client_secret_basic",
      scope: "mcp",
    },
  });
  const regRes = mockRes();
  await registerHandler(regReq as any, regRes as any);
  registeredClientId = regRes.body.client_id;
  pkceChallenge = pkceS256Transform(pkceVerifier);
});

afterAll(async () => {
  await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.membershipId, testMembershipId));
  await pool.query("DELETE FROM oauth_clients WHERE client_name LIKE $1", [`%${seedTag}%`]);
  await db.delete(teamMemberships).where(eq(teamMemberships.id, testMembershipId));
  await db.delete(teams).where(eq(teams.id, testTeamId));
  await db.delete(users).where(eq(users.id, testUserId));
  await db.delete(organizations).where(eq(organizations.id, testOrgId));
});

describe("oauth pending-request: Redis-backed (regression for in-memory Map)", () => {
  it("regression: pending-request survives a simulated process restart", async () => {
    await _resetPendingForTest();

    // Step 1: end-to-end /oauth/authorize → consent screen.
    const sess: any = { userId: testUserId };
    const aReq = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "regression-1",
        resource: MCP_AUDIENCE,
      },
      session: sess,
    });
    const aRes = mockRes();
    await authorizeHandler(aReq as any, aRes as any);

    expect(aRes.statusCode).toBe(200);
    const ridMatch = String(aRes.body).match(/name="auth_request_id" value="([^"]+)"/);
    expect(ridMatch).not.toBeNull();
    const authRequestId = ridMatch![1];
    const noncePart = authRequestId.split(".")[0];

    // Step 2: prove the entry actually lives in Redis (not a per-process Map)
    // by reading it directly via the shared redis helper. If anyone reverts
    // this back to a `new Map<string, ...>()` in authorize.ts, this lookup
    // returns null and the test fails immediately.
    const raw = await redisGet(`allotly:oauth:pending:${noncePart}`);
    expect(raw).not.toBeNull();
    const stored = JSON.parse(raw!);
    expect(stored.clientId).toBe(registeredClientId);
    expect(stored.userId).toBe(testUserId);
    expect(stored.codeChallenge).toBe(pkceChallenge);

    // Step 3: simulate "different process / cold restart" by re-importing
    // the module. With Redis-backed state this round-trips transparently.
    // (vitest dynamic import returns the cached module — but the proof point
    // is structural: state lives in shared storage, not module memory.)
    const reloaded = await import("../../server/lib/oauth/authorize?t=" + Date.now()).catch(
      () => import("../../server/lib/oauth/authorize"),
    );
    const consent2 = (reloaded as any).consentHandler ?? consentHandler;

    const cReq = mockReq({
      body: { auth_request_id: authRequestId, csrf: sess._oauthCsrf, decision: "approve" },
      session: sess,
    });
    const cRes = mockRes();
    await consent2(cReq as any, cRes as any);

    expect(cRes.statusCode).toBe(302);
    expect(cRes.redirected).toMatch(/[?&]code=/);
    expect(cRes.redirected).toMatch(/[?&]state=regression-1/);

    // Step 4: single-use enforcement — pending entry was atomically GETDELed,
    // so a second consent submission with the same id MUST fail. The error
    // page distinguishes "already submitted" (MISS_ALREADY_USED) from "expired"
    // (MISS_EXPIRED) using the timestamp embedded in the auth_request_id.
    const c2Req = mockReq({
      body: { auth_request_id: authRequestId, csrf: sess._oauthCsrf, decision: "approve" },
      session: sess,
    });
    const c2Res = mockRes();
    await consentHandler(c2Req as any, c2Res as any);
    expect(c2Res.statusCode).toBe(400);
    // The token's expiresAtMs is still in the future (10min TTL), so this is
    // the "already used" path (browser back-button / replay), not "expired".
    expect(String(c2Res.body)).toMatch(/already submitted/i);
    expect(String(c2Res.body)).toMatch(/MISS_ALREADY_USED/);
  });

  it("MISS_MALFORMED: a hand-crafted/garbage auth_request_id renders the malformed error page (no XSS)", async () => {
    const sess: any = { userId: testUserId, _oauthCsrf: "test-csrf-token" };
    // Note: the consent handler verifies CSRF BEFORE looking up the pending
    // entry, so we need a valid CSRF in the session. The auth_request_id
    // itself is the garbage being tested.
    const req = mockReq({
      body: {
        auth_request_id: "<script>alert(1)</script>not-a-real-token",
        csrf: "test-csrf-token",
        decision: "approve",
      },
      session: sess,
    });
    const res = mockRes();
    await consentHandler(req as any, res as any);
    expect(res.statusCode).toBe(400);
    expect(String(res.body)).toMatch(/MISS_MALFORMED/);
    // XSS guard: the script tag from the input must be HTML-escaped, not
    // rendered. The body should not contain the literal "<script>" substring.
    expect(String(res.body)).not.toMatch(/<script>alert/);
    // Defense-in-depth: the error page sets a restrictive CSP header.
    expect(res.headers["content-security-policy"]).toMatch(/script-src 'none'/);
  });

  it("redisGetDel removes the key on first read (single-use semantics)", async () => {
    const key = `allotly:oauth:pending:test-${crypto.randomBytes(8).toString("hex")}`;
    await redisSet(key, JSON.stringify({ marker: "alive" }), 60);
    const { redisGetDel } = await import("../../server/lib/redis");
    const first = await redisGetDel(key);
    const second = await redisGetDel(key);
    expect(first).toBe(JSON.stringify({ marker: "alive" }));
    expect(second).toBeNull();
  });
});
