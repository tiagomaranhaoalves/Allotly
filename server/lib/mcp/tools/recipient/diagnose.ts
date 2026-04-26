import { storage } from "../../../../storage";
import { withBudgetMeta, buildBudgetSnapshot } from "../../meta-budget";
import { redisGet, REDIS_KEYS } from "../../../redis";
import { getRateLimitTier } from "../../../proxy/handler";
import { EmptyInputSchema } from "../../schemas";
import { registerTool } from "../registry";

export const DIAGNOSE_DESCRIPTION = "Explain in plain English what went wrong with your most recent failed API call. Suggests a fix.";

function explain(log: { statusCode: number }): { msg: string; fix: string; doc?: string } {
  const s = log.statusCode;
  if (s === 402) return {
    msg: "Your voucher has run out of budget for this period.",
    fix: "Run request_topup to ask the issuing admin for more budget, or wait for the next reset if you have a Team membership.",
    doc: "https://allotly.ai/docs/budgets",
  };
  if (s === 429) return {
    msg: "You hit a rate or concurrency limit on the proxy.",
    fix: "Wait a few seconds and retry. If you have many parallel calls in flight, let them finish first.",
  };
  if (s === 403) return {
    msg: "The model or provider you tried isn't allowed by your voucher.",
    fix: "Run list_available_models to see what your key can use.",
  };
  if (s >= 500) return {
    msg: "The upstream AI provider returned an error.",
    fix: "Try again. If it persists, the provider may be having an outage; switch models with compare_models.",
  };
  if (s === 400) return {
    msg: "The request was malformed.",
    fix: "Check that messages, model, and any tool definitions are valid.",
  };
  return {
    msg: `The request failed with status ${s}.`,
    fix: "Run my_status to inspect current limits, then retry.",
  };
}

registerTool({
  name: "diagnose",
  description: DIAGNOSE_DESCRIPTION,
  inputSchema: EmptyInputSchema,
  requiresAuth: true,
  requiredScope: "mcp",
  handler: async (_input, ctx) => {
    const principal = ctx.principal!;
    const m = principal.membership;
    const cutoff = new Date(Date.now() - 60 * 60_000);
    const logs = await storage.getProxyRequestLogsByMembership(m.id, 50);
    const recentFail = logs.find(l => l.statusCode >= 400 && new Date(l.createdAt) >= cutoff);

    const team = await storage.getTeam(m.teamId);
    const org = team ? await storage.getOrganization(team.orgId) : null;
    const tier = org ? getRateLimitTier(org.plan, m.accessType) : { rpm: 20, maxConcurrent: 2 };

    const inFlight = parseInt(await redisGet(REDIS_KEYS.concurrent(m.id)) || "0");
    const rlUsed = parseInt(await redisGet(REDIS_KEYS.ratelimit(m.id)) || "0");
    const snap = await buildBudgetSnapshot(m);
    const voucherActive = m.voucherExpiresAt ? new Date(m.voucherExpiresAt) > new Date() : true;

    const currentState = {
      budget_ok: snap.remaining_cents > 0,
      concurrency_ok: inFlight < tier.maxConcurrent,
      rate_limit_ok: rlUsed < tier.rpm,
      voucher_active: voucherActive && m.status === "ACTIVE",
    };

    if (!recentFail) {
      return withBudgetMeta(m, {
        found_recent_failure: false,
        current_state: currentState,
        message: "No recent failures detected. Your access looks healthy.",
      });
    }

    const exp = explain(recentFail);
    return withBudgetMeta(m, {
      found_recent_failure: true,
      most_recent_failure: {
        timestamp: new Date(recentFail.createdAt).toISOString(),
        status_code: recentFail.statusCode,
        error_message: `Proxy returned status ${recentFail.statusCode}`,
        plain_english_explanation: exp.msg,
        suggested_fix: exp.fix,
        documentation_url: exp.doc,
      },
      current_state: currentState,
    });
  },
});
