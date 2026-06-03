import { describe, it, expect } from "vitest";
import { clampMaxTokens, estimateInputTokens, estimateInputCostMicroCents, calculateOutputCostMicroCents } from "../server/lib/proxy/safeguards";
import type { ModelPricing } from "@shared/schema";

const gpt4Pricing: ModelPricing = {
  id: "test-1",
  provider: "OPENAI",
  modelId: "gpt-4o",
  displayName: "GPT-4o",
  inputPricePerMTok: 250,
  outputPricePerMTok: 1000,
  maxContextTokens: 128000,
  isActive: true,
  updatedAt: new Date(),
};

const claudePricing: ModelPricing = {
  id: "test-2",
  provider: "ANTHROPIC",
  modelId: "claude-3-5-sonnet-20241022",
  displayName: "Claude 3.5 Sonnet",
  inputPricePerMTok: 300,
  outputPricePerMTok: 1500,
  maxContextTokens: 200000,
  isActive: true,
  updatedAt: new Date(),
};

const geminiPricing: ModelPricing = {
  id: "test-3",
  provider: "GOOGLE",
  modelId: "gemini-1.5-pro",
  displayName: "Gemini 1.5 Pro",
  inputPricePerMTok: 125,
  outputPricePerMTok: 500,
  maxContextTokens: 1000000,
  isActive: true,
  updatedAt: new Date(),
};

describe("Token clamping", () => {
  it("does not clamp when budget is ample", () => {
    const result = clampMaxTokens(5000 * 1_000_000, 10 * 1_000_000, gpt4Pricing, 4096);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBe(4096);
  });

  it("clamps when requested tokens exceed affordable amount", () => {
    const result = clampMaxTokens(1 * 1_000_000, 0, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBeLessThan(4096);
    expect(result.effectiveMaxTokens).toBeGreaterThanOrEqual(50);
  });

  it("returns minimum 50 tokens when budget is zero for output", () => {
    const result = clampMaxTokens(10 * 1_000_000, 10 * 1_000_000, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBe(50);
  });

  it("returns minimum 50 tokens when budget is negative for output", () => {
    const result = clampMaxTokens(5 * 1_000_000, 10 * 1_000_000, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBe(50);
  });

  it("correctly calculates affordable tokens for GPT-4o pricing", () => {
    const budgetForOutput = 100;
    const result = clampMaxTokens((100 + 10) * 1_000_000, 10 * 1_000_000, gpt4Pricing);
    expect(result.clamped).toBe(false);
    const maxAffordable = Math.floor((budgetForOutput * 1_000_000) / gpt4Pricing.outputPricePerMTok);
    expect(maxAffordable).toBe(100000);
  });

  it("correctly calculates affordable tokens for Claude pricing", () => {
    const result = clampMaxTokens(200 * 1_000_000, 50 * 1_000_000, claudePricing, 200000);
    const budgetForOutput = 200 - 50;
    const maxAffordable = Math.floor((budgetForOutput * 1_000_000) / claudePricing.outputPricePerMTok);
    expect(maxAffordable).toBe(100000);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBeLessThanOrEqual(maxAffordable);
  });

  it("passes through undefined when no requestedMaxTokens specified (provider decides)", () => {
    const result = clampMaxTokens(50000 * 1_000_000, 10 * 1_000_000, gpt4Pricing);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBeUndefined();
  });

  it("respects lower requestedMaxTokens when affordable", () => {
    const result = clampMaxTokens(50000 * 1_000_000, 10 * 1_000_000, gpt4Pricing, 100);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBe(100);
  });

  it("works with Gemini pricing", () => {
    const result = clampMaxTokens(50 * 1_000_000, 10 * 1_000_000, geminiPricing, 100000);
    expect(result.clamped).toBe(true);
    const budgetForOutput = 40;
    const maxAffordable = Math.floor((budgetForOutput * 1_000_000) / geminiPricing.outputPricePerMTok);
    expect(result.effectiveMaxTokens).toBe(Math.max(50, maxAffordable));
  });
});

describe("Token estimation", () => {
  it("estimates tokens from string content", () => {
    const messages = [{ role: "user", content: "Hello world" }];
    const tokens = estimateInputTokens(messages);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBe(Math.ceil(("Hello world".length + "user".length + 4) / 4));
  });

  it("estimates tokens from array content", () => {
    const messages = [{ role: "user", content: [{ text: "Hello" }, { text: "World" }] }];
    const tokens = estimateInputTokens(messages);
    expect(tokens).toBeGreaterThan(0);
  });

  it("handles empty messages", () => {
    const tokens = estimateInputTokens([]);
    expect(tokens).toBe(0);
  });

  it("handles multiple messages", () => {
    const messages = [
      { role: "system", content: "You are helpful." },
      { role: "user", content: "Hi" },
    ];
    const tokens = estimateInputTokens(messages);
    const singleTokens = estimateInputTokens([messages[0]]);
    expect(tokens).toBeGreaterThan(singleTokens);
  });
});

describe("Cost calculations", () => {
  it("calculates input cost in micro-cents (integer, exact)", () => {
    // tokens * ratePerMTok is already an exact micro-cent count (no /1e6).
    const cost = estimateInputCostMicroCents(1000, gpt4Pricing);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBe(1000 * 250);
  });

  it("calculates output cost in micro-cents (integer, exact)", () => {
    const cost = calculateOutputCostMicroCents(1000, gpt4Pricing);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBe(1000 * 1000);
  });

  it("keeps a single sub-cent token's exact micro-cost instead of rounding up", () => {
    const cost = estimateInputCostMicroCents(1, gpt4Pricing);
    expect(cost).toBe(250);
  });

  it("handles zero tokens", () => {
    const cost = estimateInputCostMicroCents(0, gpt4Pricing);
    expect(cost).toBe(0);
  });

  it("uses integer micro-cents throughout", () => {
    const inputCost = estimateInputCostMicroCents(5000, claudePricing);
    const outputCost = calculateOutputCostMicroCents(5000, claudePricing);
    expect(Number.isInteger(inputCost)).toBe(true);
    expect(Number.isInteger(outputCost)).toBe(true);
    expect(outputCost).toBeGreaterThan(inputCost);
  });
});
