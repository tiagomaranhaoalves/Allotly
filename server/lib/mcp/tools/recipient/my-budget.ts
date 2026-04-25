import { withBudgetMeta, buildBudgetSnapshot } from "../../meta-budget";
import { EmptyInputSchema } from "../../schemas";
import { registerTool } from "../registry";

export const MY_BUDGET_DESCRIPTION = "Show your current remaining budget, total budget, period end, and requests remaining.";

registerTool({
  name: "my_budget",
  description: MY_BUDGET_DESCRIPTION,
  inputSchema: EmptyInputSchema,
  requiresAuth: true,
  handler: async (_input, ctx) => {
    const principal = ctx.principal!;
    const snap = await buildBudgetSnapshot(principal.membership);
    const usedPct = snap.total_cents > 0
      ? Math.round(((snap.total_cents - snap.remaining_cents) / snap.total_cents) * 100)
      : 0;
    const expiresMs = new Date(snap.period_end).getTime() - Date.now();
    const expiresIn = formatDuration(expiresMs);
    return withBudgetMeta(principal.membership, {
      ...snap,
      formatted: {
        remaining: `$${(snap.remaining_cents / 100).toFixed(2)}`,
        total: `$${(snap.total_cents / 100).toFixed(2)}`,
        used_pct: usedPct,
        expires_in: expiresIn,
      },
    });
  },
});

function formatDuration(ms: number): string {
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""}`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours >= 1) return `${hours} hour${hours > 1 ? "s" : ""}`;
  const mins = Math.max(1, Math.floor(ms / (60 * 1000)));
  return `${mins} minute${mins > 1 ? "s" : ""}`;
}
