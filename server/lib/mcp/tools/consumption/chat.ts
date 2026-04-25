import { storage } from "../../../../storage";
import { ChatToolInputSchema, type ChatMessage } from "../../schemas";
import { withBudgetMeta } from "../../meta-budget";
import { McpToolError } from "../../errors";
import { callChatCompletion } from "../../proxy-bridge";
import { registerTool } from "../registry";

const VISION_CAPABLE = /gpt-4o|claude-(sonnet|haiku|opus)|gemini/i;
const TOOL_CAPABLE = /gpt|o1|o3|o4|claude|gemini/i;

export async function selectDefaultModel(
  membership: any,
  needsVision: boolean,
  needsTools: boolean,
): Promise<string> {
  const team = await storage.getTeam(membership.teamId);
  if (!team) throw new McpToolError("Forbidden", "Team not available");
  const connections = await storage.getProviderConnectionsByOrg(team.orgId);
  const activeProviders = connections.filter(c => c.status === "ACTIVE").map(c => c.provider);
  const allowedProviders = membership.allowedProviders as string[] | null;
  const allowedModels = membership.allowedModels as string[] | null;
  const filteredProviders = allowedProviders && allowedProviders.length > 0
    ? activeProviders.filter(p => allowedProviders.includes(p))
    : activeProviders;

  const pricing = await storage.getModelPricing();
  const candidates = pricing
    .filter(p => filteredProviders.includes(p.provider))
    .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
    .filter(p => !needsVision || VISION_CAPABLE.test(p.modelId))
    .filter(p => !needsTools || TOOL_CAPABLE.test(p.modelId))
    .sort((a, b) => (a.inputPricePerMTok + a.outputPricePerMTok) - (b.inputPricePerMTok + b.outputPricePerMTok));

  if (candidates.length === 0) {
    throw new McpToolError("ModelNotAllowed", "No allowed model satisfies this request", {
      needs_vision: needsVision,
      needs_tools: needsTools,
    });
  }
  return candidates[0].modelId;
}

function hasImageContent(messages: ChatMessage[]): boolean {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (part && typeof part === "object" && (part as any).type === "image_url") return true;
      }
    }
  }
  return false;
}

function collapseSystem(messages: ChatMessage[], system: string | undefined): ChatMessage[] {
  if (!system) return messages;
  const sysMsg: ChatMessage = { role: "system", content: system };
  return [sysMsg, ...messages];
}

export const CHAT_TOOL_DESCRIPTION = "Send messages to any AI model your Allotly key allows. Returns the assistant's reply and your remaining budget. Supports system prompts, temperature, JSON mode, tool calling, vision input, and streaming. If you don't specify a model, Allotly picks a sensible default within your allowlist.";

registerTool({
  name: "chat",
  description: CHAT_TOOL_DESCRIPTION,
  inputSchema: ChatToolInputSchema,
  requiresAuth: true,
  handler: async (input, ctx) => {
    const principal = ctx.principal!;
    const wantsImages = hasImageContent(input.messages);
    const wantsTools = !!(input.tools && input.tools.length > 0);

    const model = input.model ?? await selectDefaultModel(principal.membership, wantsImages, wantsTools);

    const allowedModels = principal.membership.allowedModels as string[] | null;
    if (allowedModels && allowedModels.length > 0 && !allowedModels.includes(model)) {
      throw new McpToolError("ModelNotAllowed", `Model "${model}" is not in your allowlist`, {
        allowed_models: allowedModels,
      });
    }

    if (wantsImages && !VISION_CAPABLE.test(model)) {
      throw new McpToolError("InvalidInput", "Selected model does not support image input", {
        hint: "Try claude-sonnet-4-6 or gpt-4o.",
      });
    }

    const body: any = {
      model,
      messages: collapseSystem(input.messages as ChatMessage[], input.system),
      stream: false,
    };
    if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
    if (input.temperature !== undefined) body.temperature = input.temperature;
    if (input.top_p !== undefined) body.top_p = input.top_p;
    if (input.response_format !== undefined) body.response_format = input.response_format;
    if (input.tools !== undefined) body.tools = input.tools;
    if (input.tool_choice !== undefined) body.tool_choice = input.tool_choice;

    const result = await callChatCompletion({
      membership: principal.membership,
      userId: principal.userId,
      apiKeyId: principal.apiKeyId,
      body,
    });

    if (result.status >= 400 || result.errorBody) {
      throw mapProxyErrorToMcp(result);
    }

    const choice = result.body?.choices?.[0];
    const content = typeof choice?.message?.content === "string" ? choice.message.content : "";
    const toolCalls = choice?.message?.tool_calls;
    const finishReason = choice?.finish_reason || "stop";

    const out: any = {
      content,
      ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      model: result.effectiveModel || model,
      finish_reason: finishReason,
      usage: {
        prompt_tokens: result.inputTokens,
        completion_tokens: result.outputTokens,
        total_tokens: result.inputTokens + result.outputTokens,
        cost_cents: result.costCents,
      },
      max_tokens_applied: result.maxTokensApplied,
      _meta: { budget: result.budgetSnapshot },
    };
    return out;
  },
});

export function mapProxyErrorToMcp(result: { status: number; errorBody?: any; budgetSnapshot: any }): McpToolError {
  const status = result.status;
  const code = result.errorBody?.code || "internal_error";
  const message = result.errorBody?.message || "Proxy returned an error";

  if (status === 401) return new McpToolError("Unauthorised", message);
  if (status === 402) return new McpToolError("BudgetExceeded", message, { _meta: { budget: result.budgetSnapshot } });
  if (status === 403 && code === "model_not_allowed") return new McpToolError("ModelNotAllowed", message);
  if (status === 403 && code === "provider_not_allowed") return new McpToolError("Forbidden", message);
  if (status === 429 && code === "concurrency_limit") return new McpToolError("ConcurrencyLimited", message);
  if (status === 429) return new McpToolError("RateLimited", message);
  if (status >= 500 && status < 600) return new McpToolError("ProviderError", message, { upstream_status: status });
  return new McpToolError("InvalidInput", message, { code, status });
}
