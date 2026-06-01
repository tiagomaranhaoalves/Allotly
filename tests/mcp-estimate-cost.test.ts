import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("../server/storage", () => ({
  storage: {
    getTeam: vi.fn(),
    getOrganization: vi.fn(),
    getModelPricing: vi.fn(),
    getProviderConnectionsByOrg: vi.fn(),
  },
}));

const recordAuditMock = vi.fn();
vi.mock("../server/lib/mcp/audit", async () => {
  const actual = await vi.importActual<typeof import("../server/lib/mcp/audit")>(
    "../server/lib/mcp/audit",
  );
  return {
    ...actual,
    recordAudit: (...args: any[]) => recordAuditMock(...args),
  };
});

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

const TEAM_ID = "team-1";
const ORG_ID = "org-1";

function makeMembership(overrides: Partial<any> = {}): any {
  return {
    id: "mem-1",
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
    clientId: kind === "oauth" ? "client-1" : undefined,
    scopes: kind === "oauth" ? ["mcp:read"] : undefined,
    resource: kind === "oauth" ? "mcp" : undefined,
    jti: kind === "oauth" ? "jti-1" : undefined,
    principalHash: `${kind}:1`,
  };
}

const PRICING_TABLE = [
  // OpenAI
  { id: "p1", provider: "OPENAI", modelId: "gpt-4o-mini", displayName: "GPT-4o mini",
    inputPricePerMTok: 15, outputPricePerMTok: 60, isActive: true, updatedAt: new Date() },
  { id: "p2", provider: "OPENAI", modelId: "gpt-4o", displayName: "GPT-4o",
    inputPricePerMTok: 250, outputPricePerMTok: 1000, isActive: true, updatedAt: new Date() },
  { id: "p3", provider: "OPENAI", modelId: "o3", displayName: "o3",
    inputPricePerMTok: 1500, outputPricePerMTok: 6000, isActive: true, updatedAt: new Date() },
  // Anthropic
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

beforeEach(() => {
  vi.clearAllMocks();
  (storage.getTeam as any).mockResolvedValue({ id: TEAM_ID, orgId: ORG_ID });
  (storage.getOrganization as any).mockResolvedValue({ id: ORG_ID, plan: "TEAM", currency: "USD" });
  (storage.getProviderConnectionsByOrg as any).mockResolvedValue(ACTIVE_CONNECTIONS);
  (storage.getModelPricing as any).mockResolvedValue(PRICING_TABLE);
});

describe("estimate_cost — happy path & validation", () => {
  it("returns a non-zero max_cost and matching model on a valid request", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "hello world" }],
      max_tokens: 1000,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    expect(out.model).toBe("claude-sonnet-4-6");
    expect(out.estimated.input_tokens).toBeGreaterThan(0);
    expect(out.estimated.max_output_tokens).toBe(1000);
    expect(out.estimated.max_cost_usd_cents).toBeGreaterThan(0);
    expect(out.estimated.max_cost_display.currency).toBe("USD");
    expect(out.estimated.max_cost_display.formatted).toMatch(/\$/);
    expect(out.disclaimer).toMatch(/Estimate based on max_tokens/);
  });

  it("throws ModelNotAllowed when requested model is not in the allowlist", async () => {
    const tool = getTool("estimate_cost")!;
    const mem = makeMembership({ allowedModels: ["gpt-4o-mini"] });
    await expect(
      tool.handler(
        { model: "claude-opus-4-7", messages: [{ role: "user", content: "hi" }] },
        { principal: principal(mem), authHeader: undefined },
      ),
    ).rejects.toMatchObject({ name: "ModelNotAllowed" });
  });

  it("falls back to a 4096-token default when max_tokens is omitted", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }, { principal: principal(makeMembership()), authHeader: undefined });
    expect(out.estimated.max_output_tokens).toBe(4096);
  });
});

describe("estimate_cost — alternatives selection", () => {
  it("filters alternatives to vision-capable models when input contains an image", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o",
      messages: [
        { role: "user", content: [
          { type: "text", text: "describe" },
          { type: "image_url", image_url: { url: "data:image/png;base64,AA" } },
        ] },
      ],
      max_tokens: 1000,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    // o3 is cheaper than gpt-4o? No — o3 here is more expensive. But the
    // important assertion is: every alternative is vision-capable. None of
    // the alternatives may be a non-vision model (o3 is not vision per the
    // VISION_CAPABLE regex).
    for (const alt of out.alternatives) {
      expect(alt.model).toMatch(/gpt-4o|claude-(sonnet|haiku|opus)|gemini/);
    }
  });

  it("includes text-capable cheaper alternatives for plain-text input", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1000,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    expect(out.alternatives.length).toBeGreaterThan(0);
    for (const alt of out.alternatives) {
      expect(alt.max_cost_usd_cents).toBeLessThan(out.estimated.max_cost_usd_cents);
    }
  });

  it("returns an empty alternatives array when the requested model is the cheapest", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1000,
    }, { principal: principal(makeMembership()), authHeader: undefined });
    expect(out.alternatives).toEqual([]);
  });

  it("returns up to 3 strictly-cheaper alternatives when the requested model is most expensive", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1000,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    expect(out.alternatives.length).toBeGreaterThan(0);
    expect(out.alternatives.length).toBeLessThanOrEqual(3);
    // Ascending by cost.
    const costs = out.alternatives.map((a: any) => a.max_cost_usd_cents);
    expect(costs).toEqual([...costs].sort((a, b) => a - b));
    // Strictly cheaper than requested.
    for (const c of costs) {
      expect(c).toBeLessThan(out.estimated.max_cost_usd_cents);
    }
    // Each alt has savings_pct.
    for (const alt of out.alternatives) {
      expect(alt.savings_pct).toBeGreaterThan(0);
      expect(alt.savings_pct).toBeLessThanOrEqual(100);
    }
  });
});

describe("estimate_cost — low max_tokens true-cost ranking (regression)", () => {
  // At max_tokens=500 with a tiny prompt, each per-component cost rounds up
  // to the 1-cent floor, so most models' DISPLAY cost collapses to 2c. The
  // old strict `cost < requestedCost` on rounded cents wrongly dropped every
  // same-floor model. Alternatives must now rank/filter on the true cost.
  it("surfaces genuinely-cheaper models even when display cents tie", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello world" }],
      max_tokens: 500,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    const models = out.alternatives.map((a: any) => a.model);
    expect(models).toContain("gpt-4o-mini");
    // Cheapest-first ordering by true cost.
    expect(models[0]).toBe("gpt-4o-mini");

    const mini = out.alternatives.find((a: any) => a.model === "gpt-4o-mini")!;
    // Displayed cents tie with the requested model (both ceil to 2c) ...
    expect(mini.max_cost_usd_cents).toBe(out.estimated.max_cost_usd_cents);
    // ... but savings_pct is computed from the true (unrounded) difference.
    expect(mini.savings_pct).toBeGreaterThan(0);
  });

  it("keeps the requested model's displayed max cost on the conservative ceil", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hello world" }],
      max_tokens: 500,
    }, { principal: principal(makeMembership()), authHeader: undefined });
    // 5 input tokens * 250/Mtok -> ceil 1c; 500 out * 1000/Mtok -> ceil 1c.
    expect(out.estimated.max_cost_usd_cents).toBe(2);
  });

  it("returns no alternatives when the requested model is genuinely cheapest", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hello world" }],
      max_tokens: 500,
    }, { principal: principal(makeMembership()), authHeader: undefined });
    expect(out.alternatives).toEqual([]);
  });

  it("caps at the 3 cheapest by true cost when more than 3 are cheaper", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "claude-opus-4-7",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1000,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    expect(out.alternatives).toHaveLength(3);
    expect(out.alternatives.map((a: any) => a.model)).toEqual([
      "gpt-4o-mini",
      "claude-haiku-4-5",
      "gpt-4o",
    ]);
  });
});

describe("estimate_cost — currency display", () => {
  it("formats max_cost_display in the org's currency (BRL → R$ 0,...)", async () => {
    (storage.getOrganization as any).mockResolvedValue({ id: ORG_ID, plan: "TEAM", currency: "BRL" });
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 100,
    }, { principal: principal(makeMembership()), authHeader: undefined });

    expect(out.estimated.max_cost_display.currency).toBe("BRL");
    expect(out.estimated.max_cost_display.formatted).toContain("R$");
    // pt-BR locale uses comma decimal separator.
    expect(out.estimated.max_cost_display.formatted).toMatch(/,/);
  });
});

describe("estimate_cost — side-effect free", () => {
  it("does not decrement budget or call any chat/proxy code path", async () => {
    const tool = getTool("estimate_cost")!;
    const mem = makeMembership({ monthlyBudgetCents: 10_00, currentPeriodSpendCents: 0 });
    await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 1000,
    }, { principal: principal(mem), authHeader: undefined });

    // Membership is read but never written — there is no updateMembership
    // mock provided, so any call to it would throw an undefined-method
    // error. The tool ran successfully → no membership write happened.
    expect((storage as any).updateMembership).toBeUndefined();
    // Budget figures on the membership object are untouched.
    expect(mem.currentPeriodSpendCents).toBe(0);
    expect(mem.monthlyBudgetCents).toBe(10_00);
  });
});

describe("estimate_cost — registry config (auth + scope)", () => {
  it("requires auth, runs under mcp:read scope, and is not voucher-only", () => {
    const tool = getTool("estimate_cost")!;
    expect(tool.requiresAuth).toBe(true);
    expect(tool.requiredScope).toBe("mcp:read");
    expect(tool.voucherOnly).toBe(false);
  });

  it("annotations match the locked V1.5.1 contract", () => {
    const tool = getTool("estimate_cost")!;
    expect(tool.annotations).toMatchObject({
      title: "Estimate cost of a chat request",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
  });

  it("OAuth bearer with mcp:read scope can invoke it", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }, { principal: principal(makeMembership(), "oauth"), authHeader: undefined });
    expect(out.model).toBe("gpt-4o-mini");
  });

  it("voucher bearer can invoke it", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }, { principal: principal(makeMembership({ accessType: "VOUCHER" }), "voucher"), authHeader: undefined });
    expect(out.model).toBe("gpt-4o-mini");
  });

  it("TEAM key bearer can invoke it", async () => {
    const tool = getTool("estimate_cost")!;
    const out = await tool.handler({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "hi" }],
    }, { principal: principal(makeMembership(), "key"), authHeader: undefined });
    expect(out.model).toBe("gpt-4o-mini");
  });
});

describe("estimate_cost — audit semantics (transport-level)", () => {
  it("writes an mcp_audit_log row via the transport for tools/call estimate_cost", async () => {
    // Audit rows are written by the JSON-RPC transport (not the tool
    // handler). We invoke the transport for `tools/call estimate_cost`
    // (without auth) and assert that the mocked `recordAudit` from
    // `server/lib/mcp/audit` was called with `tool_name=estimate_cost`.
    // The unauthenticated path produces ok=false / errorCode=-32001 —
    // the important point is that the row is written, proving the tool
    // is wired through the audited path.
    recordAuditMock.mockClear();

    const express = (await import("express")).default;
    const http = await import("http");
    const { mountMcp } = await import("../server/lib/mcp/server");

    const app = express();
    app.use(express.json());
    mountMcp(app, "/mcp");
    const server = app.listen(0);
    try {
      const addr = server.address() as any;
      await new Promise<void>((resolve, reject) => {
        const req = http.request({
          method: "POST",
          host: "127.0.0.1",
          port: addr.port,
          path: "/mcp",
          headers: { "Content-Type": "application/json" },
        }, res => {
          res.on("data", () => {});
          res.on("end", () => resolve());
        });
        req.on("error", reject);
        req.write(JSON.stringify({
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "estimate_cost", arguments: { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] } },
        }));
        req.end();
      });
    } finally {
      server.close();
    }

    const calls = recordAuditMock.mock.calls.map(c => c[0]);
    const ours = calls.find((c: any) => c.toolName === "estimate_cost");
    expect(ours, "expected an audit row with tool_name=estimate_cost").toBeDefined();
    expect(ours!.inputHash).toMatch(/^[a-f0-9]{64}$/);
    expect(typeof ours!.latencyMs).toBe("number");
    expect(ours!.ok).toBe(false);
    expect(ours!.errorCode).toBe(-32001);
  });
});
