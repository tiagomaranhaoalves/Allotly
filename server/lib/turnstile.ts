import type { Request, Response, NextFunction } from "express";
import { logBlocked } from "./rate-limiter";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;
const SUCCESS_CACHE_TTL_MS = 60_000;
const SUCCESS_CACHE_MAX = 1000;

const successCache = new Map<string, number>();

let startupWarningEmitted = false;
let siteKeyWarningEmitted = false;
function emitStartupWarningOnce(): void {
  if (startupWarningEmitted) return;
  startupWarningEmitted = true;
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[turnstile] WARNING: TURNSTILE_SECRET_KEY is not set in production — captcha verification is DISABLED. " +
        "Set TURNSTILE_SECRET_KEY (server) and VITE_TURNSTILE_SITE_KEY (client) to enable.",
    );
  } else {
    console.log("[turnstile] TURNSTILE_SECRET_KEY not set — captcha verification skipped (dev mode).");
  }
}

function emitSplitKeyWarningOnce(): void {
  if (siteKeyWarningEmitted) return;
  siteKeyWarningEmitted = true;
  if (process.env.NODE_ENV === "production") {
    // VITE_* vars are read at frontend BUILD time and may legitimately be absent
    // from the server's runtime env (e.g. when frontend was built in a separate
    // step). This is informational, not an alarm — only an issue if the deployed
    // frontend bundle was also built without VITE_TURNSTILE_SITE_KEY.
    console.log(
      "[turnstile] note: TURNSTILE_SECRET_KEY is set but VITE_TURNSTILE_SITE_KEY is not present in the server runtime env. " +
        "If the frontend bundle was also built without it, captcha will silently reject every request because the form has no widget. " +
        "Confirm VITE_TURNSTILE_SITE_KEY was set at build time.",
    );
  }
}

export type TurnstileResult =
  | { ok: true; skipped?: boolean }
  | { ok: false; code: "missing_token" | "verification_failed" | "verifier_unreachable" };

export function isTurnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Eagerly emit the misconfiguration warning at server startup so operators
 * notice the disabled-captcha state immediately, not on the first protected
 * request. Safe to call multiple times — the warning is one-shot.
 */
export function warnIfTurnstileMissingAtStartup(): void {
  if (!process.env.TURNSTILE_SECRET_KEY) {
    emitStartupWarningOnce();
    return;
  }
  // Server secret is set; check the public site key too — split config will
  // silently break every request because the frontend can't present a token.
  if (!process.env.VITE_TURNSTILE_SITE_KEY) {
    emitSplitKeyWarningOnce();
  }
}

function pruneCache(): void {
  if (successCache.size <= SUCCESS_CACHE_MAX) return;
  const now = Date.now();
  const entries = Array.from(successCache.entries());
  for (const [k, exp] of entries) {
    if (exp < now) successCache.delete(k);
  }
  if (successCache.size > SUCCESS_CACHE_MAX) {
    const overflow = successCache.size - SUCCESS_CACHE_MAX;
    const keys = Array.from(successCache.keys());
    for (let i = 0; i < overflow && i < keys.length; i++) {
      successCache.delete(keys[i]);
    }
  }
}

export async function verifyTurnstileToken(
  token: string | undefined | null,
  ip: string | undefined,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    emitStartupWarningOnce();
    return { ok: true, skipped: true };
  }
  if (!token || typeof token !== "string" || token.length < 10 || token.length > 4096) {
    return { ok: false, code: "missing_token" };
  }

  const cacheKey = `${token}|${ip || ""}`;
  const cachedExp = successCache.get(cacheKey);
  if (cachedExp && cachedExp > Date.now()) {
    return { ok: true };
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);
  if (ip) body.set("remoteip", ip);

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { ok: false, code: "verifier_unreachable" };
    }
    const json = (await res.json()) as { success?: boolean };
    if (json && json.success === true) {
      successCache.set(cacheKey, Date.now() + SUCCESS_CACHE_TTL_MS);
      pruneCache();
      return { ok: true };
    }
    return { ok: false, code: "verification_failed" };
  } catch {
    return { ok: false, code: "verifier_unreachable" };
  } finally {
    clearTimeout(timeout);
  }
}

export interface RequireTurnstileOptions {
  route: string;
  tokenField?: string;
}

export function requireTurnstile(opts: RequireTurnstileOptions) {
  const tokenField = opts.tokenField || "turnstile_token";
  return async function turnstileMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const token = req.body?.[tokenField] as string | undefined;
    const ip = req.ip || "unknown";
    const result = await verifyTurnstileToken(token, ip);
    if (result.ok) {
      if (req.body && tokenField in req.body) {
        delete req.body[tokenField];
      }
      next();
      return;
    }
    logBlocked("CAPTCHA_FAILED", opts.route, req, { reason: result.code });
    res.status(400).json({
      message: "Captcha verification required. Please complete the challenge and try again.",
      code: "captcha_required",
    });
  };
}

export function _resetTurnstileForTests(): void {
  successCache.clear();
  startupWarningEmitted = false;
  siteKeyWarningEmitted = false;
}
