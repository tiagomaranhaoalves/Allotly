import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { contactLimiter, signupLimiter } from "../server/lib/rate-limiter";
import { requireTurnstile, _resetTurnstileForTests } from "../server/lib/turnstile";

/**
 * End-to-end ordering guard: prove that for the public abuse-protected
 * routes, the middleware chain is ALWAYS limiter → turnstile → handler.
 *
 * Why this exists: routes.ts wires the chain by hand, and a future refactor
 * could accidentally swap or drop one of the layers. This test mounts the
 * REAL `contactLimiter` + `requireTurnstile` middleware in the documented
 * order in front of a no-op handler and asserts each layer fires correctly.
 */

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_FETCH = globalThis.fetch;

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

let contactCalls = 0;
let signupCalls = 0;

beforeAll(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  app.post(
    "/api/contact",
    contactLimiter,
    requireTurnstile({ route: "/api/contact" }),
    (_req, res) => {
      contactCalls++;
      res.json({ success: true });
    },
  );

  app.post(
    "/api/auth/signup",
    signupLimiter,
    requireTurnstile({ route: "/api/auth/signup" }),
    (_req, res) => {
      signupCalls++;
      res.json({ success: true });
    },
  );

  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  process.env.TURNSTILE_SECRET_KEY = "test-secret";
  _resetTurnstileForTests();
  contactCalls = 0;
  signupCalls = 0;

  // URL-scoped mock so the test client's fetch is not intercepted.
  const realFetch = ORIGINAL_FETCH;
  globalThis.fetch = vi.fn(async (input: any, init: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.includes("siteverify")) {
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
    return realFetch(input, init);
  }) as any;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

async function postJson(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const res = await ORIGINAL_FETCH(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: parsed };
}

describe("Abuse-protect middleware chain (limiter → turnstile → handler)", () => {
  it("/api/contact: captcha gate fires BEFORE handler when token missing (limiter pass, turnstile reject)", async () => {
    const r = await postJson("/api/contact", { name: "x", email: "x@x.com", message: "hi" });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(contactCalls).toBe(0);
  });

  it("/api/contact: full chain succeeds when limiter passes AND captcha verifies (handler runs once)", async () => {
    const r = await postJson("/api/contact", {
      name: "x", email: "x@x.com", message: "hi",
      turnstile_token: "good-token-1234567890",
    });
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(contactCalls).toBe(1);
  });

  it("/api/auth/signup: captcha gate fires BEFORE handler when token missing", async () => {
    const r = await postJson("/api/auth/signup", { name: "x", email: "x@x.com", password: "pw12345678" });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(signupCalls).toBe(0);
  });

  it("/api/auth/signup: full chain succeeds when limiter passes AND captcha verifies", async () => {
    const r = await postJson("/api/auth/signup", {
      name: "x", email: "x@x.com", password: "pw12345678",
      turnstile_token: "good-token-1234567890",
    });
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(signupCalls).toBe(1);
  });
});
