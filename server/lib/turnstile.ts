import type { Request, Response, NextFunction } from "express";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5000;
const SUCCESS_CACHE_TTL_MS = 60_000;
const SUCCESS_CACHE_MAX = 1000;

const successCache = new Map<string, number>();

let startupWarningEmitted = false;
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
    const ua = (req.headers["user-agent"] as string | undefined)?.slice(0, 80) || "unknown";
    console.log(
      `[abuse-protect] cause=CAPTCHA_FAILED route=${opts.route} ip=${ip} reason=${result.code} ua=${JSON.stringify(ua)}`,
    );
    res.status(400).json({
      message: "Captcha verification required. Please complete the challenge and try again.",
      code: "captcha_required",
    });
  };
}

export function _resetTurnstileForTests(): void {
  successCache.clear();
  startupWarningEmitted = false;
}
