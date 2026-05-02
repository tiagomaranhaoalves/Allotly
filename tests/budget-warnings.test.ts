import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getModelPricing: vi.fn(),
  },
}));

vi.mock("../server/lib/currency", async () => {
  const actual: any = await vi.importActual("../server/lib/currency");
  return {
    ...actual,
    getActiveRates: vi.fn(async () => ({
      base: "USD",
      rates: { USD: 1, EUR: 0.9, GBP: 0.8, BRL: 5, CAD: 1.3, AUD: 1.5, JPY: 150 },
      asOf: new Date(),
      source: "manual" as const,
    })),
  };
});

import { storage } from "../server/storage";
import { getBudgetWarning, TOPUP_URL } from "../server/lib/mcp/budget-warnings";

const PRICING = [
  { modelId: "gpt-4o", provider: "OPENAI", inputPricePerMTok: 2500, outputPricePerMTok: 10000 },
  { modelId: "gpt-4o-mini", provider: "OPENAI", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { modelId: "claude-haiku", provider: "ANTHROPIC", inputPricePerMTok: 25, outputPricePerMTok: 125 },
];

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getModelPricing as any).mockResolvedValue(PRICING);
});

describe("getBudgetWarning - threshold logic", () => {
  it("returns null when total budget is 0 (unlimited)", async () => {
    const w = await getBudgetWarning(1000, 0, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w).toBeNull();
  });

  it("returns null when remaining is above 25% (>= 25%)", async () => {
    const w = await getBudgetWarning(2500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w).toBeNull();
  });

  it("returns level=low when remaining is between 10% and 25%", async () => {
    const w = await getBudgetWarning(2000, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.level).toBe("low");
    expect(w?.remaining_pct).toBe(20);
  });

  it("returns level=critical when remaining is below 10%", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.level).toBe("critical");
    expect(w?.remaining_pct).toBe(5);
  });

  it("returns level=exhausted when remaining is 0", async () => {
    const w = await getBudgetWarning(0, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.level).toBe("exhausted");
    expect(w?.remaining_pct).toBe(0);
  });

  it("returns level=exhausted when remaining is negative (clamped)", async () => {
    const w = await getBudgetWarning(-50, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.level).toBe("exhausted");
  });
});

describe("getBudgetWarning - branched wording", () => {
  it("admin branch (TEAM + TEAM_ADMIN) includes topup_url and Top up text", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.suggestion.topup_url).toBe(TOPUP_URL);
    expect(w?.suggestion.topup_via_mcp_tool).toBeNull();
    expect(w?.suggestion.text).toContain(TOPUP_URL);
    expect(w?.suggestion.text).toMatch(/Top up/i);
  });

  it("admin branch also matches OWNER role", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "OWNER" }, null, "USD");
    expect(w?.suggestion.topup_url).toBe(TOPUP_URL);
  });

  it("ROOT_ADMIN org role with TEAM access falls through to member branch", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "ROOT_ADMIN" }, null, "USD");
    expect(w?.suggestion.topup_url).toBeNull();
    expect(w?.suggestion.text).toMatch(/contact your team admin/i);
  });

  it("member branch (TEAM + MEMBER) instructs to contact admin", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "MEMBER" }, null, "USD");
    expect(w?.suggestion.topup_url).toBeNull();
    expect(w?.suggestion.topup_via_mcp_tool).toBeNull();
    expect(w?.suggestion.text).toMatch(/contact your team admin/i);
  });

  it("voucher branch sets topup_via_mcp_tool=request_topup", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "VOUCHER" }, null, "USD");
    expect(w?.suggestion.topup_url).toBeNull();
    expect(w?.suggestion.topup_via_mcp_tool).toBe("request_topup");
    expect(w?.suggestion.text).toContain("request_topup");
  });

  it("exhausted voucher uses 'Voucher fully spent' message", async () => {
    const w = await getBudgetWarning(0, 10000, { accessType: "VOUCHER" }, null, "USD");
    expect(w?.message).toBe("Voucher fully spent.");
  });

  it("exhausted team budget uses 'Budget fully spent' message", async () => {
    const w = await getBudgetWarning(0, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.message).toBe("Budget fully spent.");
  });
});

describe("getBudgetWarning - cheapest model lookup", () => {
  it("returns null cheapest when allowlist is null (no constraint)", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.suggestion.cheapest_model_in_allowlist).toBeNull();
    expect(w?.suggestion.text).not.toContain("Try cheaper models");
  });

  it("returns null cheapest when allowlist is an empty array", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, [], "USD");
    expect(w?.suggestion.cheapest_model_in_allowlist).toBeNull();
  });

  it("restricts cheapest pick to allowlist when provided", async () => {
    const w = await getBudgetWarning(
      500, 10000,
      { accessType: "TEAM", orgRole: "TEAM_ADMIN" },
      ["gpt-4o", "claude-haiku"],
      "USD",
    );
    expect(w?.suggestion.cheapest_model_in_allowlist).toBe("claude-haiku");
  });

  it("returns null cheapest when allowlist matches no known models", async () => {
    const w = await getBudgetWarning(
      500, 10000,
      { accessType: "TEAM", orgRole: "TEAM_ADMIN" },
      ["nonexistent-model"],
      "USD",
    );
    expect(w?.suggestion.cheapest_model_in_allowlist).toBeNull();
    expect(w?.suggestion.text).not.toContain("Try cheaper models");
  });

  it("exhausted level omits 'Try cheaper models' regardless of allowlist", async () => {
    const w = await getBudgetWarning(0, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.suggestion.text).not.toContain("Try cheaper models");
  });

  it("returns null cheapest when getModelPricing throws", async () => {
    (storage.getModelPricing as any).mockRejectedValue(new Error("db down"));
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.suggestion.cheapest_model_in_allowlist).toBeNull();
  });
});

describe("getBudgetWarning - currency formatting", () => {
  it("low message contains formatted USD amounts", async () => {
    const w = await getBudgetWarning(2000, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.message).toContain("$");
    expect(w?.message).toMatch(/Budget at 20%/);
  });

  it("critical message reports remaining amount only", async () => {
    const w = await getBudgetWarning(500, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "USD");
    expect(w?.message).toMatch(/critically low/i);
    expect(w?.message).toMatch(/5%/);
  });

  it("formats amounts in BRL when org currency is BRL", async () => {
    const w = await getBudgetWarning(2000, 10000, { accessType: "TEAM", orgRole: "TEAM_ADMIN" }, null, "BRL");
    expect(w?.message).toMatch(/R\$/);
    expect(w?.message).toMatch(/Budget at 20%/);
  });
});
