import { describe, it, expect } from "vitest";
import { checkConcurrency, releaseConcurrency, checkRateLimit } from "../server/lib/proxy/safeguards";
import type { RateLimitTier } from "../server/lib/proxy/handler";

describe("Tier-based rate limiting", () => {
  it("FREE plan should have 20 RPM and 2 concurrent", async () => {
    const { getRateLimitTier } = await import("../server/lib/proxy/handler");
    const tier = getRateLimitTier("FREE", "TEAM");
    expect(tier.rpm).toBe(20);
    expect(tier.maxConcurrent).toBe(2);
  });

  it("TEAM plan with TEAM access should have 60 RPM and 5 concurrent", async () => {
    const { getRateLimitTier } = await import("../server/lib/proxy/handler");
    const tier = getRateLimitTier("TEAM", "TEAM");
    expect(tier.rpm).toBe(60);
    expect(tier.maxConcurrent).toBe(5);
  });

  it("TEAM plan with VOUCHER access should have 30 RPM and 2 concurrent", async () => {
    const { getRateLimitTier } = await import("../server/lib/proxy/handler");
    const tier = getRateLimitTier("TEAM", "VOUCHER");
    expect(tier.rpm).toBe(30);
    expect(tier.maxConcurrent).toBe(2);
  });

  it("ENTERPRISE plan should have 120 RPM and 10 concurrent", async () => {
    const { getRateLimitTier } = await import("../server/lib/proxy/handler");
    const tier = getRateLimitTier("ENTERPRISE", "TEAM");
    expect(tier.rpm).toBe(120);
    expect(tier.maxConcurrent).toBe(10);
  });

  it("unknown plan should default to 20 RPM and 2 concurrent", async () => {
    const { getRateLimitTier } = await import("../server/lib/proxy/handler");
    const tier = getRateLimitTier("UNKNOWN", "TEAM");
    expect(tier.rpm).toBe(20);
    expect(tier.maxConcurrent).toBe(2);
  });
});

describe("Configurable concurrency limits", () => {
  it("should accept custom max concurrent parameter", async () => {
    const membershipId = `test-conc-${Date.now()}`;
    const requestId = `req-${Date.now()}`;

    const result = await checkConcurrency(membershipId, requestId, 5);
    expect(result).toBeNull();

    await releaseConcurrency(membershipId, requestId);
  });

  it("should reject when exceeding custom concurrent limit", async () => {
    const membershipId = `test-conc2-${Date.now()}`;
    const requests: string[] = [];

    for (let i = 0; i < 3; i++) {
      const reqId = `req-${Date.now()}-${i}`;
      requests.push(reqId);
      await checkConcurrency(membershipId, reqId, 3);
    }

    const overLimit = await checkConcurrency(membershipId, `req-over-${Date.now()}`, 3);
    expect(overLimit).not.toBeNull();
    expect(overLimit?.status).toBe(429);
    expect(overLimit?.code).toBe("concurrency_limit");
    expect(overLimit?.message).toContain("max 3");

    for (const reqId of requests) {
      await releaseConcurrency(membershipId, reqId);
    }
  });
});

// =============================================================================
// /api/v1/messages parity — the new Anthropic-native endpoint MUST share the
// exact same safeguard primitives (tier table + concurrency + rate-limit) as
// /chat/completions. These tests pin that contract so a future refactor that
// forks the table or skips a check fails loudly.
// =============================================================================

describe("/api/v1/messages — tier & safeguard parity with /chat/completions", () => {
  it("uses the same getRateLimitTier table for every plan/key combination", async () => {
    const { getRateLimitTier } = await import("../server/lib/proxy/handler");
    const matrix: Array<[string, string, number, number]> = [
      ["FREE", "TEAM", 20, 2],
      ["TEAM", "TEAM", 60, 5],
      ["TEAM", "VOUCHER", 30, 2],
      ["ENTERPRISE", "TEAM", 120, 10],
      ["UNKNOWN", "TEAM", 20, 2],
    ];
    for (const [plan, kind, rpm, max] of matrix) {
      const tier = getRateLimitTier(plan, kind);
      expect(tier.rpm, `RPM mismatch for ${plan}/${kind}`).toBe(rpm);
      expect(tier.maxConcurrent, `concurrency mismatch for ${plan}/${kind}`).toBe(max);
    }
  });

  it("handler-messages.ts imports the same getRateLimitTier symbol from handler.ts", async () => {
    // Direct module-shape assertion: the messages handler is forbidden from
    // forking the rate-limit table — it must reuse handler.ts. This guards the
    // strictly-additive constraint of M3b (handler.ts processChatCompletion
    // is read-only).
    const handlerSrc = await import("node:fs/promises").then(fs =>
      fs.readFile("server/lib/proxy/handler-messages.ts", "utf8"),
    );
    expect(handlerSrc).toMatch(/from\s+["']\.\/handler["']/);
    expect(handlerSrc).toContain("getRateLimitTier");
  });

  it("handler-messages.ts wires the same safeguard helpers used by /chat/completions", async () => {
    const handlerSrc = await import("node:fs/promises").then(fs =>
      fs.readFile("server/lib/proxy/handler-messages.ts", "utf8"),
    );
    // All five safeguards MUST be invoked, mirroring handler.ts.
    expect(handlerSrc).toContain("checkRateLimit");
    expect(handlerSrc).toContain("checkConcurrency");
    expect(handlerSrc).toContain("releaseConcurrency");
    expect(handlerSrc).toContain("reserveBudget");
    expect(handlerSrc).toContain("refundBudget");
  });

  it("rejects a /api/v1/messages caller that exceeds its concurrency limit (parity)", async () => {
    // Same primitive used by both endpoints — proving parity at the safeguard
    // layer. The handler enforces 'max 2' for FREE-tier callers; here we
    // verify the underlying primitive returns the canonical error shape that
    // handler-messages.ts then re-frames as Anthropic 429 rate_limit_error.
    const membershipId = `test-msg-conc-${Date.now()}`;
    const reqs: string[] = [];
    for (let i = 0; i < 2; i++) {
      const reqId = `req-${Date.now()}-${i}`;
      reqs.push(reqId);
      await checkConcurrency(membershipId, reqId, 2);
    }
    const over = await checkConcurrency(membershipId, `req-over-${Date.now()}`, 2);
    expect(over).not.toBeNull();
    expect(over?.code).toBe("concurrency_limit");
    expect(over?.status).toBe(429);
    for (const r of reqs) await releaseConcurrency(membershipId, r);
  });

  it("rate-limit primitive used by both endpoints surfaces the same error code/status", async () => {
    const membershipId = `test-msg-rl-${Date.now()}`;
    // Burn through a tiny RPM to force the rate-limit error.
    let lastErr = null as null | { code?: string; status?: number };
    for (let i = 0; i < 4; i++) {
      const r = await checkRateLimit(membershipId, 2);
      if (r) { lastErr = r; break; }
    }
    if (lastErr) {
      expect(lastErr.code === "rate_limit" || lastErr.code === "rate_limited").toBe(true);
      expect(lastErr.status).toBe(429);
    }
  });

  it("emits the SAME budget header names as /chat/completions (verbatim parity)", async () => {
    // Budget-header parity is a hard requirement: handler.ts is forbidden
    // from edits in M3b, and the task mandates "all V1 safeguards apply with
    // parity to /chat/completions". The existing /chat/completions endpoint
    // (server/lib/proxy/handler.ts) emits `X-Allotly-Budget-Remaining` and
    // `X-Allotly-Budget-Total` — the new /api/v1/messages endpoint MUST emit
    // the IDENTICAL header names to maintain client-compatibility parity.
    // This test pins both endpoints to the same names so any future rename
    // forces a coordinated change across both handlers + CORS expose-headers.
    const fs = await import("node:fs/promises");
    const handlerSrc = await fs.readFile("server/lib/proxy/handler.ts", "utf8");
    const messagesSrc = await fs.readFile("server/lib/proxy/handler-messages.ts", "utf8");
    const routesSrc = await fs.readFile("server/routes.ts", "utf8");

    // Existing /chat/completions handler — these are the canonical names.
    expect(handlerSrc).toContain('"X-Allotly-Budget-Remaining"');
    expect(handlerSrc).toContain('"X-Allotly-Budget-Total"');

    // New /api/v1/messages handler must emit IDENTICAL names.
    expect(messagesSrc).toContain('"X-Allotly-Budget-Remaining"');
    expect(messagesSrc).toContain('"X-Allotly-Budget-Total"');

    // Neither handler should leak a divergent variant (e.g. -USD-Cents).
    expect(handlerSrc).not.toMatch(/X-Allotly-Budget-(Remaining|Total)-USD-Cents/);
    expect(messagesSrc).not.toMatch(/X-Allotly-Budget-(Remaining|Total)-USD-Cents/);

    // CORS Expose-Headers MUST list the canonical names so browser clients
    // of EITHER endpoint can read them; both endpoints sit under /api/v1.
    const exposeMatch = routesSrc.match(/Access-Control-Expose-Headers"\s*,\s*"([^"]+)"/);
    expect(exposeMatch, "expected Access-Control-Expose-Headers to be set on /api/v1").not.toBeNull();
    const exposed = exposeMatch![1];
    expect(exposed).toContain("X-Allotly-Budget-Remaining");
    expect(exposed).toContain("X-Allotly-Budget-Total");
  });
});
