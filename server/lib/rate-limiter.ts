import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

export function logBlocked(cause: "RATE_LIMITED" | "CAPTCHA_FAILED", route: string, req: Request, extra: Record<string, string | number> = {}): void {
  const ip = req.ip || "unknown";
  const ua = (req.headers["user-agent"] as string | undefined)?.slice(0, 80) || "unknown";
  const extras = Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ");
  console.log(`[abuse-protect] cause=${cause} route=${route} ip=${ip} ua=${JSON.stringify(ua)}${extras ? " " + extras : ""}`);
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (Number.isFinite(n) && n > 0 && n < 100_000) return n;
  return fallback;
}

export const loginLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ message: "Too many login attempts. Please try again in an hour." });
  },
});

export const redeemLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ message: "Too many redemption attempts. Please try again later." });
  },
});

export const regenerateKeyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const memberId = req.params.id || req.params.membershipId || "unknown";
    return `regen:${memberId}:${req.session?.userId || "anon"}`;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ message: "Key regeneration limit reached. Please try again later." });
  },
});

export const adminLoginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ message: "Too many admin login attempts. Please try again in a minute." });
  },
});

export const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: intFromEnv("CONTACT_RATE_LIMIT_PER_HOUR", 3),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logBlocked("RATE_LIMITED", "/api/contact", req);
    res.status(429).json({ message: "Too many contact submissions. Please try again later." });
  },
});

export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: intFromEnv("SIGNUP_RATE_LIMIT_PER_HOUR", 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logBlocked("RATE_LIMITED", "/api/auth/signup", req);
    res.status(429).json({ message: "Too many signup attempts from this network. Please try again in an hour." });
  },
});

export const voucherValidateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logBlocked("RATE_LIMITED", "/api/vouchers/validate", req);
    res.status(429).json({ message: "Too many voucher lookups. Please try again later." });
  },
});
