import { storage } from "../../../../storage";
import { withBudgetMeta, buildBudgetSnapshot } from "../../meta-budget";
import { EmptyInputSchema } from "../../schemas";
import { registerTool } from "../registry";

export const QUICKSTART_DESCRIPTION = "Get a friendly intro to your Allotly access — what models you can use, your remaining budget, when it expires, and three sample prompts to try.";

registerTool({
  name: "quickstart",
  description: QUICKSTART_DESCRIPTION,
  inputSchema: EmptyInputSchema,
  requiresAuth: true,
  handler: async (_input, ctx) => {
    const principal = ctx.principal!;
    const m = principal.membership;
    const snap = await buildBudgetSnapshot(m);

    let voucherLabel: string | null = null;
    let allowedModels: string[] = (m.allowedModels as string[] | null) || [];
    if (m.voucherRedemptionId) {
      const voucher = await storage.getVoucher(m.voucherRedemptionId);
      if (voucher) {
        voucherLabel = voucher.label ?? null;
        allowedModels = (voucher.allowedModels as string[] | null) || allowedModels;
      }
    }
    if (allowedModels.length === 0) {
      const team = await storage.getTeam(m.teamId);
      if (team) {
        const conns = await storage.getProviderConnectionsByOrg(team.orgId);
        const pricing = await storage.getModelPricing();
        const activeProviders = conns.filter(c => c.status === "ACTIVE").map(c => c.provider);
        allowedModels = pricing.filter(p => activeProviders.includes(p.provider)).map(p => p.modelId);
      }
    }

    const greeting = voucherLabel
      ? `Welcome to ${voucherLabel}. Here's what your voucher gives you.`
      : "Welcome to Allotly. Here's a quick tour of what your key can do.";

    const fastModel = allowedModels.find(x => /haiku|flash|mini/i.test(x)) || allowedModels[0];
    const balancedModel = allowedModels.find(x => /sonnet|gpt-4o(?!-mini)|gemini-2\.5-pro/i.test(x)) || fastModel;
    const visionModel = allowedModels.find(x => /gpt-4o|claude-(sonnet|haiku|opus)|gemini/i.test(x)) || balancedModel;

    const samplePrompts = [
      { title: "Quick fact-check", prompt: "What's the population of Tokyo as of 2024?", suggested_model: fastModel },
      { title: "Side-by-side comparison", prompt: "Compare three approaches to debouncing in JavaScript.", suggested_model: balancedModel },
      { title: "Multimodal", prompt: "Describe what's in this image.", suggested_model: visionModel },
    ].filter(p => p.suggested_model);

    return withBudgetMeta(m, {
      greeting,
      whats_in_your_voucher: {
        budget_remaining: `$${(snap.remaining_cents / 100).toFixed(2)}`,
        expires_in: formatExpires(snap.period_end),
        allowed_models: allowedModels,
        daily_request_limit: snap.requests_remaining ?? snap.rate_limit_per_min * 60 * 24,
      },
      sample_prompts: samplePrompts,
      next_steps: [
        "Try the chat tool with one of the sample prompts.",
        "Run compare_models to see two models side-by-side.",
        "Run my_status if anything looks off.",
      ],
    });
  },
});

function formatExpires(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (days >= 1) return `${days} day${days > 1 ? "s" : ""}`;
  const hours = Math.floor(ms / (60 * 60 * 1000));
  return `${Math.max(1, hours)} hour${hours > 1 ? "s" : ""}`;
}
