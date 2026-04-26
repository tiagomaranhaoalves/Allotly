import { storage } from "../../../../storage";
import { withBudgetMeta } from "../../meta-budget";
import { McpToolError } from "../../errors";
import { RedeemVoucherInputSchema } from "../../schemas";
import { getIdempotentResponse, storeIdempotentResponse, hashPrincipal } from "../../idempotency";
import { checkMcpRateLimit } from "../../auth";
import { registerTool } from "../registry";

export const REDEEM_VOUCHER_DESCRIPTION = "Redeem a voucher code and bind it to your current MCP session. After redemption, your future chat calls automatically use the voucher's budget.";

registerTool({
  name: "redeem_voucher",
  description: REDEEM_VOUCHER_DESCRIPTION,
  inputSchema: RedeemVoucherInputSchema,
  requiresAuth: true,
  voucherOnly: true,
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const code = input.code.toUpperCase();

    if (principal.bearerKind !== "voucher" || principal.voucherCode !== code) {
      throw new McpToolError("Forbidden", "redeem_voucher must be called with the voucher code itself as the bearer token, matching the input code.", {
        hint: "Set Authorization: Bearer ALLOT-XXXX-XXXX-XXXX and pass the same code as `code`.",
      });
    }

    await checkMcpRateLimit(principal.principalHash, "redeem_voucher", 10);

    const principalKey = hashPrincipal(`voucher:${code}`);
    const cached = await getIdempotentResponse("redeem_voucher", input.idempotency_key, principalKey);
    if (cached) return cached;

    const voucher = await storage.getVoucherByCode(code);
    if (!voucher) throw new McpToolError("NotFound", `Voucher ${code} not found`);
    if (voucher.status === "REVOKED") throw new McpToolError("VoucherAlreadyRedeemed", "This voucher has been revoked");
    if (voucher.status === "EXPIRED" || new Date(voucher.expiresAt) < new Date()) {
      throw new McpToolError("VoucherExpired", "This voucher has expired");
    }

    const response = await withBudgetMeta(principal.membership, {
      redeemed: true,
      voucher: {
        code: voucher.code,
        budget_cents: voucher.budgetCents,
        models: (voucher.allowedModels as string[] | null) || [],
        expires_at: new Date(voucher.expiresAt).toISOString(),
        label: voucher.label || undefined,
      },
      next_steps: [
        "Run quickstart for a tour of your voucher.",
        "Call chat with one of your allowed models.",
        "Run my_budget to see what's left.",
      ],
    });

    await storeIdempotentResponse("redeem_voucher", input.idempotency_key, principalKey, response);
    return response;
  },
});
