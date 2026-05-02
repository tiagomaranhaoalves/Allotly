import { z } from "zod";
import { storage } from "../../storage";
import { getActiveRates, buildDisplayBlock, type SupportedCurrency } from "../currency";

export type WarningLevel = "low" | "critical" | "exhausted";

export interface BudgetWarningPrincipal {
  accessType: string;
  orgRole?: string | null;
}

export const WarningSchema = z.object({
  level: z.enum(["low", "critical", "exhausted"]),
  message: z.string(),
  remaining_pct: z.number().int().nonnegative(),
  suggestion: z.object({
    text: z.string(),
    cheapest_model_in_allowlist: z.string().nullable(),
    topup_url: z.string().nullable(),
    topup_via_mcp_tool: z.string().nullable(),
  }),
});
export type Warning = z.infer<typeof WarningSchema>;

export const TOPUP_URL = "/dashboard/billing";

function isAdminBranch(p: BudgetWarningPrincipal): boolean {
  if (p.accessType !== "TEAM") return false;
  return p.orgRole === "TEAM_ADMIN" || p.orgRole === "OWNER";
}

function isVoucherBranch(p: BudgetWarningPrincipal): boolean {
  return p.accessType === "VOUCHER";
}

async function findCheapestAllowlistModel(allowlist: string[] | null | undefined): Promise<string | null> {
  // Per spec: an empty/null allowlist means no allowlist constraint exists,
  // and we must return null (no "Try cheaper models …" clause).
  if (!allowlist || allowlist.length === 0) return null;
  let pricing;
  try {
    pricing = await storage.getModelPricing();
  } catch {
    return null;
  }
  if (!pricing || pricing.length === 0) return null;
  const candidates = pricing.filter(p => allowlist.includes(p.modelId));
  if (candidates.length === 0) return null;
  let best = candidates[0];
  for (const c of candidates) {
    if (c.inputPricePerMTok < best.inputPricePerMTok) best = c;
  }
  return best.modelId;
}

export async function getBudgetWarning(
  remainingCents: number,
  totalCents: number,
  principal: BudgetWarningPrincipal,
  allowlist: string[] | null | undefined,
  currency: SupportedCurrency,
): Promise<Warning | null> {
  if (totalCents <= 0) return null;

  const safeRemaining = Math.max(0, remainingCents);
  const ratio = safeRemaining / totalCents;

  let level: WarningLevel | null = null;
  if (safeRemaining <= 0) level = "exhausted";
  else if (ratio < 0.10) level = "critical";
  else if (ratio < 0.25) level = "low";

  if (!level) return null;

  const remainingPct = Math.round(ratio * 100);

  const rates = await getActiveRates();
  const display = buildDisplayBlock(safeRemaining, totalCents, currency, rates);
  const amountRemaining = display.formatted.remaining;
  const amountTotal = display.formatted.total;

  const cheapest = await findCheapestAllowlistModel(allowlist);
  const cheaperPrefix = cheapest
    ? `Try cheaper models like ${cheapest} for routine tasks. `
    : "";

  const isAdmin = isAdminBranch(principal);
  const isVoucher = isVoucherBranch(principal);
  const isMember = principal.accessType === "TEAM" && !isAdmin;

  let message: string;
  switch (level) {
    case "low":
      message = `Budget at ${remainingPct}% — running low. ${amountRemaining} of ${amountTotal} left.`;
      break;
    case "critical":
      message = `Budget critically low — only ${remainingPct}% left. ${amountRemaining} remaining.`;
      break;
    case "exhausted":
      message = isVoucher ? "Voucher fully spent." : "Budget fully spent.";
      break;
  }

  let text: string;
  let topup_url: string | null = null;
  let topup_via_mcp_tool: string | null = null;

  if (isAdmin) {
    topup_url = TOPUP_URL;
    text = level === "exhausted"
      ? `Top up here: ${TOPUP_URL}.`
      : `${cheaperPrefix}Top up here: ${TOPUP_URL}.`;
  } else if (isMember) {
    text = level === "exhausted"
      ? "Contact your team admin to increase the budget."
      : `${cheaperPrefix}Contact your team admin to increase the budget.`;
  } else {
    topup_via_mcp_tool = "request_topup";
    text = level === "exhausted"
      ? "Run `request_topup` to ask the issuing admin for more budget."
      : `${cheaperPrefix}Run \`request_topup\` to ask the issuing admin for more budget.`;
  }

  return {
    level,
    message,
    remaining_pct: remainingPct,
    suggestion: {
      text,
      cheapest_model_in_allowlist: cheapest,
      topup_url,
      topup_via_mcp_tool,
    },
  };
}
