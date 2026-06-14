import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getTeam: vi.fn(),
    getOrganization: vi.fn(),
    getModelPricing: vi.fn(),
    getProviderConnectionsByOrg: vi.fn(),
    getUser: vi.fn(),
    getRecentModelLatency: vi.fn(),
  },
}));

vi.mock("../server/lib/currency", async () => {
  const actual = await vi.importActual<typeof import("../server/lib/currency")>(
    "../server/lib/currency",
  );
  return {
    ...actual,
    getActiveRates: vi.fn(async () => ({
      rates: { USD: 1, GBP: 0.79, EUR: 0.92, BRL: 5.20 },
      asOf: new Date(0),
      source: "fallback" as const,
    })),
  };
});

import { storage } from "../server/storage";
import { getTool } from "../server/lib/mcp/tools";
import { classifyCapability } from "../server/lib/mcp/model-capabilities";

const TEAM_ID = "team-1";
const ORG_ID = "org-1";

let idCounter = 0;
function makeMembership(overrides: Partial<any> = {}): any {
  idCounter += 1;
  return {
    id: `mem-${idCounter}`,
    teamId: TEAM_ID,
    userId: "user-1",
    accessType: "TEAM",
    monthlyBudgetCents: 100_00,
    currentPeriodSpendCents: 0,
    periodEnd: new Date(Date.now() + 30 * 86_400_000),
    voucherExpiresAt: null,
    voucherRedemptionId: null,
    status: "ACTIVE",
    allowedModels: null,
    allowedProviders: null,
    ...overrides,
  };
}

function principal(membership: any, kind: "key" | "voucher" | "oauth" = "key"): any {
  return {
    membership,
    userId: membership.userId,
    apiKeyId: kind === "oauth" ? null : "key-1",
    oauthClientId: kind === "oauth" ? "client-1" : null,
    bearerKind: kind,
    voucherCode: kind === "voucher" ? "ALLOT-AAAA-BBBB-CCCC" : undefined,
    principalHash: `${kind}:1`,
  };
}

const PRICING_TABLE = [
  { id: "p1", provider: "OPENAI", modelId: "gpt-4o-mini", displayName: "GPT-4o mini",
    inputPricePerMTok: 15, outputPricePerMTok: 60, isActive: true, updatedAt: new Date() },
  { id: "p2", provider: "OPENAI", modelId: "gpt-4o", displayName: "GPT-4o",
    inputPricePerMTok: 250, outputPricePerMTok: 1000, isActive: true, updatedAt: new Date() },
  { id: "p3", provider: "OPENAI", modelId: "o3", displayName: "o3",
    inputPricePerMTok: 1500, outputPricePerMTok: 6000, isActive: true, updatedAt: new Date() },
  { id: "p4", provider: "ANTHROPIC", modelId: "claude-haiku-4-5", displayName: "Claude Haiku",
    inputPricePerMTok: 100, outputPricePerMTok: 500, isActive: true, updatedAt: new Date() },
  { id: "p5", provider: "ANTHROPIC", modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet",
    inputPricePerMTok: 300, outputPricePerMTok: 1500, isActive: true, updatedAt: new Date() },
  { id: "p6", provider: "ANTHROPIC", modelId: "claude-opus-4-7", displayName: "Claude Opus",
    inputPricePerMTok: 1500, outputPricePerMTok: 7500, isActive: true, updatedAt: new Date() },
] as any;

const ACTIVE_CONNECTIONS = [
  { id: "c1", provider: "OPENAI", status: "ACTIVE", azureDeployments: null },
  { id: "c2", provider: "ANTHROPIC", status: "ACTIVE", azureDeployments: null },
] as any;

const TASK = "Translate this sentence into French and keep the tone formal";

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getTeam as any).mockResolvedValue({ id: TEAM_ID, orgId: ORG_ID });
  (storage.getOrganization as any).mockResolvedValue({ id: ORG_ID, plan: "TEAM", currency: "USD" });
  (storage.getProviderConnectionsByOrg as any).mockResolvedValue(ACTIVE_CONNECTIONS);
  (storage.getModelPricing as any).mockResolvedValue(PRICING_TABLE);
  (storage.getUser as any).mockResolvedValue({ id: "user-1", orgRole: "MEMBER" });
  (storage.getRecentModelLatency as any).mockResolvedValue([]);
});

const ctx = (mem: any, kind: "key" | "voucher" | "oauth" = "key") => ({
  principal: principal(mem, kind),
  authHeader: undefined,
});

describe("recommend_model — preference ordering", () => {
  it("cheapest picks the lowest true-cost model, not a premium one", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "cheapest" },
      ctx(makeMembership()),
    );
    expect(out.recommended.model).toBe("gpt-4o-mini");
    expect(out.recommended.model).not.toBe("claude-opus-4-7");
    expect(out.recommended.capability).toBe("fast");
    // Alternatives ascend by true cost and are each costlier than the top pick.
    const costs = out.alternatives.map((a: any) => a.precise_cost_usd_cents);
    expect(costs).toEqual([...costs].sort((a: number, b: number) => a - b));
    for (const c of costs) {
      expect(c).toBeGreaterThan(out.recommended.precise_cost_usd_cents);
    }
  });

  it("smartest picks the highest-capability affordable model", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest" },
      ctx(makeMembership()),
    );
    expect(out.recommended.model).toBe("claude-opus-4-7");
    expect(out.recommended.capability).toBe("frontier");
  });

  it("cheapest and smartest disagree for the same task", async () => {
    const tool = getTool("recommend_model")!;
    const cheap = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "cheapest" },
      ctx(makeMembership()),
    );
    const smart = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest" },
      ctx(makeMembership()),
    );
    expect(cheap.recommended.model).not.toBe(smart.recommended.model);
  });
});

describe("recommend_model — output length scales cost, not class", () => {
  it("longer expected output raises cost but keeps the smartest class", async () => {
    const tool = getTool("recommend_model")!;
    const short = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest" },
      ctx(makeMembership()),
    );
    const long = await tool.handler(
      { task_description: TASK, expected_output_length: "long", prefer: "smartest" },
      ctx(makeMembership()),
    );
    // Same model class chosen regardless of length.
    expect(long.recommended.model).toBe(short.recommended.model);
    // Output assumption scales 1000 -> 16000, so cost grows by >10x.
    expect(short.recommended.output_tokens_assumed).toBe(1000);
    expect(long.recommended.output_tokens_assumed).toBe(16000);
    expect(long.recommended.precise_cost_usd_cents).toBeGreaterThan(
      short.recommended.precise_cost_usd_cents * 10,
    );
  });
});

describe("recommend_model — affordability gate", () => {
  it("never recommends a model whose reserve-safe cost exceeds the budget", async () => {
    const tool = getTool("recommend_model")!;
    // remaining = 50c. With long output, opus/o3 ceil far exceed 50c and must
    // be excluded; the smartest still-affordable model is claude-sonnet.
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "long", prefer: "smartest" },
      ctx(makeMembership({ monthlyBudgetCents: 50, currentPeriodSpendCents: 0 })),
    );
    expect(out.recommended.model).toBe("claude-sonnet-4-6");
    expect(out.recommended.estimated_cost_cents).toBeLessThanOrEqual(50);
    const chosen = [out.recommended.model, ...out.alternatives.map((a: any) => a.model)];
    expect(chosen).not.toContain("claude-opus-4-7");
    expect(chosen).not.toContain("o3");
  });

  it("returns null with a budget message when nothing fits", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "long", prefer: "smartest" },
      ctx(makeMembership({ monthlyBudgetCents: 1, currentPeriodSpendCents: 0 })),
    );
    expect(out.recommended).toBeNull();
    expect(out.alternatives).toEqual([]);
    expect(out.message).toMatch(/budget/i);
  });

  it("excludes a model the proxy would reject due to the 1.25x reservation multiplier", async () => {
    // Custom input-heavy model, zero output price. A 1000-char task estimates to
    // 252 input tokens. Base-rate ceil = ceil(252*15000/1e6) = 4c, but the proxy
    // reserves input at 1.25x: ceil(252*15000*1.25/1e6) = 5c. With exactly 4c
    // remaining, a base-rate gate would (wrongly) recommend it; the
    // reservation-exact gate must exclude it — matching what the proxy enforces.
    (storage.getModelPricing as any).mockResolvedValue([
      { id: "pe", provider: "OPENAI", modelId: "expensive-input-x", displayName: "Expensive Input X",
        inputPricePerMTok: 15000, outputPricePerMTok: 0, isActive: true, updatedAt: new Date() },
    ] as any);
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: "a".repeat(1000), expected_output_length: "short", prefer: "smartest" },
      ctx(makeMembership({ monthlyBudgetCents: 4, currentPeriodSpendCents: 0, allowedModels: ["expensive-input-x"] })),
    );
    expect(out.recommended).toBeNull();
    expect(out.message).toMatch(/budget/i);
  });
});

describe("recommend_model — latency (fastest)", () => {
  it("uses the deterministic tier when there is no observed history", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "fastest" },
      ctx(makeMembership()),
    );
    expect(out.recommended.model).toBe("gpt-4o-mini");
    expect(out.recommended.latency_source).toBe("estimated");
    expect(out.recommended.latency_tier).toBe("fast");
  });

  it("observed latency reorders the ranking and is labeled as observed", async () => {
    (storage.getRecentModelLatency as any).mockResolvedValue([
      { model: "claude-opus-4-7", avgMsPerOutputToken: 2, samples: 20 },
      { model: "gpt-4o-mini", avgMsPerOutputToken: 100, samples: 20 },
    ]);
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "fastest" },
      ctx(makeMembership()),
    );
    // Opus is normally slowest but its observed latency is fastest here.
    expect(out.recommended.model).toBe("claude-opus-4-7");
    expect(out.recommended.latency_source).toBe("observed");
    expect(out.recommended.latency_tier).toBe("fast");
  });

  it("degrades gracefully when the latency lookup throws", async () => {
    (storage.getRecentModelLatency as any).mockRejectedValue(new Error("db down"));
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "fastest" },
      ctx(makeMembership()),
    );
    expect(out.recommended.model).toBe("gpt-4o-mini");
    expect(out.recommended.latency_source).toBe("estimated");
  });
});

describe("recommend_model — capability classification", () => {
  it("scores an unknown model from price within the candidate set (40..95)", async () => {
    (storage.getModelPricing as any).mockResolvedValue([
      { id: "px", provider: "OPENAI", modelId: "acme-frontier-x", displayName: "Acme X",
        inputPricePerMTok: 200, outputPricePerMTok: 800, isActive: true, updatedAt: new Date() },
    ] as any);
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest" },
      ctx(makeMembership({ allowedModels: ["acme-frontier-x"] })),
    );
    expect(out.recommended.model).toBe("acme-frontier-x");
    expect(typeof out.recommended.capability).toBe("string");
    expect(out.recommended.capability_score).toBeGreaterThanOrEqual(40);
    expect(out.recommended.capability_score).toBeLessThanOrEqual(95);
  });

  it("filters out non-vision models when needs_vision is set", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest", needs_vision: true },
      ctx(makeMembership()),
    );
    const chosen = [out.recommended.model, ...out.alternatives.map((a: any) => a.model)];
    for (const m of chosen) {
      expect(m).toMatch(/gpt-4o|claude-(sonnet|haiku|opus)|gemini/);
    }
    expect(chosen).not.toContain("o3");
  });
});

describe("classifyCapability — size-qualifier short-circuit", () => {
  const ctx = { minBlended: 10, maxBlended: 10_000 };
  const cap = (id: string) => classifyCapability(id, 100, ctx);

  it("classifies size variants as fast across families, not their parent tier", () => {
    for (const id of ["gpt-5.4-nano", "gpt-5-nano", "gpt-5.4-mini", "o4-mini", "gemini-2.5-flash-lite"]) {
      expect(cap(id)).toMatchObject({ label: "fast", source: "map" });
      expect(cap(id).score).toBeLessThan(60);
    }
  });

  it("keeps existing families correct (regressions)", () => {
    expect(cap("gpt-4.1-nano").label).toBe("fast"); // still fast via the size short-circuit
    expect(cap("claude-opus-4-7").label).toBe("frontier");
    expect(cap("claude-haiku-4-5").label).toBe("balanced");
    expect(cap("gemini-2.5-flash").label).toBe("balanced"); // plain flash stays balanced
  });

  it("does not fire on the 'mini' inside 'gemini'", () => {
    // 'mini' inside 'gemini' is not boundary-anchored, so the short-circuit
    // skips it and the family map resolves gemini-pro to advanced as before.
    expect(cap("gemini-2.5-pro")).toMatchObject({ label: "advanced", source: "map" });
    expect(cap("gemini-2.5-flash")).toMatchObject({ label: "balanced", source: "map" });
  });
});

describe("recommend_model — gpt-5 nano lands in the fast tier", () => {
  it("ranks a gpt-5 nano as fast (not frontier/slow) for prefer=fastest", async () => {
    (storage.getModelPricing as any).mockResolvedValue([
      { id: "n1", provider: "OPENAI", modelId: "gpt-5.4-nano", displayName: "GPT-5.4 nano",
        inputPricePerMTok: 5, outputPricePerMTok: 40, isActive: true, updatedAt: new Date() },
      { id: "p2", provider: "OPENAI", modelId: "gpt-4o", displayName: "GPT-4o",
        inputPricePerMTok: 250, outputPricePerMTok: 1000, isActive: true, updatedAt: new Date() },
    ] as any);
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "fastest" },
      ctx(makeMembership()),
    );
    expect(out.recommended.model).toBe("gpt-5.4-nano");
    expect(out.recommended.capability).toBe("fast");
    expect(out.recommended.latency_tier).toBe("fast");
    expect(out.recommended.reason).not.toMatch(/slow|frontier/i);
  });
});

describe("recommend_model — agreement with estimate_cost", () => {
  it("recommended cost matches estimate_cost for the same model and output size", async () => {
    const mem = makeMembership({ allowedModels: ["claude-sonnet-4-6"] });
    const recommend = getTool("recommend_model")!;
    const estimate = getTool("estimate_cost")!;

    const rec = await recommend.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest" },
      ctx(mem),
    );
    const est = await estimate.handler(
      { model: "claude-sonnet-4-6", messages: [{ role: "user", content: TASK }], max_tokens: 1000 },
      ctx(makeMembership({ allowedModels: ["claude-sonnet-4-6"] })),
    );

    expect(rec.recommended.model).toBe("claude-sonnet-4-6");
    // Same precise cost helper + same token inputs (1000 short == max_tokens
    // 1000) → identical base-rate precise cost.
    expect(rec.recommended.precise_cost_usd_cents).toBeCloseTo(
      est.estimated.precise_cost_usd_cents,
      10,
    );
    // recommend_model's estimated_cost_cents is the EXACT proxy reservation
    // (input held at 1.25x), so it is always >= estimate_cost's base-rate ceil.
    expect(rec.recommended.estimated_cost_cents).toBeGreaterThanOrEqual(est.estimated.max_cost_usd_cents);
  });
});

describe("recommend_model — sub-cent display differentiation", () => {
  it("renders distinct sub-cent costs instead of collapsing to one floor", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "cheapest" },
      ctx(makeMembership()),
    );
    const top = out.recommended.cost_display.formatted as string;
    const alt = out.alternatives[0].cost_display.formatted as string;
    expect(top).not.toBe(alt);
    expect(top).toMatch(/^\$0\.00/);
    expect(alt).toMatch(/^\$0\.00/);
    expect(top).not.toContain("<");
    expect(alt).not.toContain("<");
    expect(out.recommended.precise_cost_usd_cents).toBeLessThan(1);
    expect(out.recommended.precise_cost_usd_cents).toBeGreaterThan(0);
  });
});

describe("recommend_model — no eligible models", () => {
  it("returns a capability message when no model matches needs_vision via allowlist", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest", needs_vision: true },
      ctx(makeMembership({ allowedModels: ["o3"] })),
    );
    expect(out.recommended).toBeNull();
    expect(out.message).toMatch(/capabilit/i);
  });
});

describe("recommend_model — registry config (auth + scope)", () => {
  it("requires auth and runs under the mcp scope", () => {
    const tool = getTool("recommend_model")!;
    expect(tool.requiresAuth).toBe(true);
    expect(tool.requiredScope).toBe("mcp");
  });

  it("annotations mark it read-only", () => {
    const tool = getTool("recommend_model")!;
    expect(tool.annotations).toMatchObject({
      title: "Recommend the best model for a task",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("attaches the budget _meta envelope", async () => {
    const tool = getTool("recommend_model")!;
    const out = await tool.handler(
      { task_description: TASK, expected_output_length: "short", prefer: "smartest" },
      ctx(makeMembership()),
    );
    expect(out._meta.budget.remaining_cents).toBeGreaterThan(0);
    expect(out._meta.budget.currency).toBe("usd");
  });
});
