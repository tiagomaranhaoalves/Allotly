import { storage } from "../../../../storage";
import { CompareModelsInputSchema, type ChatMessage } from "../../schemas";
import { withBudgetMeta } from "../../meta-budget";
import { McpToolError } from "../../errors";
import { callChatCompletion } from "../../proxy-bridge";
import { mapProxyErrorToMcp } from "./chat";
import { registerTool } from "../registry";

export const COMPARE_MODELS_DESCRIPTION = "Send the same prompt to multiple models in parallel and get all answers side-by-side. Useful for getting a second opinion or comparing model behaviour on the same task. Per-model failures do not abort the call.";

registerTool({
  name: "compare_models",
  description: COMPARE_MODELS_DESCRIPTION,
  inputSchema: CompareModelsInputSchema,
  requiresAuth: true,
  requiredScope: "mcp",
  annotations: {
    title: "Compare outputs from multiple models",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const allowedModels = principal.membership.allowedModels as string[] | null;
    const offending = allowedModels && allowedModels.length > 0
      ? input.models.filter((m: string) => !allowedModels.includes(m))
      : [];
    if (offending.length > 0) {
      throw new McpToolError("ModelNotAllowed", `Models not allowed: ${offending.join(", ")}`, {
        allowed_models: allowedModels,
        offending_models: offending,
      });
    }

    const messages = input.messages as ChatMessage[];
    const settled = await Promise.allSettled(input.models.map(async (model: string) => {
      const start = Date.now();
      try {
        const body: any = { model, messages, stream: false };
        if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
        if (input.temperature !== undefined) body.temperature = input.temperature;
        const r = await callChatCompletion({
          membership: principal.membership,
          userId: principal.userId,
          apiKeyId: principal.apiKeyId,
          oauthClientId: principal.oauthClientId,
          body,
        });
        const latency = Date.now() - start;
        if (r.status >= 400 || r.errorBody) {
          const err = mapProxyErrorToMcp(r);
          return { model, latency, error: { code: err.name, message: err.message } };
        }
        const choice = r.body?.choices?.[0];
        return {
          model,
          content: typeof choice?.message?.content === "string" ? choice.message.content : "",
          finish_reason: choice?.finish_reason || "stop",
          usage: {
            prompt_tokens: r.inputTokens,
            completion_tokens: r.outputTokens,
            total_tokens: r.inputTokens + r.outputTokens,
            cost_cents: r.costCents,
          },
          latency,
        };
      } catch (err: any) {
        return { model, latency: Date.now() - start, error: { code: err.name || "internal_error", message: err.message } };
      }
    }));

    const results = settled.map((s, i) => {
      if (s.status === "fulfilled") return { latency_ms: s.value.latency, ...s.value, latency: undefined };
      return { model: input.models[i], latency_ms: 0, error: { code: "internal_error", message: String(s.reason) } };
    });

    const totalCost = results.reduce((acc, r: any) => acc + (r.usage?.cost_cents || 0), 0);
    return withBudgetMeta(principal.membership, { results, total_cost_cents: totalCost });
  },
});
