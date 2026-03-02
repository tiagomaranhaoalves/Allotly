import type { Response as ExpressResponse } from "express";
import { translateStreamChunkToOpenAI, type ProviderType } from "./translate";

export interface StreamResult {
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  fullContent: string;
}

export async function streamProviderResponse(
  providerResponse: globalThis.Response,
  provider: ProviderType,
  model: string,
  res: ExpressResponse
): Promise<StreamResult> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Transfer-Encoding", "chunked");

  let usage: StreamResult["usage"] = null;
  let fullContent = "";

  const body = providerResponse.body;
  if (!body) {
    res.write("data: [DONE]\n\n");
    res.end();
    return { usage: null, fullContent: "" };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (provider === "OPENAI") {
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              res.write("data: [DONE]\n\n");
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              const result = translateStreamChunkToOpenAI(provider, parsed, model);
              if (result) {
                res.write(result.sseData);
                if (result.usage) usage = result.usage;
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) fullContent += delta;
              }
            } catch {}
          }
        } else if (provider === "ANTHROPIC") {
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              const result = translateStreamChunkToOpenAI(provider, parsed, model);
              if (result) {
                res.write(result.sseData);
                if (result.usage) usage = result.usage;
                if (parsed.type === "content_block_delta") {
                  fullContent += parsed.delta?.text || "";
                }
              }

              if (parsed.type === "message_start" && parsed.message?.usage) {
                usage = {
                  prompt_tokens: parsed.message.usage.input_tokens || 0,
                  completion_tokens: 0,
                  total_tokens: parsed.message.usage.input_tokens || 0,
                };
              }
              if (parsed.type === "message_delta" && parsed.usage) {
                if (usage) {
                  usage.completion_tokens = parsed.usage.output_tokens || 0;
                  usage.total_tokens = usage.prompt_tokens + usage.completion_tokens;
                } else {
                  usage = {
                    prompt_tokens: 0,
                    completion_tokens: parsed.usage.output_tokens || 0,
                    total_tokens: parsed.usage.output_tokens || 0,
                  };
                }
              }
            } catch {}
          }
        } else if (provider === "GOOGLE") {
          if (trimmed.startsWith("data: ")) {
            const data = trimmed.slice(6);
            try {
              const parsed = JSON.parse(data);
              const result = translateStreamChunkToOpenAI(provider, parsed, model);
              if (result) {
                res.write(result.sseData);
                if (result.usage) usage = result.usage;
                const text = parsed.candidates?.[0]?.content?.parts?.map((p: any) => p.text || "").join("") || "";
                if (text) fullContent += text;
              }
            } catch {}
          }
        }
      }
    }

    if (buffer.trim()) {
      const trimmed = buffer.trim();
      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data !== "[DONE]") {
          try {
            const parsed = JSON.parse(data);
            const result = translateStreamChunkToOpenAI(provider, parsed, model);
            if (result) {
              res.write(result.sseData);
              if (result.usage) usage = result.usage;
            }
          } catch {}
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    try { res.end(); } catch {}
    throw err;
  }

  return { usage, fullContent };
}

export async function readNonStreamingResponse(
  providerResponse: globalThis.Response
): Promise<any> {
  const text = await providerResponse.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Invalid JSON response from provider: ${text.slice(0, 200)}`);
  }
}
