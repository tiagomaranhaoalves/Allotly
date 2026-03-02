import { redisGet, redisSet, redisIncr, redisDecr, redisDecrBy, redisIncrBy, redisDel, redisExpire, redisKeys, REDIS_KEYS } from "../redis";
import { storage } from "../../storage";
import type { TeamMembership, ModelPricing } from "@shared/schema";
import crypto from "crypto";

export interface ProxyError {
  status: number;
  code: string;
  message: string;
  suggestion?: string;
}

export function createProxyError(status: number, code: string, message: string, suggestion?: string): ProxyError {
  return { status, code, message, suggestion };
}

export async function authenticateKey(authHeader: string | undefined): Promise<{
  membership: TeamMembership;
  userId: string;
  keyHash: string;
} | ProxyError> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return createProxyError(401, "invalid_auth", "Missing or invalid Authorization header", "Use: Authorization: Bearer allotly_sk_...");
  }

  const token = authHeader.slice(7);
  if (!token.startsWith("allotly_sk_")) {
    return createProxyError(401, "invalid_key_format", "Invalid API key format", "Allotly keys start with allotly_sk_");
  }

  const keyHash = crypto.createHash("sha256").update(token).digest("hex");

  const cached = await redisGet(REDIS_KEYS.apiKeyCache(keyHash));
  if (cached) {
    const data = JSON.parse(cached);
    return { membership: data.membership, userId: data.userId, keyHash };
  }

  const apiKey = await storage.getApiKeyByHash(keyHash);
  if (!apiKey) {
    return createProxyError(401, "invalid_key", "Invalid API key", "Check your API key or contact your admin for a new one.");
  }

  if (apiKey.status !== "ACTIVE") {
    return createProxyError(401, "key_revoked", "This API key has been revoked", "Contact your admin for a new key.");
  }

  const membership = await storage.getMembership(apiKey.membershipId);
  if (!membership) {
    return createProxyError(401, "membership_not_found", "No membership found for this key");
  }

  if (membership.status === "BUDGET_EXHAUSTED") {
    return createProxyError(402, "budget_exhausted", "Your budget has been fully used for this period", "Wait for the next billing cycle or contact your admin to increase your budget.");
  }

  if (membership.status === "SUSPENDED") {
    return createProxyError(403, "account_suspended", "Your account has been suspended", "Contact your admin.");
  }

  if (membership.status === "EXPIRED") {
    return createProxyError(403, "account_expired", "Your access has expired");
  }

  if (new Date(membership.periodEnd) < new Date()) {
    return createProxyError(403, "period_expired", "Your access period has expired", "Contact your admin.");
  }

  await redisSet(REDIS_KEYS.apiKeyCache(keyHash), JSON.stringify({
    membership,
    userId: apiKey.userId,
  }), 60);

  return { membership, userId: apiKey.userId, keyHash };
}

export async function checkConcurrency(membershipId: string, requestId: string): Promise<ProxyError | null> {
  const count = await redisIncr(REDIS_KEYS.concurrent(membershipId));
  await redisSet(REDIS_KEYS.request(membershipId, requestId), "1", 120);

  if (count > 2) {
    await redisDecr(REDIS_KEYS.concurrent(membershipId));
    await redisDel(REDIS_KEYS.request(membershipId, requestId));
    return createProxyError(429, "concurrency_limit", "Too many concurrent requests (max 2)", "Wait for your current requests to complete before sending new ones.");
  }

  return null;
}

export async function releaseConcurrency(membershipId: string, requestId: string): Promise<void> {
  await redisDecr(REDIS_KEYS.concurrent(membershipId));
  await redisDel(REDIS_KEYS.request(membershipId, requestId));
  const val = await redisGet(REDIS_KEYS.concurrent(membershipId));
  if (val && parseInt(val) < 0) {
    await redisSet(REDIS_KEYS.concurrent(membershipId), "0");
  }
}

export async function checkRateLimit(membershipId: string, planLimit: number): Promise<ProxyError | null> {
  const key = REDIS_KEYS.ratelimit(membershipId);
  const count = await redisIncr(key);
  if (count === 1) {
    await redisExpire(key, 60);
  }

  if (count > planLimit) {
    return createProxyError(429, "rate_limit", `Rate limit exceeded (${planLimit} requests per minute)`, "Slow down your request rate.");
  }

  return null;
}

export function estimateInputTokens(messages: any[]): number {
  let totalChars = 0;
  for (const msg of messages) {
    if (typeof msg.content === "string") {
      totalChars += msg.content.length;
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.text) totalChars += part.text.length;
      }
    }
    totalChars += (msg.role?.length || 0) + 4;
  }
  return Math.ceil(totalChars / 4);
}

export function estimateInputCostCents(inputTokens: number, pricing: ModelPricing): number {
  return Math.ceil((inputTokens * pricing.inputPricePerMTok) / 1_000_000);
}

export function calculateOutputCostCents(outputTokens: number, pricing: ModelPricing): number {
  return Math.ceil((outputTokens * pricing.outputPricePerMTok) / 1_000_000);
}

export function clampMaxTokens(
  remainingBudgetCents: number,
  inputCostCents: number,
  pricing: ModelPricing,
  requestedMaxTokens?: number
): { effectiveMaxTokens: number; clamped: boolean } {
  const budgetForOutput = remainingBudgetCents - inputCostCents;
  if (budgetForOutput <= 0) {
    return { effectiveMaxTokens: 50, clamped: true };
  }

  const maxAffordableOutput = Math.floor((budgetForOutput * 1_000_000) / pricing.outputPricePerMTok);
  const maxAffordable = Math.max(50, maxAffordableOutput);

  if (requestedMaxTokens && requestedMaxTokens <= maxAffordable) {
    return { effectiveMaxTokens: requestedMaxTokens, clamped: false };
  }

  const defaultMax = requestedMaxTokens || 4096;
  if (defaultMax <= maxAffordable) {
    return { effectiveMaxTokens: defaultMax, clamped: false };
  }

  return { effectiveMaxTokens: Math.max(50, maxAffordable), clamped: true };
}

export async function reserveBudget(membershipId: string, estimatedCostCents: number): Promise<{ remaining: number } | ProxyError> {
  const budgetKey = REDIS_KEYS.budget(membershipId);
  let currentBudget = await redisGet(budgetKey);

  if (currentBudget === null) {
    const membership = await storage.getMembership(membershipId);
    if (!membership) return createProxyError(500, "internal_error", "Membership not found");
    const remaining = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
    await redisSet(budgetKey, String(remaining));
    currentBudget = String(remaining);
  }

  const newBalance = await redisDecrBy(budgetKey, estimatedCostCents);

  if (newBalance < 0) {
    await redisIncrBy(budgetKey, estimatedCostCents);
    return createProxyError(402, "insufficient_budget",
      `Insufficient budget. Estimated cost: $${(estimatedCostCents / 100).toFixed(4)}, remaining: $${(parseInt(currentBudget) / 100).toFixed(4)}`,
      "Reduce your request size or contact your admin to increase your budget."
    );
  }

  return { remaining: newBalance };
}

export async function refundBudget(membershipId: string, amountCents: number): Promise<void> {
  await redisIncrBy(REDIS_KEYS.budget(membershipId), amountCents);
}

export async function adjustBudgetAfterResponse(
  membershipId: string,
  estimatedCostCents: number,
  actualCostCents: number
): Promise<void> {
  const diff = estimatedCostCents - actualCostCents;
  if (diff > 0) {
    await redisIncrBy(REDIS_KEYS.budget(membershipId), diff);
  } else if (diff < 0) {
    await redisDecrBy(REDIS_KEYS.budget(membershipId), Math.abs(diff));
  }
}

export async function checkBundleRequestPool(membership: TeamMembership): Promise<ProxyError | null> {
  if (!membership.voucherRedemptionId) return null;

  const voucher = await storage.getVoucher(membership.voucherRedemptionId);
  if (!voucher?.bundleId) return null;

  const bundle = await storage.getVoucherBundle(voucher.bundleId);
  if (!bundle) return null;

  const usedKey = REDIS_KEYS.bundleRequests(bundle.id);
  let used = await redisGet(usedKey);
  if (used === null) {
    await redisSet(usedKey, String(bundle.usedProxyRequests));
    used = String(bundle.usedProxyRequests);
  }

  if (parseInt(used) >= bundle.totalProxyRequests) {
    return createProxyError(402, "requests_exhausted",
      "This bundle's request pool has been exhausted",
      "Contact your admin for a new voucher or bundle."
    );
  }

  return null;
}

export async function incrementBundleRequests(membership: TeamMembership): Promise<void> {
  if (!membership.voucherRedemptionId) return;

  const voucher = await storage.getVoucher(membership.voucherRedemptionId);
  if (!voucher?.bundleId) return;

  const bundle = await storage.getVoucherBundle(voucher.bundleId);
  if (!bundle) return;

  await redisIncr(REDIS_KEYS.bundleRequests(bundle.id));

  await storage.updateVoucherBundle(bundle.id, {
    usedProxyRequests: bundle.usedProxyRequests + 1,
  });
}

export async function selfHealConcurrency(): Promise<number> {
  let healed = 0;
  const concurrentKeys = await redisKeys("allotly:concurrent:*");

  for (const key of concurrentKeys) {
    const val = await redisGet(key);
    if (!val || parseInt(val) <= 0) continue;

    const membershipId = key.replace("allotly:concurrent:", "");
    const memberRequestKeys = await redisKeys(REDIS_KEYS.requestPattern(membershipId));

    if (memberRequestKeys.length === 0) {
      await redisSet(key, "0");
      healed++;
    }
  }

  return healed;
}
