/**
 * V1.5.1 Piece 1 — `POST /api/v1/test-connection`
 *
 * Coverage:
 *   PURE HELPERS (unit, no I/O)
 *     1. classifyError → all 6 buckets + status fallbacks
 *     2. getUserType → voucher / team_admin / team_member branches
 *     3. getHint → branched 3 codes × 3 user_types + unbranched codes
 *     4. genericMessage → no provider names leak
 *     5. selectCheapestModelFromInputs (incl. Azure deployments + allowlist)
 *     6. extractResponseText → string + Anthropic-array shapes
 *     7. Locked-prompt invariants (TEST_PROMPT, max_tokens, temperature)
 *
 *   ENDPOINT INTEGRATION (vi.mock storage + processChatCompletion)
 *     8.  Success → returns model_used, response_text, cost_usd_cents,
 *         cost.display, budget.display, latency
 *     9.  Repeated calls → each charges budget independently (no caching)
 *     10. no_providers_active → fires when org has zero ACTIVE connections
 *     11. no_models_in_tier → providers exist but tier matches nothing
 *     12. budget_exhausted → translated from membership.status pre-call
 *     13. rate_limited → translated from upstream `rate_limit` code
 *     14. provider_error → translated from upstream `provider_error`
 *     15. Auth-failure budget_exhausted → re-derives user_type from key hash
 *     16. Bad bearer → 401 envelope (not budget_exhausted)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  classifyError,
  getHint,
  getUserType,
  selectCheapestModelFromInputs,
  extractResponseText,
  genericMessage,
  TEST_PROMPT,
  TEST_MAX_TOKENS,
  TEST_TEMPERATURE,
  type TestErrorCode,
  type UserType,
} from "../server/lib/proxy/test-connection";

// =============================================================================
// Storage + handler mocking — required for the endpoint integration cases.
// Hoisted vi.mock() so the SUT picks up our stubs at import time.
// =============================================================================

vi.mock("../server/storage", () => ({
  storage: {
    getApiKeyByHash: vi.fn(),
    getMembership: vi.fn(),
    getUser: vi.fn(),
    getTeam: vi.fn(),
    getOrganization: vi.fn(),
    getProviderConnectionsByOrg: vi.fn(),
    getModelPricingByProvider: vi.fn(),
  },
}));

vi.mock("../server/lib/proxy/handler", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    processChatCompletion: vi.fn(),
  };
});

vi.mock("../server/lib/proxy/safeguards", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    authenticateKey: vi.fn(),
    checkRateLimit: vi.fn(),
  };
});

vi.mock("../server/lib/currency", async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    // Pin a deterministic snapshot so cost/budget formatting is stable.
    getActiveRates: vi.fn(async () => ({
      rates: { GBP: 0.8, EUR: 0.9, BRL: 5.0 },
      asOf: new Date("2025-01-01T00:00:00.000Z"),
      source: "live" as const,
    })),
  };
});

// Re-import the mocked modules (after vi.mock has registered above).
import { storage } from "../server/storage";
import { processChatCompletion } from "../server/lib/proxy/handler";
import { authenticateKey, checkRateLimit } from "../server/lib/proxy/safeguards";

// =============================================================================
// Test fixtures
// =============================================================================

function mkConn(provider: string, status = "ACTIVE", azureDeployments: any = null) {
  return {
    id: `conn-${provider}`,
    orgId: "org-1",
    provider,
    status,
    encryptedKey: "x",
    azureDeployments,
    createdAt: new Date(),
    updatedAt: new Date(),
    nickname: null,
    encryptedExtra: null,
    lastValidatedAt: null,
    validationError: null,
  } as any;
}

function mkPricing(modelId: string, input: number, output: number, isActive = true) {
  return { modelId, isActive, inputPricePerMTok: input, outputPricePerMTok: output };
}

const baseMembership = (overrides: Partial<any> = {}) => ({
  id: "mem-1",
  teamId: "team-1",
  userId: "user-1",
  accessType: "TEAM",
  status: "ACTIVE",
  monthlyBudgetCents: 10000,
  currentPeriodSpendCents: 0,
  periodEnd: new Date(Date.now() + 30 * 86400_000),
  voucherExpiresAt: null,
  allowedProviders: null,
  allowedModels: null,
  ...overrides,
});

function mockReq(authHeader = "Bearer allotly_sk_test12345"): any {
  return { headers: { authorization: authHeader } };
}

function mockRes(): any {
  const res: any = { _status: 0, _body: null };
  res.status = (s: number) => {
    res._status = s;
    return res;
  };
  res.json = (b: any) => {
    res._body = b;
    return res;
  };
  return res;
}

// =============================================================================
// Locked-prompt invariants
// =============================================================================

describe("test-connection: locked test prompt", () => {
  it("uses the exact spec prompt, max_tokens=5, temperature=0", () => {
    expect(TEST_PROMPT).toBe("Reply with the single word 'ok' and nothing else.");
    expect(TEST_MAX_TOKENS).toBe(5);
    expect(TEST_TEMPERATURE).toBe(0);
  });
});

// =============================================================================
// Pure unit tests — see `tests/test-connection.test.ts` header for full list
// =============================================================================

describe("test-connection: classifyError", () => {
  it("maps budget codes to budget_exhausted", () => {
    expect(classifyError(402, "budget_exhausted")).toBe("budget_exhausted");
    expect(classifyError(402, "insufficient_budget")).toBe("budget_exhausted");
    expect(classifyError(402, undefined)).toBe("budget_exhausted");
  });

  it("maps rate-limit codes (incl. upstream variants) to rate_limited", () => {
    expect(classifyError(429, "rate_limit")).toBe("rate_limited");
    expect(classifyError(429, "rate_limited")).toBe("rate_limited");
    expect(classifyError(429, "concurrency_limit")).toBe("rate_limited");
    expect(classifyError(429, "upstream_rate_limited")).toBe("rate_limited");
    expect(classifyError(429, undefined)).toBe("rate_limited");
  });

  it("maps provider/upstream codes to provider_error", () => {
    expect(classifyError(502, "provider_error")).toBe("provider_error");
    expect(classifyError(502, "upstream_error")).toBe("provider_error");
    expect(classifyError(503, "provider_unavailable")).toBe("provider_error");
    expect(classifyError(500, "empty_response")).toBe("provider_error");
    expect(classifyError(503, undefined)).toBe("provider_error");
  });

  it("falls back to unknown for anything unenumerated", () => {
    expect(classifyError(500, "weird_internal_thing")).toBe("unknown");
    expect(classifyError(418, undefined)).toBe("unknown");
  });
});

describe("test-connection: getUserType", () => {
  it("returns voucher_recipient for VOUCHER access regardless of orgRole", () => {
    expect(getUserType({ accessType: "VOUCHER" }, { orgRole: "TEAM_ADMIN" })).toBe("voucher_recipient");
    expect(getUserType({ accessType: "VOUCHER" }, { orgRole: "MEMBER" })).toBe("voucher_recipient");
    expect(getUserType({ accessType: "VOUCHER" }, null)).toBe("voucher_recipient");
  });

  it("returns team_admin for ROOT_ADMIN/TEAM_ADMIN with TEAM access", () => {
    expect(getUserType({ accessType: "TEAM" }, { orgRole: "TEAM_ADMIN" })).toBe("team_admin");
    expect(getUserType({ accessType: "TEAM" }, { orgRole: "ROOT_ADMIN" })).toBe("team_admin");
  });

  it("returns team_member for MEMBER with TEAM access (and as the safe default)", () => {
    expect(getUserType({ accessType: "TEAM" }, { orgRole: "MEMBER" })).toBe("team_member");
    expect(getUserType({ accessType: "TEAM" }, null)).toBe("team_member");
  });
});

describe("test-connection: getHint branches by user_type for the 3 spec codes", () => {
  it("no_providers_active hint differs by user_type", () => {
    const a = getHint("no_providers_active", "team_admin");
    const m = getHint("no_providers_active", "team_member");
    const v = getHint("no_providers_active", "voucher_recipient");
    expect(a).not.toEqual(m);
    expect(m).not.toEqual(v);
    expect(a).toMatch(/\/dashboard\/providers/);
    expect(m).toMatch(/team admin/i);
    expect(v).toMatch(/issuing admin/i);
  });

  it("no_models_in_tier hint differs by user_type", () => {
    const a = getHint("no_models_in_tier", "team_admin");
    const m = getHint("no_models_in_tier", "team_member");
    const v = getHint("no_models_in_tier", "voucher_recipient");
    expect(a).not.toEqual(m);
    expect(m).not.toEqual(v);
    expect(a).toMatch(/\/dashboard\/teams/);
    expect(m).toMatch(/team admin/i);
    expect(v).toMatch(/issuing admin/i);
  });

  it("budget_exhausted hint differs by user_type and voucher branch mentions request_topup", () => {
    const a = getHint("budget_exhausted", "team_admin");
    const m = getHint("budget_exhausted", "team_member");
    const v = getHint("budget_exhausted", "voucher_recipient");
    expect(a).not.toEqual(m);
    expect(m).not.toEqual(v);
    expect(a).toMatch(/\/dashboard\/billing/);
    expect(v).toMatch(/request_topup/);
  });

  it("rate_limited / provider_error / unknown hints are user-type-agnostic", () => {
    const userTypes: UserType[] = ["team_admin", "team_member", "voucher_recipient"];
    for (const ut of userTypes) {
      expect(getHint("rate_limited", ut)).toBe(getHint("rate_limited", "team_admin"));
      expect(getHint("provider_error", ut)).toBe(getHint("provider_error", "team_admin"));
      expect(getHint("unknown", ut)).toBe(getHint("unknown", "team_admin"));
    }
  });

  it("does not leak provider names in any hint or generic message", () => {
    const codes: TestErrorCode[] = [
      "no_providers_active",
      "no_models_in_tier",
      "budget_exhausted",
      "rate_limited",
      "provider_error",
      "unknown",
    ];
    const userTypes: UserType[] = ["team_admin", "team_member", "voucher_recipient"];
    const banned = ["openai", "anthropic", "google", "azure", "mistral", "groq", "deepseek"];
    for (const code of codes) {
      const generic = genericMessage(code).toLowerCase();
      for (const b of banned) {
        expect(generic, `genericMessage ${code} leaked '${b}'`).not.toContain(b);
      }
      for (const ut of userTypes) {
        const hint = getHint(code, ut).toLowerCase();
        for (const b of banned) {
          expect(hint, `hint ${code}/${ut} leaked '${b}'`).not.toContain(b);
        }
      }
    }
  });
});

describe("test-connection: selectCheapestModelFromInputs", () => {
  it("returns no_providers_active when org has zero ACTIVE connections", () => {
    const result = selectCheapestModelFromInputs(
      baseMembership(),
      [mkConn("OPENAI", "INACTIVE"), mkConn("ANTHROPIC", "ERROR")],
      {},
    );
    expect(result.kind).toBe("no_providers_active");
  });

  it("returns no_models_in_tier when providers are active but allowlist matches nothing", () => {
    const result = selectCheapestModelFromInputs(
      baseMembership({ allowedModels: ["nonexistent-model"] }),
      [mkConn("OPENAI")],
      { OPENAI: [mkPricing("gpt-4o-mini", 15, 60)] },
    );
    expect(result.kind).toBe("no_models_in_tier");
  });

  it("picks the cheapest model across multiple providers", () => {
    const result = selectCheapestModelFromInputs(
      baseMembership(),
      [mkConn("OPENAI"), mkConn("ANTHROPIC"), mkConn("GOOGLE")],
      {
        OPENAI: [mkPricing("gpt-4o", 250, 1000), mkPricing("gpt-4o-mini", 15, 60)],
        ANTHROPIC: [mkPricing("claude-haiku", 25, 125)],
        GOOGLE: [mkPricing("gemini-flash", 7, 30)],
      },
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.modelId).toBe("gemini-flash");
  });

  it("respects allowedProviders intersection", () => {
    const result = selectCheapestModelFromInputs(
      baseMembership({ allowedProviders: ["OPENAI"] }),
      [mkConn("OPENAI"), mkConn("GOOGLE")],
      {
        OPENAI: [mkPricing("gpt-4o-mini", 15, 60)],
        GOOGLE: [mkPricing("gemini-flash", 7, 30)],
      },
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.modelId).toBe("gpt-4o-mini");
  });

  it("respects allowedModels intersection and skips inactive pricing", () => {
    const result = selectCheapestModelFromInputs(
      baseMembership({ allowedModels: ["gpt-4o-mini"] }),
      [mkConn("OPENAI")],
      {
        OPENAI: [
          mkPricing("gpt-4o", 250, 1000),
          mkPricing("gpt-4o-mini", 15, 60),
          mkPricing("gpt-4o-mini-old", 5, 5, false),
        ],
      },
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.modelId).toBe("gpt-4o-mini");
  });

  it("includes Azure deployments in candidate set", () => {
    const azureConn = mkConn("AZURE_OPENAI", "ACTIVE", [
      { deploymentName: "my-gpt4o-mini", modelId: "gpt-4o-mini", inputPricePerMTok: 10, outputPricePerMTok: 40 },
    ]);
    const result = selectCheapestModelFromInputs(
      baseMembership(),
      [mkConn("OPENAI"), azureConn],
      { OPENAI: [mkPricing("gpt-4o", 250, 1000)] },
    );
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") expect(result.modelId).toBe("azure/my-gpt4o-mini");
  });
});

describe("test-connection: extractResponseText", () => {
  it("returns the first choice's string content from an OpenAI response", () => {
    const result = extractResponseText({
      status: 200,
      body: { choices: [{ message: { content: "ok" } }] },
    } as any);
    expect(result).toBe("ok");
  });

  it("flattens Anthropic-style content arrays", () => {
    const result = extractResponseText({
      status: 200,
      body: { choices: [{ message: { content: [{ type: "text", text: "ok" }] } }] },
    } as any);
    expect(result).toBe("ok");
  });

  it("returns empty string on missing/invalid bodies", () => {
    expect(extractResponseText({ status: 200, body: null } as any)).toBe("");
    expect(extractResponseText({ status: 200, body: { choices: [] } } as any)).toBe("");
    expect(
      extractResponseText({ status: 200, body: { choices: [{ message: {} }] } } as any),
    ).toBe("");
  });
});

// =============================================================================
// ENDPOINT INTEGRATION — exercises the full Express handler with mocked
// storage + processChatCompletion. Pinned to the contracts the reviewer
// flagged: cost.display block on success, budget charged per call (not
// cached), no-bypass on short-circuit paths, auth-time budget_exhausted
// translation with re-derived user_type.
// =============================================================================

describe("test-connection: handler integration", () => {
  let handleTestConnection: (req: any, res: any) => Promise<void>;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset the dynamic import each suite so the mocked modules above are
    // re-applied cleanly.
    handleTestConnection = (await import("../server/lib/proxy/test-connection"))
      .handleTestConnection;
    // Rate-limit mock defaults to "OK" — individual tests override.
    (checkRateLimit as any).mockResolvedValue(null);
  });

  function setupAuthOk(membership: any = baseMembership(), user: any = { orgRole: "MEMBER" }) {
    (authenticateKey as any).mockResolvedValue({
      membership,
      userId: membership.userId,
      apiKeyId: "key-1",
      keyHash: "hash-1",
    });
    (storage.getMembership as any).mockResolvedValue(membership);
    (storage.getUser as any).mockResolvedValue(user);
    (storage.getTeam as any).mockResolvedValue({ id: membership.teamId, orgId: "org-1" });
    (storage.getOrganization as any).mockResolvedValue({ id: "org-1", plan: "TEAM", currency: "USD" });
  }

  function setupConnections(connections: any[], pricing: Record<string, any[]> = {}) {
    (storage.getProviderConnectionsByOrg as any).mockResolvedValue(connections);
    (storage.getModelPricingByProvider as any).mockImplementation(async (p: string) => pricing[p] || []);
  }

  // 8) success → returns model_used, response_text, cost.display, budget.display, latency
  it("success: returns model_used + response_text + cost.display + budget.display + latency", async () => {
    const membership = baseMembership({ accessType: "TEAM" });
    setupAuthOk(membership, { orgRole: "TEAM_ADMIN" });
    setupConnections([mkConn("OPENAI")], { OPENAI: [mkPricing("gpt-4o-mini", 15, 60)] });
    (processChatCompletion as any).mockResolvedValue({
      status: 200,
      body: { choices: [{ message: { content: "ok" } }] },
      budgetSnapshot: { remaining_cents: 9995, total_cents: 10000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 59, rate_limit_per_min: 60, concurrency_limit: 5, voucher_expires_at: null },
      costCents: 5,
      inputTokens: 12,
      outputTokens: 1,
      maxTokensApplied: true,
      effectiveModel: "gpt-4o-mini",
      provider: "OPENAI",
    });

    const req = mockReq();
    const res = mockRes();
    await handleTestConnection(req, res);

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(res._body.user_type).toBe("team_admin");
    expect(res._body.model_used).toBe("gpt-4o-mini");
    expect(res._body.response_text).toBe("ok");
    expect(res._body.cost_usd_cents).toBe(5);
    expect(res._body.cost.usd_cents).toBe(5);
    expect(res._body.cost.display.formatted.total).toBeTruthy();
    expect(res._body.cost.display.currency).toBe("USD");
    expect(res._body.budget.remaining_usd_cents).toBe(9995);
    expect(res._body.budget.total_usd_cents).toBe(10000);
    expect(res._body.budget.display.formatted.remaining).toBeTruthy();
    expect(typeof res._body.latency_ms).toBe("number");
    expect(res._body.latency_ms).toBeGreaterThanOrEqual(0);
  });

  // 9) repeated calls → each independently charges budget (no caching)
  it("repeated calls each invoke processChatCompletion (budget charged like real call)", async () => {
    setupAuthOk(baseMembership(), { orgRole: "MEMBER" });
    setupConnections([mkConn("OPENAI")], { OPENAI: [mkPricing("gpt-4o-mini", 15, 60)] });
    let remaining = 10000;
    (processChatCompletion as any).mockImplementation(async () => {
      remaining -= 5;
      return {
        status: 200,
        body: { choices: [{ message: { content: "ok" } }] },
        budgetSnapshot: { remaining_cents: remaining, total_cents: 10000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 59, rate_limit_per_min: 60, concurrency_limit: 5, voucher_expires_at: null },
        costCents: 5,
        inputTokens: 12,
        outputTokens: 1,
        maxTokensApplied: true,
        effectiveModel: "gpt-4o-mini",
        provider: "OPENAI",
      };
    });

    const r1 = mockRes();
    await handleTestConnection(mockReq(), r1);
    const r2 = mockRes();
    await handleTestConnection(mockReq(), r2);
    const r3 = mockRes();
    await handleTestConnection(mockReq(), r3);

    expect(processChatCompletion).toHaveBeenCalledTimes(3);
    expect(r1._body.budget.remaining_usd_cents).toBe(9995);
    expect(r2._body.budget.remaining_usd_cents).toBe(9990);
    expect(r3._body.budget.remaining_usd_cents).toBe(9985);
  });

  // 10) no_providers_active → still consumes rate-limit slot (no bypass)
  it("no_providers_active: returns 503 + branched hint AND consumes rate-limit slot", async () => {
    setupAuthOk(baseMembership(), { orgRole: "TEAM_ADMIN" });
    setupConnections([mkConn("OPENAI", "INACTIVE")]);

    const res = mockRes();
    await handleTestConnection(mockReq(), res);

    expect(res._status).toBe(503);
    expect(res._body.success).toBe(false);
    expect(res._body.user_type).toBe("team_admin");
    expect(res._body.error.code).toBe("no_providers_active");
    expect(res._body.error.hint).toMatch(/\/dashboard\/providers/);
    expect(res._body.budget).toBeDefined();
    expect(processChatCompletion).not.toHaveBeenCalled();
    // Rate-limit MUST be consumed on the short-circuit path.
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });

  // 11) no_models_in_tier → 403 + branched hint, also consumes rate-limit
  it("no_models_in_tier: 403 + team_admin hint pointing at /dashboard/teams", async () => {
    setupAuthOk(baseMembership({ allowedModels: ["does-not-exist"] }), { orgRole: "TEAM_ADMIN" });
    setupConnections([mkConn("OPENAI")], { OPENAI: [mkPricing("gpt-4o-mini", 15, 60)] });

    const res = mockRes();
    await handleTestConnection(mockReq(), res);

    expect(res._status).toBe(403);
    expect(res._body.error.code).toBe("no_models_in_tier");
    expect(res._body.user_type).toBe("team_admin");
    expect(res._body.error.hint).toMatch(/\/dashboard\/teams/);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect(processChatCompletion).not.toHaveBeenCalled();
  });

  // 12) Pre-call BUDGET_EXHAUSTED status (post-auth) → 402 + voucher hint
  it("pre-call budget_exhausted: voucher branch mentions request_topup", async () => {
    setupAuthOk(baseMembership({ status: "BUDGET_EXHAUSTED", accessType: "VOUCHER" }), null);

    const res = mockRes();
    await handleTestConnection(mockReq(), res);

    expect(res._status).toBe(402);
    expect(res._body.error.code).toBe("budget_exhausted");
    expect(res._body.user_type).toBe("voucher_recipient");
    expect(res._body.error.hint).toMatch(/request_topup/);
    expect(processChatCompletion).not.toHaveBeenCalled();
  });

  // 13) rate_limited from upstream
  it("upstream rate_limit code → 429 rate_limited envelope", async () => {
    setupAuthOk(baseMembership(), { orgRole: "MEMBER" });
    setupConnections([mkConn("OPENAI")], { OPENAI: [mkPricing("gpt-4o-mini", 15, 60)] });
    (processChatCompletion as any).mockResolvedValue({
      status: 429,
      errorBody: { code: "rate_limit", message: "Too many" },
      budgetSnapshot: { remaining_cents: 10000, total_cents: 10000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 0, rate_limit_per_min: 60, concurrency_limit: 5, voucher_expires_at: null },
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
      maxTokensApplied: false,
      effectiveModel: "gpt-4o-mini",
      provider: "OPENAI",
    });

    const res = mockRes();
    await handleTestConnection(mockReq(), res);

    expect(res._status).toBe(429);
    expect(res._body.error.code).toBe("rate_limited");
  });

  // 14) provider_error from upstream
  it("upstream provider_error → 502 provider_error envelope (no provider name leak)", async () => {
    setupAuthOk(baseMembership(), { orgRole: "MEMBER" });
    setupConnections([mkConn("OPENAI")], { OPENAI: [mkPricing("gpt-4o-mini", 15, 60)] });
    (processChatCompletion as any).mockResolvedValue({
      status: 502,
      errorBody: { code: "provider_error", message: "OpenAI returned 500: server overloaded" },
      budgetSnapshot: { remaining_cents: 10000, total_cents: 10000, currency: "usd", period_end: new Date().toISOString(), requests_remaining: 59, rate_limit_per_min: 60, concurrency_limit: 5, voucher_expires_at: null },
      costCents: 0,
      inputTokens: 0,
      outputTokens: 0,
      maxTokensApplied: false,
      effectiveModel: "gpt-4o-mini",
      provider: "OPENAI",
    });

    const res = mockRes();
    await handleTestConnection(mockReq(), res);

    expect(res._status).toBe(502);
    expect(res._body.error.code).toBe("provider_error");
    // Generic message must NOT leak the upstream payload's "OpenAI" mention.
    expect(res._body.error.message.toLowerCase()).not.toContain("openai");
  });

  // 15) Auth-failure budget_exhausted → re-derive user_type from key hash
  it("auth-time budget_exhausted: re-derives user_type from key hash and returns 402 with voucher hint", async () => {
    const membership = baseMembership({ status: "BUDGET_EXHAUSTED", accessType: "VOUCHER" });
    (authenticateKey as any).mockResolvedValue({
      status: 402,
      code: "budget_exhausted",
      message: "Your budget has been fully used",
    });
    (storage.getApiKeyByHash as any).mockResolvedValue({
      id: "key-1",
      membershipId: membership.id,
      userId: membership.userId,
      status: "ACTIVE",
    });
    (storage.getMembership as any).mockResolvedValue(membership);
    (storage.getUser as any).mockResolvedValue(null);
    (storage.getTeam as any).mockResolvedValue({ id: membership.teamId, orgId: "org-1" });
    (storage.getOrganization as any).mockResolvedValue({ id: "org-1", plan: "TEAM", currency: "USD" });

    const res = mockRes();
    await handleTestConnection(mockReq(), res);

    expect(res._status).toBe(402);
    expect(res._body.error.code).toBe("budget_exhausted");
    expect(res._body.user_type).toBe("voucher_recipient");
    expect(res._body.error.hint).toMatch(/request_topup/);
    expect(res._body.budget).toBeDefined();
  });

  // 16) Bad bearer → 401 envelope, NOT budget_exhausted
  it("bad bearer: returns 401 + unknown-classified envelope (does not leak)", async () => {
    (authenticateKey as any).mockResolvedValue({
      status: 401,
      code: "invalid_key",
      message: "Invalid API key",
    });
    (storage.getApiKeyByHash as any).mockResolvedValue(null);

    const res = mockRes();
    await handleTestConnection(mockReq("Bearer allotly_sk_nope"), res);

    expect(res._status).toBe(401);
    expect(res._body.success).toBe(false);
    expect(res._body.error.code).toBe("unknown");
  });
});
