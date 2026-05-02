/**
 * Shared cost / pricing helpers extracted so the M4 streaming handler
 * (`processChatCompletionStreaming`) can resolve model pricing without
 * touching the existing buffered `processChatCompletion` in handler.ts.
 *
 * The lookup logic mirrors handler.ts's private `getModelPricing` byte-for-
 * byte. The Azure-fallback resolver mirrors handler.ts's inline Azure block
 * so streaming Azure deployments fall through to the same family-pricing
 * table when a deployment doesn't carry its own price.
 */
import { storage } from "../../storage";
import { redisGet, redisSet, REDIS_KEYS } from "../redis";
import type { ModelPricing, AzureDeploymentMapping } from "@shared/schema";

export async function lookupModelPricing(provider: string, model: string): Promise<ModelPricing | null> {
  const cacheKey = REDIS_KEYS.modelPrice(provider, model);
  const cached = await redisGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const allPricing = await storage.getModelPricingByProvider(provider);
  let pricing = allPricing.find(p => p.modelId === model);
  if (!pricing) {
    pricing = allPricing.find(p => model.startsWith(p.modelId) || p.modelId.startsWith(model));
  }
  if (!pricing) return null;

  await redisSet(cacheKey, JSON.stringify(pricing), 3600);
  return pricing;
}

/**
 * Resolve pricing for an Azure deployment.
 *
 * If the deployment carries non-zero per-MTok prices, those win (admin set
 * an override). Otherwise we walk the provider table for the effective
 * model name, then for the deployment's underlying modelId — same order as
 * handler.ts. Returns null when nothing matches; caller surfaces an
 * `model_not_found` error in that case (no charge, no upstream call).
 */
export async function resolveAzurePricing(
  azureDeployment: AzureDeploymentMapping,
  effectiveModel: string,
): Promise<ModelPricing | null> {
  if (azureDeployment.inputPricePerMTok > 0 || azureDeployment.outputPricePerMTok > 0) {
    return {
      id: "azure-deployment",
      provider: "AZURE_OPENAI",
      modelId: azureDeployment.modelId,
      displayName: azureDeployment.deploymentName,
      inputPricePerMTok: azureDeployment.inputPricePerMTok,
      outputPricePerMTok: azureDeployment.outputPricePerMTok,
      isActive: true,
      updatedAt: new Date(),
    };
  }
  const altModel = azureDeployment.modelId !== effectiveModel ? azureDeployment.modelId : null;
  for (const p of ["OPENAI", "AZURE_OPENAI", "ANTHROPIC", "GOOGLE"] as const) {
    let pricing = await lookupModelPricing(p, effectiveModel);
    if (pricing) return pricing;
    if (altModel) {
      pricing = await lookupModelPricing(p, altModel);
      if (pricing) return pricing;
    }
  }
  return null;
}
