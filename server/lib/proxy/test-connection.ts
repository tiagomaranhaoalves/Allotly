/**
 * V1.5.1 Piece 1 — `POST /api/v1/test-connection`
 *
 * Wraps the existing `processChatCompletion` path with a locked test prompt
 * (model = cheapest active model in the caller's allowlist, max_tokens = 5,
 * temperature = 0). Translates internal failures into six user-facing error
 * codes (`no_providers_active`, `no_models_in_tier`, `budget_exhausted`,
 * `rate_limited`, `provider_error`, `unknown`) and returns a typed envelope
 * the redeem / dashboard UI can render directly.
 *
 * Critical contracts (verified by `tests/test-connection.test.ts`):
 *   1. Every response — success or failure — carries `user_type` so the UI
 *      can render the correct localized hint without a second round-trip.
 *   2. `processChatCompletion` is not modified. When we DO call it, budget
 *      is charged + rate-limit is consumed + concurrency is reserved exactly
 *      like a real `/api/v1/chat/completions` call.
 *   3. When we SHORT-CIRCUIT (no_providers_active, no_models_in_tier, or
 *      pre-call budget_exhausted), we still consume the rate-limit slot so
 *      this endpoint cannot be used to probe state without rate-limiting.
 *   4. Auth-time failures (especially `budget_exhausted` returned by
 *      `authenticateKey`) are translated through the same six-code
 *      classifier and we re-derive `user_type` from the key hash so the
 *      UI gets the role-appropriate hint.
 *   5. No provider names, internal codes, or upstream payloads ever leak
 *      into the user-facing `message` / `hint` fields.
 */

import type { Request, Response } from "express";
import crypto from "crypto";
import { storage } from "../../storage";
import {
  authenticateKey,
  checkRateLimit,
  type ProxyError,
} from "./safeguards";
import {
  processChatCompletion,
  getRateLimitTier,
  type ProcessChatCompletionResult,
} from "./handler";
import {
  getOrgCurrency,
  getActiveRates,
  buildDisplayBlock,
  type DisplayBlock,
  type SupportedCurrency,
  type RatesSnapshot,
} from "../currency";
import type {
  TeamMembership,
  ProviderConnection,
  AzureDeploymentMapping,
  Organization,
  User,
} from "@shared/schema";

// =============================================================================
// Locked test request
// =============================================================================

/** The exact prompt charged against the user's budget on every test. */
export const TEST_PROMPT = "Reply with the single word 'ok' and nothing else.";
export const TEST_MAX_TOKENS = 5;
export const TEST_TEMPERATURE = 0;

// =============================================================================
// User-facing types
// =============================================================================

export type UserType = "team_admin" | "team_member" | "voucher_recipient";

export type TestErrorCode =
  | "no_providers_active"
  | "no_models_in_tier"
  | "budget_exhausted"
  | "rate_limited"
  | "provider_error"
  | "unknown";

export interface TestConnectionBudgetBlock {
  remaining_usd_cents: number;
  total_usd_cents: number;
  display: DisplayBlock;
}

export interface TestConnectionCostBlock {
  usd_cents: number;
  display: DisplayBlock;
}

export interface TestConnectionSuccess {
  success: true;
  user_type: UserType;
  model_used: string;
  response_text: string;
  /** Raw USD-cents charged for this test call. */
  cost_usd_cents: number;
  /** FX-converted, locale-formatted cost in the org's display currency. */
  cost: TestConnectionCostBlock;
  budget: TestConnectionBudgetBlock;
  latency_ms: number;
}

export interface TestConnectionFailure {
  success: false;
  user_type: UserType;
  error: {
    code: TestErrorCode;
    message: string;
    hint: string;
  };
}

export type TestConnectionEnvelope = TestConnectionSuccess | TestConnectionFailure;

// =============================================================================
// User-type derivation
// =============================================================================

/**
 * TEAM admin = ROOT_ADMIN or TEAM_ADMIN org role with a TEAM membership.
 * TEAM member = MEMBER org role with a TEAM membership.
 * Voucher recipient = any membership with accessType === "VOUCHER".
 */
export function getUserType(
  membership: { accessType: string },
  user: { orgRole: string } | null,
): UserType {
  if (membership.accessType === "VOUCHER") return "voucher_recipient";
  if (user && (user.orgRole === "ROOT_ADMIN" || user.orgRole === "TEAM_ADMIN")) {
    return "team_admin";
  }
  return "team_member";
}

// =============================================================================
// Internal-error → user-facing-code mapping
// =============================================================================

/**
 * Map a `ProcessChatCompletionResult` (or pre-call ProxyError) onto the six
 * user-facing test-connection codes. Always returns one of the six — never
 * leaks the original safeguard code.
 */
export function classifyError(
  status: number,
  internalCode: string | undefined,
): TestErrorCode {
  const code = internalCode || "";
  if (code === "budget_exhausted" || code === "insufficient_budget") {
    return "budget_exhausted";
  }
  if (
    code === "rate_limit" ||
    code === "rate_limited" ||
    code === "concurrency_limit" ||
    code === "upstream_rate_limited" ||
    code === "upstream_quota_exhausted"
  ) {
    return "rate_limited";
  }
  if (
    code === "provider_error" ||
    code === "provider_unavailable" ||
    code === "provider_not_configured" ||
    code === "empty_response" ||
    code === "upstream_error" ||
    code === "upstream_auth_failed" ||
    code === "model_not_found" ||
    code === "unsupported_model"
  ) {
    return "provider_error";
  }
  // Status-based fallback for anything we didn't explicitly enumerate.
  if (status === 429) return "rate_limited";
  if (status === 402) return "budget_exhausted";
  if (status === 502 || status === 503) return "provider_error";
  return "unknown";
}

// =============================================================================
// English fallback hints
//
// The dashboard / redeem UI re-renders these via i18next using the
// (code, user_type) tuple — the server-side strings are a stable English
// fallback only (an LLM that surfaces the JSON error will translate them
// naturally; the UI never displays them when i18next can resolve a key).
// =============================================================================

const HINTS: Record<TestErrorCode, Record<UserType, string> | string> = {
  no_providers_active: {
    team_admin: "No AI providers are connected yet. Connect one at /dashboard/providers.",
    team_member: "No AI providers are connected. Contact your team admin.",
    voucher_recipient: "No AI providers are connected. Contact the issuing admin.",
  },
  no_models_in_tier: {
    team_admin: "Your allowed-models list has no currently-active models. Update it at /dashboard/teams.",
    team_member: "No models are available in your tier. Contact your team admin.",
    voucher_recipient: "No models are available in your tier. Contact the issuing admin.",
  },
  budget_exhausted: {
    team_admin: "Your budget for this period is fully used. Top up at /dashboard/billing.",
    team_member: "Your budget for this period is fully used. Contact your team admin.",
    voucher_recipient: "Your voucher budget is fully used. Run `request_topup` from your AI client, or contact the issuing admin.",
  },
  rate_limited: "You're sending requests too fast. Wait a moment and try again.",
  provider_error: "The AI provider returned an error. Try again in a moment.",
  unknown: "Something went wrong. Try again, and if it keeps failing, contact support.",
};

export function getHint(code: TestErrorCode, userType: UserType): string {
  const entry = HINTS[code];
  if (typeof entry === "string") return entry;
  return entry[userType];
}

/**
 * User-facing message stripped of provider names + internal config. The model
 * name is OK to surface (e.g. "gpt-4o-mini") but raw upstream payloads,
 * provider IDs, and internal codes are not.
 */
export function genericMessage(code: TestErrorCode): string {
  switch (code) {
    case "no_providers_active":
      return "No AI providers are connected.";
    case "no_models_in_tier":
      return "No models are available in your tier.";
    case "budget_exhausted":
      return "Your budget for this period is fully used.";
    case "rate_limited":
      return "Too many requests right now.";
    case "provider_error":
      return "The AI provider couldn't complete this request.";
    case "unknown":
    default:
      return "The test request didn't complete.";
  }
}

// =============================================================================
// Cheapest-active-model selection
//
// Mirrors handler-messages.selectDefaultMessagesModel but does NOT bias toward
// any provider. Returns the single lowest-cost active model the caller is
// allowed to use, or a structured "no providers" / "no models" sentinel that
// the handler maps onto the corresponding user-facing error code.
// =============================================================================

export interface ModelCandidate {
  provider: string;
  modelId: string;
  costScore: number;
}

export type SelectModelResult =
  | { kind: "ok"; modelId: string }
  | { kind: "no_providers_active" }
  | { kind: "no_models_in_tier" };

/**
 * `connections` and `pricingByProvider` are passed in so this stays unit-
 * testable without touching `storage`. The handler resolves them via the
 * `storage` layer below.
 */
export function selectCheapestModelFromInputs(
  membership: { allowedProviders: unknown; allowedModels: unknown },
  connections: ProviderConnection[],
  pricingByProvider: Record<string, Array<{ modelId: string; isActive: boolean; inputPricePerMTok: number; outputPricePerMTok: number }>>,
): SelectModelResult {
  const activeProviders = Array.from(new Set(
    connections.filter(c => c.status === "ACTIVE").map(c => c.provider as string),
  ));
  if (activeProviders.length === 0) {
    return { kind: "no_providers_active" };
  }

  const allowedProviders = membership.allowedProviders as string[] | null;
  const allowedModels = membership.allowedModels as string[] | null;

  const effectiveProviders = activeProviders.filter(
    p => !allowedProviders || allowedProviders.length === 0 || allowedProviders.includes(p),
  );

  const candidates: ModelCandidate[] = [];
  for (const provider of effectiveProviders) {
    if (provider === "AZURE_OPENAI") {
      const azureConns = connections.filter(c => c.provider === "AZURE_OPENAI" && c.status === "ACTIVE");
      for (const conn of azureConns) {
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
    } else {
      const pricing = pricingByProvider[provider] || [];
      for (const p of pricing) {
        if (!p.isActive) continue;
        if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(p.modelId)) continue;
        candidates.push({
          provider,
          modelId: p.modelId,
          costScore: p.inputPricePerMTok + p.outputPricePerMTok,
        });
      }
    }
  }

  if (candidates.length === 0) {
    return { kind: "no_models_in_tier" };
  }
  candidates.sort((a, b) => a.costScore - b.costScore);
  return { kind: "ok", modelId: candidates[0].modelId };
}

async function selectCheapestActiveModel(
  membership: TeamMembership,
  orgId: string,
): Promise<SelectModelResult> {
  const connections = await storage.getProviderConnectionsByOrg(orgId);
  const activeProviders = Array.from(new Set(
    connections.filter(c => c.status === "ACTIVE").map(c => c.provider as string),
  ));
  const pricingByProvider: Record<string, any[]> = {};
  for (const provider of activeProviders) {
    if (provider === "AZURE_OPENAI") continue; // pricing comes from deployments
    pricingByProvider[provider] = await storage.getModelPricingByProvider(provider);
  }
  return selectCheapestModelFromInputs(membership, connections, pricingByProvider);
}

// =============================================================================
// Display blocks for the response envelope
// =============================================================================

async function buildBudgetBlock(
  org: Organization,
  remainingUsdCents: number,
  totalUsdCents: number,
  snapshot?: RatesSnapshot,
): Promise<TestConnectionBudgetBlock> {
  const currency: SupportedCurrency = getOrgCurrency(org);
  const snap = snapshot || (await getActiveRates());
  const display = buildDisplayBlock(remainingUsdCents, totalUsdCents, currency, snap);
  return {
    remaining_usd_cents: Math.max(0, remainingUsdCents),
    total_usd_cents: Math.max(0, totalUsdCents),
    display,
  };
}

/**
 * Reuses `buildDisplayBlock` (the canonical FX + formatting helper) to
 * convert the raw USD-cent cost into the org's display currency. We pass
 * the same value as both `remaining` and `total` so `formatted.total` and
 * `minor_units.total` carry the converted cost, and the FX metadata
 * (`fx_rate`, `fx_source`, `fx_as_of`) round-trips identically with the
 * budget block.
 */
async function buildCostBlock(
  org: Organization,
  costUsdCents: number,
  snapshot?: RatesSnapshot,
): Promise<TestConnectionCostBlock> {
  const currency: SupportedCurrency = getOrgCurrency(org);
  const snap = snapshot || (await getActiveRates());
  const display = buildDisplayBlock(costUsdCents, costUsdCents, currency, snap);
  return {
    usd_cents: Math.max(0, costUsdCents),
    display,
  };
}

// =============================================================================
// Result extraction
// =============================================================================

export function extractResponseText(result: ProcessChatCompletionResult): string {
  const choices = (result.body as any)?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const content = choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    // Anthropic-style array — flatten text blocks
    return content
      .filter((c: any) => typeof c?.text === "string")
      .map((c: any) => c.text)
      .join("");
  }
  return "";
}

// =============================================================================
// Auth-error fallback context
//
// When `authenticateKey` returns a ProxyError (e.g. `budget_exhausted` from
// a recognized-but-exhausted membership), we still want to surface the
// correct `user_type` and a budget block to the UI. We re-do the (cached)
// key-hash lookup ourselves — this never costs more than one Redis hit on
// the hot path because `authenticateKey` populates the same cache.
// =============================================================================

interface AuthFailureContext {
  userType: UserType;
  budget?: TestConnectionBudgetBlock;
}

async function deriveAuthFailureContext(authHeader: string | undefined): Promise<AuthFailureContext> {
  const fallback: AuthFailureContext = { userType: "team_member" };
  if (!authHeader || !authHeader.startsWith("Bearer ")) return fallback;
  const token = authHeader.slice(7);
  if (!token.startsWith("allotly_sk_")) return fallback;
  try {
    const keyHash = crypto.createHash("sha256").update(token).digest("hex");
    const apiKey = await storage.getApiKeyByHash(keyHash);
    if (!apiKey) return fallback;
    const membership = await storage.getMembership(apiKey.membershipId);
    if (!membership) return fallback;
    const user: User | undefined = await storage.getUser(apiKey.userId);
    const userType = getUserType(membership, user || null);
    const team = await storage.getTeam(membership.teamId);
    const org = team ? await storage.getOrganization(team.orgId) : null;
    if (!org) return { userType };
    const remaining = Math.max(0, membership.monthlyBudgetCents - membership.currentPeriodSpendCents);
    const budget = await buildBudgetBlock(org, remaining, membership.monthlyBudgetCents);
    return { userType, budget };
  } catch {
    return fallback;
  }
}

// =============================================================================
// Express handler
// =============================================================================

export async function handleTestConnection(req: Request, res: Response): Promise<void> {
  // Same auth pipeline as /api/v1/chat/completions.
  const authResult = await authenticateKey(req.headers.authorization);
  if ("status" in authResult) {
    const err = authResult as ProxyError;
    const ctx = await deriveAuthFailureContext(req.headers.authorization);
    const code = classifyError(err.status, err.code);
    sendFailure(res, mapHttpStatus(code, err.status), code, ctx.userType, genericMessage(code), ctx.budget);
    return;
  }

  const { membership, userId, apiKeyId } = authResult;
  await runTestConnection(res, membership, userId, apiKeyId);
}

/**
 * Session-cookie variant: lets logged-in dashboard users (including those who
 * reached Allotly via OAuth and have no pasteable API key) exercise the same
 * "Test connection" sanity check.
 *
 * Auth model:
 *   - Caller must be authenticated (route is mounted behind `requireAuth`).
 *   - The selected `membershipId` must belong to the calling user. We do NOT
 *     allow admins to test on behalf of other members from this endpoint —
 *     that would muddy the budget/rate-limit envelope and isn't required by
 *     the dashboard UI.
 *   - If `membershipId` is omitted, we fall back to the caller's single
 *     membership (matches the current dashboard model where each user has at
 *     most one membership).
 *
 * The downstream code path (model selection, budget reservation, rate-limit,
 * concurrency, error envelope) is identical to the API-key variant — same
 * six error codes, same budget block, same UI hints.
 */
export async function handleTestConnectionSession(req: Request, res: Response): Promise<void> {
  const sessionUserId = (req as any).session?.userId as string | undefined;
  if (!sessionUserId) {
    // Defensive — `requireAuth` should have rejected already.
    sendFailure(res, 401, "unknown", "team_member", genericMessage("unknown"));
    return;
  }

  const user = await storage.getUser(sessionUserId);
  if (!user) {
    sendFailure(res, 401, "unknown", "team_member", genericMessage("unknown"));
    return;
  }

  const requestedMembershipId =
    typeof req.body?.membershipId === "string" && req.body.membershipId.length > 0
      ? (req.body.membershipId as string)
      : null;

  const membership = requestedMembershipId
    ? await storage.getMembership(requestedMembershipId)
    : await storage.getMembershipByUser(sessionUserId);

  if (!membership || membership.userId !== sessionUserId) {
    // Don't disclose existence — same shape as a generic auth failure.
    const userType = membership ? getUserType(membership, user) : "team_member";
    sendFailure(res, 403, "unknown", userType, genericMessage("unknown"));
    return;
  }

  // Replicate the membership-status gates that `authenticateKey` enforces for
  // API-key callers, mapped onto the six user-facing codes.
  const userType = getUserType(membership, user);
  if (membership.status === "SUSPENDED" || membership.status === "EXPIRED") {
    sendFailure(res, 403, "unknown", userType, genericMessage("unknown"));
    return;
  }
  if (new Date(membership.periodEnd) < new Date()) {
    sendFailure(res, 403, "unknown", userType, genericMessage("unknown"));
    return;
  }

  // Pick any active API key for this membership so usage logs / proxy logs
  // attribute the test to a real key when one exists. OAuth-only members
  // legitimately have none — `apiKeyId` is nullable in `processChatCompletion`.
  const keys = await storage.getApiKeysByMembership(membership.id);
  const activeKey = keys.find(k => k.status === "ACTIVE") || null;

  await runTestConnection(res, membership, sessionUserId, activeKey?.id ?? null);
}

/**
 * Shared post-auth core. Inputs are already trusted (membership belongs to
 * userId; status gates already passed). Owns the budget envelope, model
 * selection, rate-limit/concurrency, and the six-code error classifier.
 */
async function runTestConnection(
  res: Response,
  membership: TeamMembership,
  userId: string,
  apiKeyId: string | null,
): Promise<void> {
  const startedAt = Date.now();

  // Resolve org + user up-front so we can branch user-type / currency for
  // every code path (including the early no_providers / no_models exits).
  const team = await storage.getTeam(membership.teamId);
  const org = team ? await storage.getOrganization(team.orgId) : null;
  const user = await storage.getUser(userId);
  const userType = getUserType(membership, user || null);

  if (!team || !org) {
    sendFailure(res, 503, "unknown", userType, genericMessage("unknown"));
    return;
  }

  const remainingPreCall = Math.max(0, membership.monthlyBudgetCents - membership.currentPeriodSpendCents);

  // Pre-call: budget already exhausted before we even tried — surface the
  // budget code rather than waiting for the upstream call to fail. Counts
  // against rate-limit so this can't be used to probe budget state.
  if (membership.status === "BUDGET_EXHAUSTED" || remainingPreCall <= 0) {
    const tier = getRateLimitTier(org.plan, membership.accessType);
    const rl = await checkRateLimit(membership.id, tier.rpm);
    const budget = await buildBudgetBlock(org, 0, membership.monthlyBudgetCents);
    if (rl) {
      sendFailure(res, 429, "rate_limited", userType, genericMessage("rate_limited"), budget);
      return;
    }
    sendFailure(res, 402, "budget_exhausted", userType, genericMessage("budget_exhausted"), budget);
    return;
  }

  const selection = await selectCheapestActiveModel(membership, team.orgId);

  // Short-circuit paths (no_providers_active / no_models_in_tier) MUST
  // still consume a rate-limit slot — otherwise this endpoint becomes a
  // free way to probe org state. We do NOT acquire concurrency on the
  // short-circuit path because we won't call processChatCompletion (which
  // owns the concurrency reservation).
  if (selection.kind !== "ok") {
    const tier = getRateLimitTier(org.plan, membership.accessType);
    const rl = await checkRateLimit(membership.id, tier.rpm);
    const budget = await buildBudgetBlock(org, remainingPreCall, membership.monthlyBudgetCents);
    if (rl) {
      sendFailure(res, 429, "rate_limited", userType, genericMessage("rate_limited"), budget);
      return;
    }
    if (selection.kind === "no_providers_active") {
      sendFailure(res, 503, "no_providers_active", userType, genericMessage("no_providers_active"), budget);
      return;
    }
    // no_models_in_tier
    sendFailure(res, 403, "no_models_in_tier", userType, genericMessage("no_models_in_tier"), budget);
    return;
  }

  const modelId = selection.modelId;

  // Real chat completion — `processChatCompletion` owns rate-limit +
  // concurrency + budget accounting. We add zero extra reservation here
  // (which would double-count rate-limit otherwise).
  let result: ProcessChatCompletionResult;
  try {
    result = await processChatCompletion({
      membership,
      userId,
      apiKeyId,
      oauthClientId: null,
      body: {
        model: modelId,
        messages: [{ role: "user", content: TEST_PROMPT }],
        max_tokens: TEST_MAX_TOKENS,
        temperature: TEST_TEMPERATURE,
      },
      stream: false,
      requestId: crypto.randomUUID(),
    });
  } catch (err) {
    // processChatCompletion catches its own errors — this branch is a defense
    // in depth for anything truly unexpected.
    const budget = await buildBudgetBlock(org, remainingPreCall, membership.monthlyBudgetCents);
    sendFailure(res, 500, "unknown", userType, genericMessage("unknown"), budget);
    return;
  }

  const latencyMs = Date.now() - startedAt;
  const remainingPostCall = result.budgetSnapshot.remaining_cents;
  const totalCents = result.budgetSnapshot.total_cents;
  const snapshot = await getActiveRates();
  const budget = await buildBudgetBlock(org, remainingPostCall, totalCents, snapshot);

  if (result.status === 200) {
    const responseText = extractResponseText(result);
    const cost = await buildCostBlock(org, result.costCents, snapshot);
    const success: TestConnectionSuccess = {
      success: true,
      user_type: userType,
      model_used: result.effectiveModel || modelId,
      response_text: responseText,
      cost_usd_cents: result.costCents,
      cost,
      budget,
      latency_ms: latencyMs,
    };
    res.status(200).json(success);
    return;
  }

  const code = classifyError(result.status, result.errorBody?.code);
  sendFailure(res, mapHttpStatus(code, result.status), code, userType, genericMessage(code), budget);
}

function mapHttpStatus(code: TestErrorCode, fallback: number): number {
  switch (code) {
    case "budget_exhausted": return 402;
    case "rate_limited": return 429;
    case "no_providers_active": return 503;
    case "no_models_in_tier": return 403;
    case "provider_error": return 502;
    case "unknown":
    default: return fallback >= 400 ? fallback : 500;
  }
}

function sendFailure(
  res: Response,
  status: number,
  code: TestErrorCode,
  userType: UserType,
  message: string,
  budget?: TestConnectionBudgetBlock,
): void {
  const body: TestConnectionFailure & { budget?: TestConnectionBudgetBlock } = {
    success: false,
    user_type: userType,
    error: {
      code,
      message,
      hint: getHint(code, userType),
    },
  };
  if (budget) body.budget = budget;
  res.status(status).json(body);
}
