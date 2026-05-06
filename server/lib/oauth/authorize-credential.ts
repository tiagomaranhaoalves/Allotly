import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { db } from "../../db";
import { oauthClients } from "@shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "../../storage";
import { comparePasswords } from "../password";
import { redeemVoucherInline } from "../vouchers/redeem-inline";
import { lookupApiKey } from "../auth/api-key-lookup";
import { renderCredentialForm } from "./credential-form-template";
import { loginLimiter, redeemLimiter } from "../rate-limiter";

const GENERIC_ERROR = "We couldn't sign you in with those credentials. Please double-check and try again.";

function logCredFailure(cause: string, ctx: Record<string, unknown> = {}): void {
  const parts = [`cause=${cause}`];
  for (const [k, v] of Object.entries(ctx)) {
    if (v !== undefined && v !== null) parts.push(`${k}=${v}`);
  }
  console.log(`[oauth-credential] FAIL ${parts.join(" ")}`);
}

/**
 * `oauth_continue` MUST be a relative path on our origin pointing back at
 * /oauth/authorize. This blocks open-redirect via crafted hidden field.
 */
function isSafeContinue(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!value.startsWith("/oauth/authorize")) return false;
  if (value.startsWith("//")) return false;
  if (value.includes("://")) return false;
  // Backslash defeats some URL-parser disagreements between Node and browsers
  // (treated as path-separator by some clients). Reject defensively.
  if (value.includes("\\")) return false;
  return true;
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
    logCredFailure("UNSAFE_CONTINUE", { value: typeof oauthContinue === "string" ? oauthContinue.slice(0, 80) : typeof oauthContinue });
    res.status(400).type("text/plain").send("invalid_request: oauth_continue must be a /oauth/authorize URL on this origin");
    return;
  }

  const sessionCsrf = sess?._oauthCsrf as string | undefined;
  if (!sessionCsrf || !csrf || !timingSafeEqualString(csrf, sessionCsrf)) {
    logCredFailure("CSRF_MISMATCH", { hasSessionCsrf: !!sessionCsrf, hasBodyCsrf: !!csrf });
    res.status(403).type("text/plain").send("csrf_mismatch");
    return;
  }

  if (credType !== "password" && credType !== "voucher" && credType !== "api_key") {
    logCredFailure("UNKNOWN_CREDENTIAL_TYPE", { credType });
    res.status(400).type("text/plain").send("invalid_request: unknown credential_type");
    return;
  }

  const clientName = await extractClientName(oauthContinue);

  if (credType === "password") {
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!email || !password) {
      logCredFailure("PASSWORD_MISSING_FIELDS");
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "password", prefillEmail: email });
      return;
    }
    const user = await storage.getUserByEmail(email);
    if (!user || !user.passwordHash) {
      logCredFailure("PASSWORD_USER_NOT_FOUND", { email });
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
      logCredFailure("PASSWORD_MISMATCH", { userId: user.id });
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "password", prefillEmail: email });
      return;
    }
    if (user.status !== "ACTIVE") {
      logCredFailure("PASSWORD_USER_INACTIVE", { userId: user.id, status: user.status });
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
      logCredFailure("VOUCHER_MISSING_CODE");
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "voucher" });
      return;
    }
    const result = await redeemVoucherInline({ code, instant: true });
    if (!result.ok) {
      logCredFailure("VOUCHER_REDEEM_FAILED", { code: result.code, message: result.message });
      renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "voucher" });
      return;
    }
    sess.userId = result.user.id;
    sess.orgId = result.user.orgId;
    sess.orgRole = result.user.orgRole;
    res.redirect(302, oauthContinue);
    return;
  }

  // credType === "api_key"
  const rawKey = typeof body.api_key === "string" ? body.api_key.trim() : "";
  if (!rawKey) {
    logCredFailure("APIKEY_MISSING");
    renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "api_key" });
    return;
  }
  const lookup = await lookupApiKey(rawKey);
  if (!lookup.ok) {
    logCredFailure("APIKEY_LOOKUP_FAILED", { code: lookup.code });
    renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "api_key" });
    return;
  }
  if (lookup.user.status !== "ACTIVE") {
    logCredFailure("APIKEY_USER_INACTIVE", { userId: lookup.user.id, status: lookup.user.status });
    renderError({ res, csrfToken: sessionCsrf, oauthContinue, clientName, activeTab: "api_key" });
    return;
  }
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
