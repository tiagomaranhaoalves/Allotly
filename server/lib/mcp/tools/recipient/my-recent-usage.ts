import { storage } from "../../../../storage";
import { withBudgetMeta } from "../../meta-budget";
import { RecentUsageInputSchema } from "../../schemas";
import { registerTool } from "../registry";

export const MY_RECENT_USAGE_DESCRIPTION = "List your recent API calls with model, cost, and timestamp. Prompt content is never included.";

registerTool({
  name: "my_recent_usage",
  description: MY_RECENT_USAGE_DESCRIPTION,
  inputSchema: RecentUsageInputSchema,
  requiresAuth: true,
  requiredScope: "mcp:read",
  annotations: {
    title: "View recent usage history",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const limit = input.limit ?? 20;
    const sinceDate = input.since ? new Date(input.since) : null;
    const logs = await storage.getProxyRequestLogsByMembership(principal.membership.id, 100);

    const filtered = logs
      .filter(l => !sinceDate || new Date(l.createdAt) >= sinceDate)
      .slice(0, limit)
      .map(l => ({
        timestamp: new Date(l.createdAt).toISOString(),
        model: l.model,
        provider: l.provider.toLowerCase(),
        input_tokens: l.inputTokens,
        output_tokens: l.outputTokens,
        cost_cents: l.costCents,
        status_code: l.statusCode,
        max_tokens_applied: l.maxTokensApplied !== null,
      }));

    const totalCost = filtered.reduce((sum, c) => sum + c.cost_cents, 0);
    return withBudgetMeta(principal.membership, { calls: filtered, total_cost_cents: totalCost });
  },
});
