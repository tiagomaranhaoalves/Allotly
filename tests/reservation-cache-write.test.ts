import { describe, it, expect } from "vitest";
import {
  estimateInputReservationCents,
  estimateInputCostCents,
  calculateSettledCostCents,
  calculateOutputCostCents,
  clampMaxTokens,
  CACHE_WRITE_MULTIPLIER,
} from "../server/lib/proxy/safeguards";
import type { ModelPricing } from "@shared/schema";

// Prices are expressed in USD-cents per million tokens.
const claudePricing: ModelPricing = {
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

const gpt4Pricing: ModelPricing = {
  ...claudePricing,
  id: "test-gpt",
  provider: "OPENAI",
  modelId: "gpt-4o",
  displayName: "GPT-4o",
  inputPricePerMTok: 250,
  outputPricePerMTok: 1000,
};

/**
 * Settled cost of the prompt portion only (output excluded). Cache mix only
 * affects the input buckets, so this is the figure the reservation hold must
 * cover.
 */
function settledPromptCents(
  pricing: ModelPricing,
  input: number,
  cacheWrite: number,
  cacheRead: number,
): number {
  return calculateSettledCostCents(
    { inputTokens: input, outputTokens: 0, cacheWriteTokens: cacheWrite, cacheReadTokens: cacheRead },
    pricing,
  );
}

describe("estimateInputReservationCents (Bug 2 — cache-write under-reservation)", () => {
  it("prices the prompt at 1.25x the base input rate", () => {
    // 1,000,000 tokens @ 300c * 1.25 = 375c.
    expect(estimateInputReservationCents(1_000_000, claudePricing)).toBe(375);
    // Strictly above the base-rate estimate (which would hold only 300c).
    expect(estimateInputReservationCents(1_000_000, claudePricing)).toBeGreaterThan(
      estimateInputCostCents(1_000_000, claudePricing),
    );
  });

  it("never holds less than the base-rate estimate for any size", () => {
    for (let i = 0; i <= 50; i++) {
      const n = i * 9973;
      expect(estimateInputReservationCents(n, claudePricing)).toBeGreaterThanOrEqual(
        estimateInputCostCents(n, claudePricing),
      );
    }
  });

  // Core assertion: reservation hold >= settled prompt cost for EVERY cache mix.
  it("holds >= settled prompt cost across all cache mixes and sizes", () => {
    const pricings = [claudePricing, gpt4Pricing];
    const sizes = [1, 137, 1000, 12_345, 200_000, 1_000_000, 3_500_000];
    for (const pricing of pricings) {
      for (const total of sizes) {
        const reserved = estimateInputReservationCents(total, pricing);
        // For a fixed estimated prompt size, settlement may split those tokens
        // across the three input buckets in any proportion. Check the corners
        // plus a mixed split — all must be covered by the single hold.
        const mixes: Array<[number, number, number]> = [
          [total, 0, 0], // no cache
          [0, total, 0], // all cache-write (worst case)
          [0, 0, total], // all cache-read (cheapest)
          [
            Math.floor(total * 0.2),
            Math.floor(total * 0.5),
            total - Math.floor(total * 0.2) - Math.floor(total * 0.5),
          ], // mixed write/read
        ];
        for (const [input, cw, cr] of mixes) {
          expect(reserved).toBeGreaterThanOrEqual(settledPromptCents(pricing, input, cw, cr));
        }
      }
    }
  });

  it("regression: 200k prompt, max_tokens=100, Claude — reserves >= 75c (was 61c)", () => {
    const promptTokens = 200_000;
    const reservedInput = estimateInputReservationCents(promptTokens, claudePricing);
    expect(reservedInput).toBe(75);

    // First call writes the whole prompt to cache => settled prompt = 75c.
    const settledFirstCall = settledPromptCents(claudePricing, 0, promptTokens, 0);
    expect(settledFirstCall).toBe(75);
    expect(reservedInput).toBeGreaterThanOrEqual(settledFirstCall);

    // Full reservation hold (input + tiny output) vs the old base-rate hold.
    const reservedTotal = reservedInput + calculateOutputCostCents(100, claudePricing);
    const legacyTotal = estimateInputCostCents(promptTokens, claudePricing) + calculateOutputCostCents(100, claudePricing);
    expect(legacyTotal).toBe(61); // pre-fix hold under-reserved the 75c settle
    expect(reservedTotal).toBeGreaterThanOrEqual(settledFirstCall);
  });

  it("uses the exported CACHE_WRITE_MULTIPLIER, not a hardcoded 1.25", () => {
    const n = 1_000_000;
    expect(estimateInputReservationCents(n, claudePricing)).toBe(
      Math.ceil((n * claudePricing.inputPricePerMTok * CACHE_WRITE_MULTIPLIER) / 1_000_000),
    );
  });
});

describe("settlement is unchanged (Bug 2 guard — must not move)", () => {
  it("matches the known pre-change settled values", () => {
    expect(calculateSettledCostCents({ inputTokens: 1000, outputTokens: 1000 }, claudePricing)).toBe(2);
    expect(calculateSettledCostCents({ inputTokens: 100, outputTokens: 100 }, claudePricing)).toBe(0);
    expect(calculateSettledCostCents({ inputTokens: 0, outputTokens: 0, cacheWriteTokens: 1_000_000 }, claudePricing)).toBe(375);
    expect(calculateSettledCostCents({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000 }, claudePricing)).toBe(30);
    expect(
      calculateSettledCostCents(
        { inputTokens: 500_000, outputTokens: 200_000, cacheWriteTokens: 100_000, cacheReadTokens: 400_000 },
        claudePricing,
      ),
    ).toBe(500);
  });
});

describe("clamp coherence with the conservative (1.25x) hold", () => {
  it("never allows more output than the remaining budget covers after the larger hold", () => {
    const promptTokens = 50_000;
    const conservativeInput = estimateInputReservationCents(promptTokens, claudePricing);
    const remainingBudgetCents = 200;

    const { effectiveMaxTokens, clamped } = clampMaxTokens(
      remainingBudgetCents,
      conservativeInput,
      claudePricing,
      1_000_000, // request a huge cap so the budget is the binding constraint
    );

    expect(clamped).toBe(true);
    expect(effectiveMaxTokens).toBeGreaterThanOrEqual(50);

    const budgetForOutput = remainingBudgetCents - conservativeInput;
    const maxAffordable = Math.max(50, Math.floor((budgetForOutput * 1_000_000) / claudePricing.outputPricePerMTok));
    expect(effectiveMaxTokens).toBeLessThanOrEqual(maxAffordable);
  });

  it("returns a sane minimum cap when the conservative hold consumes the budget", () => {
    // Hold the prompt at 1.25x against a budget that barely covers it.
    const promptTokens = 500_000; // 1.25x => ceil(500000*300*1.25/1e6) = ceil(187.5) = 188c
    const conservativeInput = estimateInputReservationCents(promptTokens, claudePricing);
    expect(conservativeInput).toBe(188);

    const { effectiveMaxTokens, clamped } = clampMaxTokens(
      conservativeInput, // remaining == the hold => zero output headroom
      conservativeInput,
      claudePricing,
      4096,
    );
    expect(clamped).toBe(true);
    expect(effectiveMaxTokens).toBe(50);
  });
});
