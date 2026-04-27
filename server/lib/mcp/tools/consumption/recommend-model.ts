import { storage } from "../../../../storage";
import { RecommendModelInputSchema } from "../../schemas";
import { withBudgetMeta, buildBudgetSnapshot } from "../../meta-budget";
import { registerTool } from "../registry";

const FAST_TIER = /haiku|flash|mini/i;
const PREMIUM_TIER = /opus|o1|o3|gpt-4o(?!-mini)|pro/i;

const OUTPUT_TOKENS = { short: 200, medium: 1000, long: 4000 } as const;
const INPUT_TOKENS_ESTIMATE = 500;

const VISION_CAPABLE = /gpt-4o|claude-(sonnet|haiku|opus)|gemini/i;
const TOOL_CAPABLE = /gpt|o1|o3|o4|claude|gemini/i;

export const RECOMMEND_MODEL_DESCRIPTION = "Suggest the best model for a task given your remaining budget. Returns one recommended model with a short reason and 1-2 alternatives. Heuristic in V1; LLM-based recommendation lands in V1.5.";

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
    const team = await storage.getTeam(principal.membership.teamId);
    const snap = await buildBudgetSnapshot(principal.membership);

    if (!team) return withBudgetMeta(principal.membership, { recommended: null, alternatives: [] });

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const activeProviders = connections.filter(c => c.status === "ACTIVE").map(c => c.provider);
    const allowedProviders = principal.membership.allowedProviders as string[] | null;
    const allowedModels = principal.membership.allowedModels as string[] | null;
    const filteredProviders = allowedProviders && allowedProviders.length > 0
      ? activeProviders.filter(p => allowedProviders.includes(p))
      : activeProviders;

    const pricing = await storage.getModelPricing();
    const outTokens = OUTPUT_TOKENS[input.expected_output_length as keyof typeof OUTPUT_TOKENS];

    const candidates = pricing
      .filter(p => filteredProviders.includes(p.provider))
      .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
      .filter(p => !input.needs_vision || VISION_CAPABLE.test(p.modelId))
      .filter(p => !input.needs_tools || TOOL_CAPABLE.test(p.modelId))
      .map(p => {
        const estCost = Math.ceil((INPUT_TOKENS_ESTIMATE * p.inputPricePerMTok + outTokens * p.outputPricePerMTok) / 1_000_000);
        return { modelId: p.modelId, estCost, p };
      })
      .filter(x => x.estCost <= snap.remaining_cents);

    const sorted = sortBy(candidates, input.prefer);

    if (sorted.length === 0) {
      return withBudgetMeta(principal.membership, {
        recommended: null,
        alternatives: [],
        message: "No model fits your remaining budget. Run request_topup or pick a smaller task.",
      });
    }

    const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
    const reasonFor = (modelId: string, estCost: number, prefer: string): string => {
      const tier = PREMIUM_TIER.test(modelId) ? "Top-tier reasoning" : FAST_TIER.test(modelId) ? "Fast and cheap" : "Strong all-rounder";
      return `${tier}, fits remaining budget (~${fmt(estCost)} for this task)`;
    };

    const top = sorted[0];
    const alts = sorted.slice(1, 3).map(c => ({
      model: c.modelId,
      reason: reasonFor(c.modelId, c.estCost, input.prefer as string),
      estimated_cost_cents: c.estCost,
    }));

    return withBudgetMeta(principal.membership, {
      recommended: {
        model: top.modelId,
        reason: reasonFor(top.modelId, top.estCost, input.prefer as string),
        estimated_cost_cents: top.estCost,
      },
      alternatives: alts,
    });
  },
});

function sortBy(arr: { modelId: string; estCost: number; p: any }[], prefer: string): typeof arr {
  if (prefer === "cheapest") return [...arr].sort((a, b) => a.estCost - b.estCost);
  if (prefer === "fastest") return [...arr].sort((a, b) => {
    const af = FAST_TIER.test(a.modelId) ? 0 : 1;
    const bf = FAST_TIER.test(b.modelId) ? 0 : 1;
    return af - bf || a.estCost - b.estCost;
  });
  return [...arr].sort((a, b) => {
    const ap = PREMIUM_TIER.test(a.modelId) ? 0 : FAST_TIER.test(a.modelId) ? 2 : 1;
    const bp = PREMIUM_TIER.test(b.modelId) ? 0 : FAST_TIER.test(b.modelId) ? 2 : 1;
    return ap - bp || a.estCost - b.estCost;
  });
}
