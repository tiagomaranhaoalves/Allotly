import type { Request, Response } from "express";
import crypto from "crypto";
import { db } from "../../db";
import { oauthClients, oauthAuthorizationCodes, teamMemberships } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { storage } from "../../storage";
import { newAuthorizationCode } from "./pkce";
import { MCP_AUDIENCE, SUPPORTED_SCOPES, parseScopeString } from "./scopes";
import { renderConsent } from "./consent-template";
import { redisSet, redisGetDel, redisKeys, redisDel } from "../redis";

// 10 min: gives MCP clients (Claude Desktop, Cursor, etc.) and slow human
// flows enough headroom. Was 5 min, but we observed users hitting "auth_request
// expired or unknown" on flows that involved a fresh login mid-consent.
const PENDING_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_SECONDS = 600;
const CODE_TTL_MS = 60 * 1000;

// Short, replica-stable id so cross-replica / cross-process log lines can be
// correlated when debugging "auth_request expired or unknown". process.pid
// alone is unreliable on autoscale because the same pid can be reused, but
// combined with startup time it's unique-enough for log grep.
const INSTANCE_ID = `${process.pid}-${Date.now().toString(36)}`;

// Truncate the 32-hex nonce to its first 8 chars for logging. Full nonces
// are secrets (anyone with one can submit consent before TTL); the prefix
// is enough to correlate setPending → takePending pairs without leaking auth.
function nonceTag(n: string): string {
  return String(n).slice(0, 8);
}

interface PendingAuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  resource: string;
  state: string;
  codeChallenge: string;
  expiresAt: number;
  // The session-bound user that started this consent flow. consentHandler
  // refuses to mint a code if a different user is now logged in (RFC 6749 §10.12).
  userId: string;
}

// Pending auth-requests live in Redis (not in-process memory) so that the
// /oauth/authorize → /oauth/consent round-trip survives a process restart
// or hits a different replica behind the load balancer. Without this, a real
// user clicking "Authorize" can land on a fresh instance and see "auth_request
// expired or unknown". Redis TTL handles expiry — no in-process pruner needed.
const PENDING_KEY = (nonce: string) => `allotly:oauth:pending:${nonce}`;

async function setPending(nonce: string, p: PendingAuthRequest): Promise<void> {
  await redisSet(PENDING_KEY(nonce), JSON.stringify(p), PENDING_TTL_SECONDS);
  console.log(
    `[oauth] setPending nonce=${nonceTag(nonce)} userId=${p.userId} clientId=${p.clientId} expAt=${p.expiresAt} ttl=${PENDING_TTL_SECONDS}s instance=${INSTANCE_ID}`,
  );
}

async function takePending(nonce: string): Promise<PendingAuthRequest | null> {
  const now = Date.now();
  // GETDEL = atomic read-and-delete; prevents consent double-submission.
  const raw = await redisGetDel(PENDING_KEY(nonce));
  if (!raw) {
    console.log(
      `[oauth] takePending MISS nonce=${nonceTag(nonce)} now=${now} instance=${INSTANCE_ID} — key not in Redis (TTL expired, double-submit consumed it, or written by a different REDIS_URL)`,
    );
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as PendingAuthRequest;
    const ageMs = now - (parsed.expiresAt - PENDING_TTL_MS);
    console.log(
      `[oauth] takePending HIT nonce=${nonceTag(nonce)} userId=${parsed.userId} clientId=${parsed.clientId} ageMs=${ageMs} expIn=${parsed.expiresAt - now}ms instance=${INSTANCE_ID}`,
    );
    return parsed;
  } catch {
    console.log(
      `[oauth] takePending PARSE-FAIL nonce=${nonceTag(nonce)} instance=${INSTANCE_ID} rawLen=${raw.length}`,
    );
    return null;
  }
}

// Single helper so every consent failure path emits a uniform, grep-able log.
// Callers pass a stable cause code (MISS_EXPIRED, MISS_ALREADY_USED,
// SESSION_USER_MISMATCH, HMAC_INVALID, MISSING_FIELDS, CSRF_MISMATCH,
// NO_SESSION) plus optional context.
function logConsentFailure(cause: string, ctx: Record<string, unknown> = {}): void {
  const parts = [`cause=${cause}`, `instance=${INSTANCE_ID}`];
  for (const [k, v] of Object.entries(ctx)) {
    if (v !== undefined && v !== null) parts.push(`${k}=${v}`);
  }
  console.log(`[oauth] consent FAIL ${parts.join(" ")}`);
}

/**
 * Render a friendly HTML error page when the consent submission cannot complete.
 * Replaces the prior plain-text "auth_request expired or unknown" so users (and
 * MCP clients) can understand what happened. Distinguishes "expired" from
 * "already used" using the timestamp embedded in the (HMAC-signed) token,
 * which we can read without needing the pending Redis entry.
 */
function renderConsentErrorPage(opts: {
  title: string;
  heading: string;
  body: string;
  detail?: string;
}): string {
  const esc = (s: string) =>
    String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)} — Allotly</title></head><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><div style="max-width:480px;margin:48px auto;padding:0 16px"><div style="text-align:center;margin-bottom:24px"><div style="display:inline-block;background:#6366F1;color:#fff;font-weight:700;font-size:18px;padding:6px 16px;border-radius:8px">allotly</div></div><div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0"><h1 style="margin:0 0 12px;color:#1e293b;font-size:20px" data-testid="consent-error-heading">${esc(opts.heading)}</h1><p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 12px" data-testid="consent-error-body">${esc(opts.body)}</p>${opts.detail ? `<p style="color:#94a3b8;font-size:12px;line-height:1.5;margin:12px 0 0;font-family:monospace;background:#f8fafc;padding:8px 12px;border-radius:6px" data-testid="consent-error-detail">${esc(opts.detail)}</p>` : ""}</div></div></body></html>`;
}

/**
 * Parse the embedded `expiresAtMs` from an auth_request_id (`<nonce>.<exp>.<hmac>`)
 * WITHOUT verifying the HMAC. Used only to give a clearer error message when the
 * pending Redis entry is missing — we can tell the user whether their link
 * expired (timestamp in the past) or was already submitted (timestamp still
 * in the future, so the only way the entry is gone is GETDEL consumed it).
 * Returns null if the token is malformed.
 */
function readExpiryFromAuthRequestId(token: string): number | null {
  const parts = String(token).split(".");
  if (parts.length !== 3) return null;
  const exp = Number(parts[1]);
  return Number.isFinite(exp) ? exp : null;
}

/**
 * Signed auth_request_id: `<nonce>.<expiresAtMs>.<hmacHex>` where the HMAC
 * binds nonce + expiry + userId + clientId. This means a stolen id cannot
 * be replayed by another user (even if our pending Map is shared/cleared)
 * and tampering with the expiry is detectable. Server-side state still
 * lives in `pending` (for codeChallenge etc), keyed by nonce.
 */
function signAuthRequestId(nonce: string, expiresAtMs: number, userId: string, clientId: string): string {
  const secret = process.env.OAUTH_JWT_SECRET || "dev-only-fallback-secret";
  const h = crypto.createHmac("sha256", secret).update(`${nonce}|${expiresAtMs}|${userId}|${clientId}`).digest("hex");
  return `${nonce}.${expiresAtMs}.${h}`;
}

interface VerifiedAuthRequestId {
  nonce: string;
  expiresAtMs: number;
}

function verifyAuthRequestId(token: string, userId: string, clientId: string): VerifiedAuthRequestId | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [nonce, expStr, mac] = parts;
  const expiresAtMs = Number(expStr);
  if (!nonce || !Number.isFinite(expiresAtMs)) return null;
  if (Date.now() > expiresAtMs) return null;
  const expected = crypto.createHmac("sha256", process.env.OAUTH_JWT_SECRET || "dev-only-fallback-secret")
    .update(`${nonce}|${expiresAtMs}|${userId}|${clientId}`)
    .digest("hex");
  // Constant-time compare
  const a = Buffer.from(mac, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { nonce, expiresAtMs };
}

function newCsrfToken(req: Request): string {
  const sess = req.session as any;
  if (sess && sess._oauthCsrf) return sess._oauthCsrf as string;
  const tok = crypto.randomBytes(16).toString("hex");
  if (sess) sess._oauthCsrf = tok;
  return tok;
}

function escapeQuery(s: string): string {
  return encodeURIComponent(s);
}

function safeRedirect(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function getActiveMembershipForUser(userId: string): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: teamMemberships.id, status: teamMemberships.status })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .limit(1);
  if (rows.length === 0) return null;
  if (rows[0].status === "EXPIRED" || rows[0].status === "SUSPENDED") return null;
  return { id: rows[0].id };
}

export async function authorizeHandler(req: Request, res: Response): Promise<void> {
  const q = req.query;
  const clientId = typeof q.client_id === "string" ? q.client_id : "";
  const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
  const responseType = typeof q.response_type === "string" ? q.response_type : "";
  const codeChallenge = typeof q.code_challenge === "string" ? q.code_challenge : "";
  const codeChallengeMethod = typeof q.code_challenge_method === "string" ? q.code_challenge_method : "";
  const scope = typeof q.scope === "string" ? q.scope : "mcp";
  const state = typeof q.state === "string" ? q.state : "";
  const resource = typeof q.resource === "string" ? q.resource : "";

  if (!clientId) {
    res.status(400).type("text/plain").send("invalid_request: client_id required");
    return;
  }
  const client = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  if (client.length === 0 || client[0].revokedAt) {
    res.status(400).type("text/plain").send("invalid_client: unknown or revoked client");
    return;
  }
  const c = client[0];

  const registeredUris = (c.redirectUris as unknown as string[]) || [];
  if (!redirectUri || !registeredUris.includes(redirectUri)) {
    res.status(400).type("text/plain").send("invalid_redirect_uri: must match a URI registered with this client");
    return;
  }

  // OAuth 2.1: `state` is REQUIRED. Reject without echoing back.
  if (!state || state.length === 0) {
    res.redirect(
      302,
      safeRedirect(redirectUri, {
        error: "invalid_request",
        error_description: "state is required",
      }),
    );
    return;
  }

  if (responseType !== "code") {
    res.redirect(302, safeRedirect(redirectUri, { error: "unsupported_response_type", state }));
    return;
  }
  if (codeChallengeMethod !== "S256") {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_request", error_description: "code_challenge_method must be S256", state }));
    return;
  }
  if (!codeChallenge || codeChallenge.length < 43) {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_request", error_description: "code_challenge required", state }));
    return;
  }
  if (resource !== MCP_AUDIENCE) {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_target", error_description: `resource must equal ${MCP_AUDIENCE}`, state }));
    return;
  }

  const requestedScopes = parseScopeString(scope);
  const allowedScopes = (c.scopesAllowed as unknown as string[]) || [];
  for (const s of requestedScopes) {
    if (!(SUPPORTED_SCOPES as readonly string[]).includes(s) || !allowedScopes.includes(s)) {
      res.redirect(302, safeRedirect(redirectUri, { error: "invalid_scope", state }));
      return;
    }
  }
  if (requestedScopes.length === 0) {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_scope", error_description: "scope is required", state }));
    return;
  }

  const sess = req.session as any;
  if (!sess?.userId) {
    const next = req.originalUrl;
    res.redirect(302, `/login?next=${escapeQuery(next)}`);
    return;
  }
  const user = await storage.getUser(sess.userId);
  if (!user) {
    res.redirect(302, `/login?next=${escapeQuery(req.originalUrl)}`);
    return;
  }
  if (user.isVoucherUser) {
    res.redirect(302, `/oauth/claim-account?next=${escapeQuery(req.originalUrl)}`);
    return;
  }

  const membership = await getActiveMembershipForUser(user.id);
  if (!membership) {
    res.redirect(302, safeRedirect(redirectUri, { error: "access_denied", error_description: "no active membership", state }));
    return;
  }

  const nonce = crypto.randomBytes(16).toString("hex");
  const expiresAtMs = Date.now() + PENDING_TTL_MS;
  await setPending(nonce, {
    clientId,
    redirectUri,
    scope: requestedScopes.join(" "),
    resource,
    state,
    codeChallenge,
    expiresAt: expiresAtMs,
    userId: user.id,
  });

  const authRequestId = signAuthRequestId(nonce, expiresAtMs, user.id, clientId);
  const csrfToken = newCsrfToken(req);
  const html = renderConsent({
    authRequestId,
    csrfToken,
    clientName: c.clientName,
    scopes: requestedScopes,
    redirectUri,
    resource,
    approvePath: "/oauth/consent",
    userEmail: user.email,
    userName: user.name,
  });
  // CSP form-action also gates redirect targets from form submissions
  // (CSP3 §form-action). Static 'self' would silently block the post-consent
  // 302 to the client's cross-origin redirect_uri. Allow the validated origin.
  let formActionOrigin = "'self'";
  try {
    formActionOrigin = `'self' ${new URL(redirectUri).origin}`;
  } catch {
    // redirectUri was validated upstream; keep strict fallback.
  }
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self'; form-action ${formActionOrigin}`,
  );
  res.type("text/html").send(html);
}

export async function consentHandler(req: Request, res: Response): Promise<void> {
  const sess = req.session as any;
  if (!sess?.userId) {
    logConsentFailure("NO_SESSION", { sessionId: req.sessionID });
    res.status(401).type("text/plain").send("unauthorized");
    return;
  }
  const body = req.body || {};
  const authRequestId = body.auth_request_id;
  const csrf = body.csrf;
  const decision = body.decision;

  if (!authRequestId || !csrf || !decision) {
    logConsentFailure("MISSING_FIELDS", {
      hasAuthRequestId: !!authRequestId,
      hasCsrf: !!csrf,
      hasDecision: !!decision,
      contentType: req.headers["content-type"],
      bodyKeys: Object.keys(body).join(",") || "(empty)",
    });
    res.status(400).type("text/plain").send("invalid_request");
    return;
  }
  if (!sess._oauthCsrf || csrf !== sess._oauthCsrf) {
    logConsentFailure("CSRF_MISMATCH", {
      hasSessionCsrf: !!sess._oauthCsrf,
      sessionId: req.sessionID,
    });
    res.status(403).type("text/plain").send("csrf_mismatch");
    return;
  }
  // First verify the HMAC: the auth_request_id has the form
  // "<nonce>.<expiresAtMs>.<hmac>" and the hmac binds (nonce, expiry, userId,
  // clientId). To verify it we must know the clientId, which we don't have
  // until after we look it up — but the nonce is in plain text in the token,
  // so we can fetch the pending entry first and use its clientId for hmac
  // verification. Doing it in this order means a tampered nonce simply misses
  // the pending entry and is rejected the same way an expired request would be.
  //
  // takePending() is GETDEL-backed — the entry is consumed atomically on first
  // read, which prevents consent double-submission. All failure paths below
  // therefore do NOT need an explicit delete.
  const noncePart = String(authRequestId).split(".")[0];
  const pendingReq = await takePending(noncePart);
  if (!pendingReq) {
    // Use the (HMAC-signed but not yet verified) timestamp embedded in the
    // token to distinguish the two real-world causes of a MISS:
    //   - expiry: > PENDING_TTL since /oauth/authorize, the Redis TTL fired
    //   - already-used: timestamp still in the future, so the only way the
    //     entry is gone is GETDEL consumed it on a prior submission. This is
    //     what we observed in production: browser back-button or MCP-client
    //     replay re-POSTed a consent form whose code was already issued.
    const expAt = readExpiryFromAuthRequestId(String(authRequestId));
    const now = Date.now();
    // Three sub-causes:
    //  - MISS_MALFORMED: token didn't parse (someone hand-crafted/tampered)
    //  - MISS_EXPIRED:   tokenExpAt < now, the 10min Redis TTL fired
    //  - MISS_ALREADY_USED: token still valid by time, so GETDEL must have
    //    consumed the entry on a prior submission (browser back-button replay,
    //    MCP-client retry, etc.) — by far the most common in practice.
    let cause: "MISS_MALFORMED" | "MISS_EXPIRED" | "MISS_ALREADY_USED";
    if (expAt === null) cause = "MISS_MALFORMED";
    else if (now > expAt) cause = "MISS_EXPIRED";
    else cause = "MISS_ALREADY_USED";
    logConsentFailure(cause, {
      nonce: nonceTag(noncePart),
      authRequestIdLen: String(authRequestId).length,
      authRequestIdParts: String(authRequestId).split(".").length,
      sessionUserId: sess.userId,
      tokenExpAt: expAt,
      now,
      ageSinceExpMs: expAt !== null ? now - expAt : null,
    });
    let errorPage;
    if (cause === "MISS_EXPIRED") {
      errorPage = {
        title: "Authorization link expired",
        heading: "This authorization link expired",
        body: "More than 10 minutes passed between starting the sign-in and submitting consent. For your security, the link is no longer valid. Please return to the application that sent you here and start the sign-in again.",
        detail: "code: MISS_EXPIRED",
      };
    } else if (cause === "MISS_MALFORMED") {
      errorPage = {
        title: "Invalid authorization request",
        heading: "This authorization request is invalid",
        body: "The link you submitted doesn't look like a valid Allotly authorization request. Please return to the application that sent you here and start the sign-in again from the beginning.",
        detail: "code: MISS_MALFORMED",
      };
    } else {
      errorPage = {
        title: "Authorization already submitted",
        heading: "This authorization was already submitted",
        body: "This consent form has already been used to grant access. If your application didn't successfully receive the sign-in (for example because the redirect failed), please return to it and start a fresh sign-in — don't use the browser back button to retry, since each authorization can only be submitted once.",
        detail: "code: MISS_ALREADY_USED",
      };
    }
    // Defense in depth: same restrictive CSP we apply to the consent page.
    // Helmet's global CSP is disabled, so this route-specific header matters.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self'; form-action 'none'",
    );
    res.status(400).type("text/html").send(renderConsentErrorPage(errorPage));
    return;
  }
  // Session-binding (RFC 6749 §10.12): a pending request only belongs to the
  // user that initiated /oauth/authorize. If the active session has changed,
  // refuse to mint a code.
  if (pendingReq.userId !== sess.userId) {
    logConsentFailure("SESSION_USER_MISMATCH", {
      nonce: nonceTag(noncePart),
      pendingUserId: pendingReq.userId,
      sessionUserId: sess.userId,
    });
    res.status(403).type("text/plain").send("session_user_mismatch");
    return;
  }
  // HMAC verification + freshness (5min) + clientId binding.
  const verified = verifyAuthRequestId(authRequestId, sess.userId, pendingReq.clientId);
  if (!verified) {
    logConsentFailure("HMAC_INVALID", {
      nonce: nonceTag(noncePart),
      userId: sess.userId,
      clientId: pendingReq.clientId,
    });
    res.status(400).type("text/plain").send("auth_request expired or invalid");
    return;
  }

  if (decision !== "approve") {
    res.redirect(302, safeRedirect(pendingReq.redirectUri, { error: "access_denied", state: pendingReq.state }));
    return;
  }

  const membership = await getActiveMembershipForUser(sess.userId);
  if (!membership) {
    res.redirect(302, safeRedirect(pendingReq.redirectUri, { error: "access_denied", error_description: "no active membership", state: pendingReq.state }));
    return;
  }

  const { code, codeHash } = newAuthorizationCode();
  await db.insert(oauthAuthorizationCodes).values({
    codeHash,
    clientId: pendingReq.clientId,
    membershipId: membership.id,
    redirectUri: pendingReq.redirectUri,
    codeChallenge: pendingReq.codeChallenge,
    resource: pendingReq.resource,
    scope: pendingReq.scope,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  res.redirect(302, safeRedirect(pendingReq.redirectUri, { code, state: pendingReq.state }));
}

export async function _resetPendingForTest(): Promise<void> {
  // State now lives in Redis (or the in-memory test store). Sweep all keys
  // under the pending namespace so each test starts clean.
  const keys = await redisKeys("allotly:oauth:pending:*");
  for (const k of keys) await redisDel(k);
}
