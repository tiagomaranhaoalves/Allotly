import type { Request, Response } from "express";
import crypto from "crypto";
import { storage } from "../../storage";
import { decryptProviderKey } from "../encryption";
import { redisGet, redisSet, redisDel, REDIS_KEYS } from "../redis";
import { sendEmail, emailTemplates } from "../email";
import { db } from "../../db";
import { allotlyApiKeys } from "@shared/schema";
import { eq, and as drizzleAnd } from "drizzle-orm";
import {
  authenticateKey,
  checkConcurrency,
  checkRateLimit,
  checkBundleRequestPool,
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
} from "./translate";
import { streamProviderResponse, readNonStreamingResponse } from "./streaming";
import type { ModelPricing } from "@shared/schema";
import { z } from "zod";

const chatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.union([z.string(), z.array(z.any())]),
  })),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
}).passthrough();

function sendProxyError(res: Response, error: ProxyError) {
  if (res.headersSent) return;
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
  const pricing = allPricing.find(p => p.modelId === model);
  if (!pricing) return null;

  await redisSet(cacheKey, JSON.stringify(pricing), 3600);
  return pricing;
}

export async function handleChatCompletion(req: Request, res: Response) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  let membershipId: string | null = null;
  let reservedCostCents = 0;
  let concurrencyAcquired = false;

  try {
    const authResult = await authenticateKey(req.headers.authorization);
    if ("status" in authResult) {
      return sendProxyError(res, authResult);
    }

    const { membership, userId } = authResult;
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

    const concError = await checkConcurrency(membershipId, requestId, tier.maxConcurrent);
    if (concError) return sendProxyError(res, concError);
    concurrencyAcquired = true;

    const rlError = await checkRateLimit(membershipId, tier.rpm);
    if (rlError) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, rlError);
    }

    const bundleError = await checkBundleRequestPool(membership);
    if (bundleError) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, bundleError);
    }

    const parseResult = chatRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(400, "invalid_request", `Invalid request: ${parseResult.error.message}`));
    }

    const parsed = parseResult.data;
    const provider = detectProvider(parsed.model);
    if (!provider) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(400, "unsupported_model",
        `Model "${parsed.model}" is not supported`,
        "Supported prefixes: gpt-*, o3*, o4* (OpenAI), claude-* (Anthropic), gemini-* (Google)"
      ));
    }

    const allowedProviders = membership.allowedProviders as string[] | null;
    if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(403, "provider_not_allowed",
        `Provider ${provider} is not allowed for your account`,
        `Allowed providers: ${allowedProviders.join(", ")}`
      ));
    }

    const allowedModels = membership.allowedModels as string[] | null;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(parsed.model)) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(403, "model_not_allowed",
        `Model "${parsed.model}" is not allowed for your account`,
        `Allowed models: ${allowedModels.join(", ")}`
      ));
    }

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const connection = connections.find(c => c.provider === provider && c.status === "ACTIVE");
    if (!connection) {
      await releaseConcurrency(membershipId, requestId);
      const existsButInactive = connections.some(c => c.provider === provider);
      if (existsButInactive) {
        return sendProxyError(res, createProxyError(503, "provider_unavailable",
          "The provider for this model is not currently available. Contact your admin."
        ));
      }
      return sendProxyError(res, createProxyError(502, "provider_not_configured",
        `Provider ${provider} is not configured for this organization`,
        "Contact your admin to add this provider."
      ));
    }

    const pricing = await getModelPricing(provider, parsed.model);
    if (!pricing) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(400, "model_not_found",
        `Pricing for model "${parsed.model}" not found`,
        "This model may not be supported yet."
      ));
    }

    const inputTokens = estimateInputTokens(parsed.messages);
    const inputCostCents = estimateInputCostCents(inputTokens, pricing);

    const remainingBudgetCents = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
    const { effectiveMaxTokens, clamped } = clampMaxTokens(
      remainingBudgetCents, inputCostCents, pricing, parsed.max_tokens
    );

    const estimatedOutputCostCents = calculateOutputCostCents(effectiveMaxTokens, pricing);
    const totalEstimatedCostCents = inputCostCents + estimatedOutputCostCents;
    reservedCostCents = totalEstimatedCostCents;

    const budgetResult = await reserveBudget(membershipId, totalEstimatedCostCents);
    if ("status" in budgetResult) {
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, budgetResult);
    }

    const adminApiKey = decryptProviderKey(
      connection.adminApiKeyEncrypted,
      connection.adminApiKeyIv,
      connection.adminApiKeyTag
    );

    const translated = translateToProvider(parsed, provider, effectiveMaxTokens);
    const authInfo = setProviderAuth(translated.headers, provider, adminApiKey, translated.url);

    if (clamped) {
      res.setHeader("X-Allotly-Max-Tokens-Applied", String(effectiveMaxTokens));
    }
    res.setHeader("X-Allotly-Budget-Remaining", String(budgetResult.remaining));
    res.setHeader("X-Allotly-Budget-Total", String(membership.monthlyBudgetCents));
    const rlKey = REDIS_KEYS.ratelimit(membershipId);
    const currentRequests = await redisGet(rlKey);
    const requestsRemaining = Math.max(0, tier.rpm - (parseInt(currentRequests || "0")));
    res.setHeader("X-Allotly-Requests-Remaining", String(requestsRemaining));
    const periodEnd = new Date(membership.periodEnd);
    res.setHeader("X-Allotly-Expires", periodEnd.toISOString());

    let providerResponse: globalThis.Response;
    try {
      providerResponse = await fetch(authInfo.url, {
        method: translated.method,
        headers: authInfo.headers,
        body: JSON.stringify(translated.body),
      });
    } catch (fetchError: any) {
      await refundBudget(membershipId, reservedCostCents);
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(502, "provider_error",
        `Failed to reach ${provider}: ${fetchError.message}`,
        "The provider may be temporarily unavailable. Try again later."
      ));
    }

    if (!providerResponse.ok) {
      const errorBody = await providerResponse.text();
      await refundBudget(membershipId, reservedCostCents);
      await releaseConcurrency(membershipId, requestId);
      return sendProxyError(res, createProxyError(
        providerResponse.status >= 500 ? 502 : 502,
        "provider_error",
        `${provider} returned ${providerResponse.status}: ${errorBody.slice(0, 200)}`,
        "The upstream provider returned an error. Check your request or try again later."
      ));
    }

    let actualInputTokens = inputTokens;
    let actualOutputTokens = 0;
    let actualCostCents = 0;

    if (parsed.stream) {
      const streamResult = await streamProviderResponse(providerResponse, provider, parsed.model, res);

      if (streamResult.usage) {
        actualInputTokens = streamResult.usage.prompt_tokens || inputTokens;
        actualOutputTokens = streamResult.usage.completion_tokens || 0;
      } else {
        actualOutputTokens = Math.ceil(streamResult.fullContent.length / 4);
      }
    } else {
      const responseBody = await readNonStreamingResponse(providerResponse);
      const openaiResponse = translateResponseToOpenAI(provider, responseBody, parsed.model);

      if (openaiResponse.usage) {
        actualInputTokens = openaiResponse.usage.prompt_tokens;
        actualOutputTokens = openaiResponse.usage.completion_tokens;
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
          provider,
          model: parsed.model,
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          costCents: actualCostCents,
          durationMs,
          statusCode: 200,
          maxTokensApplied: clamped ? effectiveMaxTokens : null,
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
                try { await sendEmail(memberEmail, tmpl.subject, tmpl.html); } catch {}
              }
              if (teamAdminUser?.email && teamAdminUser.email !== memberEmail) {
                const tmpl = emailTemplates.budgetExhausted(memberName, budgetDollars, teamAdminUser.email);
                try { await sendEmail(teamAdminUser.email, tmpl.subject, tmpl.html); } catch {}
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
                try { await sendEmail(memberEmail, tmpl.subject, tmpl.html); } catch {}
              }
              const mTeam90 = await storage.getTeam(freshMembership.teamId);
              const teamAdmin90 = mTeam90 ? await storage.getUser(mTeam90.adminId) : null;
              if (teamAdmin90?.email && teamAdmin90.email !== memberEmail) {
                const tmpl = emailTemplates.budgetWarning90(memberName, Math.round(spendPercent), budgetDollars, "/dashboard");
                try { await sendEmail(teamAdmin90.email, tmpl.subject, tmpl.html); } catch {}
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
                try { await sendEmail(memberEmail, tmpl.subject, tmpl.html); } catch {}
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
      try { await refundBudget(membershipId, reservedCostCents); } catch {}
    }
    if (membershipId && concurrencyAcquired) {
      try { await releaseConcurrency(membershipId, requestId); } catch {}
    }

    if (!res.headersSent) {
      sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"));
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

    res.json({
      object: "list",
      data: models,
    });
  } catch (err: any) {
    console.error("[proxy] list models error:", err);
    sendProxyError(res, createProxyError(500, "internal_error", "An internal error occurred"));
  }
}
