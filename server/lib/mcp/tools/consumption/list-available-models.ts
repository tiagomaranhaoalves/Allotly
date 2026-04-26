import { z } from "zod";
import { storage } from "../../../../storage";
import { withBudgetMeta } from "../../meta-budget";
import { EmptyInputSchema } from "../../schemas";
import { registerTool } from "../registry";
import type { AzureDeploymentMapping } from "@shared/schema";

const TIER_BY_MODEL: Record<string, "fast" | "balanced" | "premium"> = {
  "gpt-4o-mini": "fast",
  "gpt-4o": "balanced",
  "o1": "premium",
  "o1-pro": "premium",
  "o3": "premium",
  "o3-mini": "balanced",
  "o4-mini": "balanced",
  "claude-haiku-4-5": "fast",
  "claude-haiku-3.5": "fast",
  "claude-sonnet-4": "balanced",
  "claude-sonnet-4-6": "balanced",
  "claude-opus-4-7": "premium",
  "gemini-2.5-flash": "fast",
  "gemini-2.5-pro": "premium",
};

function tierOf(modelId: string): "fast" | "balanced" | "premium" {
  if (TIER_BY_MODEL[modelId]) return TIER_BY_MODEL[modelId];
  if (/haiku|flash|mini/i.test(modelId)) return "fast";
  if (/opus|pro|premium/i.test(modelId)) return "premium";
  return "balanced";
}

function providerLabel(p: string): "openai" | "anthropic" | "google" | "azure-openai" | "azure-anthropic" {
  switch (p) {
    case "OPENAI": return "openai";
    case "ANTHROPIC": return "anthropic";
    case "GOOGLE": return "google";
    case "AZURE_OPENAI": return "azure-openai";
    default: return "openai";
  }
}

registerTool({
  name: "list_available_models",
  description: "List the AI models your Allotly key is allowed to use, with pricing and capabilities.",
  inputSchema: EmptyInputSchema,
  requiresAuth: true,
  requiredScope: "mcp:read",
  handler: async (_input, ctx) => {
    const principal = ctx.principal!;
    const team = await storage.getTeam(principal.membership.teamId);
    if (!team) return withBudgetMeta(principal.membership, { models: [] });

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const activeProviders = connections.filter(c => c.status === "ACTIVE").map(c => c.provider);
    const allowedProviders = principal.membership.allowedProviders as string[] | null;
    const filteredProviders = allowedProviders && allowedProviders.length > 0
      ? activeProviders.filter(p => allowedProviders.includes(p))
      : activeProviders;

    const allowedModels = principal.membership.allowedModels as string[] | null;
    const allPricing = await storage.getModelPricing();

    const models = allPricing
      .filter(p => filteredProviders.includes(p.provider))
      .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
      .map(p => ({
        id: p.modelId,
        provider: providerLabel(p.provider),
        context_window: 128000,
        supports_vision: /gpt-4o|claude-(sonnet|haiku|opus)|gemini/i.test(p.modelId),
        supports_tools: true,
        supports_streaming: true,
        input_price_per_mtok_cents: p.inputPricePerMTok,
        output_price_per_mtok_cents: p.outputPricePerMTok,
        tier: tierOf(p.modelId),
      }));

    if (filteredProviders.includes("AZURE_OPENAI")) {
      const azureConns = connections.filter(c => c.provider === "AZURE_OPENAI" && c.status === "ACTIVE");
      for (const conn of azureConns) {
        const deployments = (conn.azureDeployments as AzureDeploymentMapping[] | null) || [];
        for (const dep of deployments) {
          if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(dep.deploymentName)) continue;
          models.push({
            id: dep.deploymentName,
            provider: "azure-openai",
            context_window: 128000,
            supports_vision: /gpt-4o/i.test(dep.modelId),
            supports_tools: true,
            supports_streaming: true,
            input_price_per_mtok_cents: dep.inputPricePerMTok,
            output_price_per_mtok_cents: dep.outputPricePerMTok,
            tier: tierOf(dep.modelId),
          });
        }
      }
    }

    return withBudgetMeta(principal.membership, { models });
  },
});
