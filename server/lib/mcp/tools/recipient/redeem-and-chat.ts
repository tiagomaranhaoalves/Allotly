import { storage } from "../../../../storage";
import { withBudgetMeta } from "../../meta-budget";
import { McpToolError } from "../../errors";
import { RedeemAndChatInputSchema, type ChatMessage } from "../../schemas";
import { getIdempotentResponse, storeIdempotentResponse, hashPrincipal } from "../../idempotency";
import { checkMcpRateLimit } from "../../auth";
import { callChatCompletion } from "../../proxy-bridge";
import { mapProxyErrorToMcp, selectDefaultModel } from "../consumption/chat";
import { registerTool } from "../registry";

export const REDEEM_AND_CHAT_DESCRIPTION = "Redeem a voucher and run your first chat call in one go. The fastest path from \"I have a code\" to \"I have an answer\".";

registerTool({
  name: "redeem_and_chat",
  description: REDEEM_AND_CHAT_DESCRIPTION,
  inputSchema: RedeemAndChatInputSchema,
  requiresAuth: true,
  voucherOnly: true,
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const code = input.code.toUpperCase();

    if (principal.bearerKind !== "voucher" || principal.voucherCode !== code) {
      throw new McpToolError("Forbidden", "redeem_and_chat must be called with the voucher code as the bearer token", {
        hint: "Set Authorization: Bearer ALLOT-XXXX-XXXX-XXXX and pass the same code as `code`.",
      });
    }

    await checkMcpRateLimit(principal.principalHash, "redeem_and_chat", 10);

    const principalKey = hashPrincipal(`voucher:${code}`);
    const cached = await getIdempotentResponse("redeem_and_chat", input.idempotency_key, principalKey);
    if (cached) return cached;

    const voucher = await storage.getVoucherByCode(code);
    if (!voucher) throw new McpToolError("NotFound", `Voucher ${code} not found`);

    const model = input.model ?? await selectDefaultModel(principal.membership, false, false);
    const body: any = { model, messages: input.messages as ChatMessage[], stream: false };
    if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
    if (input.temperature !== undefined) body.temperature = input.temperature;

    const r = await callChatCompletion({
      membership: principal.membership,
      userId: principal.userId,
      apiKeyId: principal.apiKeyId,
      body,
    });

    const redemption = {
      redeemed: true,
      budget_cents: voucher.budgetCents,
      expires_at: new Date(voucher.expiresAt).toISOString(),
    };

    if (r.status >= 400 || r.errorBody) {
      const err = mapProxyErrorToMcp(r);
      const response = await withBudgetMeta(principal.membership, {
        redemption,
        chat_error: { code: err.name, message: err.message, hint: err.data.hint },
      });
      await storeIdempotentResponse("redeem_and_chat", input.idempotency_key, principalKey, response);
      return response;
    }

    const choice = r.body?.choices?.[0];
    const response = {
      redemption,
      chat: {
        content: typeof choice?.message?.content === "string" ? choice.message.content : "",
        model: r.effectiveModel || model,
        finish_reason: choice?.finish_reason || "stop",
        usage: {
          prompt_tokens: r.inputTokens,
          completion_tokens: r.outputTokens,
          total_tokens: r.inputTokens + r.outputTokens,
          cost_cents: r.costCents,
        },
      },
      _meta: { budget: r.budgetSnapshot },
    };

    await storeIdempotentResponse("redeem_and_chat", input.idempotency_key, principalKey, response);
    return response;
  },
});
