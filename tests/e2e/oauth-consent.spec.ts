/**
 * Cross-browser OAuth consent regression — Task #62.
 *
 * Task #61 was a production-affecting bug: every Claude.ai connector setup
 * failed because the consent form's Authorize button stopped sending the
 * `decision` field in Firefox, Safari, and some Chromium configurations —
 * but worked perfectly in headless Chrome. Our previous Playwright suite
 * only ran in chromium, so the regression slipped through.
 *
 * This spec drives the real consent form (the one rendered by
 * `server/lib/oauth/consent-template.ts`) end-to-end against all three
 * Playwright engines (chromium, firefox, webkit). The critical assertion
 * is that the form POST contains `decision=approve` (or `decision=deny`):
 * before the #61 fix, this body was missing in Firefox/Safari because the
 * inline submit handler set `button.disabled = true`, which strips the
 * submitter from the form's entry list per HTML spec.
 *
 * Coverage:
 *   - Single-team user → approve, then deny (single hidden membership input).
 *   - Multi-team user → approve via the membership picker `<select>` branch.
 *
 * The spec is tagged `@cross-browser` so the Playwright project filter in
 * `playwright.config.ts` runs it in firefox + webkit too. The default
 * chromium project runs it as part of the normal suite.
 */
import { test, expect, type Page } from "@playwright/test";
import crypto from "crypto";
import { eq } from "drizzle-orm";

// Match the test setup used by tests/oauth/e2e.test.ts so authorize.ts's
// HMAC verification works in this process. Must be set before importing
// any oauth module.
process.env.OAUTH_JWT_SECRET =
  process.env.OAUTH_JWT_SECRET || crypto.randomBytes(32).toString("base64");

import { db, pool } from "../../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  oauthClients,
  oauthAuthorizationCodes,
  oauthTokens,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { pkceS256Transform } from "../../server/lib/oauth/pkce";
import { MCP_AUDIENCE } from "../../server/lib/oauth/scopes";

interface SeedFixture {
  orgId: string;
  singleTeamUserId: string;
  singleTeamUserEmail: string;
  singleTeamUserPassword: string;
  multiTeamUserId: string;
  multiTeamUserEmail: string;
  multiTeamUserPassword: string;
  multiTeamMembershipIds: [string, string];
  teamIds: string[];
  membershipIds: string[];
  clientId: string;
  redirectUri: string;
  pkceVerifier: string;
  pkceChallenge: string;
}

let seed: SeedFixture;

const REDIRECT_URI_BASE = "http://localhost:39733";

async function seedAll(seedTag: string): Promise<SeedFixture> {
  const org = await storage.createOrganization({
    name: `oauth-consent-e2e-${seedTag}`,
    plan: "FREE",
    maxTeamAdmins: 1,
  } as any);

  // Single-team user
  const singleTeamPwd = `pw-${crypto.randomBytes(8).toString("hex")}`;
  const singleTeamPwdHash = await hashPassword(singleTeamPwd);
  const singleTeamUser = await storage.createUser({
    email: `single-${seedTag}@allotly.local`,
    name: "Single Team User",
    passwordHash: singleTeamPwdHash,
    orgId: org.id,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  const singleTeam = await storage.createTeam({
    name: `single-team-${seedTag}`,
    orgId: org.id,
    adminId: singleTeamUser.id,
    monthlyBudgetCeilingCents: 100_000,
  } as any);
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const singleMembership = await storage.createMembership({
    teamId: singleTeam.id,
    userId: singleTeamUser.id,
    accessType: "TEAM",
    monthlyBudgetCents: 50_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);

  // Multi-team user — two memberships across two teams.
  const multiTeamPwd = `pw-${crypto.randomBytes(8).toString("hex")}`;
  const multiTeamPwdHash = await hashPassword(multiTeamPwd);
  const multiTeamUser = await storage.createUser({
    email: `multi-${seedTag}@allotly.local`,
    name: "Multi Team User",
    passwordHash: multiTeamPwdHash,
    orgId: org.id,
    orgRole: "MEMBER",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  // teams.admin_id has a UNIQUE constraint, so each team needs its own
  // throwaway admin user. The admin's identity is irrelevant to this test —
  // we only care that the multi-team user holds a membership in each team.
  const adminA = await storage.createUser({
    email: `admin-a-${seedTag}@allotly.local`,
    name: "Admin A",
    passwordHash: singleTeamPwdHash,
    orgId: org.id,
    orgRole: "TEAM_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  const adminB = await storage.createUser({
    email: `admin-b-${seedTag}@allotly.local`,
    name: "Admin B",
    passwordHash: singleTeamPwdHash,
    orgId: org.id,
    orgRole: "TEAM_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  const teamA = await storage.createTeam({
    name: `multi-team-a-${seedTag}`,
    orgId: org.id,
    adminId: adminA.id,
    monthlyBudgetCeilingCents: 100_000,
  } as any);
  const teamB = await storage.createTeam({
    name: `multi-team-b-${seedTag}`,
    orgId: org.id,
    adminId: adminB.id,
    monthlyBudgetCeilingCents: 100_000,
  } as any);
  const membershipA = await storage.createMembership({
    teamId: teamA.id,
    userId: multiTeamUser.id,
    accessType: "TEAM",
    monthlyBudgetCents: 25_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);
  const membershipB = await storage.createMembership({
    teamId: teamB.id,
    userId: multiTeamUser.id,
    accessType: "TEAM",
    monthlyBudgetCents: 25_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);

  // OAuth client. We register a *public* client (clientSecretHash = null)
  // so the spec can complete the PKCE-only token exchange after consent —
  // exactly the shape Claude.ai's connector uses. authenticateClient()
  // accepts a public client when no Authorization header is present and
  // the row's clientSecretHash is null.
  const redirectUri = `${REDIRECT_URI_BASE}/cb`;
  const inserted = await db
    .insert(oauthClients)
    .values({
      clientName: `oauth-consent-e2e-${seedTag}`,
      redirectUris: [redirectUri] as any,
      clientSecretHash: null,
      registrationAccessTokenHash: crypto.randomBytes(32).toString("hex"),
      scopesAllowed: ["mcp"] as any,
    })
    .returning({ id: oauthClients.id });
  const clientId = inserted[0].id;

  const pkceVerifier = crypto.randomBytes(40).toString("base64url");
  const pkceChallenge = pkceS256Transform(pkceVerifier);

  return {
    orgId: org.id,
    singleTeamUserId: singleTeamUser.id,
    singleTeamUserEmail: singleTeamUser.email,
    singleTeamUserPassword: singleTeamPwd,
    multiTeamUserId: multiTeamUser.id,
    multiTeamUserEmail: multiTeamUser.email,
    multiTeamUserPassword: multiTeamPwd,
    multiTeamMembershipIds: [membershipA.id, membershipB.id],
    teamIds: [singleTeam.id, teamA.id, teamB.id],
    membershipIds: [singleMembership.id, membershipA.id, membershipB.id],
    clientId,
    redirectUri,
    pkceVerifier,
    pkceChallenge,
  };
}

async function cleanupAll(s: SeedFixture): Promise<void> {
  // Reverse-FK order. Use raw SQL for the OAuth chain (no storage helpers).
  for (const mid of s.membershipIds) {
    await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, mid));
    await db
      .delete(oauthAuthorizationCodes)
      .where(eq(oauthAuthorizationCodes.membershipId, mid));
  }
  await pool.query("DELETE FROM oauth_clients WHERE id = $1", [s.clientId]);
  for (const mid of s.membershipIds) {
    await db.delete(teamMemberships).where(eq(teamMemberships.id, mid));
  }
  for (const tid of s.teamIds) {
    await db.delete(teams).where(eq(teams.id, tid));
  }
  await pool.query("DELETE FROM users WHERE org_id = $1", [s.orgId]);
  await db.delete(organizations).where(eq(organizations.id, s.orgId));
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({}, testInfo) => {
  // Per-project unique seed tag so chromium/firefox/webkit workers don't
  // collide on parallel runs (the multi-team UNIQUE on (team_id, user_id)
  // would otherwise reject duplicate memberships across projects).
  const seedTag = `${testInfo.project.name}-${Date.now()}-${crypto
    .randomBytes(2)
    .toString("hex")}`;
  seed = await seedAll(seedTag);
});

test.afterAll(async () => {
  if (seed) await cleanupAll(seed);
});

function buildAuthorizeUrl(state: string): string {
  const u = new URL("/oauth/authorize", "http://placeholder");
  u.searchParams.set("client_id", seed.clientId);
  u.searchParams.set("redirect_uri", seed.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("code_challenge", seed.pkceChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("scope", "mcp");
  u.searchParams.set("state", state);
  u.searchParams.set("resource", MCP_AUDIENCE);
  return u.pathname + u.search;
}

// Bypass /api/auth/login (10/hr per-IP loginLimiter would otherwise flake
// the suite when run twice in an hour, or during repeated local debugging).
// We seed a session row directly into the connect-pg-simple `session`
// table and attach the matching signed `connect.sid` cookie to the
// browser context, mirroring exactly what setupAuth() in server/auth.ts
// would persist after a successful POST.
async function loginAs(
  context: import("@playwright/test").BrowserContext,
  userId: string,
  orgId: string,
  orgRole: string,
): Promise<void> {
  const sid = crypto.randomBytes(24).toString("base64").replace(/[+/=]/g, "");
  const secret = process.env.SESSION_SECRET || "allotly-dev-secret";
  const sig = crypto
    .createHmac("sha256", secret)
    .update(sid)
    .digest("base64")
    .replace(/=+$/, "");
  const signed = `s:${sid}.${sig}`;

  const maxAgeMs = 30 * 24 * 60 * 60 * 1000;
  const expire = new Date(Date.now() + maxAgeMs);
  const sess = {
    cookie: {
      originalMaxAge: maxAgeMs,
      expires: expire.toISOString(),
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    },
    userId,
    orgId,
    orgRole,
    isAdmin: false,
  };

  await pool.query(
    `INSERT INTO session (sid, sess, expire) VALUES ($1, $2::json, $3)
     ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`,
    [sid, JSON.stringify(sess), expire],
  );

  const url = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5000");
  await context.addCookies([
    {
      name: "connect.sid",
      value: encodeURIComponent(signed),
      domain: url.hostname,
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(expire.getTime() / 1000),
    },
  ]);
}

// Exchange a freshly-minted authorization code at /oauth/token using the
// PKCE verifier (public client, no Authorization header). Returns the
// decoded token response so callers can assert on `access_token`,
// scope, etc. Hits the server via the test request context (not the
// browser) so it's identical across all three engines.
async function exchangeAuthCode(
  request: import("@playwright/test").APIRequestContext,
  code: string,
): Promise<{ access_token: string; token_type: string; scope: string; refresh_token: string; expires_in: number }> {
  const res = await request.post("/oauth/token", {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: seed.redirectUri,
      code_verifier: seed.pkceVerifier,
      client_id: seed.clientId,
    },
  });
  expect(
    res.ok(),
    `token exchange failed (${test.info().project.name}): ${res.status()} ${await res.text()}`,
  ).toBe(true);
  return res.json();
}

// Stub the post-consent redirect target so the browser doesn't die on a
// connection-refused navigation. The actual cb URL (including query
// string) is read off the captured request rather than this fulfill, to
// avoid races between route fulfillment and waitForRequest resolution.
async function stubRedirectTarget(page: Page): Promise<void> {
  await page.route(
    (url) => url.toString().startsWith(REDIRECT_URI_BASE),
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<!doctype html><title>cb-stub</title><body>cb-stub",
      }),
  );
}

test.describe("OAuth consent — `decision` field survives submit @cross-browser", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("single-team user: Authorize POSTs decision=approve and redirects with code+state", async ({
    page,
    context,
  }) => {
    await loginAs(context, seed.singleTeamUserId, seed.orgId, "ROOT_ADMIN");

    const state = `s-approve-${Date.now()}`;
    await stubRedirectTarget(page);

    await page.goto(buildAuthorizeUrl(state));

    // Sanity: we landed on the consent page (not the credential form).
    await expect(page.getByTestId("consent-client-name")).toBeVisible();
    await expect(page.getByTestId("consent-approve")).toBeVisible();

    // Single-team user: the membership picker is a hidden input, not a select.
    expect(await page.getByTestId("select-consent-membership").count()).toBe(0);

    const consentReqPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" && req.url().endsWith("/oauth/consent"),
    );
    const cbReqPromise = page.waitForRequest((req) =>
      req.url().startsWith(`${REDIRECT_URI_BASE}/cb`),
    );

    await page.getByTestId("consent-approve").click();

    const consentReq = await consentReqPromise;
    const body = consentReq.postData() ?? "";

    // ─── THE Task #61 REGRESSION ASSERTION ───────────────────────────────
    // Before the fix this assertion failed in firefox + webkit because the
    // inline submit handler set `button.disabled = true`, removing the
    // Authorize button (and therefore its `name=decision value=approve`)
    // from the form's entry list.
    expect(body, `consent POST body in ${test.info().project.name}`).toMatch(
      /(^|&)decision=approve(&|$)/,
    );
    // The other hidden inputs the server requires must also be present.
    expect(body).toMatch(/(^|&)auth_request_id=/);
    expect(body).toMatch(/(^|&)csrf=/);

    // The flow really completed: server 302'd back to the registered
    // redirect_uri with a `code` and the original `state`.
    const cbReq = await cbReqPromise;
    const cbUrl = new URL(cbReq.url());
    expect(cbUrl.searchParams.get("state")).toBe(state);
    const code = cbUrl.searchParams.get("code") ?? "";
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(cbUrl.searchParams.get("error")).toBeNull();

    // Token exchange: prove the issued code is actually redeemable end-to-end.
    const tok = await exchangeAuthCode(context.request, code);
    expect(tok.token_type).toBe("Bearer");
    expect(tok.scope).toContain("mcp");
    expect(tok.access_token.length).toBeGreaterThan(20);
    expect(tok.refresh_token.length).toBeGreaterThan(20);
    expect(tok.expires_in).toBeGreaterThan(0);

    // The token row must be bound to the single-team membership.
    const rows = await pool.query(
      "SELECT membership_id FROM oauth_tokens WHERE client_id = $1 ORDER BY issued_at DESC LIMIT 1",
      [seed.clientId],
    );
    expect(rows.rows[0].membership_id).toBe(seed.membershipIds[0]);
  });

  test("single-team user: Deny POSTs decision=deny and redirects with error=access_denied", async ({
    page,
    context,
  }) => {
    await loginAs(context, seed.singleTeamUserId, seed.orgId, "ROOT_ADMIN");

    const state = `s-deny-${Date.now()}`;
    await stubRedirectTarget(page);

    await page.goto(buildAuthorizeUrl(state));
    await expect(page.getByTestId("consent-deny")).toBeVisible();

    const consentReqPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" && req.url().endsWith("/oauth/consent"),
    );
    const cbReqPromise = page.waitForRequest((req) =>
      req.url().startsWith(`${REDIRECT_URI_BASE}/cb`),
    );

    await page.getByTestId("consent-deny").click();

    const consentReq = await consentReqPromise;
    const body = consentReq.postData() ?? "";

    // Same regression class — Deny must also carry `decision=deny`.
    expect(body, `deny POST body in ${test.info().project.name}`).toMatch(
      /(^|&)decision=deny(&|$)/,
    );

    const cbReq = await cbReqPromise;
    const cbUrl = new URL(cbReq.url());
    expect(cbUrl.searchParams.get("state")).toBe(state);
    expect(cbUrl.searchParams.get("error")).toBe("access_denied");
  });

  test("multi-team user: picker branch — Authorize POSTs decision=approve plus chosen membership_id", async ({
    page,
    context,
  }) => {
    await loginAs(context, seed.multiTeamUserId, seed.orgId, "MEMBER");

    const state = `m-approve-${Date.now()}`;
    await stubRedirectTarget(page);

    await page.goto(buildAuthorizeUrl(state));

    // Multi-team branch: the form renders a real <select> picker.
    const picker = page.getByTestId("select-consent-membership");
    await expect(picker).toBeVisible();
    const optionValues = await picker
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLOptionElement).value),
      );
    expect(new Set(optionValues)).toEqual(
      new Set(seed.multiTeamMembershipIds),
    );

    // Pick the second membership explicitly so the server-side allow-list
    // path is exercised, not the silent "first option" default.
    const chosenMembershipId = seed.multiTeamMembershipIds[1];
    await picker.selectOption(chosenMembershipId);

    const consentReqPromise = page.waitForRequest(
      (req) =>
        req.method() === "POST" && req.url().endsWith("/oauth/consent"),
    );
    const cbReqPromise = page.waitForRequest((req) =>
      req.url().startsWith(`${REDIRECT_URI_BASE}/cb`),
    );

    await page.getByTestId("consent-approve").click();

    const consentReq = await consentReqPromise;
    const body = consentReq.postData() ?? "";

    expect(
      body,
      `multi-team consent POST body in ${test.info().project.name}`,
    ).toMatch(/(^|&)decision=approve(&|$)/);
    expect(body).toMatch(
      new RegExp(`(^|&)membership_id=${chosenMembershipId}(&|$)`),
    );

    const cbReq = await cbReqPromise;
    const cbUrl = new URL(cbReq.url());
    expect(cbUrl.searchParams.get("state")).toBe(state);
    const code = cbUrl.searchParams.get("code") ?? "";
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);

    // Token exchange: same end-to-end check as the single-team approve
    // path, but the token row must be bound to the *chosen* membership
    // (not the multi-team user's "primary" membership).
    const tok = await exchangeAuthCode(context.request, code);
    expect(tok.token_type).toBe("Bearer");
    expect(tok.scope).toContain("mcp");
    expect(tok.access_token.length).toBeGreaterThan(20);

    const rows = await pool.query(
      "SELECT membership_id FROM oauth_tokens WHERE client_id = $1 ORDER BY issued_at DESC LIMIT 1",
      [seed.clientId],
    );
    expect(rows.rows[0].membership_id).toBe(chosenMembershipId);
  });
});
