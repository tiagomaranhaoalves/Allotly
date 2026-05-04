import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import { requireTurnstile, _resetTurnstileForTests } from "../server/lib/turnstile";

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_FETCH = globalThis.fetch;

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

let contactHandlerCalls: number;
let signupHandlerCalls: number;

beforeAll(async () => {
  // Note: This file purposefully does NOT include the rate limiters.
  // The rate-limiter tests in tests/rate-limiter.test.ts already prove the
  // limiter blocks before the handler. This file's invariant is narrower:
  // the captcha middleware must reject before the handler runs, regardless
  // of rate-limit state.
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());

  app.post(
    "/api/contact",
    requireTurnstile({ route: "/api/contact" }),
    (_req, res) => {
      contactHandlerCalls++;
      res.json({ success: true });
    },
  );

  app.post(
    "/api/auth/signup",
    requireTurnstile({ route: "/api/auth/signup" }),
    (_req, res) => {
      signupHandlerCalls++;
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
  contactHandlerCalls = 0;
  signupHandlerCalls = 0;
});

afterEach(() => {
  if (ORIGINAL_SECRET === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = ORIGINAL_SECRET;
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

/**
 * Mock ONLY Cloudflare siteverify calls; pass everything else (including
 * our own test-client requests to baseUrl) through to the real fetch.
 */
function mockSiteverify(siteverifyImpl: () => Promise<Response>): void {
  const realFetch = ORIGINAL_FETCH;
  globalThis.fetch = vi.fn(async (input: any, init: any) => {
    const url = String(typeof input === "string" ? input : input?.url ?? "");
    if (url.includes("siteverify")) {
      return siteverifyImpl();
    }
    return realFetch(input, init);
  }) as any;
}

async function postJson(
  path: string,
  body: unknown,
): Promise<{ status: number; body: any }> {
  const res = await ORIGINAL_FETCH(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let parsed: any = null;
  try { parsed = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body: parsed };
}

describe("Captcha middleware blocks side effects on contact/signup", () => {
  it("rejects /api/contact without a token BEFORE the handler runs", async () => {
    const r = await postJson("/api/contact", { name: "x", email: "x@x.com", message: "hi" });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(contactHandlerCalls).toBe(0);
  });

  it("rejects /api/contact with a too-short token BEFORE the handler runs", async () => {
    const r = await postJson("/api/contact", {
      name: "x", email: "x@x.com", message: "hi", turnstile_token: "no",
    });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(contactHandlerCalls).toBe(0);
  });

  it("rejects /api/contact when siteverify reports failure BEFORE the handler runs", async () => {
    mockSiteverify(async () =>
      new Response(JSON.stringify({ success: false, "error-codes": ["bad"] }), { status: 200 }),
    );
    const r = await postJson("/api/contact", {
      name: "x", email: "x@x.com", message: "hi", turnstile_token: "looks-like-a-token-12345",
    });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(contactHandlerCalls).toBe(0);
  });

  it("invokes /api/contact handler ONLY after siteverify reports success", async () => {
    mockSiteverify(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const r = await postJson("/api/contact", {
      name: "x", email: "x@x.com", message: "hi", turnstile_token: "good-token-1234567890",
    });
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(contactHandlerCalls).toBe(1);
  });

  it("rejects /api/auth/signup without a token BEFORE the handler runs", async () => {
    const r = await postJson("/api/auth/signup", {
      name: "x", email: "x@x.com", password: "pw12345678",
    });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(signupHandlerCalls).toBe(0);
  });

  it("rejects /api/auth/signup when siteverify reports failure BEFORE the handler runs", async () => {
    mockSiteverify(async () =>
      new Response(JSON.stringify({ success: false, "error-codes": ["bad"] }), { status: 200 }),
    );
    const r = await postJson("/api/auth/signup", {
      name: "x", email: "x@x.com", password: "pw12345678", turnstile_token: "looks-like-a-token-12345",
    });
    expect(r.status).toBe(400);
    expect(r.body?.code).toBe("captcha_required");
    expect(signupHandlerCalls).toBe(0);
  });

  it("invokes /api/auth/signup handler ONLY after siteverify reports success", async () => {
    mockSiteverify(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    const r = await postJson("/api/auth/signup", {
      name: "x", email: "x@x.com", password: "pw12345678", turnstile_token: "good-token-1234567890",
    });
    expect(r.status).toBe(200);
    expect(r.body?.success).toBe(true);
    expect(signupHandlerCalls).toBe(1);
  });

  it("strips the turnstile_token from req.body before invoking the handler", async () => {
    mockSiteverify(async () =>
      new Response(JSON.stringify({ success: true }), { status: 200 }),
    );
    let receivedBody: any = null;
    const probeApp = express();
    probeApp.use(express.json());
    probeApp.post(
      "/probe",
      requireTurnstile({ route: "/probe" }),
      (req, res) => {
        receivedBody = req.body;
        res.json({ ok: true });
      },
    );
    const probeServer = await new Promise<ReturnType<ReturnType<typeof express>["listen"]>>(resolve => {
      const s = probeApp.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const port = (probeServer.address() as AddressInfo).port;
      const res = await ORIGINAL_FETCH(`http://127.0.0.1:${port}/probe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foo: "bar", turnstile_token: "good-token-1234567890" }),
      });
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(receivedBody).toEqual({ foo: "bar" });
      expect(receivedBody.turnstile_token).toBeUndefined();
    } finally {
      await new Promise<void>(resolve => probeServer.close(() => resolve()));
    }
  });
});
