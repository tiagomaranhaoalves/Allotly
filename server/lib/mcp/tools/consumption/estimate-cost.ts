import { storage } from "../../../../storage";
import { EstimateCostInputSchema, type ChatMessage } from "../../schemas";
import { McpToolError } from "../../errors";
import { registerTool } from "../registry";
import { estimateInputTokens } from "../../../proxy/safeguards";
import {
  convertFromUsdCents,
  formatMoney,
  getActiveRates,
  getOrgCurrency,
  type SupportedCurrency,
  CURRENCY_LOCALES,
} from "../../../currency";
import type { ModelPricing } from "@shared/schema";

const VISION_CAPABLE = /gpt-4o|claude-(sonnet|haiku|opus)|gemini/i;

/**
 * V1.5.1 default cap when the caller omits `max_tokens`. Mirrors the
 * `budgetEstimateTokens = effectiveMaxTokens ?? 4096` fallback in
 * `processChatCompletion` so a preview matches what the proxy would
 * actually reserve in the worst case.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

const MAX_ALTERNATIVES = 3;

export const ESTIMATE_COST_DESCRIPTION = "Estimate the maximum cost of a chat request before invoking it. Takes the same inputs as `chat` (model, messages, max_tokens) and returns the estimated input tokens, max output tokens, and worst-case cost in the user's currency, plus 2-3 cheaper alternative models if available. Does not invoke the model — purely a preview. Use this when the user asks 'how much will this cost?' or before running expensive long-output requests.";

const DISCLAIMER = "Estimate based on max_tokens; actual cost depends on output length. Token counts are approximate.";

function hasImageContent(messages: ChatMessage[]): boolean {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && typeof part === "object" && (part as any).type === "image_url") return true;
      }
    }
  }
  return false;
}

function maxCostCents(inputTokens: number, maxOutputTokens: number, pricing: ModelPricing): number {
  const inputCost = Math.ceil((inputTokens * pricing.inputPricePerMTok) / 1_000_000);
  const outputCost = Math.ceil((maxOutputTokens * pricing.outputPricePerMTok) / 1_000_000);
  return inputCost + outputCost;
}

/**
 * True fractional-cent cost for ranking/comparison ONLY. Unlike
 * `maxCostCents` it does NOT round per component, so two models with very
 * different real prices don't collapse to the same value at low max_tokens
 * (where each component would otherwise hit the 1-cent ceil floor). This is
 * used to select and order alternatives and to compute savings_pct; it is
 * never displayed. Displayed costs stay on the conservative `maxCostCents`
 * ceil so a preview never undercuts what `processChatCompletion` reserves.
 */
function preciseCostCents(inputTokens: number, maxOutputTokens: number, pricing: ModelPricing): number {
  return (inputTokens * pricing.inputPricePerMTok + maxOutputTokens * pricing.outputPricePerMTok) / 1_000_000;
}

function buildAmountDisplay(
  usdCents: number,
  currency: SupportedCurrency,
  rate: number,
): { currency: SupportedCurrency; amount: number; formatted: string } {
  const locale = CURRENCY_LOCALES[currency];
  const amount = convertFromUsdCents(usdCents, currency, rate);
  return {
    currency,
    amount,
    formatted: formatMoney(amount, currency, locale),
  };
}

registerTool({
  name: "estimate_cost",
  description: ESTIMATE_COST_DESCRIPTION,
  inputSchema: EstimateCostInputSchema,
  requiresAuth: true,
  requiredScope: "mcp:read",
  voucherOnly: false,
  annotations: {
    title: "Estimate cost of a chat request",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const membership = principal.membership;

    const allowedModels = membership.allowedModels as string[] | null;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(input.model)) {
      // Per the brief: surface only the user-facing model name and the
      // allowlist; never echo provider names or other internal config.
      throw new McpToolError("ModelNotAllowed", `Model "${input.model}" is not in your allowlist`, {
        allowed_models: allowedModels,
      });
    }

    const messages = input.messages as ChatMessage[];
    const needsVision = hasImageContent(messages);

    // Token counting reuses the proxy's existing helper so the preview
    // matches what `processChatCompletion` would compute on the same input.
    // System prompt counts toward input; mirror chat's collapseSystem
    // semantics by treating it as an extra system message.
    const inputCountingMessages: ChatMessage[] = input.system
      ? [{ role: "system", content: input.system }, ...messages]
      : messages;
    const inputTokens = estimateInputTokens(inputCountingMessages);
    const maxOutputTokens = input.max_tokens ?? DEFAULT_MAX_OUTPUT_TOKENS;

    const team = await storage.getTeam(membership.teamId);
    if (!team) {
      throw new McpToolError("Forbidden", "Team is not available for this membership");
    }
    const org = await storage.getOrganization(team.orgId);

    const allPricing = await storage.getModelPricing();
    const requestedPricing = allPricing.find(p => p.modelId === input.model);
    if (!requestedPricing) {
      // Pricing missing is an internal data gap rather than a user-facing
      // allowlist problem; surface it as InvalidInput so the LLM can
      // suggest a different model rather than treating it as a hard reject.
      throw new McpToolError("InvalidInput", `Pricing for model "${input.model}" is not available`, {
        hint: "Run list_available_models to see models you can preview.",
      });
    }

    if (needsVision && !VISION_CAPABLE.test(input.model)) {
      throw new McpToolError("InvalidInput", `Model "${input.model}" does not support image input`, {
        hint: "Try a vision-capable model such as claude-sonnet-4-6 or gpt-4o.",
      });
    }

    // Conservative whole-cent ceil — this is what we DISPLAY for the
    // requested model and what the proxy actually reserves against budget.
    const requestedCost = maxCostCents(inputTokens, maxOutputTokens, requestedPricing);
    // True fractional cost — used ONLY to rank/filter alternatives and to
    // compute savings_pct, so genuinely-cheaper models aren't dropped on a
    // rounded-cent tie at low max_tokens.
    const requestedPrecise = preciseCostCents(inputTokens, maxOutputTokens, requestedPricing);

    // Alternatives must be ACTUALLY callable for the user — filter to
    // active provider connections + their allowedProviders + allowedModels,
    // matching what list_available_models already exposes.
    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const activeProviders = connections.filter(c => c.status === "ACTIVE").map(c => c.provider);
    const allowedProviders = membership.allowedProviders as string[] | null;
    const filteredProviders = allowedProviders && allowedProviders.length > 0
      ? activeProviders.filter(p => allowedProviders.includes(p))
      : activeProviders;

    const alternatives = allPricing
      .filter(p => p.modelId !== input.model)
      .filter(p => filteredProviders.includes(p.provider))
      .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
      .filter(p => !needsVision || VISION_CAPABLE.test(p.modelId))
      .map(p => ({
        modelId: p.modelId,
        // Conservative ceil for display, precise value for ranking/savings.
        cost: maxCostCents(inputTokens, maxOutputTokens, p),
        precise: preciseCostCents(inputTokens, maxOutputTokens, p),
      }))
      .filter(x => x.precise < requestedPrecise)
      .sort((a, b) => a.precise - b.precise)
      .slice(0, MAX_ALTERNATIVES);

    const orgCurrency = getOrgCurrency(org);
    const rates = await getActiveRates();
    const rate = orgCurrency === "USD" ? 1 : (rates.rates[orgCurrency] ?? 1);

    return {
      model: input.model,
      estimated: {
        input_tokens: inputTokens,
        max_output_tokens: maxOutputTokens,
        max_cost_usd_cents: requestedCost,
        max_cost_display: buildAmountDisplay(requestedCost, orgCurrency, rate),
      },
      alternatives: alternatives.map(a => ({
        model: a.modelId,
        max_cost_usd_cents: a.cost,
        max_cost_display: buildAmountDisplay(a.cost, orgCurrency, rate),
        savings_pct: requestedPrecise > 0
          ? Math.round(((requestedPrecise - a.precise) / requestedPrecise) * 100)
          : 0,
      })),
      disclaimer: DISCLAIMER,
    };
  },
});

