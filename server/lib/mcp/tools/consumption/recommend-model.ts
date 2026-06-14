import { storage } from "../../../../storage";
import { RecommendModelInputSchema } from "../../schemas";
import { withBudgetMeta, buildBudgetSnapshot } from "../../meta-budget";
import { registerTool } from "../registry";
import {
  estimateInputTokens,
  estimateInputReservationCents,
  calculateOutputCostCents,
} from "../../../proxy/safeguards";
import { preciseCostCents } from "../../../proxy/cost-utils";
import {
  blendedPricePerMTok,
  classifyCapability,
  deterministicLatencyTier,
  supportsVision,
  supportsTools,
  type Capability,
  type CapabilityLabel,
} from "../../model-capabilities";
import {
  getActiveRates,
  getOrgCurrency,
  buildPreciseAmountDisplay,
  type SupportedCurrency,
} from "../../../currency";
import { redisGet, redisSet, REDIS_KEYS } from "../../../redis";
import type { ModelPricing } from "@shared/schema";

/**
 * Realistic output-token caps per requested length. These SCALE cost only;
 * per the plan constraint they never select the model class. Each is clamped
 * to the model's real `maxOutputTokens` when that value is known.
 */
const OUTPUT_TOKENS = { short: 1_000, medium: 4_000, long: 16_000 } as const;

const LATENCY_CACHE_TTL_SECONDS = 60;
const MAX_ALTERNATIVES = 2;

type Prefer = "cheapest" | "fastest" | "smartest";

export const RECOMMEND_MODEL_DESCRIPTION = "Suggest the best model for a task given your remaining budget. Ranks candidates on true (sub-cent) cost using the same cost helper as estimate_cost, scales cost with the expected output length, classifies capability from pricing data, and (for prefer=fastest) uses observed per-model latency when available. Returns one recommended model with a reason plus 1-2 alternatives.";

interface LatencyStat {
  avgMsPerOutputToken: number;
  samples: number;
}

/**
 * Best-effort, briefly-cached per-model latency for the current membership.
 * Cache + DB failures degrade gracefully to "no history" (deterministic tier),
 * so the tool never errors on the latency path. Read-only.
 */
async function loadLatencyMap(membershipId: string): Promise<Map<string, LatencyStat>> {
  const key = REDIS_KEYS.mcpLatency(membershipId);
  try {
    const cached = await redisGet(key);
    if (cached) {
      const arr = JSON.parse(cached) as { model: string; avgMsPerOutputToken: number; samples: number }[];
      return new Map(arr.map(r => [r.model, { avgMsPerOutputToken: r.avgMsPerOutputToken, samples: r.samples }]));
    }
  } catch {
    /* fall through to DB */
  }
  let rows: { model: string; avgMsPerOutputToken: number; samples: number }[] = [];
  try {
    rows = await storage.getRecentModelLatency(membershipId);
  } catch {
    rows = [];
  }
  try {
    await redisSet(key, JSON.stringify(rows), LATENCY_CACHE_TTL_SECONDS);
  } catch {
    /* best effort */
  }
  return new Map(rows.map(r => [r.model, { avgMsPerOutputToken: r.avgMsPerOutputToken, samples: r.samples }]));
}

function clampOutputTokens(base: number, cap: number | null | undefined): number {
  return cap && cap > 0 ? Math.min(base, cap) : base;
}

/** Bucket an observed ms-per-output-token into the same 0..3 tier scale as the fallback. */
function observedLatencyTier(msPerOutputToken: number): number {
  if (msPerOutputToken < 8) return 0;
  if (msPerOutputToken < 20) return 1;
  if (msPerOutputToken < 40) return 2;
  return 3;
}

function latencyTierLabel(tier: number): "fast" | "medium" | "slow" {
  return tier <= 0 ? "fast" : tier <= 2 ? "medium" : "slow";
}

interface Candidate {
  pricing: ModelPricing;
  modelId: string;
  outTokens: number;
  precise: number;
  reserveCost: number;
  cap: Capability;
  latencyTier: number;
  latencyRatio: number | null;
  latencyObserved: boolean;
}

function sortCandidates(arr: Candidate[], prefer: Prefer): Candidate[] {
  const byCostAsc = (a: Candidate, b: Candidate) => a.precise - b.precise;
  const byCapDesc = (a: Candidate, b: Candidate) => b.cap.score - a.cap.score;
  const byLatencyAsc = (a: Candidate, b: Candidate) =>
    a.latencyTier - b.latencyTier ||
    (a.latencyRatio ?? Infinity) - (b.latencyRatio ?? Infinity);
  const copy = [...arr];
  if (prefer === "cheapest") return copy.sort((a, b) => byCostAsc(a, b) || byCapDesc(a, b));
  if (prefer === "fastest") return copy.sort((a, b) => byLatencyAsc(a, b) || byCostAsc(a, b));
  // smartest (default): capability first, cheapest tie-break.
  return copy.sort((a, b) => byCapDesc(a, b) || byCostAsc(a, b));
}

function capabilityPhrase(label: CapabilityLabel): string {
  switch (label) {
    case "frontier":
      return "top-tier reasoning";
    case "advanced":
      return "strong all-rounder";
    case "balanced":
      return "solid mid-tier";
    case "fast":
      return "fast and economical";
  }
}

function reasonFor(c: Candidate, prefer: Prefer, currency: SupportedCurrency, rate: number): string {
  const cost = buildPreciseAmountDisplay(c.precise, currency, rate).formatted;
  const capWord = capabilityPhrase(c.cap.label);
  const latWord = latencyTierLabel(c.latencyTier);
  const latPhrase = c.latencyObserved ? `${latWord} observed latency` : `typically ${latWord}`;
  let lead: string;
  switch (prefer) {
    case "cheapest":
      lead = `Cheapest fit at ~${cost} for this task`;
      break;
    case "fastest":
      lead = `Fastest fit (${latPhrase})`;
      break;
    default:
      lead = `Most capable fit (${capWord})`;
      break;
  }
  return `${lead}; ${capWord}, ${latPhrase}, ~${cost} estimated.`;
}

registerTool({
  name: "recommend_model",
  description: RECOMMEND_MODEL_DESCRIPTION,
  inputSchema: RecommendModelInputSchema,
  requiresAuth: true,
  requiredScope: "mcp",
  annotations: {
    title: "Recommend the best model for a task",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const membership = principal.membership;
    const team = await storage.getTeam(membership.teamId);
    if (!team) return withBudgetMeta(membership, { recommended: null, alternatives: [] });

    const snap = await buildBudgetSnapshot(membership);

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const activeProviders = connections.filter(c => c.status === "ACTIVE").map(c => c.provider);
    const allowedProviders = membership.allowedProviders as string[] | null;
    const allowedModels = membership.allowedModels as string[] | null;
    const filteredProviders = allowedProviders && allowedProviders.length > 0
      ? activeProviders.filter(p => allowedProviders.includes(p))
      : activeProviders;

    const pricing = await storage.getModelPricing();
    const org = await storage.getOrganization(team.orgId);
    const orgCurrency = getOrgCurrency(org);
    const rates = await getActiveRates();
    const rate = orgCurrency === "USD" ? 1 : (rates.rates[orgCurrency] ?? 1);

    // Estimate input tokens from the task description via the SAME proxy helper
    // estimate_cost uses, so the two tools agree on cost for equivalent inputs.
    const inputTokens = estimateInputTokens([{ role: "user", content: input.task_description }]);
    const baseOutTokens = OUTPUT_TOKENS[input.expected_output_length as keyof typeof OUTPUT_TOKENS] ?? OUTPUT_TOKENS.medium;

    const eligible = pricing
      .filter(p => filteredProviders.includes(p.provider))
      .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
      .filter(p => !input.needs_vision || supportsVision(p.modelId))
      .filter(p => !input.needs_tools || supportsTools(p.modelId));

    if (eligible.length === 0) {
      return withBudgetMeta(membership, {
        recommended: null,
        alternatives: [],
        message: "No available model matches the requested capabilities. Check your allowlist or enabled providers.",
      });
    }

    // Price context drives the price-derived capability fallback for models not
    // in the capability map (so new models still classify sensibly).
    const blendedValues = eligible.map(p => blendedPricePerMTok(p));
    const priceCtx = { minBlended: Math.min(...blendedValues), maxBlended: Math.max(...blendedValues) };

    const latency = await loadLatencyMap(membership.id);

    const candidates: Candidate[] = eligible
      .map(p => {
        const outTokens = clampOutputTokens(baseOutTokens, p.maxOutputTokens);
        const precise = preciseCostCents(inputTokens, outTokens, p);
        // Affordability uses the EXACT proxy pre-flight reservation: input held
        // at the 1.25x cache-write rate (estimateInputReservationCents) plus
        // base-rate output (calculateOutputCostCents) — the same functions
        // processChatCompletion reserves with. This guarantees we never
        // recommend a model the proxy would then reject for budget. (Display
        // costs stay on the base rate via preciseCostCents.)
        const reserveCost =
          estimateInputReservationCents(inputTokens, p) + calculateOutputCostCents(outTokens, p);
        const cap = classifyCapability(p.modelId, blendedPricePerMTok(p), priceCtx);
        const lat = latency.get(p.modelId) ?? null;
        const latencyTier = lat ? observedLatencyTier(lat.avgMsPerOutputToken) : deterministicLatencyTier(cap.label);
        return {
          pricing: p,
          modelId: p.modelId,
          outTokens,
          precise,
          reserveCost,
          cap,
          latencyTier,
          latencyRatio: lat ? lat.avgMsPerOutputToken : null,
          latencyObserved: !!lat,
        };
      })
      // Gate on the proxy's actual pre-flight reservation vs remaining budget so
      // the tool never recommends a model the proxy would then reject.
      .filter(c => c.reserveCost <= snap.remaining_cents);

    if (candidates.length === 0) {
      return withBudgetMeta(membership, {
        recommended: null,
        alternatives: [],
        message: "No model fits your remaining budget. Run request_topup or pick a smaller task.",
      });
    }

    const sorted = sortCandidates(candidates, input.prefer as Prefer);
    const top = sorted[0];
    const alts = sorted.slice(1, 1 + MAX_ALTERNATIVES);

    const toOutput = (c: Candidate) => ({
      model: c.modelId,
      reason: reasonFor(c, input.prefer as Prefer, orgCurrency, rate),
      estimated_cost_cents: c.reserveCost, // exact proxy pre-flight reservation (affordability basis)
      precise_cost_usd_cents: c.precise, // true fractional base-rate cents (ranking/display basis)
      cost_display: buildPreciseAmountDisplay(c.precise, orgCurrency, rate),
      capability: c.cap.label,
      capability_score: c.cap.score,
      latency_tier: latencyTierLabel(c.latencyTier),
      latency_source: c.latencyObserved ? "observed" : "estimated",
      output_tokens_assumed: c.outTokens,
    });

    return withBudgetMeta(membership, {
      recommended: toOutput(top),
      alternatives: alts.map(toOutput),
      assumptions: {
        input_tokens: inputTokens,
        expected_output_length: input.expected_output_length,
        prefer: input.prefer,
      },
    });
  },
});
