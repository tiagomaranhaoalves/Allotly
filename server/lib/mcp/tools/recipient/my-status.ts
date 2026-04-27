import { storage } from "../../../../storage";
import { withBudgetMeta, buildBudgetSnapshot } from "../../meta-budget";
import { redisGet, REDIS_KEYS } from "../../../redis";
import { getRateLimitTier } from "../../../proxy/handler";
import { EmptyInputSchema } from "../../schemas";
import { registerTool } from "../registry";

export const MY_STATUS_DESCRIPTION = "Show your budget, current concurrency state, and rate limit state in one view. Useful for diagnosing why a call just failed.";

registerTool({
  name: "my_status",
  description: MY_STATUS_DESCRIPTION,
  inputSchema: EmptyInputSchema,
  requiresAuth: true,
  requiredScope: "mcp:read",
  annotations: {
    title: "View account status, budget, and limits",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (_input, ctx) => {
    const principal = ctx.principal!;
    const m = principal.membership;
    const team = await storage.getTeam(m.teamId);
    const org = team ? await storage.getOrganization(team.orgId) : null;
    const tier = org ? getRateLimitTier(org.plan, m.accessType) : { rpm: 20, maxConcurrent: 2 };

    const inFlight = parseInt(await redisGet(REDIS_KEYS.concurrent(m.id)) || "0");
    const rlUsed = parseInt(await redisGet(REDIS_KEYS.ratelimit(m.id)) || "0");
    const snap = await buildBudgetSnapshot(m);

    let label: string | null = null;
    if (m.voucherRedemptionId) {
      const v = await storage.getVoucher(m.voucherRedemptionId);
      label = v?.label ?? null;
    }

    return withBudgetMeta(m, {
      budget: snap,
      concurrency: { in_flight: Math.max(0, inFlight), limit: tier.maxConcurrent },
      rate_limit: {
        used_in_window: rlUsed,
        limit_per_min: tier.rpm,
        window_resets_in_seconds: 60,
      },
      membership: {
        type: m.accessType === "VOUCHER" ? "voucher" : "team",
        plan_tier: org?.plan?.toLowerCase() || "free",
        status: m.status.toLowerCase(),
        label,
      },
    });
  },
});
