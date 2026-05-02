import type { Response as ExpressResponse } from "express";
import {
  translateStreamChunkToOpenAI,
  extractGoogleStreamText,
  applyStopSequences,
  translateStreamChunkToAnthropic,
  createAnthropicStreamState,
  buildAnthropicErrorEvent,
  type AnthropicStreamState,
  type AnthropicEvent,
  type ProviderType,
} from "./translate";

export interface StreamResult {
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number } | null;
  fullContent: string;
}

export async function streamProviderResponse(
  providerResponse: globalThis.Response,
  provider: ProviderType,
  model: string,
  res: ExpressResponse,
  proxyStopSequences?: string[]
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

  const useProxyStop = provider === "GOOGLE" && proxyStopSequences && proxyStopSequences.length > 0;
  const maxStopLen = useProxyStop ? Math.max(...proxyStopSequences!.map(s => s.length)) : 0;
  let stopContentBuffer = "";
  let stopContentSent = 0;
  let stopTriggered = false;

  function sendContentChunk(text: string, finishReason: string | null = null) {
    const chunk = {
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion.chunk",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [{ index: 0, delta: text ? { content: text } : {}, finish_reason: finishReason }],
    };
    res.write(`data: ${JSON.stringify(chunk)}\n\n`);
  }

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

        if (provider === "OPENAI" || provider === "AZURE_OPENAI") {
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
              if (result?.usage) usage = result.usage;

              if (stopTriggered) continue;

              const { text: chunkText } = extractGoogleStreamText(parsed.candidates?.[0]);
              if (!chunkText) {
                if (!useProxyStop && result) {
                  res.write(result.sseData);
                }
                continue;
              }

              if (useProxyStop) {
                stopContentBuffer += chunkText;
                fullContent = stopContentBuffer;

                const { text: truncated, stopped } = applyStopSequences(stopContentBuffer, proxyStopSequences!);
                if (stopped) {
                  const unsent = truncated.substring(stopContentSent);
                  if (unsent) sendContentChunk(unsent);
                  sendContentChunk("", "stop");
                  fullContent = truncated;
                  stopTriggered = true;
                  continue;
                }

                const safe = stopContentBuffer.length - maxStopLen;
                if (safe > stopContentSent) {
                  sendContentChunk(stopContentBuffer.substring(stopContentSent, safe));
                  stopContentSent = safe;
                }
              } else {
                fullContent += chunkText;
                if (result) res.write(result.sseData);
              }
            } catch {}
          }
        }
      }
    }

    if (useProxyStop && !stopTriggered && stopContentSent < stopContentBuffer.length) {
      sendContentChunk(stopContentBuffer.substring(stopContentSent));
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
              if (!stopTriggered) res.write(result.sseData);
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

// =============================================================================
// Anthropic-native streaming (M3b — /api/v1/messages)
// =============================================================================

export interface AnthropicStreamResult {
  usage: { input_tokens: number; output_tokens: number } | null;
  fullContent: string;
  stopReason: string | null;
  /** True iff at least one `message_start` event was emitted to the client. */
  messageStartSent: boolean;
}

function writeAnthropicEvent(res: ExpressResponse, event: AnthropicEvent): void {
  res.write(`event: ${event.event}\n`);
  res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}

/**
 * Stream an upstream provider response and re-frame it as Anthropic SSE events.
 *
 * IMPORTANT: this helper does NOT call `res.end()` on the success path and
 * does NOT auto-emit a minimal envelope when upstream produces nothing. The
 * caller is responsible for closing the stream (and/or emitting a trailing
 * `error` event for empty-response refunds) so empty-response semantics stay
 * with the handler.
 *
 * On a hard read error, the helper emits an Anthropic `error` event, ends the
 * stream, and rethrows.
 */
export async function streamProviderResponseAsAnthropic(
  providerResponse: globalThis.Response,
  provider: ProviderType,
  model: string,
  res: ExpressResponse,
): Promise<AnthropicStreamResult> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Transfer-Encoding", "chunked");

  const state = createAnthropicStreamState(model);
  const body = providerResponse.body;
  if (!body) {
    return {
      usage: null,
      fullContent: "",
      stopReason: null,
      messageStartSent: state.messageStartSent,
    };
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let pingInterval: NodeJS.Timeout | null = null;

  const sendPing = () => {
    try { writeAnthropicEvent(res, { event: "ping", data: { type: "ping" } }); } catch {}
  };

  function processData(rawData: string) {
    if (rawData === "[DONE]") return;
    let parsed: any;
    try { parsed = JSON.parse(rawData); } catch { return; }
    const events = translateStreamChunkToAnthropic(provider, parsed, state);
    for (const event of events) writeAnthropicEvent(res, event);
  }

  try {
    pingInterval = setInterval(sendPing, 15000);
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith("data: ")) {
          processData(trimmed.slice(6));
        }
      }
    }

    if (buffer.trim().startsWith("data: ")) {
      processData(buffer.trim().slice(6));
    }
  } catch (err) {
    try {
      writeAnthropicEvent(res, buildAnthropicErrorEvent("api_error", "Stream interrupted"));
      if (!res.writableEnded) res.end();
    } catch {}
    throw err;
  } finally {
    if (pingInterval) clearInterval(pingInterval);
  }

  return {
    // Return null when upstream never reported token usage so the caller
    // (handler-messages) falls back to estimating output tokens from
    // `fullContent`. Returning a zeroed object here would silently
    // undercharge budget on providers/streams that omit usage metadata.
    usage: state.usageObserved
      ? { input_tokens: state.inputTokens, output_tokens: state.outputTokens }
      : null,
    fullContent: state.fullText,
    stopReason: state.stopReason,
    messageStartSent: state.messageStartSent,
  };
}

export { writeAnthropicEvent };
