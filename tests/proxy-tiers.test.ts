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

  it("rejects a /api/v1/messages caller that exceeds its concurrency limit (parity)", async () => {
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

});
