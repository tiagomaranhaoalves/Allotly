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
