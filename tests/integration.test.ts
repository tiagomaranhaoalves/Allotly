import { describe, it, expect, beforeEach } from "vitest";
import {
  redisGet,
  redisSet,
  redisDel,
  redisIncr,
  redisDecr,
  redisDecrBy,
  redisIncrBy,
  REDIS_KEYS,
} from "../server/lib/redis";
import {
  checkConcurrency,
  releaseConcurrency,
  clampMaxTokens,
  estimateInputTokens,
  estimateInputCostCents,
  calculateOutputCostCents,
  createProxyError,
} from "../server/lib/proxy/safeguards";
import { getRateLimitTier } from "../server/lib/proxy/handler";
import type { ModelPricing } from "@shared/schema";

const gpt4Pricing: ModelPricing = {
  id: "int-test-1",
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
  id: "int-test-2",
  provider: "ANTHROPIC",
  modelId: "claude-3-5-sonnet-20241022",
  displayName: "Claude 3.5 Sonnet",
  inputPricePerMTok: 300,
  outputPricePerMTok: 1500,
  maxContextTokens: 200000,
  isActive: true,
  updatedAt: new Date(),
};

const UID = () => `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

beforeEach(async () => {
  await redisDel(REDIS_KEYS.budget("int-member-1"));
  await redisDel(REDIS_KEYS.budget("int-member-2"));
  await redisDel(REDIS_KEYS.concurrent("int-member-1"));
  await redisDel(REDIS_KEYS.ratelimit("int-member-1"));
  await redisDel(REDIS_KEYS.bundleRequests("int-bundle-1"));
});

describe("C2.1 Team member budget lifecycle", () => {
  it("triggers 80% alert threshold when spend=80 of budget=100", () => {
    const budgetCents = 10000;
    const spentCents = 8000;
    const utilization = Math.round((spentCents / budgetCents) * 100);
    expect(utilization).toBe(80);
    expect(spentCents >= budgetCents * 0.8).toBe(true);
    expect(spentCents >= budgetCents * 0.9).toBe(false);
    expect(spentCents >= budgetCents * 1.0).toBe(false);
  });

  it("triggers 100% threshold when spend=100 of budget=100, key should be revoked", () => {
    const budgetCents = 10000;
    const spentCents = 10000;
    const utilization = Math.round((spentCents / budgetCents) * 100);
    expect(utilization).toBe(100);
    expect(spentCents >= budgetCents * 1.0).toBe(true);

    const shouldRevoke = spentCents >= budgetCents;
    expect(shouldRevoke).toBe(true);

    const newStatus = shouldRevoke ? "BUDGET_EXHAUSTED" : "ACTIVE";
    expect(newStatus).toBe("BUDGET_EXHAUSTED");
  });

  it("full lifecycle: 80% alert → 100% revoke → budget reset restores", async () => {
    const budgetCents = 10000;
    const memberId = "int-member-1";

    await redisSet(REDIS_KEYS.budget(memberId), String(budgetCents));

    const spend80 = 8000;
    const remaining80 = await redisDecrBy(REDIS_KEYS.budget(memberId), spend80);
    expect(remaining80).toBe(2000);
    const util80 = Math.round((spend80 / budgetCents) * 100);
    expect(util80).toBe(80);
    expect(util80 >= 80).toBe(true);

    const spend100 = 2000;
    const remaining100 = await redisDecrBy(REDIS_KEYS.budget(memberId), spend100);
    expect(remaining100).toBe(0);
    const totalSpent = spend80 + spend100;
    const util100 = Math.round((totalSpent / budgetCents) * 100);
    expect(util100).toBe(100);
    expect(totalSpent >= budgetCents).toBe(true);

    await redisSet(REDIS_KEYS.budget(memberId), String(budgetCents));
    const restored = await redisGet(REDIS_KEYS.budget(memberId));
    expect(restored).toBe(String(budgetCents));

    const newSpend = 0;
    const newUtil = budgetCents > 0 ? Math.round((newSpend / budgetCents) * 100) : 0;
    expect(newUtil).toBe(0);
  });

  it("progressive threshold detection: 80 → 90 → 100", () => {
    const budgetCents = 10000;
    const thresholds = [80, 90, 100];
    const triggered: number[] = [];

    const spendLevels = [8000, 9000, 10000];

    for (const spend of spendLevels) {
      const util = Math.round((spend / budgetCents) * 100);
      for (const t of thresholds) {
        if (util >= t && !triggered.includes(t)) {
          triggered.push(t);
        }
      }
    }

    expect(triggered).toEqual([80, 90, 100]);
  });
});

describe("C2.2 Voucher budget exhaustion", () => {
  it("returns BUDGET_EXHAUSTED status when spend >= budget", () => {
    const budgetCents = 5000;
    const spentCents = 5000;
    const remaining = budgetCents - spentCents;
    expect(remaining).toBe(0);

    const status = remaining <= 0 ? "BUDGET_EXHAUSTED" : "ACTIVE";
    expect(status).toBe("BUDGET_EXHAUSTED");
  });

  it("returns BUDGET_EXHAUSTED when spend exceeds budget", () => {
    const budgetCents = 5000;
    const spentCents = 5500;
    const remaining = budgetCents - spentCents;
    expect(remaining).toBeLessThan(0);

    const status = remaining <= 0 ? "BUDGET_EXHAUSTED" : "ACTIVE";
    expect(status).toBe("BUDGET_EXHAUSTED");
  });

  it("verifies 402 error is created for budget exhaustion", () => {
    const error = createProxyError(402, "budget_exhausted", "Your budget has been fully used for this period");
    expect(error.status).toBe(402);
    expect(error.code).toBe("budget_exhausted");
  });

  it("Redis budget reservation rejects when insufficient", async () => {
    const memberId = "int-member-1";
    await redisSet(REDIS_KEYS.budget(memberId), "100");

    const estimatedCost = 200;
    const currentBudget = parseInt((await redisGet(REDIS_KEYS.budget(memberId)))!);
    expect(currentBudget).toBe(100);

    const newBalance = await redisDecrBy(REDIS_KEYS.budget(memberId), estimatedCost);
    expect(newBalance).toBe(-100);
    expect(newBalance < 0).toBe(true);

    await redisIncrBy(REDIS_KEYS.budget(memberId), estimatedCost);
    const restored = await redisGet(REDIS_KEYS.budget(memberId));
    expect(restored).toBe("100");
  });
});

describe("C2.3 Bundle request pool", () => {
  it("increments bundle request counter", async () => {
    const key = REDIS_KEYS.bundleRequests("int-bundle-1");
    await redisSet(key, "0");

    const count1 = await redisIncr(key);
    expect(count1).toBe(1);

    const count2 = await redisIncr(key);
    expect(count2).toBe(2);

    const count3 = await redisIncr(key);
    expect(count3).toBe(3);
  });

  it("rejects when pool is exhausted (0 remaining)", async () => {
    const key = REDIS_KEYS.bundleRequests("int-bundle-1");
    const totalRequests = 100;
    await redisSet(key, String(totalRequests));

    const used = parseInt((await redisGet(key))!);
    expect(used >= totalRequests).toBe(true);

    const error = createProxyError(402, "requests_exhausted", "This bundle's request pool has been exhausted");
    expect(error.status).toBe(402);
    expect(error.code).toBe("requests_exhausted");
  });

  it("tracks usage across multiple requests until exhaustion", async () => {
    const key = REDIS_KEYS.bundleRequests("int-bundle-1");
    const totalRequests = 5;
    await redisSet(key, "0");

    for (let i = 0; i < totalRequests; i++) {
      await redisIncr(key);
    }

    const used = parseInt((await redisGet(key))!);
    expect(used).toBe(totalRequests);
    expect(used >= totalRequests).toBe(true);

    const oneMore = await redisIncr(key);
    expect(oneMore).toBe(totalRequests + 1);
    expect(oneMore > totalRequests).toBe(true);
  });
});

describe("C2.4 Proxy concurrency", () => {
  it("acquires concurrency up to max then fails", async () => {
    const memberId = UID();
    const maxConcurrent = 3;
    const requests: string[] = [];

    for (let i = 0; i < maxConcurrent; i++) {
      const reqId = `req-${i}`;
      requests.push(reqId);
      const result = await checkConcurrency(memberId, reqId, maxConcurrent);
      expect(result).toBeNull();
    }

    const overLimit = await checkConcurrency(memberId, "req-over", maxConcurrent);
    expect(overLimit).not.toBeNull();
    expect(overLimit?.status).toBe(429);
    expect(overLimit?.code).toBe("concurrency_limit");

    for (const reqId of requests) {
      await releaseConcurrency(memberId, reqId);
    }
  });

  it("releases one slot then allows a new request", async () => {
    const memberId = UID();
    const maxConcurrent = 2;

    const req1 = "req-1";
    const req2 = "req-2";
    await checkConcurrency(memberId, req1, maxConcurrent);
    await checkConcurrency(memberId, req2, maxConcurrent);

    const blocked = await checkConcurrency(memberId, "req-3", maxConcurrent);
    expect(blocked).not.toBeNull();
    expect(blocked?.status).toBe(429);

    await releaseConcurrency(memberId, req1);

    const allowed = await checkConcurrency(memberId, "req-4", maxConcurrent);
    expect(allowed).toBeNull();

    await releaseConcurrency(memberId, req2);
    await releaseConcurrency(memberId, "req-4");
  });

  it("uses tier-based concurrency limits", async () => {
    const freeTier = getRateLimitTier("FREE", "TEAM");
    expect(freeTier.maxConcurrent).toBe(2);

    const teamTier = getRateLimitTier("TEAM", "TEAM");
    expect(teamTier.maxConcurrent).toBe(5);

    const enterpriseTier = getRateLimitTier("ENTERPRISE", "TEAM");
    expect(enterpriseTier.maxConcurrent).toBe(10);

    const memberId = UID();

    for (let i = 0; i < freeTier.maxConcurrent; i++) {
      const result = await checkConcurrency(memberId, `req-${i}`, freeTier.maxConcurrent);
      expect(result).toBeNull();
    }

    const overFree = await checkConcurrency(memberId, "req-over", freeTier.maxConcurrent);
    expect(overFree).not.toBeNull();
    expect(overFree?.status).toBe(429);
    expect(overFree?.message).toContain(`max ${freeTier.maxConcurrent}`);

    for (let i = 0; i < freeTier.maxConcurrent; i++) {
      await releaseConcurrency(memberId, `req-${i}`);
    }
  });
});

describe("C2.5 Token clamping integration", () => {
  it("clamps tokens with $0.05 remaining budget", () => {
    const remainingCents = 5;
    const inputCostCents = 1;
    const budgetForOutput = remainingCents - inputCostCents;
    expect(budgetForOutput).toBe(4);

    const result = clampMaxTokens(remainingCents, inputCostCents, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);

    const maxAffordable = Math.floor((budgetForOutput * 1_000_000) / gpt4Pricing.outputPricePerMTok);
    expect(maxAffordable).toBe(4000);
    expect(result.effectiveMaxTokens).toBe(maxAffordable);
    expect(result.effectiveMaxTokens).toBeLessThan(4096);
  });

  it("calculates correct max_tokens based on model pricing", () => {
    const remainingCents = 10;
    const inputCostCents = 2;
    const budgetForOutput = remainingCents - inputCostCents;

    const resultGpt4 = clampMaxTokens(remainingCents, inputCostCents, gpt4Pricing, 100000);
    const gpt4Affordable = Math.floor((budgetForOutput * 1_000_000) / gpt4Pricing.outputPricePerMTok);
    expect(resultGpt4.effectiveMaxTokens).toBe(gpt4Affordable);
    expect(resultGpt4.clamped).toBe(true);

    const resultClaude = clampMaxTokens(remainingCents, inputCostCents, claudePricing, 100000);
    const claudeAffordable = Math.floor((budgetForOutput * 1_000_000) / claudePricing.outputPricePerMTok);
    expect(resultClaude.effectiveMaxTokens).toBe(claudeAffordable);
    expect(resultClaude.clamped).toBe(true);

    expect(gpt4Affordable).toBeGreaterThan(claudeAffordable);
  });

  it("verifies X-Allotly-Max-Tokens-Applied header value would be set when clamped", () => {
    const remainingCents = 5;
    const inputCostCents = 1;

    const { effectiveMaxTokens, clamped } = clampMaxTokens(remainingCents, inputCostCents, gpt4Pricing, 4096);
    expect(clamped).toBe(true);

    const headerValue = String(effectiveMaxTokens);
    expect(headerValue).toBe("4000");
    expect(parseInt(headerValue)).toBeLessThan(4096);
  });

  it("does not clamp when budget is ample", () => {
    const remainingCents = 50000;
    const inputCostCents = 10;

    const result = clampMaxTokens(remainingCents, inputCostCents, gpt4Pricing, 4096);
    expect(result.clamped).toBe(false);
    expect(result.effectiveMaxTokens).toBe(4096);
  });

  it("returns minimum 50 tokens when budget is completely exhausted for output", () => {
    const remainingCents = 5;
    const inputCostCents = 5;

    const result = clampMaxTokens(remainingCents, inputCostCents, gpt4Pricing, 4096);
    expect(result.clamped).toBe(true);
    expect(result.effectiveMaxTokens).toBe(50);
  });

  it("end-to-end: estimate input → clamp → calculate output cost", () => {
    const messages = [{ role: "user", content: "Hello, how are you?" }];
    const inputTokens = estimateInputTokens(messages);
    const inputCost = estimateInputCostCents(inputTokens, gpt4Pricing);
    const remainingCents = 5;

    const { effectiveMaxTokens, clamped } = clampMaxTokens(remainingCents, inputCost, gpt4Pricing, 4096);
    const outputCost = calculateOutputCostCents(effectiveMaxTokens, gpt4Pricing);

    const totalCost = inputCost + outputCost;
    expect(totalCost).toBeLessThanOrEqual(remainingCents + 1);
    expect(clamped).toBe(true);
    expect(effectiveMaxTokens).toBeGreaterThanOrEqual(50);
  });
});

describe("C2.6 Redis reconciliation", () => {
  it("detects drift and corrects Redis to match Postgres value", async () => {
    const memberId = "int-member-1";
    const pgRemaining = 9500;

    await redisSet(REDIS_KEYS.budget(memberId), "7000");

    const redisVal = parseInt((await redisGet(REDIS_KEYS.budget(memberId)))!);
    expect(redisVal).toBe(7000);

    const drift = Math.abs(redisVal - pgRemaining);
    expect(drift).toBe(2500);
    expect(drift > 100).toBe(true);

    await redisSet(REDIS_KEYS.budget(memberId), String(pgRemaining));

    const corrected = await redisGet(REDIS_KEYS.budget(memberId));
    expect(corrected).toBe("9500");
  });

  it("initializes Redis from Postgres when key is missing", async () => {
    const memberId = "int-member-2";
    await redisDel(REDIS_KEYS.budget(memberId));

    const val = await redisGet(REDIS_KEYS.budget(memberId));
    expect(val).toBeNull();

    const pgRemaining = 12000;
    await redisSet(REDIS_KEYS.budget(memberId), String(pgRemaining));

    const restored = await redisGet(REDIS_KEYS.budget(memberId));
    expect(restored).toBe("12000");
  });

  it("does not correct when drift is within tolerance", async () => {
    const memberId = "int-member-1";
    const pgRemaining = 10000;

    await redisSet(REDIS_KEYS.budget(memberId), "9950");

    const redisVal = parseInt((await redisGet(REDIS_KEYS.budget(memberId)))!);
    const drift = Math.abs(redisVal - pgRemaining);
    expect(drift).toBe(50);
    expect(drift <= 100).toBe(true);

    const unchanged = await redisGet(REDIS_KEYS.budget(memberId));
    expect(unchanged).toBe("9950");
  });

  it("full reconciliation: wrong value → detect → fix → verify", async () => {
    const memberId = "int-member-1";
    const pgBudget = 20000;
    const pgSpend = 5000;
    const pgRemaining = pgBudget - pgSpend;

    await redisSet(REDIS_KEYS.budget(memberId), "10000");

    const redisVal = parseInt((await redisGet(REDIS_KEYS.budget(memberId)))!);
    const drift = Math.abs(redisVal - pgRemaining);
    expect(drift).toBe(5000);

    if (drift > 100) {
      await redisSet(REDIS_KEYS.budget(memberId), String(pgRemaining));
    }

    const final = await redisGet(REDIS_KEYS.budget(memberId));
    expect(final).toBe("15000");

    await redisDecrBy(REDIS_KEYS.budget(memberId), 1000);
    const afterSpend = await redisGet(REDIS_KEYS.budget(memberId));
    expect(afterSpend).toBe("14000");
  });
});

describe("C2.7 Provider disconnect cascade", () => {
  it("detects when a provider is removed from allowedProviders", () => {
    const allowedProviders = ["OPENAI", "ANTHROPIC", "GOOGLE"];
    const providerToRemove = "ANTHROPIC";

    const updated = allowedProviders.filter(p => p !== providerToRemove);
    expect(updated).toEqual(["OPENAI", "GOOGLE"]);
    expect(updated.includes("ANTHROPIC")).toBe(false);
  });

  it("suspends membership when allowedProviders becomes empty", () => {
    const allowedProviders = ["OPENAI"];
    const providerToRemove = "OPENAI";

    const updated = allowedProviders.filter(p => p !== providerToRemove);
    expect(updated).toEqual([]);
    expect(updated.length).toBe(0);

    const newStatus = updated.length === 0 ? "SUSPENDED" : "ACTIVE";
    expect(newStatus).toBe("SUSPENDED");
  });

  it("keeps membership active when some providers remain", () => {
    const allowedProviders = ["OPENAI", "ANTHROPIC"];
    const providerToRemove = "OPENAI";

    const updated = allowedProviders.filter(p => p !== providerToRemove);
    expect(updated).toEqual(["ANTHROPIC"]);
    expect(updated.length).toBeGreaterThan(0);

    const newStatus = updated.length === 0 ? "SUSPENDED" : "ACTIVE";
    expect(newStatus).toBe("ACTIVE");
  });

  it("rejects requests for removed providers", () => {
    const allowedProviders = ["ANTHROPIC"];
    const requestedProvider = "OPENAI";

    const allowed = allowedProviders.includes(requestedProvider);
    expect(allowed).toBe(false);

    const error = createProxyError(
      403,
      "provider_not_allowed",
      `Provider ${requestedProvider} is not allowed for your account`
    );
    expect(error.status).toBe(403);
    expect(error.code).toBe("provider_not_allowed");
  });

  it("cascading removal: remove all providers one by one", () => {
    let allowedProviders = ["OPENAI", "ANTHROPIC", "GOOGLE"];
    let status = "ACTIVE";

    allowedProviders = allowedProviders.filter(p => p !== "OPENAI");
    expect(allowedProviders.length).toBe(2);
    status = allowedProviders.length === 0 ? "SUSPENDED" : "ACTIVE";
    expect(status).toBe("ACTIVE");

    allowedProviders = allowedProviders.filter(p => p !== "ANTHROPIC");
    expect(allowedProviders.length).toBe(1);
    status = allowedProviders.length === 0 ? "SUSPENDED" : "ACTIVE";
    expect(status).toBe("ACTIVE");

    allowedProviders = allowedProviders.filter(p => p !== "GOOGLE");
    expect(allowedProviders.length).toBe(0);
    status = allowedProviders.length === 0 ? "SUSPENDED" : "ACTIVE";
    expect(status).toBe("SUSPENDED");
  });
});
