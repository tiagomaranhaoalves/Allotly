import { describe, it, expect } from "vitest";
import {
  calculateSettledCostCents,
  estimateInputCostCents,
  calculateOutputCostCents,
  CACHE_WRITE_MULTIPLIER,
  CACHE_READ_MULTIPLIER,
} from "../server/lib/proxy/safeguards";
import type { ModelPricing } from "@shared/schema";

// Prices are expressed in USD-cents per million tokens.
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

describe("calculateSettledCostCents", () => {
  it("rounds the combined cost exactly once instead of per-component", () => {
    // 1000 input @ 300c/MTok = 0.3c, 1000 output @ 1500c/MTok = 1.5c.
    // True combined = 1.8c -> rounds to 2c.
    const settled = calculateSettledCostCents(
      { inputTokens: 1000, outputTokens: 1000 },
      pricing,
    );
    expect(settled).toBe(2);

    // The legacy double-ceil approach over-charges: ceil(0.3)+ceil(1.5)=1+2=3c.
    const legacy =
      estimateInputCostCents(1000, pricing) +
      calculateOutputCostCents(1000, pricing);
    expect(legacy).toBe(3);
    expect(settled).toBeLessThan(legacy);
  });

  it("matches the provider's single-round invoice for a tiny request", () => {
    // 100 input + 100 output => (100*300 + 100*1500)/1e6 = 0.18c -> 0c.
    const settled = calculateSettledCostCents(
      { inputTokens: 100, outputTokens: 100 },
      pricing,
    );
    expect(settled).toBe(0);
    // Legacy charged 2c (ceil 0.03 + ceil 0.15 = 1 + 1) for a sub-cent request.
    const legacy =
      estimateInputCostCents(100, pricing) +
      calculateOutputCostCents(100, pricing);
    expect(legacy).toBe(2);
  });

  it("prices Anthropic cache-write tokens at 1.25x the input rate", () => {
    // 1,000,000 cache-write tokens @ 300c * 1.25 = 375c.
    const settled = calculateSettledCostCents(
      { inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 },
      pricing,
    );
    expect(settled).toBe(Math.round(300 * CACHE_WRITE_MULTIPLIER));
    expect(settled).toBe(375);
  });

  it("prices Anthropic cache-read tokens at 0.1x the input rate", () => {
    // 1,000,000 cache-read tokens @ 300c * 0.1 = 30c.
    const settled = calculateSettledCostCents(
      { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 },
      pricing,
    );
    expect(settled).toBe(Math.round(300 * CACHE_READ_MULTIPLIER));
    expect(settled).toBe(30);
  });

  it("sums all four token buckets in a single rounding step", () => {
    const usage = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheWriteTokens: 100_000,
      cacheReadTokens: 400_000,
    };
    // (500000*300 + 200000*1500 + 100000*300*1.25 + 400000*300*0.1) / 1e6
    // = (150,000,000 + 300,000,000 + 37,500,000 + 12,000,000) / 1e6
    // = 499,500,000 / 1e6 = 499.5 -> rounds to 500c.
    const expected = Math.round(
      (usage.inputTokens * pricing.inputPricePerMTok +
        usage.outputTokens * pricing.outputPricePerMTok +
        usage.cacheWriteTokens * pricing.inputPricePerMTok * CACHE_WRITE_MULTIPLIER +
        usage.cacheReadTokens * pricing.inputPricePerMTok * CACHE_READ_MULTIPLIER) /
        1_000_000,
    );
    expect(calculateSettledCostCents(usage, pricing)).toBe(expected);
    expect(calculateSettledCostCents(usage, pricing)).toBe(500);
  });

  it("bills a fully cache-served prompt (input_tokens 0 + cache read) without input charge", () => {
    // Anthropic reports input_tokens: 0 when the whole prompt is a cache hit.
    // Only the cache-read tokens (0.1x) and the output should be billed — the
    // settlement must NOT silently substitute an input estimate for the 0.
    const settled = calculateSettledCostCents(
      {
        inputTokens: 0,
        outputTokens: 1_000_000,
        cacheReadTokens: 1_000_000,
      },
      pricing,
    );
    // output: 1500c, cache read: 300 * 0.1 = 30c => 1530c.
    expect(settled).toBe(1530);
  });

  it("treats omitted cache buckets as zero (non-caching providers)", () => {
    const withUndefinedCaches = calculateSettledCostCents(
      {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cacheWriteTokens: undefined,
        cacheReadTokens: undefined,
      },
      pricing,
    );
    const withoutCaches = calculateSettledCostCents(
      { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      pricing,
    );
    expect(withUndefinedCaches).toBe(withoutCaches);
    // 300c input + 1500c output = 1800c.
    expect(withoutCaches).toBe(1800);
  });

  it("never over-charges versus the legacy double-ceil for combined usage", () => {
    for (let i = 1; i <= 50; i++) {
      const inputTokens = i * 137;
      const outputTokens = i * 91;
      const settled = calculateSettledCostCents({ inputTokens, outputTokens }, pricing);
      const legacy =
        estimateInputCostCents(inputTokens, pricing) +
        calculateOutputCostCents(outputTokens, pricing);
      expect(settled).toBeLessThanOrEqual(legacy);
    }
  });
});
