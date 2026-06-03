import { describe, it, expect } from "vitest";
import {
  calculateSettledCostMicroCents,
  estimateInputCostMicroCents,
  calculateOutputCostMicroCents,
  CACHE_WRITE_MULTIPLIER,
  CACHE_READ_MULTIPLIER,
} from "../server/lib/proxy/safeguards";
import { microCentsToCents, MICRO_CENTS_PER_CENT } from "../server/lib/currency";
import type { ModelPricing } from "@shared/schema";

// Money is metered internally in MICRO-CENTS (1 cent = 1_000_000 micro-cents).
// Pricing rates are cents per million tokens, so `tokens * ratePerMTok` is
// already an exact micro-cent count (cost_cents = tokens*rate/1e6).
const pricing: ModelPricing = {
  id: "test-model",
  provider: "ANTHROPIC",
  modelId: "claude-test",
  displayName: "Claude Test",
  inputPricePerMTok: 300, // $3.00 / MTok input
  outputPricePerMTok: 1500, // $15.00 / MTok output
  maxOutputTokens: null,
  isActive: true,
  updatedAt: new Date(),
};

describe("calculateSettledCostMicroCents", () => {
  it("settles in micro-cents and matches exact reservation for non-cache usage", () => {
    // 1000 input @ 300c/MTok = 0.3c = 300_000 micro-cents.
    // 1000 output @ 1500c/MTok = 1.5c = 1_500_000 micro-cents.
    // True combined = 1.8c = 1_800_000 micro-cents (exact, no rounding loss).
    const settled = calculateSettledCostMicroCents(
      { inputTokens: 1000, outputTokens: 1000 },
      pricing,
    );
    expect(settled).toBe(1_800_000);
    expect(microCentsToCents(settled)).toBe(2); // 1.8c -> rounds to 2c at the wire

    // The reservation helpers are now exact (no per-component ceil), so for
    // non-cache usage settlement equals the sum of the two estimates.
    const reservation =
      estimateInputCostMicroCents(1000, pricing) +
      calculateOutputCostMicroCents(1000, pricing);
    expect(reservation).toBe(1_800_000);
    expect(settled).toBe(reservation);
  });

  it("keeps a sub-cent request's true cost instead of rounding it to 0", () => {
    // 100 input + 100 output => (100*300 + 100*1500) = 180_000 micro-cents
    // = 0.18c. Under the old cent-granular settlement this rounded to 0 and the
    // request billed nothing; in micro-cents it keeps its exact cost.
    const settled = calculateSettledCostMicroCents(
      { inputTokens: 100, outputTokens: 100 },
      pricing,
    );
    expect(settled).toBe(180_000);
    expect(settled).toBeGreaterThan(0);
    // At the wire boundary a single such request still displays as 0c...
    expect(microCentsToCents(settled)).toBe(0);
  });

  it("accumulates many sub-cent requests instead of dropping them to 0", () => {
    // 1000 identical 0.18c requests. Cent-granular settlement would have billed
    // 0c each => 0c total. Micro-cent settlement preserves every fraction.
    let totalMicroCents = 0;
    for (let i = 0; i < 1000; i++) {
      totalMicroCents += calculateSettledCostMicroCents(
        { inputTokens: 100, outputTokens: 100 },
        pricing,
      );
    }
    // 1000 * 180_000 = 180_000_000 micro-cents = 180c.
    expect(totalMicroCents).toBe(180_000_000);
    expect(microCentsToCents(totalMicroCents)).toBe(180);
    expect(totalMicroCents / MICRO_CENTS_PER_CENT).toBe(180);
  });

  it("prices Anthropic cache-write tokens at 1.25x the input rate", () => {
    // 1,000,000 cache-write tokens @ 300c * 1.25 = 375c = 375_000_000 micro.
    const settled = calculateSettledCostMicroCents(
      { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 },
      pricing,
    );
    expect(settled).toBe(Math.round(1_000_000 * 300 * CACHE_WRITE_MULTIPLIER));
    expect(settled).toBe(375_000_000);
    expect(microCentsToCents(settled)).toBe(375);
  });

  it("prices Anthropic cache-read tokens at 0.1x the input rate", () => {
    // 1,000,000 cache-read tokens @ 300c * 0.1 = 30c = 30_000_000 micro.
    const settled = calculateSettledCostMicroCents(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
      pricing,
    );
    expect(settled).toBe(Math.round(1_000_000 * 300 * CACHE_READ_MULTIPLIER));
    expect(settled).toBe(30_000_000);
    expect(microCentsToCents(settled)).toBe(30);
  });

  it("sums all four token buckets in a single rounding step", () => {
    const usage = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheWriteTokens: 100_000,
      cacheReadTokens: 400_000,
    };
    // (500000*300 + 200000*1500 + 100000*300*1.25 + 400000*300*0.1)
    // = 150,000,000 + 300,000,000 + 37,500,000 + 12,000,000
    // = 499,500,000 micro-cents = 499.5c.
    const expected = Math.round(
      usage.inputTokens * pricing.inputPricePerMTok +
        usage.outputTokens * pricing.outputPricePerMTok +
        usage.cacheWriteTokens * pricing.inputPricePerMTok * CACHE_WRITE_MULTIPLIER +
        usage.cacheReadTokens * pricing.inputPricePerMTok * CACHE_READ_MULTIPLIER,
    );
    expect(calculateSettledCostMicroCents(usage, pricing)).toBe(expected);
    expect(calculateSettledCostMicroCents(usage, pricing)).toBe(499_500_000);
    expect(microCentsToCents(499_500_000)).toBe(500); // 499.5c -> 500c at the wire
  });

  it("bills a fully cache-served prompt (input_tokens 0 + cache read) without input charge", () => {
    // Anthropic reports input_tokens: 0 when the whole prompt is a cache hit.
    // Only the cache-read tokens (0.1x) and the output should be billed — the
    // settlement must NOT silently substitute an input estimate for the 0.
    const settled = calculateSettledCostMicroCents(
      {
        inputTokens: 0,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
      },
      pricing,
    );
    // output: 1500c = 1,500,000,000 micro; cache read: 300*0.1 = 30c = 30,000,000.
    expect(settled).toBe(1_530_000_000);
    expect(microCentsToCents(settled)).toBe(1530);
  });

  it("treats omitted cache buckets as zero (non-caching providers)", () => {
    const withUndefinedCaches = calculateSettledCostMicroCents(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheWriteTokens: undefined,
        cacheReadTokens: undefined,
      },
      pricing,
    );
    const withoutCaches = calculateSettledCostMicroCents(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      pricing,
    );
    expect(withUndefinedCaches).toBe(withoutCaches);
    // 300c input + 1500c output = 1800c = 1,800,000,000 micro.
    expect(withoutCaches).toBe(1_800_000_000);
    expect(microCentsToCents(withoutCaches)).toBe(1800);
  });
});
