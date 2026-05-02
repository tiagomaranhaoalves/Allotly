/**
 * V1.5.0 M4 — MCP `chat` tool streaming.
 *
 * `processChatCompletionStreaming` mirrors `processChatCompletion`'s flow
 * (auth handed in, tier → concurrency → rate-limit → validate → detect
 * provider → allowlist → pricing → reserve → upstream → settle → release)
 * but drives an upstream SSE stream instead of buffering the whole
 * response, emitting per-chunk callbacks for `notifications/progress`
 * framing.
 *
 * **Critical**: the existing `processChatCompletion` in `handler.ts` is
 * NEVER touched. This module duplicates the orchestration on purpose so
 * the buffered path stays bit-for-bit identical. Shared logic is pulled
 * from `safeguards.ts`, `cost-utils.ts`, `upstream-stream.ts`, and
 * `translate.ts`.
 *
 * Disconnect handling:
 *   - Client disconnect (abortSignal fires): cancel upstream reader,
 *     settle budget to actual-so-far, release slot, return error
 *     `client_disconnected` (-32099 audit).
 *   - Upstream disconnect: emit final progress `error`, return error,
 *     settle, release.
 *   - Concurrency / rate-limit / budget rejections happen BEFORE any
 *     chunk is emitted, so the caller can return a normal JSON-RPC
 *     error instead of opening an ndjson response.
 */
import { storage } from "../../storage";
import crypto from "crypto";
import { decryptProviderKey } from "../encryption";
import { effectiveAzureApiVersion } from "../providers/azure-openai";
import { redisGet, REDIS_KEYS } from "../redis";
import {
  checkConcurrency,
  checkRateLimit,
  releaseRateLimit,
  releaseConcurrency,
  checkBundleRequestPool,
  incrementBundleRequests,
  getBundleRequestsRemaining,
  estimateInputTokens,
  estimateInputCostCents,
  calculateOutputCostCents,
  clampMaxTokens,
  reserveBudget,
  refundBudget,
  adjustBudgetAfterResponse,
  createProxyError,
  type ProxyError,
} from "./safeguards";
import {
  detectProvider,
  translateToProvider,
  setProviderAuth,
  sanitizeProviderBody,
  translateStreamChunkToOpenAI,
  type AzureContext,
} from "./translate";
import { consumeSseUpstream } from "./upstream-stream";
import { lookupModelPricing, resolveAzurePricing } from "./cost-utils";
import { getRateLimitTier, type BudgetSnapshot, type RateLimitTier } from "./handler";
import { z } from "zod";
import type { ModelPricing } from "@shared/schema";

const chatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant", "tool"]),
    content: z.union([z.string(), z.array(z.any())]),
  })).min(1, "messages must be a non-empty array"),
  stream: z.boolean().optional().default(true),
  max_tokens: z.number().int().min(1).optional(),
  max_completion_tokens: z.number().int().min(1).optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
}).passthrough();

export interface StreamingChatContext {
  membership: any;
  userId: string;
  apiKeyId: string | null;
  oauthClientId?: string | null;
  body: any;
  requestId: string;
  /** Fires on client disconnect; we cancel the upstream reader and settle. */
  abortSignal: AbortSignal;
}

export interface StreamingChunk {
  /** Text appended to the assistant's content since the previous callback. */
  delta: string;
  /** Cumulative output tokens emitted so far (estimated until upstream usage arrives). */
  outputTokensSoFar: number;
  /**
   * Effective `max_tokens` after clamping to remaining budget — passed once
   * via the first chunk so the transport can populate `total` on every
   * `notifications/progress`. Undefined when neither client nor budget
   * imposed a cap (model default applies).
   */
  totalTokens?: number;
}

export interface StreamingFinalResult {
  /** OpenAI `chat.completion`-shaped final body, identical to non-streaming. */
  body: any;
  budgetSnapshot: BudgetSnapshot;
  costCents: number;
  inputTokens: number;
  outputTokens: number;
  maxTokensApplied: boolean;
  effectiveModel: string;
  provider: string;
}

export interface StreamingErrorResult {
  status: number;
  errorBody: { code: string; message: string; suggestion?: string; type?: string };
  budgetSnapshot: BudgetSnapshot;
  /** Audit error code: -32099 for client disconnect, otherwise mapped. */
  errorCode: number;
  /** Whether at least one chunk was emitted before the failure. */
  emittedChunks: boolean;
}

export type OnChunk = (chunk: StreamingChunk) => void | Promise<void>;
export type OnComplete = (result: StreamingFinalResult) => void | Promise<void>;
export type OnError = (err: StreamingErrorResult) => void | Promise<void>;

async function buildBudgetSnapshot(membership: any, tier: RateLimitTier, remainingOverride?: number): Promise<BudgetSnapshot> {
  const rlKey = REDIS_KEYS.ratelimit(membership.id);
  const budgetKey = REDIS_KEYS.budget(membership.id);
  // Mirror handler.ts: voucher bundle pool, when set, takes precedence over
  // the per-minute RPM counter so `requests_remaining` reflects the cap the
  // user actually feels (e.g. "X redemptions left" for vouchers).
  const bundleRemaining = await getBundleRequestsRemaining(membership, false);
  const requestsRemaining = bundleRemaining !== null
    ? bundleRemaining
    : Math.max(0, tier.rpm - parseInt(await redisGet(rlKey) || "0"));
  const remaining = remainingOverride ?? parseInt(await redisGet(budgetKey) || String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents));
  return {
    remaining_cents: Math.max(0, remaining),
    total_cents: membership.monthlyBudgetCents,
    currency: "usd",
    period_end: new Date(membership.periodEnd).toISOString(),
    requests_remaining: requestsRemaining,
    rate_limit_per_min: tier.rpm,
    concurrency_limit: tier.maxConcurrent,
    voucher_expires_at: membership.voucherExpiresAt ? new Date(membership.voucherExpiresAt).toISOString() : null,
  };
}

async function emitErr(
  onError: OnError,
  e: ProxyError,
  membership: any,
  tier: RateLimitTier,
  emittedChunks: boolean,
  errorCode: number,
): Promise<void> {
  const snap = await buildBudgetSnapshot(membership, tier);
  await onError({
    status: e.status,
    errorBody: { code: e.code, message: e.message, suggestion: e.suggestion, type: "allotly_error" },
    budgetSnapshot: snap,
    errorCode,
    emittedChunks,
  });
}

/**
 * Approximate tokens-from-text via the safeguards estimator (chars/4).
 * Used to feed the transport a monotonically increasing `progress` value
 * BEFORE the upstream reports usage.
 */
function estimateOutputTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function processChatCompletionStreaming(
  ctx: StreamingChatContext,
  onChunk: OnChunk,
  onComplete: OnComplete,
  onError: OnError,
): Promise<void> {
  const startTime = Date.now();
  const { membership, userId, apiKeyId, body, requestId, abortSignal } = ctx;
  const oauthClientId = ctx.oauthClientId ?? null;
  const membershipId = membership.id;

  let reservedCostCents = 0;
  let concurrencyAcquired = false;
  let emittedChunks = false;

  const team = await storage.getTeam(membership.teamId);
  if (!team) {
    return await emitErr(onError, createProxyError(503, "internal_error", "Team not found"), membership, { rpm: 20, maxConcurrent: 2 }, false, -32603);
  }
  const org = await storage.getOrganization(team.orgId);
  if (!org) {
    return await emitErr(onError, createProxyError(503, "internal_error", "Organization not found"), membership, { rpm: 20, maxConcurrent: 2 }, false, -32603);
  }
  const tier = getRateLimitTier(org.plan, membership.accessType);

  try {
    const concError = await checkConcurrency(membershipId, requestId, tier.maxConcurrent);
    if (concError) return await emitErr(onError, concError, membership, tier, false, -32012);
    concurrencyAcquired = true;

    const rlError = await checkRateLimit(membershipId, tier.rpm);
    if (rlError) {
      await releaseConcurrency(membershipId, requestId);
      concurrencyAcquired = false;
      return await emitErr(onError, rlError, membership, tier, false, -32011);
    }

    // After this point, the per-minute RPM counter is committed for this
    // request. Mirroring handler.ts, every pre-upstream rejection branch
    // explicitly releases both the rate-limit and concurrency counters so
    // failed validations do NOT consume RPM budget. Successful requests
    // (and post-upstream errors that reflect real provider work) keep the
    // RPM counter incremented.
    const releasePreUpstream = async () => {
      await releaseRateLimit(membershipId).catch(() => {});
      if (concurrencyAcquired) {
        await releaseConcurrency(membershipId, requestId).catch(() => {});
        concurrencyAcquired = false;
      }
    };

    const parseResult = chatRequestSchema.safeParse(body);
    if (!parseResult.success) {
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(400, "invalid_request", "Invalid chat request body"), membership, tier, false, -32100);
    }
    const parsed = parseResult.data;

    const detectResult = await detectProvider(parsed.model, team.orgId);
    if (!detectResult) {
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(400, "unsupported_model", `Model "${parsed.model}" is not supported`), membership, tier, false, -32100);
    }
    const provider = detectResult.provider;
    const azureDeployment = detectResult.azureDeployment;
    const effectiveModel = detectResult.strippedModel || parsed.model;

    const allowedProviders = membership.allowedProviders as string[] | null;
    if (allowedProviders && allowedProviders.length > 0 && !allowedProviders.includes(provider)) {
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(403, "provider_not_allowed", `Provider ${provider} is not allowed`), membership, tier, false, -32002);
    }
    const allowedModels = membership.allowedModels as string[] | null;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(effectiveModel) && !allowedModels.includes(parsed.model)) {
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(403, "model_not_allowed", `Model "${parsed.model}" is not allowed`), membership, tier, false, -32015);
    }

    const connections = await storage.getProviderConnectionsByOrg(team.orgId);
    const connection = connections.find(c => c.provider === provider && c.status === "ACTIVE");
    if (!connection) {
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(502, "provider_not_configured", `Provider ${provider} is not configured`), membership, tier, false, -32030);
    }

    let pricing: ModelPricing | null;
    if (provider === "AZURE_OPENAI" && azureDeployment) {
      pricing = await resolveAzurePricing(azureDeployment, effectiveModel);
    } else {
      pricing = await lookupModelPricing(provider, effectiveModel);
    }
    if (!pricing) {
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(400, "model_not_found", `Pricing for model "${effectiveModel}" not found`), membership, tier, false, -32100);
    }

    const inputTokens = estimateInputTokens(parsed.messages);
    const inputCostCents = estimateInputCostCents(inputTokens, pricing);
    const remainingBudgetCents = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
    const clientTokenCap = (parsed as any).max_completion_tokens ?? parsed.max_tokens;
    const { effectiveMaxTokens, clamped } = clampMaxTokens(remainingBudgetCents, inputCostCents, pricing, clientTokenCap);

    // Pessimistic reservation = input cost + output cost at the effective
    // max_tokens cap (or 4096 default when uncapped — same heuristic as
    // processChatCompletion).
    const budgetEstimateTokens = effectiveMaxTokens ?? 4096;
    const estimatedOutputCostCents = calculateOutputCostCents(budgetEstimateTokens, pricing);
    const totalEstimatedCostCents = inputCostCents + estimatedOutputCostCents;
    reservedCostCents = totalEstimatedCostCents;

    const budgetResult = await reserveBudget(membershipId, totalEstimatedCostCents);
    if ("status" in budgetResult) {
      reservedCostCents = 0;
      await releasePreUpstream();
      return await emitErr(onError, budgetResult, membership, tier, false, -32010);
    }

    const bundleError = await checkBundleRequestPool(membership);
    if (bundleError) {
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releasePreUpstream();
      return await emitErr(onError, bundleError, membership, tier, false, -32010);
    }

    const adminApiKey = decryptProviderKey(connection.adminApiKeyEncrypted, connection.adminApiKeyIv, connection.adminApiKeyTag);

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

    // stream:true is what differentiates this from processChatCompletion
    const translatedInput = detectResult.strippedModel
      ? { ...parsed, model: effectiveModel, stream: true }
      : { ...parsed, stream: true };
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
    } catch (fetchErr: any) {
      // Network failure: mirror handler.ts — refund budget AND release
      // both rate-limit and concurrency. Upstream never produced any
      // billable work, so neither RPM nor the slot should remain held.
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(502, "provider_error", `Failed to reach ${provider}: ${fetchErr.message}`), membership, tier, false, -32030);
    }

    if (!providerResponse.ok) {
      // Upstream rejected the call (4xx/5xx body): mirror handler.ts —
      // refund + release both counters. Same reasoning: no billable work
      // happened upstream.
      const errBodyText = await providerResponse.text().catch(() => "");
      await refundBudget(membershipId, reservedCostCents);
      reservedCostCents = 0;
      await releasePreUpstream();
      return await emitErr(onError, createProxyError(providerResponse.status, "provider_error", errBodyText.slice(0, 500) || `Upstream ${provider} returned ${providerResponse.status}`), membership, tier, false, -32030);
    }

    // ---- Stream consumption ----
    type UpstreamUsage = { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    let fullContent = "";
    let outputTokensSoFar = 0;
    let upstreamUsage: UpstreamUsage | null = null;
    let finishReason: string | null = null;
    const toolCallsByIndex = new Map<number, { id?: string; type?: string; function?: { name?: string; arguments: string } }>();
    let firstChunk = true;

    const processData = async (rawData: string) => {
      if (rawData === "[DONE]") return;
      let parsed: any;
      try { parsed = JSON.parse(rawData); } catch { return; }

      const result = translateStreamChunkToOpenAI(provider, parsed, effectiveModel);
      if (result?.usage) upstreamUsage = result.usage as UpstreamUsage;

      // Per-provider delta extraction → unify on OpenAI shape internally
      let deltaText = "";
      if (provider === "OPENAI" || provider === "AZURE_OPENAI") {
        const choice = parsed.choices?.[0];
        const d = choice?.delta?.content;
        if (typeof d === "string") deltaText = d;
        if (choice?.finish_reason) finishReason = choice.finish_reason;
        const tcs = choice?.delta?.tool_calls;
        if (Array.isArray(tcs)) {
          for (const tc of tcs) {
            const idx = typeof tc.index === "number" ? tc.index : 0;
            const cur = toolCallsByIndex.get(idx) || { function: { arguments: "" } };
            if (tc.id) cur.id = tc.id;
            if (tc.type) cur.type = tc.type;
            if (tc.function) {
              cur.function = cur.function || { arguments: "" };
              if (tc.function.name) cur.function.name = tc.function.name;
              if (typeof tc.function.arguments === "string") cur.function.arguments += tc.function.arguments;
            }
            toolCallsByIndex.set(idx, cur);
          }
        }
      } else if (provider === "ANTHROPIC") {
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          deltaText = parsed.delta.text;
        }
        if (parsed.type === "message_delta" && parsed.delta?.stop_reason) {
          // Map Anthropic stop_reason → OpenAI finish_reason vocabulary.
          const sr = parsed.delta.stop_reason;
          finishReason = sr === "end_turn" ? "stop" : sr === "max_tokens" ? "length" : sr === "tool_use" ? "tool_calls" : sr;
        }
      } else if (provider === "GOOGLE") {
        const candidate = parsed.candidates?.[0];
        const parts = candidate?.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (typeof p?.text === "string") deltaText += p.text;
          }
        }
        if (candidate?.finishReason) {
          const fr = String(candidate.finishReason).toUpperCase();
          finishReason = fr === "STOP" ? "stop" : fr === "MAX_TOKENS" ? "length" : "stop";
        }
      }

      if (deltaText) {
        fullContent += deltaText;
        outputTokensSoFar = estimateOutputTokens(fullContent);
        emittedChunks = true;
        await onChunk({
          delta: deltaText,
          outputTokensSoFar,
          ...(firstChunk && effectiveMaxTokens ? { totalTokens: effectiveMaxTokens } : {}),
        });
        firstChunk = false;
      }
    };

    try {
      await consumeSseUpstream(providerResponse, { onData: processData }, { signal: abortSignal });
    } catch (streamErr: any) {
      // Upstream disconnected mid-stream. Settle to what was actually
      // produced so far, release the concurrency slot (RPM stays — real
      // upstream work was performed). Failure to release the slot here
      // would otherwise leak it indefinitely.
      const u = upstreamUsage as UpstreamUsage | null;
      const actualOutput = u?.completion_tokens ?? outputTokensSoFar;
      const actualInput = u?.prompt_tokens ?? inputTokens;
      const actualCost = estimateInputCostCents(actualInput, pricing) + calculateOutputCostCents(actualOutput, pricing);
      await adjustBudgetAfterResponse(membershipId, reservedCostCents, actualCost);
      reservedCostCents = 0;
      if (concurrencyAcquired) {
        await releaseConcurrency(membershipId, requestId).catch(() => {});
        concurrencyAcquired = false;
      }
      return await emitErr(onError, createProxyError(502, "provider_stream_interrupted", `Upstream ${provider} stream interrupted: ${streamErr?.message || "unknown"}`), membership, tier, emittedChunks, -32030);
    }

    if (abortSignal.aborted) {
      // Client disconnected — settle to actual-so-far, release the slot,
      // and audit -32099 client_disconnected per task spec. RPM stays
      // incremented (the user's request did consume upstream resources).
      const u = upstreamUsage as UpstreamUsage | null;
      const actualOutput = u?.completion_tokens ?? outputTokensSoFar;
      const actualInput = u?.prompt_tokens ?? inputTokens;
      const actualCost = estimateInputCostCents(actualInput, pricing) + calculateOutputCostCents(actualOutput, pricing);
      await adjustBudgetAfterResponse(membershipId, reservedCostCents, actualCost);
      reservedCostCents = 0;
      if (concurrencyAcquired) {
        await releaseConcurrency(membershipId, requestId).catch(() => {});
        concurrencyAcquired = false;
      }
      return await emitErr(onError, createProxyError(499, "client_disconnected", "Client disconnected mid-stream"), membership, tier, emittedChunks, -32099);
    }

    // ---- Settle on success ----
    const finalUsage = upstreamUsage as UpstreamUsage | null;
    const actualInputTokens = finalUsage?.prompt_tokens ?? inputTokens;
    const actualOutputTokens = finalUsage?.completion_tokens ?? outputTokensSoFar;
    const actualCostCents = estimateInputCostCents(actualInputTokens, pricing) + calculateOutputCostCents(actualOutputTokens, pricing);
    await adjustBudgetAfterResponse(membershipId, reservedCostCents, actualCostCents);
    reservedCostCents = 0;

    await releaseConcurrency(membershipId, requestId);
    concurrencyAcquired = false;

    const durationMs = Date.now() - startTime;
    setImmediate(async () => {
      try {
        await storage.createProxyRequestLog({
          membershipId,
          apiKeyId: apiKeyId ?? null,
          oauthClientId,
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
        const fresh = await storage.getMembership(membershipId);
        if (fresh) {
          await storage.updateMembership(membershipId, {
            currentPeriodSpendCents: fresh.currentPeriodSpendCents + actualCostCents,
          });
        }
        await incrementBundleRequests(membership);
      } catch (postErr) {
        console.error("[mcp-streaming] post-processing error:", postErr);
      }
    });

    const newRemaining = parseInt(await redisGet(REDIS_KEYS.budget(membershipId)) || "0");
    const snap = await buildBudgetSnapshot(membership, tier, newRemaining);

    // Reconstruct an OpenAI-shaped final completion body so the chat tool's
    // post-processing layer can read it identically to the buffered path.
    const toolCalls = Array.from(toolCallsByIndex.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([idx, tc]) => ({
        index: idx,
        id: tc.id || `call_${idx}`,
        type: tc.type || "function",
        function: { name: tc.function?.name || "", arguments: tc.function?.arguments || "" },
      }));

    const finalBody = {
      id: `chatcmpl-${crypto.randomUUID()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: effectiveModel,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: fullContent,
          ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: finishReason || "stop",
      }],
      usage: {
        prompt_tokens: actualInputTokens,
        completion_tokens: actualOutputTokens,
        total_tokens: actualInputTokens + actualOutputTokens,
      },
    };

    await onComplete({
      body: finalBody,
      budgetSnapshot: snap,
      costCents: actualCostCents,
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
      maxTokensApplied: clamped,
      effectiveModel,
      provider: provider.toLowerCase(),
    });
  } catch (err: any) {
    console.error("[processChatCompletionStreaming] error:", err);
    if (reservedCostCents > 0) await refundBudget(membershipId, reservedCostCents).catch(() => {});
    // Internal error: mirror handler.ts catch-all — release rate-limit AND
    // concurrency since this request never reached the provider success
    // path. (Successful streaming runs release concurrency inline above
    // and intentionally LEAVE the RPM counter incremented.)
    await releaseRateLimit(membershipId).catch(() => {});
    if (concurrencyAcquired) await releaseConcurrency(membershipId, requestId).catch(() => {});
    return await emitErr(onError, createProxyError(500, "internal_error", "An internal error occurred"), membership, tier, emittedChunks, -32603);
  }
}
