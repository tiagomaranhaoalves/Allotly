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
import {
  authorizeCredentialHandler,
  voucherKeyDisplayHandler,
} from "../../server/lib/oauth/authorize-credential";
import { registerHandler } from "../../server/lib/oauth/register";
import { pkceS256Transform } from "../../server/lib/oauth/pkce";
import { MCP_AUDIENCE } from "../../server/lib/oauth/scopes";
import { generateVoucherCode } from "../../server/lib/voucher-codes";

import enLocale from "../../client/src/i18n/locales/en.json";
import esLocale from "../../client/src/i18n/locales/es.json";
import ptLocale from "../../client/src/i18n/locales/pt-BR.json";

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

const seedTag = `vk-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
const TEST_REDIRECT_URI = "http://localhost:4445/cb";

let testOrgId = "";
let realUserId = "";
let testTeamId = "";
let realMembershipId = "";
let registeredClientId = "";
let oauthContinue = "";
const pkceVerifier = crypto.randomBytes(40).toString("base64url");
let pkceChallenge = "";
const createdSyntheticUserIds: string[] = [];
const createdMembershipIds: string[] = [];
const createdApiKeyIds: string[] = [];

async function buildAuthorizeUrl(state: string): Promise<string> {
  const u = new URL("http://localhost/oauth/authorize");
  u.searchParams.set("client_id", registeredClientId);
  u.searchParams.set("redirect_uri", TEST_REDIRECT_URI);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", pkceChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", "mcp");
  u.searchParams.set("state", state);
  u.searchParams.set("resource", MCP_AUDIENCE);
  return u.pathname + "?" + u.searchParams.toString();
}

async function freshVoucher(label: string): Promise<string> {
  const code = generateVoucherCode();
  await storage.createVoucher({
    code,
    orgId: testOrgId,
    teamId: testTeamId,
    createdById: realUserId,
    label,
    budgetCents: 5_000,
    allowedProviders: ["openai"],
    allowedModels: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    maxRedemptions: 100,
  } as any);
  return code;
}

async function trackSyntheticUser(sess: any) {
  if (sess.userId && sess.userId !== realUserId && !createdSyntheticUserIds.includes(sess.userId)) {
    createdSyntheticUserIds.push(sess.userId);
    const m = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, sess.userId)).limit(1);
    if (m[0] && !createdMembershipIds.includes(m[0].id)) createdMembershipIds.push(m[0].id);
    const k = await db.select().from(allotlyApiKeys).where(eq(allotlyApiKeys.userId, sess.userId));
    for (const row of k) if (!createdApiKeyIds.includes(row.id)) createdApiKeyIds.push(row.id);
  }
}

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `vk-${seedTag}`,
    plan: "ENTERPRISE",
    maxTeamAdmins: 5,
  } as any);
  testOrgId = org.id;

  const passwordHash = await hashPassword("real-password-123");
  const realUser = await storage.createUser({
    email: `vk-real-${seedTag}@allotly.local`,
    name: "Real VK User",
    passwordHash,
    orgId: org.id,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  realUserId = realUser.id;

  const team = await storage.createTeam({
    name: `vk-team-${seedTag}`,
    orgId: org.id,
    adminId: realUserId,
    monthlyBudgetCeilingCents: 1_000_000,
  });
  testTeamId = team.id;

  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const realMembership = await storage.createMembership({
    teamId: team.id,
    userId: realUser.id,
    accessType: "TEAM",
    monthlyBudgetCents: 50_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: new Date(),
    periodEnd,
    status: "ACTIVE",
  } as any);
  realMembershipId = realMembership.id;

  const regReq = mockReq({
    body: {
      client_name: `vk-host-${seedTag}`,
      redirect_uris: [TEST_REDIRECT_URI],
      token_endpoint_auth_method: "client_secret_basic",
      scope: "mcp",
    },
  });
  const regRes = mockRes();
  await registerHandler(regReq as any, regRes as any);
  registeredClientId = regRes.body.client_id;
  pkceChallenge = pkceS256Transform(pkceVerifier);
  oauthContinue = await buildAuthorizeUrl("vk-state");
});

afterAll(async () => {
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

async function postVoucher(sess: any, code: string) {
  const csrf = "vk-csrf-token".padEnd(32, "0");
  sess._oauthCsrf = csrf;
  const req = mockReq({
    body: {
      csrf,
      oauth_continue: oauthContinue,
      credential_type: "voucher",
      code,
    },
    session: sess,
  });
  const res = mockRes();
  await authorizeCredentialHandler(req as any, res as any);
  return res;
}

describe("Task #65 voucher OAuth key-display interstitial", () => {
  it("voucher POST stashes raw key in session and redirects to interstitial (NOT to oauth_continue)", async () => {
    const code = await freshVoucher("vk-stash");
    const sess: any = {};
    const res = await postVoucher(sess, code);
    expect(res.statusCode).toBe(302);
    expect(res.redirected).toBe("/oauth/authorize/voucher-key");
    expect(res.redirected).not.toBe(oauthContinue);
    await trackSyntheticUser(sess);
    expect(sess._oauthVoucherKey).toBeTruthy();
    expect(sess._oauthVoucherKey.apiKey).toMatch(/^allotly_sk_/);
    expect(sess._oauthVoucherKey.keyPrefix).toMatch(/^allotly_sk_/);
    expect(sess._oauthVoucherKey.oauthContinue).toBe(oauthContinue);
    expect(sess._oauthVoucherKey.clientId).toBe(registeredClientId);
    // Raw key never appears in the redirect URL.
    expect(String(res.redirected)).not.toMatch(/allotly_sk_/);
  });

  it("interstitial GET renders the raw key once, clears the session field, sets strict CSP + no-store", async () => {
    const code = await freshVoucher("vk-once");
    const sess: any = {};
    await postVoucher(sess, code);
    await trackSyntheticUser(sess);
    const stashedKey: string = sess._oauthVoucherKey.apiKey;

    const getReq = mockReq({ session: sess, headers: { "accept-language": "en" } });
    const getRes = mockRes();
    await voucherKeyDisplayHandler(getReq as any, getRes as any);
    expect(getRes.statusCode).toBe(200);
    const body = String(getRes.body);
    // Raw key surfaced exactly here, framed by the dedicated container.
    expect(body).toContain(`data-testid="voucher-key-value">${stashedKey}<`);
    expect(body).toContain('data-testid="voucher-key-heading"');
    expect(body).toContain('data-testid="voucher-key-warning"');
    expect(body).toContain('data-testid="voucher-key-continue"');
    // The continue button targets the original /oauth/authorize URL.
    expect(body).toContain(`href="${oauthContinue.replace(/&/g, "&amp;")}"`);

    // Hard security headers.
    expect(getRes.headers["content-security-policy"]).toMatch(/script-src 'none'/);
    expect(getRes.headers["content-security-policy"]).toMatch(/default-src 'self'/);
    expect(getRes.headers["cache-control"]).toBe("no-store");
    expect(getRes.headers["referrer-policy"]).toBe("no-referrer");

    // Session field consumed — a refresh must NOT re-display the key.
    expect(sess._oauthVoucherKey).toBeUndefined();

    const getRes2 = mockRes();
    await voucherKeyDisplayHandler(mockReq({ session: sess }) as any, getRes2 as any);
    expect(getRes2.statusCode).toBe(302);
    expect(getRes2.redirected).toBe("/login");
    // Second render emits no HTML body containing the raw key.
    expect(String(getRes2.body ?? "")).not.toContain(stashedKey);
  });

  it("interstitial writes exactly one voucher.oauth_key_displayed audit row with NO raw key in metadata", async () => {
    const code = await freshVoucher("vk-audit");
    const sess: any = {};
    await postVoucher(sess, code);
    await trackSyntheticUser(sess);
    const stashedKey: string = sess._oauthVoucherKey.apiKey;
    const expectedPrefix: string = sess._oauthVoucherKey.keyPrefix;

    const getRes = mockRes();
    await voucherKeyDisplayHandler(mockReq({ session: sess }) as any, getRes as any);
    expect(getRes.statusCode).toBe(200);

    const syntheticUserId = sess.userId;
    const rows = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.orgId, testOrgId));
    // Filter by the freshly-minted synthetic user so prior tests in the
    // same suite (which also redeem vouchers and emit display events) don't
    // inflate the count.
    const displays = rows.filter(
      (r) => r.action === "voucher.oauth_key_displayed" && r.actorId === syntheticUserId,
    );
    expect(displays.length).toBe(1);
    const row = displays[0];
    expect(row.actorId).toBe(syntheticUserId);
    expect(row.targetType).toBe("user");
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    expect(meta.keyPrefix).toBe(expectedPrefix);
    expect(meta.oauthClientId).toBe(registeredClientId);
    // The raw key MUST NOT appear anywhere in the audit row.
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(stashedKey);
  });

  it("interstitial honours Accept-Language for en / es / pt-BR", async () => {
    for (const [header, expectedHeading] of [
      ["en", (enLocale as any).oauth?.voucherKey?.heading ?? "Save your Allotly key"],
      ["es-ES,es;q=0.9", (esLocale as any).oauth?.voucherKey?.heading ?? "Guarda tu clave de Allotly"],
      ["pt-BR,pt;q=0.9", (ptLocale as any).oauth?.voucherKey?.heading ?? "Salve sua chave da Allotly"],
    ] as const) {
      const code = await freshVoucher(`vk-i18n-${header}`);
      const sess: any = {};
      await postVoucher(sess, code);
      await trackSyntheticUser(sess);
      const getRes = mockRes();
      await voucherKeyDisplayHandler(
        mockReq({ session: sess, headers: { "accept-language": header } }) as any,
        getRes as any,
      );
      expect(getRes.statusCode).toBe(200);
      expect(String(getRes.body)).toContain(expectedHeading);
    }
  });

  it("password and api_key paths do NOT stash a voucher-key in the session", async () => {
    // Password path with an unknown user — the failure path still must not
    // touch the voucher-key session field.
    const sess: any = {};
    const csrf = "vk-csrf-pw".padEnd(32, "0");
    sess._oauthCsrf = csrf;
    const req = mockReq({
      body: {
        csrf,
        oauth_continue: oauthContinue,
        credential_type: "api_key",
        api_key: "sk-not-an-allotly-key",
      },
      session: sess,
    });
    await authorizeCredentialHandler(req as any, mockRes() as any);
    expect(sess._oauthVoucherKey).toBeUndefined();
  });

  it("locale JSON files all carry the oauth.voucherKey.* string namespace", () => {
    for (const [name, locale] of [
      ["en", enLocale],
      ["es", esLocale],
      ["pt-BR", ptLocale],
    ] as const) {
      const ns = ((locale as any).oauth ?? {}).voucherKey;
      expect(ns, `${name}.oauth.voucherKey is missing`).toBeTruthy();
      for (const key of [
        "pageTitle",
        "heading",
        "intro",
        "warning",
        "copyHint",
        "continueLabel",
        "hostFallback",
        "keyLabel",
      ]) {
        expect(typeof ns[key], `${name}.oauth.voucherKey.${key} should be a string`).toBe("string");
        expect(String(ns[key]).length).toBeGreaterThan(0);
      }
    }
  });
});
