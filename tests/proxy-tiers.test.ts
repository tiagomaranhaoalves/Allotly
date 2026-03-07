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
