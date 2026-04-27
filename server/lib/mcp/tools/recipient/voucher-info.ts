import { storage } from "../../../../storage";
import { McpToolError } from "../../errors";
import { VoucherInfoInputSchema } from "../../schemas";
import { registerTool } from "../registry";

export const VOUCHER_INFO_DESCRIPTION = "Look up details about a voucher code without redeeming it. Useful for previewing what a voucher gives you before committing. Callable without authentication.";

function statusMap(voucherStatus: string, currentRedemptions: number, maxRedemptions: number): "unredeemed" | "redeemed" | "revoked" | "expired" {
  if (voucherStatus === "REVOKED") return "revoked";
  if (voucherStatus === "EXPIRED") return "expired";
  if (voucherStatus === "FULLY_REDEEMED") return "redeemed";
  if (currentRedemptions >= maxRedemptions) return "redeemed";
  return "unredeemed";
}

registerTool({
  name: "voucher_info",
  description: VOUCHER_INFO_DESCRIPTION,
  inputSchema: VoucherInfoInputSchema,
  requiresAuth: false,
  requiredScope: "mcp:read",
  annotations: {
    title: "Look up voucher details",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (input) => {
    const code = input.code.toUpperCase();
    const voucher = await storage.getVoucherByCode(code);
    if (!voucher) throw new McpToolError("NotFound", `Voucher code ${code} not found`);

    let issuedByLabel: string | undefined;
    try {
      const creator = await storage.getUser(voucher.createdById);
      issuedByLabel = creator?.name || undefined;
    } catch {}

    const status = statusMap(voucher.status, voucher.currentRedemptions, voucher.maxRedemptions);
    const expired = new Date(voucher.expiresAt) < new Date();
    const finalStatus = expired ? "expired" : status;
    const redeemable = finalStatus === "unredeemed";

    return {
      code: voucher.code,
      status: finalStatus,
      budget_cents: voucher.budgetCents,
      models: (voucher.allowedModels as string[] | null) || [],
      concurrency_limit: 2,
      expires_at: new Date(voucher.expiresAt).toISOString(),
      issued_by_label: issuedByLabel,
      redeemable,
    };
  },
});
