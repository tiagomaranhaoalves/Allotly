import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { verifyTurnstileToken, isTurnstileEnabled, _resetTurnstileForTests } from "../server/lib/turnstile";

const ORIGINAL_SECRET = process.env.TURNSTILE_SECRET_KEY;
const ORIGINAL_FETCH = globalThis.fetch;

function setSecret(value: string | undefined): void {
  if (value === undefined) delete process.env.TURNSTILE_SECRET_KEY;
  else process.env.TURNSTILE_SECRET_KEY = value;
}

function mockFetch(impl: (url: string, init: RequestInit) => Promise<Response>): void {
  globalThis.fetch = vi.fn(async (input: any, init: any) => impl(String(input), init || {})) as any;
}

describe("Turnstile helper", () => {
  beforeEach(() => {
    _resetTurnstileForTests();
  });

  afterEach(() => {
    setSecret(ORIGINAL_SECRET);
    globalThis.fetch = ORIGINAL_FETCH;
    vi.restoreAllMocks();
  });

  it("isTurnstileEnabled reflects the env var", () => {
    setSecret(undefined);
    expect(isTurnstileEnabled()).toBe(false);
    setSecret("test-secret");
    expect(isTurnstileEnabled()).toBe(true);
  });

  it("skips cleanly when TURNSTILE_SECRET_KEY is unset", async () => {
    setSecret(undefined);
    const result = await verifyTurnstileToken("anything", "1.2.3.4");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.skipped).toBe(true);
  });

  it("rejects missing tokens when secret is set", async () => {
    setSecret("test-secret");
    const r1 = await verifyTurnstileToken(undefined, "1.2.3.4");
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.code).toBe("missing_token");

    const r2 = await verifyTurnstileToken("", "1.2.3.4");
    expect(r2.ok).toBe(false);

    const r3 = await verifyTurnstileToken("short", "1.2.3.4");
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.code).toBe("missing_token");
  });

  it("verifies a successful token by hitting siteverify", async () => {
    setSecret("test-secret");
    let calledUrl = "";
    let calledBody = "";
    mockFetch(async (url, init) => {
      calledUrl = url;
      calledBody = String(init.body || "");
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const result = await verifyTurnstileToken("a-valid-token-12345", "9.9.9.9");
    expect(result.ok).toBe(true);
    expect(calledUrl).toContain("siteverify");
    expect(calledBody).toContain("secret=test-secret");
    expect(calledBody).toContain("response=a-valid-token-12345");
    expect(calledBody).toContain("remoteip=9.9.9.9");
  });

  it("returns verification_failed when siteverify says success=false", async () => {
    setSecret("test-secret");
    mockFetch(async () => new Response(JSON.stringify({ success: false, "error-codes": ["bad"] }), { status: 200 }));
    const result = await verifyTurnstileToken("a-valid-looking-token-xx", "1.1.1.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("verification_failed");
  });

  it("returns verifier_unreachable on non-200 response", async () => {
    setSecret("test-secret");
    mockFetch(async () => new Response("oops", { status: 500 }));
    const result = await verifyTurnstileToken("a-valid-looking-token-xx", "1.1.1.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("verifier_unreachable");
  });

  it("returns verifier_unreachable on fetch throw", async () => {
    setSecret("test-secret");
    globalThis.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as any;
    const result = await verifyTurnstileToken("a-valid-looking-token-xx", "1.1.1.1");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("verifier_unreachable");
  });

  it("caches successful verifications to tolerate retries", async () => {
    setSecret("test-secret");
    let calls = 0;
    mockFetch(async () => {
      calls++;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    });
    const r1 = await verifyTurnstileToken("token-cached-12345678", "5.5.5.5");
    const r2 = await verifyTurnstileToken("token-cached-12345678", "5.5.5.5");
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(calls).toBe(1);
  });
});
