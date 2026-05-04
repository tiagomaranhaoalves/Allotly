import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { contactLimiter, signupLimiter, voucherValidateLimiter } from "../server/lib/rate-limiter";

function makeApp() {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.post("/api/contact", contactLimiter, (_req, res) => res.json({ ok: true }));
  app.post("/api/auth/signup", signupLimiter, (_req, res) => res.json({ ok: true }));
  app.get("/api/vouchers/validate/:code", voucherValidateLimiter, (_req, res) => res.json({ ok: true }));
  return app;
}

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let port: number;

beforeAll(async () => {
  const app = makeApp();
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

async function hit(path: string, method: "GET" | "POST" = "POST"): Promise<number> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  return res.status;
}

async function hitWithStatus(path: string, method: "GET" | "POST" = "POST"): Promise<{ status: number; body: any }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? "{}" : undefined,
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

describe("Rate limiters for public endpoints", () => {
  it("contactLimiter trips after 3 attempts in the same window", async () => {
    expect(await hit("/api/contact")).toBe(200);
    expect(await hit("/api/contact")).toBe(200);
    expect(await hit("/api/contact")).toBe(200);
    const blocked = await hitWithStatus("/api/contact");
    expect(blocked.status).toBe(429);
    expect(blocked.body?.message).toMatch(/contact submissions/i);
  });

  it("signupLimiter trips after 5 attempts in the same window", async () => {
    for (let i = 0; i < 5; i++) {
      expect(await hit("/api/auth/signup")).toBe(200);
    }
    const blocked = await hitWithStatus("/api/auth/signup");
    expect(blocked.status).toBe(429);
    expect(blocked.body?.message).toMatch(/signup attempts/i);
  });

  it("voucherValidateLimiter trips after 30 attempts in the same window", async () => {
    for (let i = 0; i < 30; i++) {
      expect(await hit(`/api/vouchers/validate/code-${i}`, "GET")).toBe(200);
    }
    const blocked = await hitWithStatus("/api/vouchers/validate/code-31", "GET");
    expect(blocked.status).toBe(429);
    expect(blocked.body?.message).toMatch(/voucher lookups/i);
  });
});
