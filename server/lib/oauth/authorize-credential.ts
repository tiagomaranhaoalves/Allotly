import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../../db";
import { oauthClients } from "@shared/schema";
import type { InsertAuditLog } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import { comparePasswords } from "../password";
import { redeemVoucherInline } from "../vouchers/redeem-inline";
import { lookupApiKey } from "../auth/api-key-lookup";
import { renderCredentialForm } from "./credential-form-template";
import { renderVoucherKeyPage, pickVoucherKeyLocale } from "./voucher-key-template";
import { loginLimiter, redeemLimiter } from "../rate-limiter";

/**
 * Session field used to hand off the freshly-minted Allotly API key from
 * the voucher credential POST handler to the GET interstitial. Cleared on
 * the first GET render so the raw key is never available a second time.
 *
 * The key is stored in the session (server-side, in the connect-pg-simple
 * store) — never in the URL, never in a cookie, never in an audit log.
 */
const VOUCHER_KEY_SESSION_FIELD = "_oauthVoucherKey";

interface PendingVoucherKey {
  apiKey: string;
  keyPrefix: string;
  userId: string;
  orgId: string;
  /** The /oauth/authorize?... URL the user was originally trying to reach.
   *  Re-validated by isSafeContinue() on render — a tampered session value
   *  must not be able to redirect to an off-origin host. */
  oauthContinue: string;
  /** OAuth client's display name for the host requesting access (purely
   *  cosmetic — used in the "Continue to {host}" label). */
  clientName: string;
  /** OAuth client_id we extracted from oauthContinue, recorded in the audit
   *  metadata so operators can correlate the display event to a specific
   *  host without ever seeing the raw key. */
  clientId: string | null;
}

const GENERIC_ERROR = "We couldn't sign you in with those credentials. Please double-check and try again.";

/**
 * Failure-attribution context. When `orgId` is set we write a structured
 * audit_logs row (action: oauth.credential_failed) so security operators can
 * see precise reasons. When it isn't, we can't satisfy the NOT NULL FK on
 * audit_logs.org_id and fall back to a server log only.
 *
 * The user-facing response is always the same generic error regardless — the
 * audit log is the single source of truth for the precise reason.
 */
interface CredFailureAttribution {
  orgId?: string;
  actorId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

async function logCredFailure(
  cause: string,
  ctx: Record<string, unknown> = {},
  attribution?: CredFailureAttribution,
): Promise<void> {
  const parts = [`cause=${cause}`];
  for (const [k, v] of Object.entries(ctx)) {
    if (v !== undefined && v !== null) parts.push(`${k}=${v}`);
  }
  console.log(`[oauth-credential] FAIL ${parts.join(" ")}`);

  if (attribution?.orgId) {
    try {
      // audit_logs.actor_id is a NOT NULL FK to users.id — only write when
      // attribution carries a real user (the offending user, the voucher
      // creator, or the API-key owner). Without that we can't satisfy the FK
      // and fall back to the server log line above.
      if (!attribution.actorId) return;
      const entry: InsertAuditLog = {
        orgId: attribution.orgId,
        actorId: attribution.actorId,
        action: "oauth.credential_failed",
        targetType: attribution.targetType ?? null,
        targetId: attribution.targetId ?? null,
        metadata: { cause, ...(attribution.metadata ?? {}) },
      };
      await storage.createAuditLog(entry);
    } catch (e) {
      // Audit-log write failures must never block the response path.
      console.log(`[oauth-credential] audit_log write failed cause=${cause} err=${(e as Error).message}`);
    }
  }
}

/**
 * `oauth_continue` MUST be a relative path on our origin pointing back at
 * /oauth/authorize. This blocks open-redirect via crafted hidden field while
 * allowing the legitimate form-rendered value (which includes nested
 * `redirect_uri=https://...` inside the query string).
 *
 * Implementation: parse the value relative to a placeholder origin. If the
 * parser interprets the value as same-origin (hostname unchanged) AND the
 * pathname is exactly /oauth/authorize, it is safe. Anything else (absolute
 * URL with a real host, protocol-relative `//evil.com/...`, traversal, etc.)
 * either changes the hostname or moves the pathname off /oauth/authorize.
 *
 * The `\\` check stays because some browser/Node URL parsers disagree on
 * whether backslash is a path separator; defensively reject it before parse.
 *
 * Hotfix history: the prior `value.includes("://")` blanket check rejected
 * any real browser submission because the form embeds the original
 * /oauth/authorize?...&redirect_uri=https://... URL verbatim and that string
 * always contains `://` inside the query.
 */
function isSafeContinue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  // Must be absolute-path-relative ("/oauth/authorize?..."). This single
  // gate rejects every absolute URL form (`http://...`, `https://...`,
  // `javascript:...`, and even the placeholder-origin shape
  // `http://placeholder.local/oauth/authorize`) before we ever ask the
  // URL parser what it thinks. Belt-and-suspenders with the hostname
  // check below.
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("\\")) return false;
  try {
    const url = new URL(value, "http://placeholder.local");
    if (url.hostname !== "placeholder.local") return false;
    if (url.pathname !== "/oauth/authorize") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Hash both sides to a fixed length before timingSafeEqual so the compare is
 * fully constant-time even when the two inputs differ in length. (A direct
 * compare returns early on length mismatch and leaks token-length info.)
 */
function timingSafeEqualString(a: string, b: string): boolean {
  const ah = crypto.createHash("sha256").update(a).digest();
  const bh = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ah, bh);
}

async function extractClientName(continueUrl: string): Promise<string> {
  try {
    const url = new URL(continueUrl, "http://placeholder.local");
    const cid = url.searchParams.get("client_id");
    if (!cid) return "this application";
    const rows = await db.select().from(oauthClients).where(eq(oauthClients.id, cid)).limit(1);
    if (rows.length === 0 || rows[0].revokedAt) return "this application";
    return rows[0].clientName || "this application";
  } catch {
    return "this application";
  }
}

function renderError(opts: {
  res: Response;
  csrfToken: string;
  oauthContinue: string;
  clientName: string;
  activeTab: "password" | "voucher" | "api_key";
  prefillEmail?: string;
}): void {
  opts.res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self'; form-action 'self'",
  );
  opts.res.setHeader("Cache-Control", "no-store");
  opts.res.status(401).type("text/html").send(
    renderCredentialForm({
      csrfToken: opts.csrfToken,
      oauthContinue: opts.oauthContinue,
      clientName: opts.clientName,
      activeTab: opts.activeTab,
      prefillEmail: opts.prefillEmail,
      errorMessage: GENERIC_ERROR,
    }),
  );
}

/**
 * POST /oauth/authorize/credential — handles all three unauthenticated
 * credential paths (password / voucher / api_key) for the OAuth handshake.
 *
 * On success: sets the session and 302s back to `oauth_continue` (the same
 * /oauth/authorize?... URL the user was originally trying to reach), where
 * the GET handler will now find a session and render the consent screen.
 *
 * On failure: re-renders the credential form with one generic error message
 * (no enumeration oracle); the precise reason goes to the server log only.
 */
export async function authorizeCredentialHandler(req: Request, res: Response): Promise<void> {
  const body = req.body || {};
  const credType = body.credential_type;
  const csrf = typeof body.csrf === "string" ? body.csrf : "";
  const oauthContinue = body.oauth_continue;
  const sess = req.session as any;

  if (!isSafeContinue(oauthContinue)) {
    await logCredFailure("UNSAFE_CONTINUE", { value: typeof oauthContinue === "string" ? oauthContinue.slice(0, 80) : typeof oauthContinue });
    res.status(400).type("text/plain").send("invalid_request: oauth_continue must be a /oauth/authorize URL on this origin");
    return;
  }

  const sessionCsrf = sess?._oauthCsrf as string | undefined;
  if (!sessionCsrf || !csrf || !timingSafeEqualString(csrf, sessionCsrf)) {
    await logCredFailure("CSRF_MISMATCH", { hasSessionCsrf: !!sessionCsrf, hasBodyCsrf: !!csrf });
    res.status(403).type("text/plain").send("csrf_mismatch");
    return;
  }

  if (credType !== "password" && credType !== "voucher" && credType !== "api_key") {
    await logCredFailure("UNKNOWN_CREDENTIAL_TYPE", { credType });
    res.status(400).type("text/plain").send("invalid_request: unknown credential_type");
    return;
  }

  const clientName = await extractClientName(oauthContinue);

  if (credType === "password") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      await logCredFailure("PASSWORD_MISSING_FIELDS");
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "password", prefillEmail: email });
      return;
    }
    const user = await storage.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      // Inattributable: no org. Server log only.
      await logCredFailure("PASSWORD_USER_NOT_FOUND", { email });
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "password", prefillEmail: email });
      return;
    }
    let passwordOk = false;
    try {
      passwordOk = await comparePasswords(password, user.passwordHash);
    } catch {
      passwordOk = false;
    }
    if (!passwordOk) {
      await logCredFailure(
        "PASSWORD_MISMATCH",
        { userId: user.id },
        { orgId: user.orgId, actorId: user.id, targetType: "user", targetId: user.id, metadata: { email } },
      );
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "password", prefillEmail: email });
      return;
    }
    if (user.status !== "ACTIVE") {
      await logCredFailure(
        "PASSWORD_USER_INACTIVE",
        { userId: user.id, status: user.status },
        { orgId: user.orgId, actorId: user.id, targetType: "user", targetId: user.id, metadata: { status: user.status } },
      );
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "password", prefillEmail: email });
      return;
    }
    sess.userId = user.id;
    sess.orgId = user.orgId;
    sess.orgRole = user.orgRole;
    res.redirect(302, oauthContinue);
    return;
  }

  if (credType === "voucher") {
    const code = typeof body.code === "string" ? body.code.trim() : "";
    if (!code) {
      await logCredFailure("VOUCHER_MISSING_CODE");
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "voucher" });
      return;
    }
    const result = await redeemVoucherInline({ code, instant: true });
    if (!result.ok) {
      const attribution = result.orgId && result.actorId
        ? {
            orgId: result.orgId,
            actorId: result.actorId, // voucher creator (team admin)
            targetType: "voucher" as const,
            targetId: result.voucherId,
            metadata: { code: result.code, message: result.message },
          }
        : undefined;
      await logCredFailure("VOUCHER_REDEEM_FAILED", { code: result.code, message: result.message }, attribution);
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "voucher" });
      return;
    }
    sess.userId = result.user.id;
    sess.orgId = result.user.orgId;
    sess.orgRole = result.user.orgRole;
    // Hand the freshly-minted raw key off to the GET interstitial via the
    // session. The key is also returned to non-OAuth /api/vouchers/redeem
    // callers in JSON, but for the OAuth flow we have no opportunity to
    // surface it from the redirect target (consent doesn't show keys), so
    // we interpose a one-shot interstitial. Stashing in the session means
    // the raw key never appears in URLs, query strings, or browser history.
    let clientId: string | null = null;
    try {
      const u = new URL(oauthContinue, "http://placeholder.local");
      clientId = u.searchParams.get("client_id");
    } catch {
      clientId = null;
    }
    const pending: PendingVoucherKey = {
      apiKey: result.apiKey,
      keyPrefix: result.keyPrefix,
      userId: result.user.id,
      orgId: result.user.orgId,
      oauthContinue,
      clientName,
      clientId,
    };
    sess[VOUCHER_KEY_SESSION_FIELD] = pending;
    res.redirect(302, "/oauth/authorize/voucher-key");
    return;
  }

  // credType === "api_key"
  const rawKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!rawKey) {
    await logCredFailure("APIKEY_MISSING");
    renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "api_key" });
    return;
  }
  const lookup = await lookupApiKey(rawKey);
  if (!lookup.ok) {
    const attribution = lookup.orgId && lookup.userId
      ? {
          orgId: lookup.orgId,
          actorId: lookup.userId,
          targetType: "allotly_api_key" as const,
          targetId: lookup.apiKeyId,
          metadata: { code: lookup.code },
        }
      : undefined;
    await logCredFailure("APIKEY_LOOKUP_FAILED", { code: lookup.code }, attribution);
    renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "api_key" });
    return;
  }
  // Intentionally NO `user.status === "ACTIVE"` gate here. Admins can create
  // a user + key in one step and hand the key out-of-band; the user record
  // stays INVITED until they accept the email and set a password (which is
  // only needed for password login). The proxy (`safeguards.ts:authenticateKey`)
  // accepts the same key for direct API/MCP calls without this gate, and
  // `lookupApiKey` documents that it mirrors the proxy. Re-adding a
  // `user.status` check here would silently break admin-distributed keys
  // that already work via the raw proxy path.
  sess.userId = lookup.user.id;
  sess.orgId = lookup.user.orgId;
  sess.orgRole = lookup.user.orgRole;
  res.redirect(302, oauthContinue);
}

/**
 * Per-credential rate limiting: voucher / api_key submissions reuse the
 * 5/hr `redeemLimiter` because they're cost-bearing (each voucher attempt
 * touches Stripe pricing data and may mint a synthetic user); password
 * submissions reuse the 10/hr `loginLimiter` to match the regular login
 * surface. We pick the limiter based on the form field BEFORE the handler
 * runs so an attacker can't bypass the lower limit by tagging brute-force
 * attempts as credential_type=password.
 */
export function credentialRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const credType = (req.body || {}).credential_type;
  const limiter = credType === "password" ? loginLimiter : redeemLimiter;
  limiter(req, res, next);
}

/**
 * GET /oauth/authorize/voucher-key — single-shot interstitial that surfaces
 * the freshly-minted Allotly API key after a successful voucher credential
 * POST. Reads `_oauthVoucherKey` from the session, renders the page, then
 * deletes the field so a refresh / back-button never re-displays the key.
 *
 * Audit-logs `voucher.oauth_key_displayed` exactly once per render. The
 * audit metadata records the key prefix and host client_id only — the raw
 * key is never persisted, never logged, and never written to the URL.
 *
 * If the session field is missing (refresh after consume, direct hit, etc.)
 * the user is bounced to the login page rather than shown an error oracle.
 */
export async function voucherKeyDisplayHandler(req: Request, res: Response): Promise<void> {
  const sess = req.session as any;
  const pending = sess?.[VOUCHER_KEY_SESSION_FIELD] as PendingVoucherKey | undefined;
  if (!pending || typeof pending !== "object" || typeof pending.apiKey !== "string") {
    // No pending key — most likely a refresh after the one-shot consumed it,
    // or someone hitting the URL directly. Send them back to the start of
    // the OAuth flow rather than leaking that "there was once a key here".
    res.redirect(302, "/login");
    return;
  }
  // Re-validate the stashed continue URL on every render. Without this, a
  // tampered session value (e.g. via session-fixation against a logged-out
  // attacker) could redirect the next click off-origin. isSafeContinue()
  // already rejects every absolute URL, scheme-relative, and traversal form.
  const safeContinue = isSafeContinue(pending.oauthContinue) ? pending.oauthContinue : "/oauth/authorize";

  // CRITICAL: clear the session field BEFORE rendering. If the render path
  // throws after we send headers, we've still removed the raw key from the
  // session — a retry will land on the "no pending" branch above rather than
  // re-showing the key.
  delete sess[VOUCHER_KEY_SESSION_FIELD];

  // Audit log: one row per displayed key. Metadata carries the key prefix
  // (the first ~12 chars users see in the dashboard, safe to log) and the
  // OAuth client_id of the host that triggered the display. The raw key is
  // intentionally absent.
  try {
    const entry: InsertAuditLog = {
      orgId: pending.orgId,
      actorId: pending.userId,
      action: "voucher.oauth_key_displayed",
      targetType: "user",
      targetId: pending.userId,
      metadata: {
        keyPrefix: pending.keyPrefix,
        oauthClientId: pending.clientId,
      },
    };
    await storage.createAuditLog(entry);
  } catch (e) {
    // An audit-log failure must not block surfacing the key to the user —
    // we've already deleted the session field, so a non-displayed key would
    // be permanently unrecoverable. Log to server console and continue.
    console.log(`[oauth-credential] voucher_key audit_log write failed err=${(e as Error).message}`);
  }

  const locale = pickVoucherKeyLocale(req);
  const html = renderVoucherKeyPage({
    apiKey: pending.apiKey,
    continueUrl: safeContinue,
    hostName: pending.clientName,
    locale,
  });
  // Strict CSP: same shape as the credential form, plus Cache-Control:no-store
  // so the raw key isn't retained in the browser's HTTP cache or any
  // intermediary. `script-src 'none'` rules out injected JS exfiltrating
  // the key from the DOM. `form-action 'self'` is harmless here (no form)
  // but keeps the header consistent with sibling OAuth pages.
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self'; form-action 'self'",
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.type("text/html").send(html);
}

/**
 * Mirror of the GET-side render so authorize.ts can show the same form
 * when the visitor has no session. Exposed for that single caller.
 */
export async function renderCredentialFormForRequest(req: Request, res: Response, opts: {
  csrfToken: string;
  oauthContinue: string;
  clientName: string;
}): Promise<void> {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'none'; img-src 'self'; form-action 'self'",
  );
  res.setHeader("Cache-Control", "no-store");
  res.type("text/html").send(
    renderCredentialForm({
      csrfToken: opts.csrfToken,
      oauthContinue: opts.oauthContinue,
      clientName: opts.clientName,
    }),
  );
}
