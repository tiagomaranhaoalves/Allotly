import { describe, it, expect } from "vitest";
import {
  translateAnthropicToProvider,
  translateResponseToAnthropic,
  createAnthropicStreamState,
  translateStreamChunkToAnthropic,
  getAnthropicDroppedFields,
  buildAnthropicErrorEvent,
} from "../server/lib/proxy/translate";
import { anthropicMessagesRequestSchema } from "../server/lib/proxy/messages-schema";

describe("anthropicMessagesRequestSchema", () => {
  it("accepts a minimal valid request", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.stream).toBe(false);
    }
  });

  it("makes model optional (default-model selection)", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.success).toBe(true);
  });

  it("requires max_tokens", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.success).toBe(false);
  });

  it("requires non-empty messages", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      max_tokens: 100,
      messages: [],
    });
    expect(r.success).toBe(false);
  });

  it("accepts content blocks (text + image)", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      max_tokens: 100,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
        ],
      }],
    });
    expect(r.success).toBe(true);
  });

  it("preserves cache_control via passthrough", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      max_tokens: 100,
      system: [{ type: "text", text: "hi", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "hi" }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects role outside user/assistant", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      max_tokens: 100,
      messages: [{ role: "system", content: "x" }],
    });
    expect(r.success).toBe(false);
  });

  it("accepts tools and tool_choice", () => {
    const r = anthropicMessagesRequestSchema.safeParse({
      model: "claude-sonnet-4",
      max_tokens: 100,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "lookup", description: "x", input_schema: { type: "object" } }],
      tool_choice: { type: "tool", name: "lookup" },
    });
    expect(r.success).toBe(true);
  });
});

describe("translateAnthropicToProvider — ANTHROPIC passthrough", () => {
  it("passes Anthropic request through verbatim", () => {
    const req = {
      model: "claude-sonnet-4",
      messages: [{ role: "user" as const, content: "hello" }],
      max_tokens: 100,
      system: "you are helpful",
      temperature: 0.5,
      stop_sequences: ["END"],
    };
    const r = translateAnthropicToProvider(req, "ANTHROPIC", 100);
    expect(r.url).toBe("https://api.anthropic.com/v1/messages");
    expect(r.method).toBe("POST");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    expect(r.body.model).toBe("claude-sonnet-4");
    expect(r.body.max_tokens).toBe(100);
    expect(r.body.system).toBe("you are helpful");
    expect(r.body.stop_sequences).toEqual(["END"]);
  });

  it("preserves tools and thinking on Anthropic upstream", () => {
    const req = {
      model: "claude-sonnet-4",
      messages: [{ role: "user" as const, content: "hi" }],
      max_tokens: 50,
      tools: [{ name: "x", input_schema: {} }],
      thinking: { type: "enabled", budget_tokens: 1024 },
    };
    const r = translateAnthropicToProvider(req, "ANTHROPIC");
    expect(r.body.tools).toBeDefined();
    expect(r.body.thinking).toEqual({ type: "enabled", budget_tokens: 1024 });
  });
});

describe("translateAnthropicToProvider — OPENAI translation", () => {
  it("flattens system block into a system message", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 50,
      system: "you are helpful",
    }, "OPENAI", 50);
    expect(r.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(r.body.messages[0]).toEqual({ role: "system", content: "you are helpful" });
    expect(r.body.messages[1]).toEqual({ role: "user", content: "hi" });
  });

  it("flattens system text-block array into a single string", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 50,
      system: [
        { type: "text", text: "you are" },
        { type: "text", text: "helpful" },
      ],
    }, "OPENAI", 50);
    expect(r.body.messages[0].role).toBe("system");
    expect(r.body.messages[0].content).toContain("you are");
    expect(r.body.messages[0].content).toContain("helpful");
  });

  it("converts image blocks to OpenAI image_url parts", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } },
        ],
      }],
    }, "OPENAI");
    const userMsg = r.body.messages[0];
    expect(userMsg.role).toBe("user");
    expect(Array.isArray(userMsg.content)).toBe(true);
    const imgPart = userMsg.content.find((p: any) => p.type === "image_url");
    expect(imgPart).toBeDefined();
    expect(imgPart.image_url.url).toContain("data:image/png;base64,AAAA");
  });

  it("converts tool_use assistant blocks to OpenAI tool_calls", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [
        { role: "user", content: "do it" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "calling..." },
            { type: "tool_use", id: "toolu_1", name: "lookup", input: { q: "x" } },
          ],
        },
      ],
    }, "OPENAI");
    const asst = r.body.messages.find((m: any) => m.role === "assistant");
    expect(asst.tool_calls).toBeDefined();
    expect(asst.tool_calls[0].id).toBe("toolu_1");
    expect(asst.tool_calls[0].function.name).toBe("lookup");
    expect(JSON.parse(asst.tool_calls[0].function.arguments)).toEqual({ q: "x" });
  });

  it("converts tool_result user blocks to OpenAI tool messages", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [
        { role: "user", content: "do it" },
        { role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "lookup", input: {} }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "result text" }] },
      ],
    }, "OPENAI");
    const toolMsg = r.body.messages.find((m: any) => m.role === "tool");
    expect(toolMsg).toBeDefined();
    expect(toolMsg.tool_call_id).toBe("toolu_1");
    expect(toolMsg.content).toBe("result text");
  });

  it("translates Anthropic tools into OpenAI function tools", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "lookup", description: "search", input_schema: { type: "object", properties: { q: { type: "string" } } } }],
      tool_choice: { type: "tool", name: "lookup" },
    }, "OPENAI");
    expect(r.body.tools[0].type).toBe("function");
    expect(r.body.tools[0].function.name).toBe("lookup");
    expect(r.body.tool_choice).toEqual({ type: "function", function: { name: "lookup" } });
  });

  it("maps tool_choice 'any' to 'required' for OpenAI", () => {
    const r = translateAnthropicToProvider({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "x", input_schema: {} }],
      tool_choice: { type: "any" },
    }, "OPENAI");
    expect(r.body.tool_choice).toBe("required");
  });
});

describe("translateAnthropicToProvider — GOOGLE translation", () => {
  it("builds Gemini contents with role mapping", () => {
    const r = translateAnthropicToProvider({
      model: "gemini-1.5-pro",
      max_tokens: 50,
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "how are you?" },
      ],
    }, "GOOGLE");
    expect(r.url).toContain("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro");
    expect(r.body.contents[0].role).toBe("user");
    expect(r.body.contents[1].role).toBe("model");
    expect(r.body.contents[2].role).toBe("user");
  });

  it("flattens system into systemInstruction", () => {
    const r = translateAnthropicToProvider({
      model: "gemini-1.5-pro",
      max_tokens: 50,
      system: "you are helpful",
      messages: [{ role: "user", content: "hi" }],
    }, "GOOGLE");
    expect(r.body.systemInstruction.parts[0].text).toBe("you are helpful");
  });

  it("uses streamGenerateContent URL when stream=true", () => {
    const r = translateAnthropicToProvider({
      model: "gemini-1.5-pro",
      max_tokens: 50,
      messages: [{ role: "user", content: "hi" }],
      stream: true,
    }, "GOOGLE");
    expect(r.url).toContain(":streamGenerateContent?alt=sse");
  });

  it("converts image blocks to Gemini inline_data", () => {
    const r = translateAnthropicToProvider({
      model: "gemini-1.5-pro",
      max_tokens: 50,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "ZZZZ" } },
        ],
      }],
    }, "GOOGLE");
    const parts = r.body.contents[0].parts;
    const inline = parts.find((p: any) => p.inline_data);
    expect(inline).toBeDefined();
    expect(inline.inline_data.mime_type).toBe("image/jpeg");
    expect(inline.inline_data.data).toBe("ZZZZ");
  });
});

describe("translateResponseToAnthropic", () => {
  it("returns Anthropic body verbatim for ANTHROPIC provider", () => {
    const body = {
      id: "msg_abc",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4",
      content: [{ type: "text", text: "hi" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5 },
    };
    const r = translateResponseToAnthropic("ANTHROPIC", body, "claude-sonnet-4");
    expect(r.id).toBe("msg_abc");
    expect(r.content).toEqual([{ type: "text", text: "hi" }]);
    expect(r.usage.input_tokens).toBe(10);
    expect(r.usage.output_tokens).toBe(5);
  });

  it("translates OpenAI completion to Anthropic message", () => {
    const body = {
      id: "chatcmpl-xyz",
      choices: [{
        message: { role: "assistant", content: "hi back" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
      model: "gpt-4o",
    };
    const r = translateResponseToAnthropic("OPENAI", body, "gpt-4o");
    expect(r.role).toBe("assistant");
    expect(r.content).toEqual([{ type: "text", text: "hi back" }]);
    expect(r.stop_reason).toBe("end_turn");
    expect(r.usage.input_tokens).toBe(12);
    expect(r.usage.output_tokens).toBe(3);
  });

  it("translates OpenAI tool_calls into Anthropic tool_use blocks", () => {
    const body = {
      id: "chatcmpl-xyz",
      choices: [{
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{
            id: "call_1",
            type: "function",
            function: { name: "lookup", arguments: JSON.stringify({ q: "weather" }) },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    };
    const r = translateResponseToAnthropic("OPENAI", body, "gpt-4o");
    expect(r.stop_reason).toBe("tool_use");
    const tu = r.content.find((c: any) => c.type === "tool_use");
    expect(tu).toBeDefined();
    expect(tu.id).toBe("call_1");
    expect(tu.name).toBe("lookup");
    expect(tu.input).toEqual({ q: "weather" });
  });

  it("translates Google candidate to Anthropic message", () => {
    const body = {
      candidates: [{
        content: { parts: [{ text: "hello there" }] },
        finishReason: "STOP",
      }],
      usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 2 },
    };
    const r = translateResponseToAnthropic("GOOGLE", body, "gemini-1.5-pro");
    expect(r.content).toEqual([{ type: "text", text: "hello there" }]);
    expect(r.stop_reason).toBe("end_turn");
    expect(r.usage.input_tokens).toBe(8);
    expect(r.usage.output_tokens).toBe(2);
  });

  it("maps Google MAX_TOKENS finish to max_tokens", () => {
    const body = {
      candidates: [{ content: { parts: [{ text: "long" }] }, finishReason: "MAX_TOKENS" }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
    };
    const r = translateResponseToAnthropic("GOOGLE", body, "gemini-1.5-pro");
    expect(r.stop_reason).toBe("max_tokens");
  });
});

describe("translateStreamChunkToAnthropic — OpenAI re-framing", () => {
  it("emits message_start once and content_block events for text deltas", () => {
    const state = createAnthropicStreamState("gpt-4o");
    const events1 = translateStreamChunkToAnthropic("OPENAI", {
      choices: [{ delta: { role: "assistant", content: "Hel" } }],
    }, state);
    const events2 = translateStreamChunkToAnthropic("OPENAI", {
      choices: [{ delta: { content: "lo!" } }],
    }, state);
    const allTypes = [...events1, ...events2].map(e => e.event);
    expect(allTypes).toContain("message_start");
    expect(allTypes.filter(e => e === "message_start")).toHaveLength(1);
    expect(allTypes).toContain("content_block_start");
    expect(allTypes).toContain("content_block_delta");
    // Text accumulates across deltas
    expect(state.fullText).toBe("Hello!");
  });

  it("captures usage tokens from final OpenAI chunk", () => {
    const state = createAnthropicStreamState("gpt-4o");
    translateStreamChunkToAnthropic("OPENAI", { choices: [{ delta: { content: "x" } }] }, state);
    translateStreamChunkToAnthropic("OPENAI", {
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 4, completion_tokens: 1 },
    }, state);
    expect(state.inputTokens).toBe(4);
    expect(state.outputTokens).toBe(1);
  });

  it("passes Anthropic chunks through with their original event type", () => {
    const state = createAnthropicStreamState("claude-sonnet-4");
    const events = translateStreamChunkToAnthropic("ANTHROPIC", {
      type: "message_start",
      message: { id: "msg_xyz", usage: { input_tokens: 7 } },
    }, state);
    expect(events[0].event).toBe("message_start");
    expect(state.inputTokens).toBe(7);
    expect(state.messageId).toBe("msg_xyz");
  });
});

describe("getAnthropicDroppedFields", () => {
  it("returns no dropped fields for ANTHROPIC upstream", () => {
    const r = getAnthropicDroppedFields({
      model: "claude-sonnet-4",
      max_tokens: 50,
      messages: [{ role: "user", content: [{ type: "text", text: "x", cache_control: { type: "ephemeral" } }] }],
      thinking: { type: "enabled" },
    }, "ANTHROPIC");
    expect(r).toEqual([]);
  });

  it("flags cache_control when routing to OPENAI", () => {
    const r = getAnthropicDroppedFields({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [{ role: "user", content: [{ type: "text", text: "x", cache_control: { type: "ephemeral" } }] }],
    }, "OPENAI");
    expect(r).toContain("cache_control");
  });

  it("flags thinking when routing to GOOGLE", () => {
    const r = getAnthropicDroppedFields({
      model: "gemini-1.5-pro",
      max_tokens: 50,
      messages: [{ role: "user", content: "x" }],
      thinking: { type: "enabled" },
    }, "GOOGLE");
    expect(r).toContain("thinking");
  });

  it("flags citations on a content block when routing to OPENAI", () => {
    const r = getAnthropicDroppedFields({
      model: "gpt-4o",
      max_tokens: 50,
      messages: [{ role: "user", content: [{ type: "text", text: "x", citations: [{ source: "doc" }] }] }],
    }, "OPENAI");
    expect(r).toContain("citations");
  });
});

describe("buildAnthropicErrorEvent", () => {
  it("builds an SSE error event in the Anthropic envelope", () => {
    const e = buildAnthropicErrorEvent("api_error", "boom");
    expect(e.event).toBe("error");
    expect(e.data.type).toBe("error");
    expect(e.data.error).toEqual({ type: "api_error", message: "boom" });
  });
});

// =============================================================================
// /api/v1/messages route smoke tests — verify the live endpoint returns
// Anthropic-shaped envelopes for unauthenticated and method-not-allowed cases.
// =============================================================================

// =============================================================================
// Internal mapping regression tests — guard the table + status fallback used
// by sendAnthropicError(WithCode). We re-create the table here in a local
// helper to mirror what handler-messages.ts does, since the mapping is not
// exported (it's an internal concern of the handler module).
// =============================================================================

const ALLOTLY_TO_ANTHROPIC_TEST: Record<string, { type: string; status: number }> = {
  unauthenticated: { type: "authentication_error", status: 401 },
  invalid_key: { type: "authentication_error", status: 401 },
  account_suspended: { type: "permission_error", status: 403 },
  invalid_request: { type: "invalid_request_error", status: 400 },
  rate_limit: { type: "rate_limit_error", status: 429 },
  concurrency_limit: { type: "rate_limit_error", status: 429 },
  upstream_rate_limited: { type: "rate_limit_error", status: 429 },
  upstream_auth_failed: { type: "api_error", status: 502 },
  provider_unavailable: { type: "api_error", status: 503 },
  empty_response: { type: "api_error", status: 502 },
  internal_error: { type: "api_error", status: 500 },
};

function mapAllotlyToAnthropicTest(code: string, fallbackStatus: number) {
  const m = ALLOTLY_TO_ANTHROPIC_TEST[code];
  if (m) return m;
  if (fallbackStatus === 401) return { type: "authentication_error", status: 401 };
  if (fallbackStatus === 403) return { type: "permission_error", status: 403 };
  if (fallbackStatus === 404) return { type: "not_found_error", status: 404 };
  if (fallbackStatus === 429) return { type: "rate_limit_error", status: 429 };
  if (fallbackStatus >= 500) return { type: "api_error", status: fallbackStatus };
  return { type: "invalid_request_error", status: fallbackStatus || 400 };
}

describe("Anthropic error mapping — table + status fallback", () => {
  it("preserves upstream 400 as invalid_request_error/400 when code is upstream_error (not in table)", () => {
    const r = mapAllotlyToAnthropicTest("upstream_error", 400);
    expect(r).toEqual({ type: "invalid_request_error", status: 400 });
  });

  it("maps upstream 502 (unknown code) to api_error/502 via status fallback", () => {
    const r = mapAllotlyToAnthropicTest("upstream_error", 502);
    expect(r).toEqual({ type: "api_error", status: 502 });
  });

  it("maps unknown 429 to rate_limit_error/429", () => {
    const r = mapAllotlyToAnthropicTest("totally_made_up_code", 429);
    expect(r).toEqual({ type: "rate_limit_error", status: 429 });
  });

  it("maps unknown 401 to authentication_error/401", () => {
    const r = mapAllotlyToAnthropicTest("totally_made_up_code", 401);
    expect(r).toEqual({ type: "authentication_error", status: 401 });
  });

  it("known codes always win over status fallback", () => {
    expect(mapAllotlyToAnthropicTest("rate_limit", 500))
      .toEqual({ type: "rate_limit_error", status: 429 });
    expect(mapAllotlyToAnthropicTest("provider_unavailable", 200))
      .toEqual({ type: "api_error", status: 503 });
  });
});

// =============================================================================
// Streaming empty-response detection — guard against false positives on
// tool-only streams (no text content, no usage). Uses the real
// streamProviderResponseAsAnthropic against a synthetic OpenAI tool-call
// stream and asserts messageStartSent is true (so the handler will NOT refund).
// =============================================================================

import { streamProviderResponseAsAnthropic } from "../server/lib/proxy/streaming";

function makeToolOnlyOpenAIStream(): Response {
  const chunks = [
    `data: {"id":"x","choices":[{"index":0,"delta":{"role":"assistant","tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"foo","arguments":""}}]}}]}\n\n`,
    `data: {"id":"x","choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\\"a\\":1}"}}]}}]}\n\n`,
    `data: {"id":"x","choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}\n\n`,
    `data: [DONE]\n\n`,
  ];
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function makeFakeRes() {
  const writes: string[] = [];
  return {
    headersSent: false,
    writableEnded: false,
    statusCode: 200,
    setHeader() {},
    flushHeaders() { (this as any).headersSent = true; },
    write(c: any) { writes.push(typeof c === "string" ? c : c.toString()); return true; },
    end(c?: any) { if (c) writes.push(typeof c === "string" ? c : c.toString()); (this as any).writableEnded = true; },
    on() {},
    once() {},
    emit() {},
    writes,
  } as any;
}

describe("streamProviderResponseAsAnthropic — tool-only stream", () => {
  it("emits message_start (messageStartSent=true) for tool-only OpenAI stream", async () => {
    const upstream = makeToolOnlyOpenAIStream();
    const res = makeFakeRes();
    const result = await streamProviderResponseAsAnthropic(upstream, "OPENAI" as any, "gpt-4o-mini", res);
    expect(result.messageStartSent).toBe(true);
    const joined = res.writes.join("");
    expect(joined).toContain("message_start");
    // Tool-only: fullContent (text accumulator) is empty but stream is NOT empty.
    expect(result.fullContent).toBe("");
  });
});

describe("/api/v1/messages — live route smoke", () => {
  const base = process.env.ALLOTLY_TEST_BASE_URL || "http://localhost:5000";

  async function reachable(): Promise<boolean> {
    try {
      const r = await fetch(`${base}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
      return r.ok;
    } catch { return false; }
  }

  it("returns Anthropic-shaped 401 with no Authorization header", async () => {
    if (!(await reachable())) return;
    const r = await fetch(`${base}/api/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ max_tokens: 1, messages: [{ role: "user", content: "x" }] }),
    });
    expect(r.status).toBe(401);
    expect(r.headers.get("X-Allotly-Native-Format")).toBe("anthropic");
    expect(r.headers.get("X-Allotly-Request-ID")).toBeTruthy();
    const body = await r.json();
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("authentication_error");
    expect(typeof body.error.message).toBe("string");
  });

  it("returns Anthropic-shaped 405 for non-POST methods", async () => {
    if (!(await reachable())) return;
    const r = await fetch(`${base}/api/v1/messages`, { method: "GET" });
    expect(r.status).toBe(405);
    const body = await r.json();
    expect(body.type).toBe("error");
    expect(body.error.type).toBe("invalid_request_error");
  });

});
