import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { eq, inArray } from "drizzle-orm";

process.env.OAUTH_JWT_SECRET = process.env.OAUTH_JWT_SECRET || crypto.randomBytes(32).toString("base64");

import { db, pool } from "../../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  vouchers,
  voucherRedemptions,
  allotlyApiKeys,
  auditLogs,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { generateAllotlyKey } from "../../server/lib/keys";
import { authorizeHandler } from "../../server/lib/oauth/authorize";
import { authorizeCredentialHandler } from "../../server/lib/oauth/authorize-credential";
import { registerHandler } from "../../server/lib/oauth/register";
import { pkceS256Transform } from "../../server/lib/oauth/pkce";
import { MCP_AUDIENCE } from "../../server/lib/oauth/scopes";
import { generateVoucherCode } from "../../server/lib/voucher-codes";

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
    sessionID: o.sessionID || "test-session",
  };
}

const seedTag = `cred-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const TEST_REDIRECT_URI = "http://localhost:4444/cb";

let testOrgId = "";
let realUserId = "";
let realUserEmail = "";
const realUserPassword = "real-password-123";
let testTeamId = "";
let realMembershipId = "";
let registeredClientId = "";
let activeVoucherCode = "";
let expiredVoucherCode = "";
let activeApiKey = "";
let revokedApiKey = "";
const pkceVerifier = crypto.randomBytes(40).toString("base64url");
let pkceChallenge = "";

let oauthContinue = "";

const createdSyntheticUserIds: string[] = [];
const createdMembershipIds: string[] = [];
const createdApiKeyIds: string[] = [];

async function buildAuthorizeUrl(): Promise<string> {
  const u = new URL("http://localhost/oauth/authorize");
  u.searchParams.set("client_id", registeredClientId);
  u.searchParams.set("redirect_uri", TEST_REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", pkceChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", "mcp");
  u.searchParams.set("state", "cred-test-state");
  u.searchParams.set("resource", MCP_AUDIENCE);
  return u.pathname + "?" + u.searchParams.toString();
}

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `cred-${seedTag}`,
    plan: "ENTERPRISE", // avoid plan-limit interactions for member counts
    maxTeamAdmins: 5,
  } as any);
  testOrgId = org.id;

  realUserEmail = `cred-real-${seedTag}@allotly.local`;
  const passwordHash = await hashPassword(realUserPassword);
  const realUser = await storage.createUser({
    email: realUserEmail,
    name: "Real Cred User",
    passwordHash,
    orgId: org.id,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  realUserId = realUser.id;

  const team = await storage.createTeam({
    name: `cred-team-${seedTag}`,
    orgId: org.id,
    adminId: realUserId,
    monthlyBudgetCeilingCents: 1_000_000,
  });
  testTeamId = team.id;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const realMembership = await storage.createMembership({
    teamId: team.id,
    userId: realUser.id,
    accessType: "TEAM",
    monthlyBudgetCents: 50_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);
  realMembershipId = realMembership.id;

  // Active API key tied to the real user
  const k1 = generateAllotlyKey();
  await storage.createAllotlyApiKey({
    userId: realUserId,
    membershipId: realMembership.id,
    keyHash: k1.hash,
    keyPrefix: k1.prefix,
  });
  activeApiKey = k1.key;

  // Revoked API key
  const k2 = generateAllotlyKey();
  const revokedKeyRow = await storage.createAllotlyApiKey({
    userId: realUserId,
    membershipId: realMembership.id,
    keyHash: k2.hash,
    keyPrefix: k2.prefix,
  });
  revokedApiKey = k2.key;
  await db.update(allotlyApiKeys).set({ status: "REVOKED" }).where(eq(allotlyApiKeys.id, revokedKeyRow.id));

  // Active voucher
  activeVoucherCode = generateVoucherCode();
  await storage.createVoucher({
    code: activeVoucherCode,
    orgId: org.id,
    teamId: team.id,
    createdById: realUserId,
    label: "credential-test-active",
    budgetCents: 5_000,
    allowedProviders: ["openai"],
    allowedModels: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxRedemptions: 100,
  } as any);

  // Expired voucher
  expiredVoucherCode = generateVoucherCode();
  const expiredVoucher = await storage.createVoucher({
    code: expiredVoucherCode,
    orgId: org.id,
    teamId: team.id,
    createdById: realUserId,
    label: "credential-test-expired",
    budgetCents: 5_000,
    allowedProviders: ["openai"],
    allowedModels: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxRedemptions: 100,
  } as any);
  // Force-expire by direct DB update (createVoucher rejects past expiresAt in zod).
  await db
    .update(vouchers)
    .set({ expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) })
    .where(eq(vouchers.id, expiredVoucher.id));

  const regReq = mockReq({
    body: {
      client_name: `cred-cli-${seedTag}`,
      redirect_uris: [TEST_REDIRECT_URI],
      token_endpoint_auth_method: "client_secret_basic",
      scope: "mcp",
    },
  });
  const regRes = mockRes();
  await registerHandler(regReq as any, regRes as any);
  registeredClientId = regRes.body.client_id;
  pkceChallenge = pkceS256Transform(pkceVerifier);
  oauthContinue = await buildAuthorizeUrl();
});

afterAll(async () => {
  // Audit logs first, then deps in dependency order.
  await db.delete(auditLogs).where(eq(auditLogs.orgId, testOrgId));
  if (createdApiKeyIds.length > 0) {
    await db.delete(allotlyApiKeys).where(inArray(allotlyApiKeys.id, createdApiKeyIds));
  }
  await db.delete(allotlyApiKeys).where(eq(allotlyApiKeys.userId, realUserId));
  await db.delete(voucherRedemptions).where(inArray(voucherRedemptions.userId, [realUserId, ...createdSyntheticUserIds]));
  await db.delete(vouchers).where(eq(vouchers.orgId, testOrgId));
  if (createdMembershipIds.length > 0) {
    await db.delete(teamMemberships).where(inArray(teamMemberships.id, createdMembershipIds));
  }
  await db.delete(teamMemberships).where(eq(teamMemberships.id, realMembershipId));
  await db.delete(teams).where(eq(teams.id, testTeamId));
  if (createdSyntheticUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, createdSyntheticUserIds));
  }
  await db.delete(users).where(eq(users.id, realUserId));
  await pool.query("DELETE FROM oauth_clients WHERE client_name LIKE $1", [`%${seedTag}%`]);
  await db.delete(organizations).where(eq(organizations.id, testOrgId));
});

async function trackSyntheticUser(sess: any) {
  if (sess.userId && sess.userId !== realUserId && !createdSyntheticUserIds.includes(sess.userId)) {
    createdSyntheticUserIds.push(sess.userId);
    const m = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, sess.userId)).limit(1);
    if (m[0] && !createdMembershipIds.includes(m[0].id)) createdMembershipIds.push(m[0].id);
    const k = await db.select().from(allotlyApiKeys).where(eq(allotlyApiKeys.userId, sess.userId));
    for (const row of k) if (!createdApiKeyIds.includes(row.id)) createdApiKeyIds.push(row.id);
  }
}

describe("oauth credential POST /oauth/authorize/credential — three-path auth", () => {
  it("[1] GET /oauth/authorize with no session renders the credential form (no /login bounce)", async () => {
    const sess: any = {};
    const req = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "g1",
        resource: MCP_AUDIENCE,
      },
      session: sess,
      originalUrl: oauthContinue,
    });
    const res = mockRes();
    await authorizeHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('action="/oauth/authorize/credential"');
    expect(String(res.body)).toContain('data-testid="form-password"');
    expect(String(res.body)).toContain('data-testid="form-voucher"');
    expect(String(res.body)).toContain('data-testid="form-api-key"');
    // CSP must lock script-src to 'none' (CSS-only tabs).
    expect(res.headers["content-security-policy"]).toMatch(/script-src 'none'/);
    expect(res.headers["cache-control"]).toBe("no-store");
    // CSRF token was minted into the session.
    expect(sess._oauthCsrf).toMatch(/^[a-f0-9]{32}$/);
  });

  it("[2] POST credential password — wrong password re-renders the form with the generic error (no enumeration)", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-2".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-2".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "password",
        email: realUserEmail,
        password: "WRONG-PASSWORD",
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain('data-testid="credential-error"');
    expect(String(res.body)).not.toMatch(/incorrect password|wrong password|invalid credentials/i);
    // Session must NOT be set
    expect(sess.userId).toBeUndefined();
  });

  it("[3] POST credential password — valid email+password sets session and 302s back to oauth_continue", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-3".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-3".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "password",
        email: realUserEmail,
        password: realUserPassword,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toBe(oauthContinue);
    expect(sess.userId).toBe(realUserId);
    expect(sess.orgId).toBe(testOrgId);
    expect(sess.orgRole).toBe("ROOT_ADMIN");
  });

  it("[4] POST credential voucher — happy path mints synthetic user, sets session, 302s", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-4".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-4".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "voucher",
        code: activeVoucherCode,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(302);
    // Voucher path now redirects to the one-shot key-display interstitial
    // before continuing to the original /oauth/authorize URL (Task #65).
    expect(res.redirected).toBe("/oauth/authorize/voucher-key");
    expect(sess.userId).toBeTruthy();
    expect(sess.userId).not.toBe(realUserId);
    expect(sess.orgId).toBe(testOrgId);
    expect(sess.orgRole).toBe("MEMBER");
    await trackSyntheticUser(sess);
    // Verify the synthetic user is the @allotly.local form
    const syntheticUser = await storage.getUser(sess.userId);
    expect(syntheticUser?.email).toMatch(/^voucher-.*@allotly\.local$/);
    expect(syntheticUser?.isVoucherUser).toBe(true);
    // The freshly-minted key is stashed in the session for the interstitial
    // to consume; it must NOT appear in the redirect URL or the response.
    expect((sess as any)._oauthVoucherKey).toBeTruthy();
    expect((sess as any)._oauthVoucherKey.apiKey).toMatch(/^allotly_sk_/);
    expect(res.redirected).not.toMatch(/allotly_sk_/);
  });

  it("[5] POST credential voucher — expired voucher re-renders form WITHOUT leaking 'expired' in body", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-5".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-5".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "voucher",
        code: expiredVoucherCode,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain('data-testid="credential-error"');
    // Body must NOT enumerate the precise reason ("expired"). The generic
    // error string is the only user-visible signal.
    expect(String(res.body).toLowerCase()).not.toContain("expired");
    expect(sess.userId).toBeUndefined();
  });

  it("[6] POST credential voucher — malformed/unknown code re-renders form, no session set", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-6".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-6".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "voucher",
        code: "GARBAGE-NOT-A-REAL-CODE",
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain('data-testid="credential-error"');
    expect(sess.userId).toBeUndefined();
  });

  it("[7] POST credential api_key — valid allotly_sk_ key sets session and 302s", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-7".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-7".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "api_key",
        api_key: activeApiKey,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toBe(oauthContinue);
    expect(sess.userId).toBe(realUserId);
    expect(sess.orgId).toBe(testOrgId);
  });

  it("[8] POST credential api_key — revoked key re-renders form, no session set", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-8".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-8".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "api_key",
        api_key: revokedApiKey,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain('data-testid="credential-error"');
    expect(sess.userId).toBeUndefined();
  });

  it("[9] POST credential api_key — malformed key (wrong prefix) is rejected", async () => {
    const sess: any = { _oauthCsrf: "test-csrf-9".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-9".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "api_key",
        api_key: "sk-totally-not-an-allotly-key",
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(String(res.body)).toContain('data-testid="credential-error"');
    expect(sess.userId).toBeUndefined();
  });

  it("[10] CSRF mismatch is rejected with 403 (any credential type)", async () => {
    const sess: any = { _oauthCsrf: "real-csrf".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "wrong-csrf-tok".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "password",
        email: realUserEmail,
        password: realUserPassword,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(403);
    expect(String(res.body)).toMatch(/csrf_mismatch/);
    expect(sess.userId).toBeUndefined();
  });

  it("[11] open-redirect attempt via oauth_continue is rejected with 400", async () => {
    const sess: any = { _oauthCsrf: "csrf-11".padEnd(32, "0") };
    for (const evil of ["https://evil.example.com/", "//evil.example.com/path", "/dashboard", "/oauth/authorize\\..\\evil"]) {
      const req = mockReq({
        body: {
          csrf: "csrf-11".padEnd(32, "0"),
          oauth_continue: evil,
          credential_type: "password",
          email: realUserEmail,
          password: realUserPassword,
        },
        session: sess,
      });
      const res = mockRes();
      await authorizeCredentialHandler(req as any, res as any);
      // 400 for known bad shapes; the backslash-trick still starts with
      // /oauth/authorize so it is allowed at this layer (it just becomes a
      // benign 302 to a path the GET handler then rejects). The point of
      // this assertion is the cross-origin / scheme-relative attempts.
      if (evil.includes("://") || evil.startsWith("//") || !evil.startsWith("/oauth/authorize")) {
        expect(res.statusCode).toBe(400);
        expect(sess.userId).toBeUndefined();
      }
    }
  });

  it("[12] full GET → POST → consent flow works for a voucher path (regression)", async () => {
    // Step 1: anonymous GET renders the form, mints CSRF.
    const sess: any = {};
    const reqGet = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "g12",
        resource: MCP_AUDIENCE,
      },
      session: sess,
      originalUrl: oauthContinue,
    });
    const resGet = mockRes();
    await authorizeHandler(reqGet as any, resGet as any);
    expect(resGet.statusCode).toBe(200);
    const csrfToken = sess._oauthCsrf;
    expect(csrfToken).toBeTruthy();

    // Step 2: voucher POST sets session and 302s.
    const reqPost = mockReq({
      body: {
        csrf: csrfToken,
        oauth_continue: oauthContinue,
        credential_type: "voucher",
        code: activeVoucherCode,
      },
      session: sess,
    });
    const resPost = mockRes();
    await authorizeCredentialHandler(reqPost as any, resPost as any);
    expect(resPost.statusCode).toBe(302);
    // Task #65: voucher path now interposes the key-display interstitial
    // before completing to the consent screen. The interstitial's continue
    // link sends the browser back to the original oauth_continue URL.
    expect(resPost.redirected).toBe("/oauth/authorize/voucher-key");
    expect(sess.userId).toBeTruthy();
    await trackSyntheticUser(sess);

    // Step 3: re-issue GET with the session — should now render consent.
    const reqGet2 = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "g12",
        resource: MCP_AUDIENCE,
      },
      session: sess,
      originalUrl: oauthContinue,
    });
    const resGet2 = mockRes();
    await authorizeHandler(reqGet2 as any, resGet2 as any);
    expect(resGet2.statusCode).toBe(200);
    expect(String(resGet2.body)).toContain('data-testid="consent-client-name"');
    // Crucially: synthetic voucher user with isVoucherUser=true did NOT get
    // bounced to /oauth/claim-account.
    expect(String(resGet2.body)).not.toMatch(/claim-account/);
  });

  it("[13a] credential failure for a known user writes a structured audit_logs row (precise reason in audit, generic message in HTTP body)", async () => {
    const before = await db.select().from(auditLogs).where(eq(auditLogs.orgId, testOrgId));
    const beforeFailedCount = before.filter((r) => r.action === "oauth.credential_failed").length;

    const sess: any = { _oauthCsrf: "test-csrf-13a".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-13a".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "password",
        email: realUserEmail,
        password: "WRONG-PASSWORD-AUDIT-TEST",
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);

    const after = await db.select().from(auditLogs).where(eq(auditLogs.orgId, testOrgId));
    const afterFailed = after.filter((r) => r.action === "oauth.credential_failed");
    expect(afterFailed.length).toBe(beforeFailedCount + 1);
    const row = afterFailed[afterFailed.length - 1];
    expect(row.actorId).toBe(realUserId);
    expect(row.targetType).toBe("user");
    expect(row.targetId).toBe(realUserId);
    expect((row.metadata as any).cause).toBe("PASSWORD_MISMATCH");
    // HTTP body still carries only the generic error.
    expect(String(res.body)).not.toMatch(/PASSWORD_MISMATCH|wrong password/i);
  });

  it("[13] stale session (userId points at a deleted user) re-renders the form and clears the dangling session keys", async () => {
    const sess: any = {
      userId: "non-existent-user-id-" + crypto.randomBytes(8).toString("hex"),
      orgId: testOrgId,
      orgRole: "MEMBER",
    };
    const req = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "g13",
        resource: MCP_AUDIENCE,
      },
      session: sess,
      originalUrl: oauthContinue,
    });
    const res = mockRes();
    await authorizeHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(String(res.body)).toContain('action="/oauth/authorize/credential"');
    // Stale userId should have been cleared so a successful credential POST
    // replaces them cleanly rather than racing the dangling values.
    expect(sess.userId).toBeUndefined();
    expect(sess.orgId).toBeUndefined();
    expect(sess.orgRole).toBeUndefined();
  });

  it("[14] regression: real-browser GET → POST round-trip with embedded redirect_uri=https:// is accepted by isSafeContinue", async () => {
    // Drive the real production code path: render the form via authorizeHandler,
    // pull the embedded oauth_continue + csrf out of the rendered HTML (DOM-
    // decoding &amp; → &), then POST those values back to authorizeCredentialHandler.
    // Pre-fix this returned 400 because the embedded URL contains
    // `redirect_uri=https://...` which the old `value.includes("://")` check
    // blanket-rejected.
    //
    // RFC 3986 allows reserved chars (`:`, `/`) in the query component without
    // percent-encoding, and many real OAuth clients (Claude Desktop, MCP hosts,
    // Cursor) send `redirect_uri=https://...` unencoded. We mirror that by
    // setting originalUrl with literal `://` rather than going through
    // URLSearchParams (which would percent-encode and mask the bug).
    const rawOriginalUrl =
      `/oauth/authorize?client_id=${registeredClientId}` +
      `&redirect_uri=${TEST_REDIRECT_URI}` +
      `&response_type=code&code_challenge=${pkceChallenge}` +
      `&code_challenge_method=S256&scope=mcp&state=g14` +
      `&resource=${MCP_AUDIENCE}`;
    const sess: any = {};
    const reqGet = mockReq({
      query: {
        client_id: registeredClientId,
        redirect_uri: TEST_REDIRECT_URI,
        response_type: "code",
        code_challenge: pkceChallenge,
        code_challenge_method: "S256",
        scope: "mcp",
        state: "g14",
        resource: MCP_AUDIENCE,
      },
      session: sess,
      originalUrl: rawOriginalUrl,
    });
    const resGet = mockRes();
    await authorizeHandler(reqGet as any, resGet as any);
    expect(resGet.statusCode).toBe(200);

    const html = String(resGet.body);
    const continueMatch = html.match(/name="oauth_continue"\s+value="([^"]+)"/);
    const csrfMatch = html.match(/name="csrf"\s+value="([^"]+)"/);
    expect(continueMatch).toBeTruthy();
    expect(csrfMatch).toBeTruthy();
    // DOM-decode the &amp; entities a real browser would unescape on submit.
    const embeddedContinue = continueMatch![1].replace(/&amp;/g, "&");
    const embeddedCsrf = csrfMatch![1];
    // Sanity: this is exactly the failure shape — the value contains "://".
    expect(embeddedContinue).toContain("redirect_uri=");
    expect(embeddedContinue).toContain("://");

    const reqPost = mockReq({
      body: {
        csrf: embeddedCsrf,
        oauth_continue: embeddedContinue,
        credential_type: "voucher",
        code: "ALLOT-FAKE-FAKE-FAKE",
      },
      session: sess,
    });
    const resPost = mockRes();
    await authorizeCredentialHandler(reqPost as any, resPost as any);
    // Pre-fix: 400 "oauth_continue must be a /oauth/authorize URL on this origin".
    // Post-fix: validator passes, credential validation runs, malformed voucher
    // → 401 form re-render with the credential-error banner.
    expect(resPost.statusCode).not.toBe(400);
    expect(resPost.statusCode).toBe(401);
    expect(String(resPost.body)).toContain('data-testid="credential-error"');
    expect(sess.userId).toBeUndefined();
  });

  it("[16] api_key path accepts an INVITED user (admin pre-distributed key, user never opened invite email)", async () => {
    // Regression for Task #64. The admin "create user + copy key" workflow
    // hands keys to users out-of-band. Those users stay status=INVITED until
    // they accept the email and set a password — which they may never do if
    // they only ever use the API/MCP. The proxy (`safeguards.ts`) accepts
    // these keys for direct API calls; OAuth must do the same.
    const invitedUserEmail = `cred-invited-${seedTag}@allotly.local`;
    const invitedUserPassword = "invited-user-real-password-123";
    // We deliberately seed a real passwordHash so the password-path sentinel
    // below actually exercises the `user.status !== "ACTIVE"` guard
    // (PASSWORD_USER_INACTIVE) rather than short-circuiting on
    // PASSWORD_USER_NOT_FOUND when the hash is null.
    const invitedPasswordHash = await hashPassword(invitedUserPassword);
    const invitedUser = await storage.createUser({
      email: invitedUserEmail,
      name: "Invited Cred User",
      passwordHash: invitedPasswordHash,
      orgId: testOrgId,
      orgRole: "MEMBER",
      status: "INVITED",
      isVoucherUser: false,
    } as any);
    createdSyntheticUserIds.push(invitedUser.id);
    // Sanity: status must actually be INVITED (createUser default may differ).
    await db.update(users).set({ status: "INVITED" }).where(eq(users.id, invitedUser.id));

    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const invitedMembership = await storage.createMembership({
      teamId: testTeamId,
      userId: invitedUser.id,
      accessType: "TEAM",
      monthlyBudgetCents: 50_000,
      allowedModels: null,
      allowedProviders: null,
      currentPeriodSpendCents: 0,
      periodStart: now,
      periodEnd,
      status: "ACTIVE",
    } as any);
    createdMembershipIds.push(invitedMembership.id);

    const k = generateAllotlyKey();
    const invitedKeyRow = await storage.createAllotlyApiKey({
      userId: invitedUser.id,
      membershipId: invitedMembership.id,
      keyHash: k.hash,
      keyPrefix: k.prefix,
    });
    createdApiKeyIds.push(invitedKeyRow.id);

    const sess: any = { _oauthCsrf: "test-csrf-16".padEnd(32, "0") };
    const req = mockReq({
      body: {
        csrf: "test-csrf-16".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "api_key",
        api_key: k.key,
      },
      session: sess,
    });
    const res = mockRes();
    await authorizeCredentialHandler(req as any, res as any);
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toBe(oauthContinue);
    expect(sess.userId).toBe(invitedUser.id);
    expect(sess.orgId).toBe(testOrgId);
    expect(sess.orgRole).toBe("MEMBER");

    // Regression sentinel: password path must STILL reject INVITED users
    // even when the password is correct. The user has a real passwordHash
    // (seeded above), so the only thing blocking login is the
    // `user.status !== "ACTIVE"` guard at line 226 of authorize-credential.ts.
    // If a future contributor accidentally drops that guard too, this test
    // catches it.
    const beforePwd = await db.select().from(auditLogs).where(eq(auditLogs.orgId, testOrgId));
    const beforePwdFailedCount = beforePwd.filter((r) => r.action === "oauth.credential_failed").length;
    const sessPwd: any = { _oauthCsrf: "test-csrf-16b".padEnd(32, "0") };
    const reqPwd = mockReq({
      body: {
        csrf: "test-csrf-16b".padEnd(32, "0"),
        oauth_continue: oauthContinue,
        credential_type: "password",
        email: invitedUserEmail,
        password: invitedUserPassword,
      },
      session: sessPwd,
    });
    const resPwd = mockRes();
    await authorizeCredentialHandler(reqPwd as any, resPwd as any);
    expect(resPwd.statusCode).toBe(401);
    expect(sessPwd.userId).toBeUndefined();
    // Confirm the rejection actually came from the status guard, not from
    // PASSWORD_USER_NOT_FOUND or PASSWORD_MISMATCH.
    const afterPwd = await db.select().from(auditLogs).where(eq(auditLogs.orgId, testOrgId));
    const afterPwdFailed = afterPwd.filter((r) => r.action === "oauth.credential_failed");
    expect(afterPwdFailed.length).toBe(beforePwdFailedCount + 1);
    const lastFailure = afterPwdFailed[afterPwdFailed.length - 1];
    expect((lastFailure.metadata as any).cause).toBe("PASSWORD_USER_INACTIVE");
  });

  it("[15] regression: every previously-rejected oauth_continue shape still returns 400", async () => {
    const stableCsrf = "csrf-15".padEnd(32, "0");
    const badShapes: Array<unknown> = [
      "https://evil.example.com/oauth/authorize",
      "//evil.example.com/oauth/authorize",
      "\\\\evil.example.com\\oauth\\authorize",
      "/oauth/authorize/../foo",
      "/login?next=/oauth/authorize",
      "javascript:alert(1)",
      "",
      null,
      // Defense in depth: an absolute URL whose hostname is exactly the
      // placeholder origin used internally by the validator must not
      // sneak through. Architect-flagged regression.
      "http://placeholder.local/oauth/authorize",
    ];
    for (const evil of badShapes) {
      const sess: any = { _oauthCsrf: stableCsrf };
      const req = mockReq({
        body: {
          csrf: stableCsrf,
          oauth_continue: evil,
          credential_type: "password",
          email: realUserEmail,
          password: realUserPassword,
        },
        session: sess,
      });
      const res = mockRes();
      await authorizeCredentialHandler(req as any, res as any);
      expect(res.statusCode, `shape ${JSON.stringify(evil)} should be rejected with 400`).toBe(400);
      expect(sess.userId).toBeUndefined();
    }
  });
});
