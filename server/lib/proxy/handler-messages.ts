import type { Request, Response } from "express";
import crypto from "crypto";
import { storage } from "../../storage";
import { decryptProviderKey } from "../encryption";
import { effectiveAzureApiVersion } from "../providers/azure-openai";
import { redisGet, redisSet, REDIS_KEYS } from "../redis";
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
  translateAnthropicToProvider,
  translateResponseToAnthropic,
  setProviderAuth,
  sanitizeProviderBody,
  getAnthropicDroppedFields,
  buildAnthropicErrorEvent,
  type AzureContext,
  type ProviderType,
} from "./translate";
import { streamProviderResponseAsAnthropic, readNonStreamingResponse, writeAnthropicEvent } from "./streaming";
import { buildUpstreamError, formatUpstreamLogLine } from "./upstream-errors";
import {
  anthropicMessagesRequestSchema,
  type AnthropicMessagesRequest,
} from "./messages-schema";
import { formatZodError, getRateLimitTier } from "./handler";
import type { ModelPricing, AzureDeploymentMapping } from "@shared/schema";

// =============================================================================
// Anthropic error envelope mapping
//
// Each Allotly safeguard/upstream code maps to an Anthropic-canonical
// (type, status) pair so SDK retry/backoff logic behaves as users expect.
// We prefer the Anthropic-canonical status over the safeguard's internal
// status to avoid mismatches like `not_found_error` returning HTTP 400.
// =============================================================================

const ALLOTLY_TO_ANTHROPIC: Record<string, { type: string; status: number }> = {
  // Authentication / identity
  missing_auth: { type: "authentication_error", status: 401 },
  invalid_auth: { type: "authentication_error", status: 401 },
  invalid_key: { type: "authentication_error", status: 401 },
  invalid_key_format: { type: "authentication_error", status: 401 },
  key_revoked: { type: "authentication_error", status: 401 },
  membership_not_found: { type: "authentication_error", status: 401 },

  // Permission / account state
  account_suspended: { type: "permission_error", status: 403 },
  account_expired: { type: "permission_error", status: 403 },
  period_expired: { type: "permission_error", status: 403 },
  voucher_expired: { type: "permission_error", status: 403 },
  model_not_allowed: { type: "permission_error", status: 403 },
  provider_not_allowed: { type: "permission_error", status: 403 },

  // Validation
  invalid_request: { type: "invalid_request_error", status: 400 },
  invalid_json: { type: "invalid_request_error", status: 400 },
  unsupported_model: { type: "invalid_request_error", status: 400 },

  // Resource lookup
  model_not_found: { type: "not_found_error", status: 404 },
  provider_not_configured: { type: "not_found_error", status: 404 },

  // Throttle / quota
  budget_exhausted: { type: "rate_limit_error", status: 429 },
  insufficient_budget: { type: "rate_limit_error", status: 429 },
  rate_limit: { type: "rate_limit_error", status: 429 },
  rate_limited: { type: "rate_limit_error", status: 429 },
  concurrency_limit: { type: "rate_limit_error", status: 429 },
  bundle_exhausted: { type: "rate_limit_error", status: 429 },
  requests_exhausted: { type: "rate_limit_error", status: 429 },

  // Upstream — surface rate-limit semantics through to clients.
  // NOTE: `upstream_error` is intentionally NOT in this table so that the
  // original upstream HTTP status (400 vs 5xx) is preserved via the
  // status-based fallback below.
  upstream_rate_limited: { type: "rate_limit_error", status: 429 },
  upstream_quota_exhausted: { type: "rate_limit_error", status: 429 },
  upstream_auth_failed: { type: "api_error", status: 502 },

  // Provider state
  provider_unavailable: { type: "api_error", status: 503 },
  provider_error: { type: "api_error", status: 502 },
  empty_response: { type: "api_error", status: 502 },

  // Fallback
  internal_error: { type: "api_error", status: 500 },
};

function mapAllotlyToAnthropic(code: string, fallbackStatus: number): { type: string; status: number } {
  const mapped = ALLOTLY_TO_ANTHROPIC[code];
  if (mapped) return mapped;
  // Unknown code: derive from the original safeguard status so we never
  // collapse 401/403/429 down to a generic 500.
  if (fallbackStatus === 401) return { type: "authentication_error", status: 401 };
  if (fallbackStatus === 403) return { type: "permission_error", status: 403 };
  if (fallbackStatus === 404) return { type: "not_found_error", status: 404 };
  if (fallbackStatus === 429) return { type: "rate_limit_error", status: 429 };
  if (fallbackStatus >= 500) return { type: "api_error", status: fallbackStatus };
  return { type: "invalid_request_error", status: fallbackStatus || 400 };
}

function setBudgetHeaders(
  res: Response,
  ctx?: { remaining: number; total: number; expires: string; requestsRemaining: number; keyType?: string },
) {
  if (!ctx) return;
  res.setHeader("X-Allotly-Budget-Remaining-USD-Cents", String(ctx.remaining));
  res.setHeader("X-Allotly-Budget-Total-USD-Cents", String(ctx.total));
  res.setHeader("X-Allotly-Expires", ctx.expires);
  res.setHeader("X-Allotly-Requests-Remaining", String(ctx.requestsRemaining));
  if (ctx.keyType) res.setHeader("X-Allotly-Key-Type", ctx.keyType);
}

function sendAnthropicError(
  res: Response,
  err: ProxyError,
  budgetCtx?: { remaining: number; total: number; expires: string; requestsRemaining: number; keyType?: string },
) {
  if (res.headersSent) return;
  setBudgetHeaders(res, budgetCtx);
  const { type, status } = mapAllotlyToAnthropic(err.code, err.status);
  // Suggestion is appended to the message so SDK consumers see actionable hints.
  const message = err.suggestion ? `${err.message} ${err.suggestion}` : err.message;
  res.status(status).json({
    type: "error",
    error: { type, message },
  });
}

function sendAnthropicErrorWithCode(
  res: Response,
  code: string,
  fallbackStatus: number,
  message: string,
  budgetCtx?: { remaining: number; total: number; expires: string; requestsRemaining: number; keyType?: string },
) {
  if (res.headersSent) return;
  setBudgetHeaders(res, budgetCtx);
  const { type, status } = mapAllotlyToAnthropic(code, fallbackStatus);
  res.status(status).json({
    type: "error",
    error: { type, message },
  });
}

// =============================================================================
// Pricing lookup (mirrors handler.ts's private helper)
// =============================================================================

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

// =============================================================================
// Default-model selection — biased toward Anthropic providers
// =============================================================================

interface ModelCandidate {
  provider: ProviderType;
  modelId: string;
  /** Sum of input + output prices (cents per 1M tokens). Used as a coarse cost proxy. */
  costScore: number;
}

async function selectDefaultMessagesModel(
  membership: any,
  orgId: string,
): Promise<string | null> {
  const connections = await storage.getProviderConnectionsByOrg(orgId);
  const activeProviders = new Set(
    connections.filter(c => c.status === "ACTIVE").map(c => c.provider as ProviderType),
  );

  const allowedProviders = membership.allowedProviders as string[] | null;
  const allowedModels = membership.allowedModels as string[] | null;

  const allPricing = await storage.getModelPricing();
  const candidates: ModelCandidate[] = [];
  for (const p of allPricing) {
    const provider = p.provider as ProviderType;
    if (provider === "AZURE_OPENAI") continue; // Azure handled separately via deployment names.
    if (!activeProviders.has(provider)) continue;
    if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(provider)) continue;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(p.modelId)) continue;
    candidates.push({
      provider,
      modelId: p.modelId,
      costScore: p.inputPricePerMTok + p.outputPricePerMTok,
    });
  }

  // Azure OpenAI deployments — emit "azure/<deployment>" so detectProvider routes them correctly.
  if (activeProviders.has("AZURE_OPENAI") &&
      (!allowedProviders || allowedProviders.length === 0 || allowedProviders.includes("AZURE_OPENAI"))) {
    for (const conn of connections) {
      if (conn.provider !== "AZURE_OPENAI" || conn.status !== "ACTIVE") continue;
      const deployments = (conn.azureDeployments as AzureDeploymentMapping[] | null) || [];
      for (const dep of deployments) {
        if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(dep.deploymentName)) continue;
        candidates.push({
          provider: "AZURE_OPENAI",
          modelId: `azure/${dep.deploymentName}`,
          costScore: (dep.inputPricePerMTok || 0) + (dep.outputPricePerMTok || 0),
        });
      }
    }
  }

  if (candidates.length === 0) return null;

  // Bias toward Anthropic: pick cheapest Anthropic model first, then cheapest of any provider.
  const anthropicCandidates = candidates.filter(c => c.provider === "ANTHROPIC");
  const pool = anthropicCandidates.length > 0 ? anthropicCandidates : candidates;
  pool.sort((a, b) => a.costScore - b.costScore);
  return pool[0].modelId;
}

// =============================================================================
// Main handler
// =============================================================================

export async function handleMessages(req: Request, res: Response) {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  let membershipId: string | null = null;
  let reservedCostCents = 0;
  let concurrencyAcquired = false;
  let budgetCtx: { remaining: number; total: number; expires: string; requestsRemaining: number; keyType?: string } | undefined;

  // Always tag this endpoint's responses so SDKs/clients can verify the format.
  res.setHeader("X-Allotly-Native-Format", "anthropic");
  res.setHeader("X-Allotly-Request-ID", requestId);

  try {
    const authResult = await authenticateKey(req.headers.authorization);
    if ("status" in authResult) {
      return sendAnthropicError(res, authResult);
    }

    const { membership, userId, apiKeyId } = authResult;
    membershipId = membership.id;

    const team = await storage.getTeam(membership.teamId);
    if (!team) {
      return sendAnthropicError(res, createProxyError(500, "internal_error", "Team not found"));
    }

    const org = await storage.getOrganization(team.orgId);
    if (!org) {
      return sendAnthropicError(res, createProxyError(500, "internal_error", "Organization not found"));
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
      const budgetRemaining = remaining ?? parseInt(
        await redisGet(budgetKey) || String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents),
      );
      return {
        remaining: budgetRemaining,
        total: membership.monthlyBudgetCents,
        expires: periodEnd.toISOString(),
        requestsRemaining,
        keyType: membership.accessType,
      };
    };

    const concError = await checkConcurrency(membershipId, requestId, tier.maxConcurrent);
    if (concError) {
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(res, concError, budgetCtx);
    }
    concurrencyAcquired = true;

    const rlError = await checkRateLimit(membershipId, tier.rpm);
    if (rlError) {
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(res, rlError, budgetCtx);
    }

    const parseResult = anthropicMessagesRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(
        res,
        createProxyError(400, "invalid_request", formatZodError(parseResult.error)),
        budgetCtx,
      );
    }

    const parsed: AnthropicMessagesRequest = parseResult.data;

    // Default-model selection if `model` omitted/empty.
    let modelToUse = parsed.model;
    if (!modelToUse) {
      const defaultModel = await selectDefaultMessagesModel(membership, team.orgId);
      if (!defaultModel) {
        await releaseRateLimit(membershipId);
        await releaseConcurrency(membershipId, requestId);
        concurrencyAcquired = false;
        budgetCtx = await buildBudgetCtx();
        return sendAnthropicError(
          res,
          createProxyError(400, "model_not_found",
            "No model specified and no default model is available for this account.",
            "Pass an explicit `model` field or contact your admin to enable a provider/model.",
          ),
          budgetCtx,
        );
      }
      modelToUse = defaultModel;
    }

    const detectResult = await detectProvider(modelToUse, team.orgId);
    const allowedProviders = membership.allowedProviders as string[] | null;

    if (!detectResult) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(
        res,
        createProxyError(400, "unsupported_model",
          `Model "${modelToUse}" is not supported`,
          "Supported prefixes: azure/* (Azure OpenAI), gpt-*, o1*, o3*, o4* (OpenAI), claude-* (Anthropic), gemini-* (Google).",
        ),
        budgetCtx,
      );
    }

    const provider = detectResult.provider;
    const azureDeployment = detectResult.azureDeployment;
    const effectiveModel = detectResult.strippedModel || modelToUse;

    if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(
        res,
        createProxyError(403, "provider_not_allowed",
          `Provider ${provider} is not allowed for your account`,
          `Allowed providers: ${allowedProviders.join(", ")}`,
        ),
        budgetCtx,
      );
    }

    const allowedModels = membership.allowedModels as string[] | null;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(effectiveModel) && !allowedModels.includes(modelToUse)) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(
        res,
        createProxyError(403, "model_not_allowed",
          `Model "${modelToUse}" is not allowed for your account`,
          `Allowed models: ${allowedModels.join(", ")}`,
        ),
        budgetCtx,
      );
    }

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const connection = connections.find(c => c.provider === provider && c.status === "ACTIVE");
    if (!connection) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      const existsButInactive = connections.some(c => c.provider === provider);
      const err = existsButInactive
        ? createProxyError(503, "provider_unavailable", "The provider for this model is not currently available. Contact your admin.")
        : createProxyError(502, "provider_not_configured", `Provider ${provider} is not configured for this organization`, "Contact your admin to add this provider.");
      return sendAnthropicError(res, err, budgetCtx);
    }

    let pricing: ModelPricing | null = null;
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
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(
        res,
        createProxyError(400, "model_not_found",
          `Pricing for model "${effectiveModel}" not found`,
          "This model may not be supported yet. Check the /v1/models endpoint for available models.",
        ),
        budgetCtx,
      );
    }

    // Token + budget accounting (parsed.max_tokens is required by Anthropic schema).
    const inputTokens = estimateInputTokens(parsed.messages as any[]);
    const inputCostCents = estimateInputCostCents(inputTokens, pricing);
    const remainingBudgetCents = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
    const { effectiveMaxTokens, clamped } = clampMaxTokens(
      remainingBudgetCents, inputCostCents, pricing, parsed.max_tokens,
    );

    const budgetEstimateTokens = effectiveMaxTokens ?? parsed.max_tokens;
    const estimatedOutputCostCents = calculateOutputCostCents(budgetEstimateTokens, pricing);
    const totalEstimatedCostCents = inputCostCents + estimatedOutputCostCents;
    reservedCostCents = totalEstimatedCostCents;

    const budgetResult = await reserveBudget(membershipId, totalEstimatedCostCents);
    if ("status" in budgetResult) {
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      reservedCostCents = 0;
      return sendAnthropicError(res, budgetResult, budgetCtx);
    }

    const bundleError = await checkBundleRequestPool(membership);
    if (bundleError) {
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releaseRateLimit(membershipId);
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      budgetCtx = await buildBudgetCtx();
      return sendAnthropicError(res, bundleError, budgetCtx);
    }

    const adminApiKey = decryptProviderKey(
      connection.adminApiKeyEncrypted,
      connection.adminApiKeyIv,
      connection.adminApiKeyTag,
    );

    let azureContext: AzureContext | undefined;
    if (provider === "AZURE_OPENAI" && azureDeployment && connection.azureBaseUrl) {
      let endpointMode = (connection.azureEndpointMode as "v1" | "legacy") || "legacy";
      if (endpointMode === "v1" && connection.azureBaseUrl.includes("azure-api.net")) endpointMode = "legacy";
      azureContext = {
        baseUrl: connection.azureBaseUrl,
        endpointMode,
        apiVersion: effectiveAzureApiVersion(azureDeployment.modelId, connection.azureApiVersion),
        deploymentName: azureDeployment.deploymentName,
        modelId: azureDeployment.modelId,
      };
    }

    const requestForTranslate = { ...parsed, model: effectiveModel };
    const translated = translateAnthropicToProvider(
      requestForTranslate,
      provider,
      effectiveMaxTokens ?? parsed.max_tokens,
      azureContext,
    );
    // Anthropic→Anthropic is verbatim pass-through; other providers sanitize.
    if (provider === "ANTHROPIC") {
      translated.body = {
        ...parsed,
        model: effectiveModel,
        max_tokens: effectiveMaxTokens ?? parsed.max_tokens,
      };
    } else {
      translated.body = sanitizeProviderBody(translated.body, provider);
    }
    const authInfo = setProviderAuth(translated.headers, provider, adminApiKey, translated.url);

    // Surface dropped Anthropic-native fields when routing to non-Anthropic upstreams.
    const droppedFields = getAnthropicDroppedFields(parsed, provider);
    if (droppedFields.length > 0) {
      res.setHeader("X-Allotly-Dropped-Fields", droppedFields.join(", "));
    }

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
      return sendAnthropicError(
        res,
        createProxyError(502, "provider_error",
          `Failed to reach ${provider}: ${fetchError.message}`,
          "The provider may be temporarily unavailable. Try again later.",
        ),
        budgetCtx,
      );
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
      const logLine = formatUpstreamLogLine(provider, req.headers.authorization, modelToUse, upstreamErr.upstream);
      console.error(`[proxy-messages] ${logLine}`);

      budgetCtx = await buildBudgetCtx();
      return sendAnthropicErrorWithCode(res, upstreamErr.errorType, upstreamErr.allotlyStatus, upstreamErr.friendlyMessage, budgetCtx);
    }

    if (clamped) {
      res.setHeader("X-Allotly-Max-Tokens-Applied", String(effectiveMaxTokens));
    }
    res.setHeader("X-Allotly-Effective-Model", effectiveModel);
    res.setHeader("X-Allotly-Budget-Remaining-USD-Cents", String(budgetResult.remaining));
    res.setHeader("X-Allotly-Budget-Total-USD-Cents", String(membership.monthlyBudgetCents));
    const bundleRemainingNow = await getBundleRequestsRemaining(membership, true);
    const requestsRemainingNow = bundleRemainingNow !== null
      ? bundleRemainingNow
      : Math.max(0, tier.rpm - parseInt(await redisGet(rlKey) || "0"));
    res.setHeader("X-Allotly-Requests-Remaining", String(requestsRemainingNow));
    res.setHeader("X-Allotly-Expires", periodEnd.toISOString());
    res.setHeader("X-Allotly-Key-Type", membership.accessType);

    let actualInputTokens = inputTokens;
    let actualOutputTokens = 0;
    let actualCostCents = 0;

    if (parsed.stream) {
      const streamResult = await streamProviderResponseAsAnthropic(providerResponse, provider, effectiveModel, res);

      if (streamResult.usage) {
        actualInputTokens = streamResult.usage.input_tokens || inputTokens;
        actualOutputTokens = streamResult.usage.output_tokens || 0;
      } else {
        actualOutputTokens = Math.ceil(streamResult.fullContent.length / 4);
      }

      // Empty-response detection: only refund if the helper never emitted
      // a single Anthropic event (i.e. the upstream stream produced nothing
      // parseable). A tool-only stream is NOT empty even if `fullContent` is
      // blank and the upstream omitted usage tokens.
      if (!streamResult.messageStartSent) {
        // Empty upstream response: refund and emit a trailing Anthropic
        // `error` SSE event before closing. Stream headers are already set
        // by streamProviderResponseAsAnthropic, so we MUST use the SSE
        // envelope here, not res.json().
        await refundBudget(membershipId, reservedCostCents);
        reservedCostCents = 0;
        await releaseRateLimit(membershipId);
        await releaseConcurrency(membershipId, requestId);
        concurrencyAcquired = false;
        if (!res.writableEnded) {
          try {
            writeAnthropicEvent(res, buildAnthropicErrorEvent("api_error",
              "The model returned an empty response. No budget was charged."));
            res.end();
          } catch {}
        }
        return;
      }

      // Successful stream — close it now (helper no longer auto-ends).
      if (!res.writableEnded) {
        try { res.end(); } catch {}
      }
    } else {
      const responseBody = await readNonStreamingResponse(providerResponse);

      const anthropicResponse = provider === "ANTHROPIC"
        ? responseBody
        : translateResponseToAnthropic(provider, responseBody, effectiveModel, translated.proxyStopSequences);

      const usage = anthropicResponse?.usage;
      if (usage) {
        actualInputTokens = usage.input_tokens || inputTokens;
        actualOutputTokens = usage.output_tokens || 0;
      }

      // Empty-response detection — text content blocks with no text and no tool_use.
      const hasContent = Array.isArray(anthropicResponse?.content) && anthropicResponse.content.some((b: any) => {
        if (!b || typeof b !== "object") return false;
        if (b.type === "tool_use") return true;
        if (b.type === "text") return typeof b.text === "string" && b.text.trim() !== "";
        if (b.type === "thinking") return typeof b.thinking === "string" && b.thinking.trim() !== "";
        return false;
      });
      if (actualOutputTokens === 0 && !hasContent) {
        await refundBudget(membershipId, reservedCostCents);
        reservedCostCents = 0;
        await releaseRateLimit(membershipId);
        await releaseConcurrency(membershipId, requestId);
        concurrencyAcquired = false;
        budgetCtx = await buildBudgetCtx();
        return sendAnthropicError(
          res,
          createProxyError(502, "empty_response",
            "The model returned an empty response. No budget was charged. Try again or use a different model.",
          ),
          budgetCtx,
        );
      }

      res.json(anthropicResponse);
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
          apiKeyId: apiKeyId ?? null,
          oauthClientId: null,
          provider,
          model: provider === "AZURE_OPENAI" && azureDeployment ? azureDeployment.modelId : modelToUse!,
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
          await storage.updateMembership(membershipId!, {
            currentPeriodSpendCents: freshMembership.currentPeriodSpendCents + actualCostCents,
          });
        }
        await incrementBundleRequests(membership);
      } catch (err) {
        console.error("[proxy-messages] async post-processing error:", err);
      }
    });
  } catch (err: any) {
    console.error("[proxy-messages] handler error:", err);

    if (membershipId && reservedCostCents > 0) {
      try { await refundBudget(membershipId, reservedCostCents); } catch {}
    }
    if (membershipId) {
      try { await releaseRateLimit(membershipId); } catch {}
    }
    if (membershipId && concurrencyAcquired) {
      try { await releaseConcurrency(membershipId, requestId); } catch {}
    }

    if (!res.headersSent) {
      sendAnthropicError(res, createProxyError(500, "internal_error", "An internal error occurred"), budgetCtx);
    }
  }
}
