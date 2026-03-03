import { describe, it, expect } from "vitest";
import { clampMaxTokens, estimateInputTokens, estimateInputCostCents, calculateOutputCostCents } from "../server/lib/proxy/safeguards";
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
    const result = clampMaxTokens(5000, 10, gpt4Pricing, 4096);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBe(4096);
  });

  it("clamps when requested tokens exceed affordable amount", () => {
    const result = clampMaxTokens(1, 0, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBeLessThan(4096);
    expect(result.effectiveMaxTokens).toBeGreaterThanOrEqual(50);
  });

  it("returns minimum 50 tokens when budget is zero for output", () => {
    const result = clampMaxTokens(10, 10, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBe(50);
  });

  it("returns minimum 50 tokens when budget is negative for output", () => {
    const result = clampMaxTokens(5, 10, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBe(50);
  });

  it("correctly calculates affordable tokens for GPT-4o pricing", () => {
    const budgetForOutput = 100;
    const result = clampMaxTokens(100 + 10, 10, gpt4Pricing);
    expect(result.clamped).toBe(false);
    const maxAffordable = Math.floor((budgetForOutput * 1_000_000) / gpt4Pricing.outputPricePerMTok);
    expect(maxAffordable).toBe(100000);
  });

  it("correctly calculates affordable tokens for Claude pricing", () => {
    const result = clampMaxTokens(200, 50, claudePricing, 200000);
    const budgetForOutput = 200 - 50;
    const maxAffordable = Math.floor((budgetForOutput * 1_000_000) / claudePricing.outputPricePerMTok);
    expect(maxAffordable).toBe(100000);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBeLessThanOrEqual(maxAffordable);
  });

  it("uses default max of 4096 when no requestedMaxTokens specified", () => {
    const result = clampMaxTokens(50000, 10, gpt4Pricing);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBe(4096);
  });

  it("respects lower requestedMaxTokens when affordable", () => {
    const result = clampMaxTokens(50000, 10, gpt4Pricing, 100);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBe(100);
  });

  it("works with Gemini pricing", () => {
    const result = clampMaxTokens(50, 10, geminiPricing, 100000);
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
  it("calculates input cost in cents (integer)", () => {
    const cost = estimateInputCostCents(1000, gpt4Pricing);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBe(Math.ceil((1000 * 250) / 1_000_000));
  });

  it("calculates output cost in cents (integer)", () => {
    const cost = calculateOutputCostCents(1000, gpt4Pricing);
    expect(Number.isInteger(cost)).toBe(true);
    expect(cost).toBe(Math.ceil((1000 * 1000) / 1_000_000));
  });

  it("rounds up fractional cents", () => {
    const cost = estimateInputCostCents(1, gpt4Pricing);
    expect(cost).toBe(1);
  });

  it("handles zero tokens", () => {
    const cost = estimateInputCostCents(0, gpt4Pricing);
    expect(cost).toBe(0);
  });

  it("uses integer cents throughout", () => {
    const inputCost = estimateInputCostCents(5000, claudePricing);
    const outputCost = calculateOutputCostCents(5000, claudePricing);
    expect(Number.isInteger(inputCost)).toBe(true);
    expect(Number.isInteger(outputCost)).toBe(true);
    expect(outputCost).toBeGreaterThan(inputCost);
  });
});
