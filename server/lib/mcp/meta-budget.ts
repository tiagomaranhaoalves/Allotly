import { redisGet, REDIS_KEYS } from "../redis";
import { storage } from "../../storage";
import { getRateLimitTier } from "../proxy/handler";
import type { BudgetSnapshot } from "./schemas";
import type { TeamMembership } from "@shared/schema";

export async function buildBudgetSnapshot(membership: TeamMembership): Promise<BudgetSnapshot> {
  const team = await storage.getTeam(membership.teamId);
  const org = team ? await storage.getOrganization(team.orgId) : null;
  const tier = org ? getRateLimitTier(org.plan, membership.accessType) : { rpm: 20, maxConcurrent: 2 };

  const budgetKey = REDIS_KEYS.budget(membership.id);
  const rlKey = REDIS_KEYS.ratelimit(membership.id);
  const remaining = parseInt(await redisGet(budgetKey) || String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents));
  const rlUsed = parseInt(await redisGet(rlKey) || "0");
  const requestsRemaining = Math.max(0, tier.rpm - rlUsed);

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

export async function withBudgetMeta<T extends Record<string, any>>(
  membership: TeamMembership,
  result: T
): Promise<T & { _meta: { budget: BudgetSnapshot } }> {
  const budget = await buildBudgetSnapshot(membership);
  return { ...result, _meta: { budget } };
}
