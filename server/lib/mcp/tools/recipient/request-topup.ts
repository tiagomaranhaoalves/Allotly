import crypto from "crypto";
import { db } from "../../../../db";
import { storage } from "../../../../storage";
import { voucherTopupRequests } from "@shared/schema";
import { withBudgetMeta } from "../../meta-budget";
import { McpToolError } from "../../errors";
import { RequestTopupInputSchema } from "../../schemas";
import { getIdempotentResponse, storeIdempotentResponse, hashPrincipal } from "../../idempotency";
import { checkMcpRateLimit } from "../../auth";
import { sendEmail, emailTemplates } from "../../../email";
import { eq, and, gte, count } from "drizzle-orm";
import { registerTool } from "../registry";

export const REQUEST_TOPUP_DESCRIPTION = "Ask the admin who issued your voucher to add more budget. Optionally include a reason.";

registerTool({
  name: "request_topup",
  description: REQUEST_TOPUP_DESCRIPTION,
  inputSchema: RequestTopupInputSchema,
  requiresAuth: true,
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    await checkMcpRateLimit(principal.principalHash, "request_topup", 5);

    const principalKey = hashPrincipal(principal.principalHash);
    const cached = await getIdempotentResponse("request_topup", input.idempotency_key, principalKey);
    if (cached) return cached;

    const m = principal.membership;
    if (!m.voucherRedemptionId) {
      throw new McpToolError("Forbidden", "request_topup is only available for voucher-based memberships", {
        hint: "Team-membership budgets reset on the billing cycle.",
      });
    }

    const voucher = await storage.getVoucher(m.voucherRedemptionId);
    if (!voucher) throw new McpToolError("NotFound", "Underlying voucher not found");

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [{ value: recent }] = await db
      .select({ value: count() })
      .from(voucherTopupRequests)
      .where(and(eq(voucherTopupRequests.voucherId, voucher.id), gte(voucherTopupRequests.createdAt, since)));
    if (Number(recent) >= 5) {
      throw new McpToolError("RateLimited", "Too many top-up requests in the last 24 hours", {
        hint: "Wait for the admin to respond before requesting again.",
      });
    }

    const requestId = crypto.randomUUID();
    await db.insert(voucherTopupRequests).values({
      id: requestId,
      voucherId: voucher.id,
      membershipId: m.id,
      requestedByPrincipalHash: principal.principalHash,
      amountCentsRequested: input.amount_cents_requested ?? null,
      reason: input.reason ?? null,
      status: "pending",
      notificationSent: false,
    });

    const admin = await storage.getUser(voucher.createdById);
    let notified = false;
    if (admin?.email) {
      try {
        const tmpl = emailTemplates.topupRequest(
          admin.name || "Admin",
          voucher.label || "",
          voucher.code,
          `Voucher recipient (${principal.principalHash.slice(0, 8)}…)`,
          input.amount_cents_requested ? (input.amount_cents_requested / 100).toFixed(2) : null,
          input.reason ?? null,
          `https://allotly.ai/dashboard/vouchers`
        );
        await sendEmail(admin.email, tmpl.subject, tmpl.html);
        notified = true;
        await db.update(voucherTopupRequests).set({ notificationSent: true }).where(eq(voucherTopupRequests.id, requestId));
      } catch (err: any) {
        console.error(`[mcp:request_topup] notify failed: ${err?.message}`);
      }
    }

    const response = await withBudgetMeta(m, {
      requested: true,
      request_id: requestId,
      notification_sent_to_admin: notified,
      estimated_response_time: "Usually within 24 hours",
    });

    await storeIdempotentResponse("request_topup", input.idempotency_key, principalKey, response);
    return response;
  },
});
