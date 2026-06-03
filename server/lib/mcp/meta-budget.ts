import { redisGet, REDIS_KEYS } from "../redis";
import { storage } from "../../storage";
import { getRateLimitTier } from "../proxy/handler";
import type { BudgetSnapshot } from "./schemas";
import type { TeamMembership } from "@shared/schema";
import { getActiveRates, buildDisplayBlock, getOrgCurrency, microCentsToCents } from "../currency";
import { getBudgetWarning } from "./budget-warnings";

export async function buildBudgetSnapshot(membership: TeamMembership): Promise<BudgetSnapshot> {
  const team = await storage.getTeam(membership.teamId);
  const org = team ? await storage.getOrganization(team.orgId) : null;
  const tier = org ? getRateLimitTier(org.plan, membership.accessType) : { rpm: 20, maxConcurrent: 2 };

  const budgetKey = REDIS_KEYS.budget(membership.id);
  const rlKey = REDIS_KEYS.ratelimit(membership.id);
  const remaining = parseInt(await redisGet(budgetKey) || String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents));
  const rlUsed = parseInt(await redisGet(rlKey) || "0");
  const requestsRemaining = Math.max(0, tier.rpm - rlUsed);

  // Internal budget is metered in micro-cents; the snapshot, display block and
  // warning all speak whole cents, so convert once here.
  const remainingCents = microCentsToCents(Math.max(0, remaining));
  const totalCents = microCentsToCents(membership.monthlyBudgetCents);

  const orgCurrency = getOrgCurrency(org);
  const rates = await getActiveRates();
  const display = buildDisplayBlock(remainingCents, totalCents, orgCurrency, rates);

  // V1.5.1 Piece 4: attach optional proactive budget warning. orgRole is
  // looked up only for TEAM members (it determines admin-vs-member branch);
  // VOUCHER memberships ignore orgRole entirely.
  let orgRole: string | null = null;
  if (membership.accessType === "TEAM") {
    try {
      const user = await storage.getUser(membership.userId);
      orgRole = user?.orgRole ?? null;
    } catch {
      orgRole = null;
    }
  }
  const warning = await getBudgetWarning(
    remainingCents,
    totalCents,
    { accessType: membership.accessType, orgRole },
    membership.allowedModels as string[] | null,
    orgCurrency,
  );

  return {
    remaining_cents: remainingCents,
    total_cents: totalCents,
    currency: "usd",
    period_end: new Date(membership.periodEnd).toISOString(),
    requests_remaining: requestsRemaining,
    rate_limit_per_min: tier.rpm,
    concurrency_limit: tier.maxConcurrent,
    voucher_expires_at: membership.voucherExpiresAt ? new Date(membership.voucherExpiresAt).toISOString() : null,
    display,
    warning,
  };
}

export async function withBudgetMeta<T extends Record<string, any>>(
  membership: TeamMembership,
  result: T
): Promise<T & { _meta: { budget: BudgetSnapshot } }> {
  const budget = await buildBudgetSnapshot(membership);
  return { ...result, _meta: { budget } };
}
