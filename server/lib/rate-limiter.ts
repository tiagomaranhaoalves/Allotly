import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

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
