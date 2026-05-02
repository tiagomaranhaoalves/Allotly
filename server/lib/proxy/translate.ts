import { storage } from "../../storage";
import { redisGet, redisSet, REDIS_KEYS } from "../redis";
import { DEFAULT_AZURE_API_VERSION } from "../providers/azure-openai";
import type { AzureDeploymentMapping } from "@shared/schema";

export type ProviderType = "OPENAI" | "ANTHROPIC" | "GOOGLE" | "AZURE_OPENAI";

const OPENAI_ALLOWED_PARAMS = new Set([
  "model", "messages", "max_tokens", "max_completion_tokens", "temperature",
  "top_p", "n", "stream", "stop", "presence_penalty", "frequency_penalty",
  "logit_bias", "logprobs", "top_logprobs", "user", "response_format", "seed",
  "tools", "tool_choice", "parallel_tool_calls", "stream_options",
  "reasoning_effort", "modalities", "audio", "store", "metadata",
]);

const ANTHROPIC_ALLOWED_PARAMS = new Set([
  "model", "messages", "max_tokens", "temperature", "top_p", "top_k",
  "stream", "stop_sequences", "system", "metadata", "tools", "tool_choice",
]);

const GOOGLE_ALLOWED_PARAMS = new Set([
  "contents", "generationConfig", "systemInstruction",
  "safetySettings", "tools", "toolConfig",
]);

export function sanitizeProviderBody(body: any, provider: ProviderType): any {
  const allowedSet = provider === "OPENAI" || provider === "AZURE_OPENAI"
    ? OPENAI_ALLOWED_PARAMS
    : provider === "ANTHROPIC" ? ANTHROPIC_ALLOWED_PARAMS
    : GOOGLE_ALLOWED_PARAMS;

  const sanitized: any = {};
  for (const key of Object.keys(body)) {
    if (allowedSet.has(key)) {
      sanitized[key] = body[key];
    }
  }
  return sanitized;
}

export interface DetectProviderResult {
  provider: ProviderType;
  azureDeployment?: AzureDeploymentMapping;
}

export async function getAzureDeployments(orgId: string): Promise<AzureDeploymentMapping[]> {
  const cacheKey = REDIS_KEYS.azureDeployments(orgId);
  const cached = await redisGet(cacheKey);
  if (cached) return JSON.parse(cached);

  const connections = await storage.getProviderConnectionsByOrg(orgId);
  const azureConns = connections.filter(c => c.provider === "AZURE_OPENAI" && c.status === "ACTIVE");
  if (azureConns.length === 0) return [];

  const allDeployments: AzureDeploymentMapping[] = [];
  for (const conn of azureConns) {
    if (conn.azureDeployments) {
      allDeployments.push(...(conn.azureDeployments as AzureDeploymentMapping[]));
    }
  }

  if (allDeployments.length > 0) {
    await redisSet(cacheKey, JSON.stringify(allDeployments), 300);
  }
  return allDeployments;
}

const OPENAI_COMPATIBLE_MODEL = /^(gpt-|o1|o3|o4)/;

export async function detectProvider(model: string, orgId?: string): Promise<DetectProviderResult & { strippedModel?: string } | null> {
  if (model.startsWith("azure/")) {
    const deploymentName = model.slice(6);
    if (orgId) {
      const deployments = await getAzureDeployments(orgId);
      const deployment = deployments.find(d => d.deploymentName === deploymentName);
      if (deployment) {
        return { provider: "AZURE_OPENAI", azureDeployment: deployment, strippedModel: deploymentName };
      }
    }
    return {
      provider: "AZURE_OPENAI",
      azureDeployment: {
        deploymentName,
        modelId: deploymentName,
        inputPricePerMTok: 0,
        outputPricePerMTok: 0,
      },
      strippedModel: deploymentName,
    };
  }

  if (OPENAI_COMPATIBLE_MODEL.test(model)) return { provider: "OPENAI" };
  if (model.startsWith("claude-")) return { provider: "ANTHROPIC" };
  if (model.startsWith("gemini-")) return { provider: "GOOGLE" };

  return null;
}

export function getProviderBaseUrl(provider: ProviderType): string {
  switch (provider) {
    case "OPENAI": return "https://api.openai.com";
    case "ANTHROPIC": return "https://api.anthropic.com";
    case "GOOGLE": return "https://generativelanguage.googleapis.com";
    case "AZURE_OPENAI": return "";
  }
}

interface ChatMessage {
  role: string;
  content: string | any[];
}

interface OpenAIRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  [key: string]: any;
}

export interface AzureContext {
  baseUrl: string;
  endpointMode: "v1" | "legacy";
  apiVersion?: string;
  deploymentName: string;
  modelId: string;
}

function normalizeTokenCap(
  body: any,
  isReasoningModel: boolean,
  effectiveValue: number | undefined,
  originalRequest: any,
): void {
  delete body.max_tokens;
  delete body.max_completion_tokens;

  if (!effectiveValue) return;

  if (isReasoningModel) {
    body.max_completion_tokens = effectiveValue;
    return;
  }

  const clientSentMCT = originalRequest.max_completion_tokens !== undefined;
  const clientSentMT = originalRequest.max_tokens !== undefined;

  if (clientSentMCT) {
    body.max_completion_tokens = effectiveValue;
  } else if (clientSentMT) {
    body.max_tokens = effectiveValue;
  } else {
    body.max_completion_tokens = effectiveValue;
  }
}

export function translateToProvider(
  request: OpenAIRequest,
  provider: ProviderType,
  effectiveMaxTokens?: number,
  azureContext?: AzureContext
): { url: string; body: any; headers: Record<string, string>; method: string; proxyStopSequences?: string[] } {
  const maxTokens = effectiveMaxTokens ?? request.max_completion_tokens ?? request.max_tokens;

  if (provider === "OPENAI") {
    const isReasoningModel = /^(o1|o3|o4|gpt-5)/.test(request.model);
    const body = { ...request };
    normalizeTokenCap(body, isReasoningModel, maxTokens, request);
    return {
      url: "https://api.openai.com/v1/chat/completions",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    };
  }

  if (provider === "AZURE_OPENAI") {
    if (!azureContext) throw new Error("Azure context required for AZURE_OPENAI provider");

    const isReasoningModel = /^(o1|o3|o4|gpt-5)/.test(azureContext.modelId);
    const body = { ...request };
    normalizeTokenCap(body, isReasoningModel, maxTokens, request);

    let url: string;
    const baseUrl = azureContext.baseUrl.replace(/\/$/, "");

    if (azureContext.endpointMode === "v1") {
      url = `${baseUrl}/openai/v1/chat/completions`;
      body.model = azureContext.deploymentName;
    } else {
      url = `${baseUrl}/openai/deployments/${encodeURIComponent(azureContext.deploymentName)}/chat/completions?api-version=${azureContext.apiVersion || DEFAULT_AZURE_API_VERSION}`;
      delete body.model;
    }

    if (body.stream) {
      body.stream_options = { include_usage: true };
    }

    return {
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    };
  }

  if (provider === "ANTHROPIC") {
    const systemMessages = request.messages.filter(m => m.role === "system");
    const nonSystemMessages = request.messages.filter(m => m.role !== "system");
    const systemText = systemMessages.map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content)).join("\n");

    const anthropicBody: any = {
      model: request.model,
      messages: nonSystemMessages.map(m => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
      max_tokens: maxTokens || 4096,
      stream: request.stream ?? false,
    };

    if (systemText) anthropicBody.system = systemText;
    if (request.temperature !== undefined) anthropicBody.temperature = request.temperature;
    if (request.top_p !== undefined) anthropicBody.top_p = request.top_p;
    if (request.stop) {
      anthropicBody.stop_sequences = Array.isArray(request.stop) ? request.stop : [request.stop];
    }

    return {
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: anthropicBody,
    };
  }

  if (provider === "GOOGLE") {
    const isThinkingModel = /^gemini-2\.5-(flash|pro)/.test(request.model) && !/lite/.test(request.model);

    const contents = request.messages
      .filter(m => m.role !== "system")
      .map(m => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
      }));

    const systemInstruction = request.messages
      .filter(m => m.role === "system")
      .map(m => typeof m.content === "string" ? m.content : JSON.stringify(m.content))
      .join("\n");

    const googleBody: any = { contents };
    if (systemInstruction) {
      googleBody.systemInstruction = { parts: [{ text: systemInstruction }] };
    }
    const stopSequences = request.stop
      ? (Array.isArray(request.stop) ? request.stop : [request.stop])
      : [];
    const hasStopSequences = stopSequences.length > 0;

    const generationConfig: any = {};
    let proxyStopSequences: string[] | undefined;

    if (isThinkingModel) {
      generationConfig.maxOutputTokens = maxTokens ? Math.max(maxTokens, 16384) : 65536;
      generationConfig.thinkingConfig = { thinkingBudget: 8192 };
      if (hasStopSequences) {
        proxyStopSequences = stopSequences;
      }
    } else {
      if (maxTokens) generationConfig.maxOutputTokens = maxTokens;
      if (hasStopSequences) {
        generationConfig.stopSequences = stopSequences;
      }
    }
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.top_p !== undefined) generationConfig.topP = request.top_p;
    googleBody.generationConfig = generationConfig;

    const streamSuffix = request.stream ? ":streamGenerateContent?alt=sse" : ":generateContent";
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${request.model}${streamSuffix}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: googleBody,
      proxyStopSequences,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export function setProviderAuth(
  headers: Record<string, string>,
  provider: ProviderType,
  apiKey: string,
  url: string
): { headers: Record<string, string>; url: string } {
  if (provider === "OPENAI") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  } else if (provider === "ANTHROPIC") {
    headers["x-api-key"] = apiKey;
  } else if (provider === "GOOGLE") {
    const separator = url.includes("?") ? "&" : "?";
    url = `${url}${separator}key=${apiKey}`;
  } else if (provider === "AZURE_OPENAI") {
    headers["api-key"] = apiKey;
  }
  return { headers, url };
}

interface OpenAIChoice {
  index: number;
  message: { role: string; content: string | null };
  finish_reason: string | null;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export function extractGoogleText(candidate: any): string {
  if (!candidate) return "";

  if (candidate?.content?.parts) {
    const parts = candidate.content.parts;
    const visibleParts = parts.filter((p: any) => !p.thought);

    if (visibleParts.length > 0) {
      const text = visibleParts.map((p: any) => p.text).filter(Boolean).join("");
      if (text) return text;
    }

    if (parts.length > 0 && visibleParts.length === 0) {
      const lastPart = parts[parts.length - 1];
      if (lastPart?.text) return lastPart.text;
    }
  }

  if (candidate?.output?.text) {
    return candidate.output.text;
  }

  if (candidate?.groundingContent?.parts) {
    return candidate.groundingContent.parts.map((p: any) => p.text).filter(Boolean).join("");
  }

  return "";
}

export function extractGoogleStreamText(candidate: any): { text: string; isThinkingOnly: boolean } {
  if (!candidate?.content?.parts) return { text: "", isThinkingOnly: false };

  const parts = candidate.content.parts;
  const visibleParts = parts.filter((p: any) => !p.thought);
  const text = visibleParts.map((p: any) => p.text).filter(Boolean).join("");

  const isThinkingOnly = parts.length > 0 && visibleParts.length === 0;
  return { text, isThinkingOnly };
}

export function applyStopSequences(
  text: string,
  stopSequences?: string[]
): { text: string; stopped: boolean } {
  if (!stopSequences || stopSequences.length === 0 || !text) {
    return { text, stopped: false };
  }
  let earliestIndex = text.length;
  let found = false;
  for (const seq of stopSequences) {
    const index = text.indexOf(seq);
    if (index !== -1 && index < earliestIndex) {
      earliestIndex = index;
      found = true;
    }
  }
  if (found) {
    return { text: text.substring(0, earliestIndex), stopped: true };
  }
  return { text, stopped: false };
}

export function translateResponseToOpenAI(
  provider: ProviderType,
  body: any,
  model: string,
  proxyStopSequences?: string[]
): OpenAIResponse {
  if (provider === "OPENAI" || provider === "AZURE_OPENAI") return body;

  if (provider === "ANTHROPIC") {
    const text = body.content?.map((c: any) => c.text || "").join("") || "";
    return {
      id: body.id || `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: body.model || model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: body.stop_reason === "end_turn" ? "stop" : (body.stop_reason || "stop"),
      }],
      usage: {
        prompt_tokens: body.usage?.input_tokens || 0,
        completion_tokens: body.usage?.output_tokens || 0,
        total_tokens: (body.usage?.input_tokens || 0) + (body.usage?.output_tokens || 0),
      },
    };
  }

  if (provider === "GOOGLE") {
    const candidate = body.candidates?.[0];
    let text = extractGoogleText(candidate);
    const promptTokens = body.usageMetadata?.promptTokenCount || 0;
    const completionTokens = body.usageMetadata?.candidatesTokenCount || 0;
    const thinkingTokens = body.usageMetadata?.thoughtsTokenCount || 0;
    const usage: Record<string, number> = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    };
    if (thinkingTokens > 0) usage.thinking_tokens = thinkingTokens;

    const { text: finalText, stopped } = applyStopSequences(text, proxyStopSequences);

    return {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: finalText },
        finish_reason: stopped ? "stop" : (candidate?.finishReason === "STOP" ? "stop" : (candidate?.finishReason?.toLowerCase() || "stop")),
      }],
      usage,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export function translateStreamChunkToOpenAI(
  provider: ProviderType,
  chunk: any,
  model: string
): { sseData: string; done: boolean; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } } | null {
  if (provider === "OPENAI" || provider === "AZURE_OPENAI") {
    if (chunk === "[DONE]") return { sseData: "data: [DONE]\n\n", done: true };
    try {
      const parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk;
      const usage = parsed.usage || undefined;
      return {
        sseData: `data: ${JSON.stringify(parsed)}\n\n`,
        done: parsed.choices?.[0]?.finish_reason != null,
        usage,
      };
    } catch { return null; }
  }

  if (provider === "ANTHROPIC") {
    try {
      const parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk;
      if (parsed.type === "message_start") return null;
      if (parsed.type === "content_block_start") return null;
      if (parsed.type === "ping") return null;

      if (parsed.type === "content_block_delta") {
        const text = parsed.delta?.text || "";
        const sseChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        };
        return { sseData: `data: ${JSON.stringify(sseChunk)}\n\n`, done: false };
      }

      if (parsed.type === "message_delta") {
        const sseChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, delta: {}, finish_reason: parsed.delta?.stop_reason === "end_turn" ? "stop" : "stop" }],
        };
        const usage = parsed.usage ? {
          prompt_tokens: 0,
          completion_tokens: parsed.usage.output_tokens || 0,
          total_tokens: parsed.usage.output_tokens || 0,
        } : undefined;
        return { sseData: `data: ${JSON.stringify(sseChunk)}\n\n`, done: true, usage };
      }

      if (parsed.type === "message_stop") {
        return { sseData: "data: [DONE]\n\n", done: true };
      }

      return null;
    } catch { return null; }
  }

  if (provider === "GOOGLE") {
    try {
      const parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk;
      const candidate = parsed.candidates?.[0];
      const { text, isThinkingOnly } = extractGoogleStreamText(candidate);
      const done = candidate?.finishReason === "STOP" || candidate?.finishReason != null;

      const gPrompt = parsed.usageMetadata?.promptTokenCount || 0;
      const gCompletion = parsed.usageMetadata?.candidatesTokenCount || 0;
      const gThinking = parsed.usageMetadata?.thoughtsTokenCount || 0;
      const usage = parsed.usageMetadata ? {
        prompt_tokens: gPrompt,
        completion_tokens: gCompletion,
        total_tokens: gPrompt + gCompletion,
        ...(gThinking > 0 && { thinking_tokens: gThinking }),
      } : undefined;

      if (isThinkingOnly && !done) {
        return { sseData: "", done: false, usage };
      }

      const sseChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [{ index: 0, delta: { content: text }, finish_reason: done ? "stop" : null }],
      };

      return { sseData: `data: ${JSON.stringify(sseChunk)}\n\n`, done, usage };
    } catch { return null; }
  }

  return null;
}

// =============================================================================
// Anthropic-native translations (M3b — /api/v1/messages)
// =============================================================================

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | any[];
}

export interface AnthropicMessagesRequestLike {
  model?: string;
  messages: AnthropicMessage[];
  system?: string | any[];
  max_tokens: number;
  metadata?: any;
  stop_sequences?: string[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  tools?: any[];
  tool_choice?: any;
  thinking?: any;
  [key: string]: any;
}

const ANTHROPIC_NATIVE_FIELD_KEYS = ["cache_control", "thinking", "citations"];

function flattenSystem(system: string | any[] | undefined): string {
  if (!system) return "";
  if (typeof system === "string") return system;
  if (Array.isArray(system)) {
    return system
      .map(b => typeof b === "string" ? b : (b?.text || ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function blocksToText(content: string | any[]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(b => b?.type === "text")
    .map(b => b.text || "")
    .join("");
}

function detectAnthropicDroppedFields(req: AnthropicMessagesRequestLike): Set<string> {
  const dropped = new Set<string>();
  if (req.thinking !== undefined) dropped.add("thinking");

  const scan = (content: any) => {
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      if (block.cache_control !== undefined) dropped.add("cache_control");
      if (block.citations !== undefined) dropped.add("citations");
    }
  };
  for (const m of req.messages) scan(m.content);
  if (Array.isArray(req.system)) scan(req.system);
  if (Array.isArray(req.tools)) {
    for (const t of req.tools) {
      if (t?.cache_control !== undefined) dropped.add("cache_control");
    }
  }
  return dropped;
}

export function getAnthropicDroppedFields(
  req: AnthropicMessagesRequestLike,
  provider: ProviderType,
): string[] {
  if (provider === "ANTHROPIC") return [];
  return Array.from(detectAnthropicDroppedFields(req));
}

function anthropicContentToOpenAIParts(content: string | any[]): any {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  const parts: any[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text") {
      parts.push({ type: "text", text: block.text || "" });
    } else if (block.type === "image") {
      const src = block.source;
      if (src?.type === "base64" && src.media_type && src.data) {
        parts.push({ type: "image_url", image_url: { url: `data:${src.media_type};base64,${src.data}` } });
      } else if (src?.type === "url" && src.url) {
        parts.push({ type: "image_url", image_url: { url: src.url } });
      }
    }
    // thinking / document / cache_control / citations are dropped silently.
  }

  if (parts.length === 0) return "";
  if (parts.length === 1 && parts[0].type === "text") return parts[0].text;
  return parts;
}

function anthropicMessagesToOpenAI(req: AnthropicMessagesRequestLike): any[] {
  const out: any[] = [];

  const sysText = flattenSystem(req.system);
  if (sysText) out.push({ role: "system", content: sysText });

  for (const msg of req.messages) {
    const content = msg.content;

    if (msg.role === "assistant") {
      const toolCalls: any[] = [];
      const textParts: any[] = [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "tool_use") {
            toolCalls.push({
              id: block.id,
              type: "function",
              function: {
                name: block.name,
                arguments: typeof block.input === "string" ? block.input : JSON.stringify(block.input ?? {}),
              },
            });
          } else if (block.type === "text") {
            textParts.push({ type: "text", text: block.text || "" });
          }
        }
      }
      const asstMsg: any = { role: "assistant" };
      if (typeof content === "string") {
        asstMsg.content = content;
      } else if (textParts.length > 0) {
        asstMsg.content = textParts.length === 1 ? textParts[0].text : textParts;
      } else {
        asstMsg.content = null;
      }
      if (toolCalls.length > 0) asstMsg.tool_calls = toolCalls;
      out.push(asstMsg);
      continue;
    }

    // user role
    const toolResults: any[] = [];
    const userBlocks: any[] = [];
    if (Array.isArray(content)) {
      for (const block of content) {
        if (!block || typeof block !== "object") continue;
        if (block.type === "tool_result") {
          let resultContent: string;
          if (typeof block.content === "string") resultContent = block.content;
          else if (Array.isArray(block.content)) {
            resultContent = block.content
              .filter((b: any) => b?.type === "text")
              .map((b: any) => b.text || "")
              .join("");
          } else {
            resultContent = "";
          }
          toolResults.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content: resultContent,
          });
        } else {
          userBlocks.push(block);
        }
      }
    }

    if (typeof content === "string") {
      out.push({ role: "user", content });
    } else if (userBlocks.length > 0) {
      out.push({ role: "user", content: anthropicContentToOpenAIParts(userBlocks) });
    }
    out.push(...toolResults);
  }

  return out;
}

function anthropicToolsToOpenAI(tools: any[] | undefined): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map(t => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function anthropicToolChoiceToOpenAI(choice: any): any {
  if (!choice) return undefined;
  if (choice.type === "auto") return "auto";
  if (choice.type === "any") return "required";
  if (choice.type === "none") return "none";
  if (choice.type === "tool" && choice.name) {
    return { type: "function", function: { name: choice.name } };
  }
  return undefined;
}

function anthropicContentToGoogleParts(content: string | any[]): any[] {
  if (typeof content === "string") return [{ text: content }];
  if (!Array.isArray(content)) return [];
  const parts: any[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text") {
      parts.push({ text: block.text || "" });
    } else if (block.type === "image") {
      const src = block.source;
      if (src?.type === "base64" && src.media_type && src.data) {
        parts.push({ inline_data: { mime_type: src.media_type, data: src.data } });
      } else if (src?.type === "url" && src.url) {
        parts.push({ file_data: { file_uri: src.url } });
      }
    } else if (block.type === "tool_use") {
      parts.push({ functionCall: { name: block.name, args: block.input ?? {} } });
    } else if (block.type === "tool_result") {
      let response: any;
      if (typeof block.content === "string") response = { content: block.content };
      else if (Array.isArray(block.content)) {
        response = {
          content: block.content
            .filter((b: any) => b?.type === "text")
            .map((b: any) => b.text || "")
            .join(""),
        };
      } else response = {};
      parts.push({ functionResponse: { name: block.tool_use_id, response } });
    }
  }
  return parts;
}

function anthropicMessagesToGoogleContents(messages: AnthropicMessage[]): any[] {
  return messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: anthropicContentToGoogleParts(m.content),
  }));
}

function anthropicToolsToGoogle(tools: any[] | undefined): any[] | undefined {
  if (!tools || tools.length === 0) return undefined;
  return [{
    functionDeclarations: tools.map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

export function translateAnthropicToProvider(
  request: AnthropicMessagesRequestLike,
  provider: ProviderType,
  effectiveMaxTokens?: number,
  azureContext?: AzureContext,
): { url: string; body: any; headers: Record<string, string>; method: string; proxyStopSequences?: string[] } {
  const maxTokens = effectiveMaxTokens ?? request.max_tokens;
  const model = request.model || "";

  if (provider === "ANTHROPIC") {
    const body: any = {
      model,
      messages: request.messages,
      max_tokens: maxTokens,
    };
    if (request.system !== undefined) body.system = request.system;
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.top_p !== undefined) body.top_p = request.top_p;
    if (request.top_k !== undefined) body.top_k = request.top_k;
    if (request.stop_sequences) body.stop_sequences = request.stop_sequences;
    if (request.stream) body.stream = true;
    if (request.metadata) body.metadata = request.metadata;
    if (request.tools) body.tools = request.tools;
    if (request.tool_choice) body.tool_choice = request.tool_choice;
    if (request.thinking) body.thinking = request.thinking;
    return {
      url: "https://api.anthropic.com/v1/messages",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body,
    };
  }

  if (provider === "OPENAI" || provider === "AZURE_OPENAI") {
    const isReasoningModel = /^(o1|o3|o4|gpt-5)/.test(model);
    const messages = anthropicMessagesToOpenAI(request);
    const body: any = { model, messages };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    if (request.top_p !== undefined) body.top_p = request.top_p;
    if (request.stop_sequences) body.stop = request.stop_sequences;
    if (request.stream) {
      body.stream = true;
      body.stream_options = { include_usage: true };
    }
    const tools = anthropicToolsToOpenAI(request.tools);
    if (tools) body.tools = tools;
    const toolChoice = anthropicToolChoiceToOpenAI(request.tool_choice);
    if (toolChoice !== undefined) body.tool_choice = toolChoice;

    normalizeTokenCap(body, isReasoningModel, maxTokens, { max_tokens: request.max_tokens });

    if (provider === "OPENAI") {
      return {
        url: "https://api.openai.com/v1/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      };
    }

    if (!azureContext) throw new Error("Azure context required for AZURE_OPENAI provider");
    const baseUrl = azureContext.baseUrl.replace(/\/$/, "");
    let url: string;
    if (azureContext.endpointMode === "v1") {
      url = `${baseUrl}/openai/v1/chat/completions`;
      body.model = azureContext.deploymentName;
    } else {
      url = `${baseUrl}/openai/deployments/${encodeURIComponent(azureContext.deploymentName)}/chat/completions?api-version=${azureContext.apiVersion || DEFAULT_AZURE_API_VERSION}`;
      delete body.model;
    }
    return {
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    };
  }

  if (provider === "GOOGLE") {
    const isThinkingModel = /^gemini-2\.5-(flash|pro)/.test(model) && !/lite/.test(model);
    const contents = anthropicMessagesToGoogleContents(request.messages);
    const systemText = flattenSystem(request.system);

    const body: any = { contents };
    if (systemText) body.systemInstruction = { parts: [{ text: systemText }] };

    const stopSequences = request.stop_sequences || [];
    const generationConfig: any = {};
    let proxyStopSequences: string[] | undefined;

    if (isThinkingModel) {
      generationConfig.maxOutputTokens = maxTokens ? Math.max(maxTokens, 16384) : 65536;
      generationConfig.thinkingConfig = { thinkingBudget: 8192 };
      if (stopSequences.length > 0) proxyStopSequences = stopSequences;
    } else {
      if (maxTokens) generationConfig.maxOutputTokens = maxTokens;
      if (stopSequences.length > 0) generationConfig.stopSequences = stopSequences;
    }
    if (request.temperature !== undefined) generationConfig.temperature = request.temperature;
    if (request.top_p !== undefined) generationConfig.topP = request.top_p;
    if (request.top_k !== undefined) generationConfig.topK = request.top_k;
    body.generationConfig = generationConfig;

    const tools = anthropicToolsToGoogle(request.tools);
    if (tools) body.tools = tools;

    const streamSuffix = request.stream ? ":streamGenerateContent?alt=sse" : ":generateContent";
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${model}${streamSuffix}`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      proxyStopSequences,
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

export interface AnthropicResponseShape {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: any[];
  stop_reason: string | null;
  stop_sequence: string | null;
  usage: { input_tokens: number; output_tokens: number };
}

function mapOpenAIFinishToAnthropic(finish: string | null | undefined): string | null {
  if (!finish) return null;
  switch (finish) {
    case "stop": return "end_turn";
    case "length": return "max_tokens";
    case "tool_calls":
    case "function_call": return "tool_use";
    case "content_filter": return "stop_sequence";
    default: return finish;
  }
}

function mapGoogleFinishToAnthropic(finish: string | null | undefined): string | null {
  if (!finish) return null;
  switch (finish) {
    case "STOP": return "end_turn";
    case "MAX_TOKENS": return "max_tokens";
    case "SAFETY":
    case "RECITATION":
    case "BLOCKLIST":
    case "PROHIBITED_CONTENT":
    case "SPII":
    case "OTHER": return "stop_sequence";
    default: return finish.toLowerCase();
  }
}

function safeJsonParse(input: any): any {
  if (input == null) return {};
  if (typeof input === "object") return input;
  if (typeof input !== "string") return {};
  try { return JSON.parse(input); } catch { return {}; }
}

export function translateResponseToAnthropic(
  provider: ProviderType,
  body: any,
  model: string,
  proxyStopSequences?: string[],
): AnthropicResponseShape {
  if (provider === "ANTHROPIC") {
    return {
      id: body.id || `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: body.model || model,
      content: Array.isArray(body.content) ? body.content : [],
      stop_reason: body.stop_reason ?? null,
      stop_sequence: body.stop_sequence ?? null,
      usage: {
        input_tokens: body.usage?.input_tokens || 0,
        output_tokens: body.usage?.output_tokens || 0,
      },
    };
  }

  if (provider === "OPENAI" || provider === "AZURE_OPENAI") {
    const choice = body.choices?.[0];
    const msg = choice?.message || {};
    const content: any[] = [];
    const text = typeof msg.content === "string" ? msg.content : "";
    if (text) content.push({ type: "text", text });
    if (Array.isArray(msg.tool_calls)) {
      for (const tc of msg.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function?.name,
          input: safeJsonParse(tc.function?.arguments),
        });
      }
    }
    return {
      id: body.id || `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model: body.model || model,
      content,
      stop_reason: mapOpenAIFinishToAnthropic(choice?.finish_reason),
      stop_sequence: null,
      usage: {
        input_tokens: body.usage?.prompt_tokens || 0,
        output_tokens: body.usage?.completion_tokens || 0,
      },
    };
  }

  if (provider === "GOOGLE") {
    const candidate = body.candidates?.[0];
    let text = extractGoogleText(candidate);
    let stopReasonOverride: string | null = null;
    if (proxyStopSequences && proxyStopSequences.length > 0) {
      const result = applyStopSequences(text, proxyStopSequences);
      text = result.text;
      if (result.stopped) stopReasonOverride = "stop_sequence";
    }

    const content: any[] = [];
    if (text) content.push({ type: "text", text });
    if (Array.isArray(candidate?.content?.parts)) {
      for (const part of candidate.content.parts) {
        if (part?.functionCall) {
          content.push({
            type: "tool_use",
            id: `toolu_${Date.now()}_${content.length}`,
            name: part.functionCall.name,
            input: part.functionCall.args ?? {},
          });
        }
      }
    }

    return {
      id: `msg_${Date.now()}`,
      type: "message",
      role: "assistant",
      model,
      content,
      stop_reason: stopReasonOverride || mapGoogleFinishToAnthropic(candidate?.finishReason),
      stop_sequence: null,
      usage: {
        input_tokens: body.usageMetadata?.promptTokenCount || 0,
        output_tokens: body.usageMetadata?.candidatesTokenCount || 0,
      },
    };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// =============================================================================
// Anthropic-native streaming chunk re-framing (used by streaming.ts)
// =============================================================================

export interface AnthropicStreamState {
  messageId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  textBlockOpen: boolean;
  textBlockIndex: number;
  // Tracks open tool_use blocks keyed by their content-block index.
  toolBlocks: Map<number, { id: string; name: string; argsBuffer: string }>;
  nextBlockIndex: number;
  messageStartSent: boolean;
  stopReason: string | null;
  stopSequence: string | null;
  fullText: string;
}

export function createAnthropicStreamState(model: string): AnthropicStreamState {
  return {
    messageId: `msg_${Date.now()}`,
    model,
    inputTokens: 0,
    outputTokens: 0,
    textBlockOpen: false,
    textBlockIndex: -1,
    toolBlocks: new Map(),
    nextBlockIndex: 0,
    messageStartSent: false,
    stopReason: null,
    stopSequence: null,
    fullText: "",
  };
}

export interface AnthropicEvent {
  event: string;
  data: any;
}

function ev(event: string, data: any): AnthropicEvent {
  return { event, data: { type: event, ...data } };
}

function emitMessageStart(state: AnthropicStreamState): AnthropicEvent[] {
  if (state.messageStartSent) return [];
  state.messageStartSent = true;
  return [{
    event: "message_start",
    data: {
      type: "message_start",
      message: {
        id: state.messageId,
        type: "message",
        role: "assistant",
        model: state.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: state.inputTokens, output_tokens: 0 },
      },
    },
  }];
}

function ensureTextBlockOpen(state: AnthropicStreamState): AnthropicEvent[] {
  if (state.textBlockOpen) return [];
  state.textBlockOpen = true;
  state.textBlockIndex = state.nextBlockIndex++;
  return [ev("content_block_start", {
    index: state.textBlockIndex,
    content_block: { type: "text", text: "" },
  })];
}

function closeTextBlock(state: AnthropicStreamState): AnthropicEvent[] {
  if (!state.textBlockOpen) return [];
  const idx = state.textBlockIndex;
  state.textBlockOpen = false;
  state.textBlockIndex = -1;
  return [ev("content_block_stop", { index: idx })];
}

function closeAllToolBlocks(state: AnthropicStreamState): AnthropicEvent[] {
  const events: AnthropicEvent[] = [];
  for (const idx of Array.from(state.toolBlocks.keys())) {
    events.push(ev("content_block_stop", { index: idx }));
  }
  state.toolBlocks.clear();
  return events;
}

/**
 * Translate one upstream stream chunk into Anthropic SSE events.
 * Returns [] when the chunk produces no user-visible events.
 */
export function translateStreamChunkToAnthropic(
  provider: ProviderType,
  chunk: any,
  state: AnthropicStreamState,
): AnthropicEvent[] {
  if (provider === "ANTHROPIC") {
    if (chunk == null) return [];
    let parsed: any;
    try { parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk; } catch { return []; }
    if (!parsed?.type) return [];
    if (parsed.type === "message_start") {
      state.messageStartSent = true;
      const usage = parsed.message?.usage;
      if (usage?.input_tokens) state.inputTokens = usage.input_tokens;
      if (parsed.message?.id) state.messageId = parsed.message.id;
    }
    if (parsed.type === "message_delta" && parsed.usage?.output_tokens != null) {
      state.outputTokens = parsed.usage.output_tokens;
      if (parsed.delta?.stop_reason) state.stopReason = parsed.delta.stop_reason;
      if (parsed.delta?.stop_sequence) state.stopSequence = parsed.delta.stop_sequence;
    }
    return [{ event: parsed.type, data: parsed }];
  }

  if (provider === "OPENAI" || provider === "AZURE_OPENAI") {
    if (chunk === "[DONE]") return [];
    let parsed: any;
    try { parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk; } catch { return []; }
    const events: AnthropicEvent[] = [];

    if (parsed.usage?.prompt_tokens != null && state.inputTokens === 0) {
      state.inputTokens = parsed.usage.prompt_tokens;
    }
    if (parsed.usage?.completion_tokens != null) {
      state.outputTokens = parsed.usage.completion_tokens;
    }

    events.push(...emitMessageStart(state));

    const choice = parsed.choices?.[0];
    if (!choice) return events;

    const delta = choice.delta || {};
    const textDelta = typeof delta.content === "string" ? delta.content : "";
    if (textDelta) {
      events.push(...ensureTextBlockOpen(state));
      state.fullText += textDelta;
      events.push(ev("content_block_delta", {
        index: state.textBlockIndex,
        delta: { type: "text_delta", text: textDelta },
      }));
    }

    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const tcIndex = typeof tc.index === "number" ? tc.index : 0;
        // Look up the tool block for this OpenAI tool-call index.
        let blockIdx = -1;
        for (const [idx, info] of state.toolBlocks.entries()) {
          if ((info as any).openaiIndex === tcIndex) { blockIdx = idx; break; }
        }
        if (blockIdx === -1) {
          // First chunk for this tool call: close any open text block, open a tool_use block.
          events.push(...closeTextBlock(state));
          blockIdx = state.nextBlockIndex++;
          const toolInfo: any = {
            id: tc.id || `toolu_${Date.now()}_${blockIdx}`,
            name: tc.function?.name || "",
            argsBuffer: "",
            openaiIndex: tcIndex,
          };
          state.toolBlocks.set(blockIdx, toolInfo);
          events.push(ev("content_block_start", {
            index: blockIdx,
            content_block: { type: "tool_use", id: toolInfo.id, name: toolInfo.name, input: {} },
          }));
        }
        const toolInfo = state.toolBlocks.get(blockIdx)!;
        const argsChunk = tc.function?.arguments;
        if (typeof argsChunk === "string" && argsChunk.length > 0) {
          toolInfo.argsBuffer += argsChunk;
          events.push(ev("content_block_delta", {
            index: blockIdx,
            delta: { type: "input_json_delta", partial_json: argsChunk },
          }));
        }
      }
    }

    if (choice.finish_reason) {
      events.push(...closeTextBlock(state));
      events.push(...closeAllToolBlocks(state));
      state.stopReason = mapOpenAIFinishToAnthropic(choice.finish_reason);
      events.push(ev("message_delta", {
        delta: { stop_reason: state.stopReason, stop_sequence: state.stopSequence },
        usage: { output_tokens: state.outputTokens },
      }));
      events.push(ev("message_stop", {}));
    }

    return events;
  }

  if (provider === "GOOGLE") {
    let parsed: any;
    try { parsed = typeof chunk === "string" ? JSON.parse(chunk) : chunk; } catch { return []; }
    const events: AnthropicEvent[] = [];

    if (parsed.usageMetadata?.promptTokenCount != null && state.inputTokens === 0) {
      state.inputTokens = parsed.usageMetadata.promptTokenCount;
    }
    if (parsed.usageMetadata?.candidatesTokenCount != null) {
      state.outputTokens = parsed.usageMetadata.candidatesTokenCount;
    }

    events.push(...emitMessageStart(state));

    const candidate = parsed.candidates?.[0];
    if (!candidate) return events;

    const { text } = extractGoogleStreamText(candidate);
    if (text) {
      events.push(...ensureTextBlockOpen(state));
      state.fullText += text;
      events.push(ev("content_block_delta", {
        index: state.textBlockIndex,
        delta: { type: "text_delta", text },
      }));
    }

    if (Array.isArray(candidate.content?.parts)) {
      for (const part of candidate.content.parts) {
        if (part?.functionCall) {
          events.push(...closeTextBlock(state));
          const blockIdx = state.nextBlockIndex++;
          const toolInfo = {
            id: `toolu_${Date.now()}_${blockIdx}`,
            name: part.functionCall.name || "",
            argsBuffer: JSON.stringify(part.functionCall.args ?? {}),
          };
          state.toolBlocks.set(blockIdx, toolInfo);
          events.push(ev("content_block_start", {
            index: blockIdx,
            content_block: { type: "tool_use", id: toolInfo.id, name: toolInfo.name, input: {} },
          }));
          events.push(ev("content_block_delta", {
            index: blockIdx,
            delta: { type: "input_json_delta", partial_json: toolInfo.argsBuffer },
          }));
          events.push(ev("content_block_stop", { index: blockIdx }));
          state.toolBlocks.delete(blockIdx);
        }
      }
    }

    if (candidate.finishReason) {
      events.push(...closeTextBlock(state));
      events.push(...closeAllToolBlocks(state));
      state.stopReason = mapGoogleFinishToAnthropic(candidate.finishReason);
      events.push(ev("message_delta", {
        delta: { stop_reason: state.stopReason, stop_sequence: state.stopSequence },
        usage: { output_tokens: state.outputTokens },
      }));
      events.push(ev("message_stop", {}));
    }

    return events;
  }

  return [];
}

export function buildAnthropicErrorEvent(type: string, message: string): AnthropicEvent {
  return {
    event: "error",
    data: {
      type: "error",
      error: { type, message },
    },
  };
}

