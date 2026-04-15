import type { Request, Response } from "express";
import crypto from "crypto";
import { storage } from "../../storage";
import { decryptProviderKey } from "../encryption";
import { effectiveAzureApiVersion } from "../providers/azure-openai";
import { redisGet, redisSet, redisDel, REDIS_KEYS } from "../redis";
import { sendEmail, emailTemplates } from "../email";
import { db } from "../../db";
import { allotlyApiKeys } from "@shared/schema";
import { eq, and as drizzleAnd } from "drizzle-orm";
import {
  authenticateKey,
  checkConcurrency,
  checkRateLimit,
  releaseRateLimit,
  checkBundleRequestPool,
  getBundleRequestsRemaining,
  incrementBundleRequests,
  estimateInputTokens,
  estimateInputCostCents,
  calculateOutputCostCents,
  clampMaxTokens,
  reserveBudget,
  refundBudget,
  adjustBudgetAfterResponse,
  releaseConcurrency,
  createProxyError,
  type ProxyError,
} from "./safeguards";
import {
  detectProvider,
  translateToProvider,
  setProviderAuth,
  translateResponseToOpenAI,
  sanitizeProviderBody,
  type AzureContext,
  type DetectProviderResult,
} from "./translate";
import { streamProviderResponse, readNonStreamingResponse } from "./streaming";
import { buildUpstreamError, formatUpstreamLogLine } from "./upstream-errors";
import { redact } from "./redactor";
import type { ModelPricing, AzureDeploymentMapping } from "@shared/schema";
import { z } from "zod";

const chatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.union([z.string(), z.array(z.any())]),
  })).min(1, "messages must be a non-empty array"),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().int().min(1, "max_tokens must be at least 1").optional(),
  max_completion_tokens: z.number().int().min(1, "max_completion_tokens must be at least 1").optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
}).passthrough();

function sendProxyError(res: Response, error: ProxyError, budgetContext?: { remaining: number; total: number; expires: string; requestsRemaining: number }) {
  if (res.headersSent) return;
  if (budgetContext) {
    res.setHeader("X-Allotly-Budget-Remaining", String(budgetContext.remaining));
    res.setHeader("X-Allotly-Budget-Total", String(budgetContext.total));
    res.setHeader("X-Allotly-Expires", budgetContext.expires);
    res.setHeader("X-Allotly-Requests-Remaining", String(budgetContext.requestsRemaining));
  }
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      suggestion: error.suggestion,
      type: "allotly_error",
    },
  });
}

export interface RateLimitTier {
  rpm: number;
  maxConcurrent: number;
}

export function getRateLimitTier(plan: string, accessType: string): RateLimitTier {
  switch (plan) {
    case "FREE":
      return { rpm: 20, maxConcurrent: 2 };
    case "TEAM":
      if (accessType === "VOUCHER") {
        return { rpm: 30, maxConcurrent: 2 };
      }
      return { rpm: 60, maxConcurrent: 5 };
    case "ENTERPRISE":
      return { rpm: 120, maxConcurrent: 10 };
    default:
      return { rpm: 20, maxConcurrent: 2 };
  }
}

async function getModelPricing(provider: string, model: string): Promise<ModelPricing | null> {
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

export function formatZodError(zodError: z.ZodError): string {
  const issues = zodError.issues;
  if (issues.length === 0) return "Invalid request";
  const parts = issues.map(issue => {
    const field = issue.path.join(".");
    if (issue.code === "invalid_type" && issue.received === "undefined") {
      return `Missing required field: ${field}`;
    }
    if (issue.code === "invalid_type") {
      return `Invalid type for '${field}': expected ${issue.expected}, got ${issue.received}`;
    }
    if (issue.code === "invalid_enum_value") {
      return `Invalid value for '${field}': must be one of [${(issue as any).options?.join(", ") || ""}]`;
    }
    return `${field}: ${issue.message}`;
  });
  return parts.join("; ");
}

export function getProviderErrorSuggestion(statusCode: number, errorMessage: string, provider: string): string {
  const lower = errorMessage.toLowerCase();
  if (lower.includes("deprecated") || lower.includes("no longer available") || lower.includes("decommissioned")) {
    const alternatives: Record<string, string> = {
      "OPENAI": "gpt-4o-mini or gpt-4o",
      "ANTHROPIC": "claude-sonnet-4 or claude-haiku-3.5",
      "GOOGLE": "gemini-2.5-flash or gemini-2.5-pro",
      "AZURE_OPENAI": "a newer Azure deployment",
    };
    return `This model has been deprecated by the provider. Try ${alternatives[provider] || "a newer model"} instead.`;
  }
  if (statusCode === 429 || lower.includes("rate limit") || lower.includes("quota")) {
    return "The provider is rate-limiting requests. Wait a moment and try again.";
  }
  if (statusCode === 401 || statusCode === 403 || lower.includes("unauthorized") || lower.includes("forbidden")) {
    return "There may be an issue with the provider API key. Contact your admin.";
  }
  if (statusCode === 404 || lower.includes("not found")) {
    return "This model may not exist or is no longer available. Check the /models endpoint for available models.";
  }
  return "The upstream provider returned an error. Check your request or try again later.";
}

export async function handleChatCompletion(req: Request, res: Response) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  let membershipId: string | null = null;
  let reservedCostCents = 0;
  let concurrencyAcquired = false;
  let budgetCtx: { remaining: number; total: number; expires: string; requestsRemaining: number } | undefined;

  try {
    const authResult = await authenticateKey(req.headers.authorization);
    if ("status" in authResult) {
      return sendProxyError(res, authResult);
    }

    const { membership, userId, apiKeyId } = authResult;
    membershipId = membership.id;

    const team = await storage.getTeam(membership.teamId);
    if (!team) {
      return sendProxyError(res, createProxyError(500, "internal_error", "Team not found"));
    }

    const org = await storage.getOrganization(team.orgId);
    if (!org) {
      return sendProxyError(res, createProxyError(500, "internal_error", "Organization not found"));
    }

    const tier = getRateLimitTier(org.plan, membership.accessType);

    const periodEnd = new Date(membership.periodEnd);
    const rlKey = REDIS_KEYS.ratelimit(membershipId);

    const buildBudgetCtx = async (remaining?: number, countCurrentRequest: boolean = false) => {
      const bundleRemaining = await getBundleRequestsRemaining(membership, countCurrentRequest);
      const requestsRemaining = bundleRemaining !== null
        ? bundleRemaining
        : Math.max(0, tier.rpm - parseInt(await redisGet(rlKey) || "0"));
      const budgetKey = REDIS_KEYS.budget(membershipId!);
      const budgetRemaining = remaining ?? parseInt(await redisGet(budgetKey) || String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents));
      return {
        remaining: budgetRemaining,
        total: membership.monthlyBudgetCents,
        expires: periodEnd.toISOString(),
        requestsRemaining,
      };
    };

    const concError = await checkConcurrency(membershipId, requestId, tier.maxConcurrent);
    if (concError) {
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, concError, budgetCtx);
    }
    concurrencyAcquired = true;

    const rlError = await checkRateLimit(membershipId, tier.rpm);
    if (rlError) {
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, rlError, budgetCtx);
    }

    const parseResult = chatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, createProxyError(400, "invalid_request", formatZodError(parseResult.error)), budgetCtx);
    }

    const parsed = parseResult.data;
    const detectResult = await detectProvider(parsed.model, team.orgId);

    const allowedProviders = membership.allowedProviders as string[] | null;

    if (!detectResult) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, createProxyError(400, "unsupported_model",
        `Model "${parsed.model}" is not supported`,
        "Supported prefixes: azure/* (Azure OpenAI), gpt-*, o1*, o3*, o4* (OpenAI), claude-* (Anthropic), gemini-* (Google)."
      ), budgetCtx);
    }
    const provider = detectResult.provider;
    const azureDeployment = detectResult.azureDeployment;
    const effectiveModel = detectResult.strippedModel || parsed.model;

    if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, createProxyError(403, "provider_not_allowed",
        `Provider ${provider} is not allowed for your account`,
        `Allowed providers: ${allowedProviders.join(", ")}`
      ), budgetCtx);
    }

    const allowedModels = membership.allowedModels as string[] | null;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(effectiveModel) && !allowedModels.includes(parsed.model)) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, createProxyError(403, "model_not_allowed",
        `Model "${parsed.model}" is not allowed for your account`,
        `Allowed models: ${allowedModels.join(", ")}`
      ), budgetCtx);
    }

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const connection = connections.find(c => c.provider === provider && c.status === "ACTIVE");
    if (!connection) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      const existsButInactive = connections.some(c => c.provider === provider);
      if (existsButInactive) {
        return sendProxyError(res, createProxyError(503, "provider_unavailable",
          "The provider for this model is not currently available. Contact your admin."
        ), budgetCtx);
      }
      return sendProxyError(res, createProxyError(502, "provider_not_configured",
        `Provider ${provider} is not configured for this organization`,
        "Contact your admin to add this provider."
      ), budgetCtx);
    }

    let pricing: ModelPricing | null;
    if (provider === "AZURE_OPENAI" && azureDeployment) {
      if (azureDeployment.inputPricePerMTok > 0 || azureDeployment.outputPricePerMTok > 0) {
        pricing = {
          id: "azure-deployment",
          provider: "AZURE_OPENAI",
          modelId: azureDeployment.modelId,
          displayName: azureDeployment.deploymentName,
          inputPricePerMTok: azureDeployment.inputPricePerMTok,
          outputPricePerMTok: azureDeployment.outputPricePerMTok,
          isActive: true,
          updatedAt: new Date(),
        };
      } else {
        const lookupModel = effectiveModel;
        const altModel = azureDeployment.modelId !== effectiveModel ? azureDeployment.modelId : null;
        for (const p of ["OPENAI", "AZURE_OPENAI", "ANTHROPIC", "GOOGLE"] as const) {
          pricing = await getModelPricing(p, lookupModel);
          if (pricing) break;
          if (altModel) {
            pricing = await getModelPricing(p, altModel);
            if (pricing) break;
          }
        }
      }
    } else {
      pricing = await getModelPricing(provider, effectiveModel);
    }
    if (!pricing) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      const alternatives: Record<string, Record<string, string>> = {
        OPENAI: {
          "gpt-4-turbo": "gpt-4o or gpt-4o-mini",
          "gpt-3.5-turbo": "gpt-4o-mini",
        },
        ANTHROPIC: {
          "claude-3-5-sonnet-20241022": "claude-sonnet-4",
          "claude-3-5-haiku-20241022": "claude-haiku-4-5",
          "claude-3-opus-20240229": "claude-sonnet-4",
          "claude-3-7-sonnet-20250219": "claude-sonnet-4",
        },
        GOOGLE: {
          "gemini-1.5-flash": "gemini-2.5-flash",
          "gemini-1.5-pro": "gemini-2.5-pro",
        },
      };
      const alt = alternatives[provider]?.[effectiveModel];
      const suggestion = alt
        ? `This model is not available. Try ${alt} instead.`
        : "This model may not be supported yet. Check the /models endpoint for available models.";
      return sendProxyError(res, createProxyError(400, "model_not_found",
        `Pricing for model "${effectiveModel}" not found`,
        suggestion
      ), budgetCtx);
    }

    const inputTokens = estimateInputTokens(parsed.messages);
    const inputCostCents = estimateInputCostCents(inputTokens, pricing);

    const remainingBudgetCents = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
    const clientTokenCap = (parsed as any).max_completion_tokens ?? parsed.max_tokens;
    const { effectiveMaxTokens, clamped } = clampMaxTokens(
      remainingBudgetCents, inputCostCents, pricing, clientTokenCap
    );

    const estimatedOutputCostCents = calculateOutputCostCents(effectiveMaxTokens, pricing);
    const totalEstimatedCostCents = inputCostCents + estimatedOutputCostCents;
    reservedCostCents = totalEstimatedCostCents;

    const budgetResult = await reserveBudget(membershipId, totalEstimatedCostCents);
    if ("status" in budgetResult) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, budgetResult, budgetCtx);
    }

    const bundleError = await checkBundleRequestPool(membership);
    if (bundleError) {
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, bundleError, budgetCtx);
    }

    const adminApiKey = decryptProviderKey(
      connection.adminApiKeyEncrypted,
      connection.adminApiKeyIv,
      connection.adminApiKeyTag
    );

    let azureContext: AzureContext | undefined;
    if (provider === "AZURE_OPENAI" && azureDeployment && connection.azureBaseUrl) {
      let endpointMode = (connection.azureEndpointMode as "v1" | "legacy") || "legacy";
      if (endpointMode === "v1" && connection.azureBaseUrl.includes("azure-api.net")) {
        endpointMode = "legacy";
      }
      azureContext = {
        baseUrl: connection.azureBaseUrl,
        endpointMode,
        apiVersion: effectiveAzureApiVersion(azureDeployment.modelId, connection.azureApiVersion),
        deploymentName: azureDeployment.deploymentName,
        modelId: azureDeployment.modelId,
      };
    }

    const translatedInput = detectResult.strippedModel ? { ...parsed, model: effectiveModel } : parsed;
    const translated = translateToProvider(translatedInput, provider, effectiveMaxTokens, azureContext);
    translated.body = sanitizeProviderBody(translated.body, provider);
    const authInfo = setProviderAuth(translated.headers, provider, adminApiKey, translated.url);

    let providerResponse: globalThis.Response;
    try {
      providerResponse = await fetch(authInfo.url, {
        method: translated.method,
        headers: authInfo.headers,
        body: JSON.stringify(translated.body),
      });
    } catch (fetchError: any) {
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendProxyError(res, createProxyError(502, "provider_error",
        `Failed to reach ${provider}: ${fetchError.message}`,
        "The provider may be temporarily unavailable. Try again later."
      ), budgetCtx);
    }

    if (!providerResponse.ok) {
      const errorBody = await providerResponse.text();
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;

      const status = providerResponse.status;
      if (status === 429) {
        const retryAfter = providerResponse.headers.get("retry-after");
        if (retryAfter) res.setHeader("Retry-After", retryAfter);
      }

      const upstreamErr = buildUpstreamError(provider, status, errorBody, [adminApiKey]);
      const logLine = formatUpstreamLogLine(provider, req.headers.authorization, parsed.model, upstreamErr.upstream);
      console.error(`[proxy] ${logLine}`);

      budgetCtx = await buildBudgetCtx();
      if (res.headersSent) return;

      res.status(upstreamErr.allotlyStatus);
      if (budgetCtx) {
        res.setHeader("X-Allotly-Budget-Remaining", String(budgetCtx.remaining));
        res.setHeader("X-Allotly-Budget-Total", String(budgetCtx.total));
        res.setHeader("X-Allotly-Expires", budgetCtx.expires);
        res.setHeader("X-Allotly-Requests-Remaining", String(budgetCtx.requestsRemaining));
      }

      return res.json({
        error: {
          type: upstreamErr.errorType,
          message: upstreamErr.friendlyMessage,
          provider: provider.toLowerCase(),
          upstream: upstreamErr.upstream,
        },
      });
    }

    if (clamped) {
      res.setHeader("X-Allotly-Max-Tokens-Applied", String(effectiveMaxTokens));
    }
    res.setHeader("X-Allotly-Budget-Remaining", String(budgetResult.remaining));
    res.setHeader("X-Allotly-Budget-Total", String(membership.monthlyBudgetCents));
    const bundleRemaining = await getBundleRequestsRemaining(membership, true);
    const requestsRemaining = bundleRemaining !== null
      ? bundleRemaining
      : Math.max(0, tier.rpm - parseInt(await redisGet(rlKey) || "0"));
    res.setHeader("X-Allotly-Requests-Remaining", String(requestsRemaining));
    res.setHeader("X-Allotly-Expires", periodEnd.toISOString());

    let actualInputTokens = inputTokens;
    let actualOutputTokens = 0;
    let actualCostCents = 0;

    if (parsed.stream) {
      const streamResult = await streamProviderResponse(providerResponse, provider, effectiveModel, res, translated.proxyStopSequences);

      if (streamResult.usage) {
        actualInputTokens = streamResult.usage.prompt_tokens || inputTokens;
        actualOutputTokens = streamResult.usage.completion_tokens || 0;
      } else {
        actualOutputTokens = Math.ceil(streamResult.fullContent.length / 4);
      }

      if (actualOutputTokens === 0 && streamResult.fullContent.trim() === "") {
        await refundBudget(membershipId, reservedCostCents);
        reservedCostCents = 0;
        await releaseRateLimit(membershipId);
        await releaseConcurrency(membershipId, requestId);
        concurrencyAcquired = false;
        if (!res.writableEnded) {
          const errorEvent = JSON.stringify({
            error: {
              code: "empty_response",
              message: "The model returned an empty response. No budget was charged. Try again or use a different model.",
              type: "allotly_error",
            },
          });
          res.write(`data: ${errorEvent}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        }
        return;
      }
    } else {
      const responseBody = await readNonStreamingResponse(providerResponse);

      const openaiResponse = translateResponseToOpenAI(provider, responseBody, effectiveModel, translated.proxyStopSequences);

      if (openaiResponse.usage) {
        actualInputTokens = openaiResponse.usage.prompt_tokens;
        actualOutputTokens = openaiResponse.usage.completion_tokens;
      }

      const content = openaiResponse.choices?.[0]?.message?.content;
      if (actualOutputTokens === 0 && (!content || content.trim() === "")) {
        await refundBudget(membershipId, reservedCostCents);
        reservedCostCents = 0;
        await releaseRateLimit(membershipId);
        await releaseConcurrency(membershipId, requestId);
        concurrencyAcquired = false;
        budgetCtx = await buildBudgetCtx();
        return sendProxyError(res, createProxyError(502, "empty_response",
          "The model returned an empty response. No budget was charged. Try again or use a different model."
        ), budgetCtx);
      }

      res.json(openaiResponse);
    }

    actualCostCents = estimateInputCostCents(actualInputTokens, pricing)
      + calculateOutputCostCents(actualOutputTokens, pricing);

    await adjustBudgetAfterResponse(membershipId, reservedCostCents, actualCostCents);
    await releaseConcurrency(membershipId, requestId);
    concurrencyAcquired = false;

    const durationMs = Date.now() - startTime;

    setImmediate(async () => {
      try {
        await storage.createProxyRequestLog({
          membershipId: membershipId!,
          apiKeyId,
          provider,
          model: provider === "AZURE_OPENAI" && azureDeployment ? azureDeployment.modelId : parsed.model,
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          costCents: actualCostCents,
          durationMs,
          statusCode: 200,
          maxTokensApplied: clamped ? effectiveMaxTokens : null,
          deploymentName: provider === "AZURE_OPENAI" && azureDeployment ? azureDeployment.deploymentName : null,
        });

        const freshMembership = await storage.getMembership(membershipId!);
        if (freshMembership) {
          const newSpend = freshMembership.currentPeriodSpendCents + actualCostCents;
          await storage.updateMembership(membershipId!, {
            currentPeriodSpendCents: newSpend,
          });

          const spendPercent = (newSpend / freshMembership.monthlyBudgetCents) * 100;
          const budgetDollars = (freshMembership.monthlyBudgetCents / 100).toFixed(2);
          const memberUser = await storage.getUser(userId);
          const memberName = memberUser?.name || "User";
          const memberEmail = memberUser?.email;

          if (spendPercent >= 100) {
            const existing = await storage.getBudgetAlert(membershipId!, 100);
            if (!existing) {
              await storage.createBudgetAlert({
                membershipId: membershipId!,
                thresholdPercent: 100,
                triggeredAt: new Date(),
                actionTaken: "BUDGET_EXHAUSTED",
              });
              await storage.updateMembership(membershipId!, { status: "BUDGET_EXHAUSTED" });

              const keys = await storage.getApiKeysByMembership(membershipId!);
              for (const k of keys) {
                if (k.status === "ACTIVE") {
                  await db.update(allotlyApiKeys)
                    .set({ status: "REVOKED", updatedAt: new Date() })
                    .where(eq(allotlyApiKeys.id, k.id));
                  await redisDel(REDIS_KEYS.apiKeyCache(k.keyHash));
                }
              }

              const mTeam = await storage.getTeam(freshMembership.teamId);
              const mOrg = mTeam ? await storage.getOrganization(mTeam.orgId) : null;
              const adminUsers = mOrg ? await storage.getUsersByOrg(mOrg.id) : [];
              const adminUser = adminUsers.find(u => u.orgRole === "ROOT_ADMIN");
              const teamAdminUser = mTeam ? await storage.getUser(mTeam.adminId) : null;

              if (memberEmail) {
                const tmpl = emailTemplates.budgetExhausted(memberName, budgetDollars, adminUser?.email || "your admin");
                try { await sendEmail(memberEmail, tmpl.subject, tmpl.html); } catch (e: any) { console.error("[proxy] budget-exhausted email failed:", e.message); }
              }
              if (teamAdminUser?.email && teamAdminUser.email !== memberEmail) {
                const tmpl = emailTemplates.budgetExhausted(memberName, budgetDollars, teamAdminUser.email);
                try { await sendEmail(teamAdminUser.email, tmpl.subject, tmpl.html); } catch (e: any) { console.error("[proxy] budget-exhausted admin email failed:", e.message); }
              }
            }
          } else if (spendPercent >= 90) {
            const existing = await storage.getBudgetAlert(membershipId!, 90);
            if (!existing) {
              await storage.createBudgetAlert({
                membershipId: membershipId!,
                thresholdPercent: 90,
                triggeredAt: new Date(),
              });
              if (memberEmail) {
                const tmpl = emailTemplates.budgetWarning90(memberName, Math.round(spendPercent), budgetDollars, "/dashboard");
                try { await sendEmail(memberEmail, tmpl.subject, tmpl.html); } catch (e: any) { console.error("[proxy] budget-90 email failed:", e.message); }
              }
              const mTeam90 = await storage.getTeam(freshMembership.teamId);
              const teamAdmin90 = mTeam90 ? await storage.getUser(mTeam90.adminId) : null;
              if (teamAdmin90?.email && teamAdmin90.email !== memberEmail) {
                const tmpl = emailTemplates.budgetWarning90(memberName, Math.round(spendPercent), budgetDollars, "/dashboard");
                try { await sendEmail(teamAdmin90.email, tmpl.subject, tmpl.html); } catch (e: any) { console.error("[proxy] budget-90 admin email failed:", e.message); }
              }
            }
          } else if (spendPercent >= 80) {
            const existing = await storage.getBudgetAlert(membershipId!, 80);
            if (!existing) {
              await storage.createBudgetAlert({
                membershipId: membershipId!,
                thresholdPercent: 80,
                triggeredAt: new Date(),
              });
              if (memberEmail) {
                const tmpl = emailTemplates.budgetWarning80(memberName, Math.round(spendPercent), budgetDollars, "/dashboard");
                try { await sendEmail(memberEmail, tmpl.subject, tmpl.html); } catch (e: any) { console.error("[proxy] budget-80 email failed:", e.message); }
              }
            }
          }
        }

        await incrementBundleRequests(membership);
      } catch (err) {
        console.error("[proxy] async post-processing error:", err);
      }
    });

  } catch (err: any) {
    console.error("[proxy] handler error:", err);

    if (membershipId && reservedCostCents > 0) {
      try { await refundBudget(membershipId, reservedCostCents); } catch (e: any) { console.error("[proxy] budget refund failed:", e.message); }
    }
    if (membershipId) {
      try { await releaseRateLimit(membershipId); } catch (e: any) { console.error("[proxy] rate limit release failed:", e.message); }
    }
    if (membershipId && concurrencyAcquired) {
      try { await releaseConcurrency(membershipId, requestId); } catch (e: any) { console.error("[proxy] concurrency release failed:", e.message); }
    }

    if (!res.headersSent) {
      if (budgetCtx) {
        sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"), budgetCtx);
      } else if (membershipId) {
        try {
          const m = await storage.getMembership(membershipId);
          if (m) {
            const budgetKey = REDIS_KEYS.budget(membershipId);
            const budgetRemaining = parseInt(await redisGet(budgetKey) || String(m.monthlyBudgetCents - m.currentPeriodSpendCents));
            sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"), {
              remaining: budgetRemaining,
              total: m.monthlyBudgetCents,
              expires: new Date(m.periodEnd).toISOString(),
              requestsRemaining: 0,
            });
          } else {
            sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"));
          }
        } catch (e: any) {
          console.error("[proxy] error building budget context for error response:", e.message);
          sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"));
        }
      } else {
        sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"));
      }
    }
  }
}

export async function handleListModels(req: Request, res: Response) {
  try {
    const authResult = await authenticateKey(req.headers.authorization);
    if ("status" in authResult) {
      return sendProxyError(res, authResult);
    }

    const { membership } = authResult;
    const team = await storage.getTeam(membership.teamId);
    if (!team) {
      return sendProxyError(res, createProxyError(500, "internal_error", "Team not found"));
    }

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const activeProviders = connections.filter(c => c.status === "ACTIVE").map(c => c.provider);

    const allowedProviders = membership.allowedProviders as string[] | null;
    const filteredProviders = allowedProviders && allowedProviders.length > 0
      ? activeProviders.filter(p => allowedProviders.includes(p))
      : activeProviders;

    const allPricing = await storage.getModelPricing();
    const allowedModels = membership.allowedModels as string[] | null;

    const models = allPricing
      .filter(p => filteredProviders.includes(p.provider))
      .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
      .map(p => ({
        id: p.modelId,
        object: "model",
        created: Math.floor(new Date(p.updatedAt).getTime() / 1000),
        owned_by: p.provider.toLowerCase(),
        display_name: p.displayName,
        input_price_per_m_tok: p.inputPricePerMTok,
        output_price_per_m_tok: p.outputPricePerMTok,
      }));

    if (filteredProviders.includes("AZURE_OPENAI")) {
      const azureConnections = connections.filter(c => c.provider === "AZURE_OPENAI" && c.status === "ACTIVE");
      for (const azureConn of azureConnections) {
        const deployments = (azureConn.azureDeployments as AzureDeploymentMapping[] | null) || [];
        for (const dep of deployments) {
          if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(dep.deploymentName)) continue;
          models.push({
            id: dep.deploymentName,
            object: "model",
            created: Math.floor(new Date(azureConn.updatedAt).getTime() / 1000),
            owned_by: "azure-openai",
            display_name: `${dep.deploymentName} (${dep.modelId})`,
            input_price_per_m_tok: dep.inputPricePerMTok,
            output_price_per_m_tok: dep.outputPricePerMTok,
          });
        }
      }
    }

    res.json({
      object: "list",
      data: models,
    });
  } catch (err: any) {
    console.error("[proxy] list models error:", err);
    sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"));
  }
}
