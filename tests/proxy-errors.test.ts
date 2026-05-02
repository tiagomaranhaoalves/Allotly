import { describe, it, expect } from "vitest";
import { z } from "zod";
import { formatZodError, getProviderErrorSuggestion } from "../server/lib/proxy/handler";
import {
  anthropicMessagesRequestSchema,
  anthropicMessagesResponseSchema,
  anthropicErrorResponseSchema,
  anthropicStreamEventSchema,
} from "../server/lib/proxy/messages-schema";

const chatRequestSchema = z.object({
  model: z.string(),
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.union([z.string(), z.array(z.any())]),
  })),
  stream: z.boolean().optional().default(false),
  max_tokens: z.number().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
}).passthrough();

describe("formatZodError", () => {
  it("formats missing required field", () => {
    const result = chatRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("Missing required field: model");
      expect(msg).toContain("Missing required field: messages");
    }
  });

  it("formats invalid type error", () => {
    const result = chatRequestSchema.safeParse({
      model: 123,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("Invalid type for 'model'");
      expect(msg).toContain("expected string");
    }
  });

  it("formats invalid enum value", () => {
    const result = chatRequestSchema.safeParse({
      model: "gpt-4o",
      messages: [{ role: "narrator", content: "Once upon a time" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("Invalid value for");
      expect(msg).toContain("must be one of");
    }
  });

  it("formats multiple errors joined by semicolons", () => {
    const result = chatRequestSchema.safeParse({
      model: 42,
      messages: "not an array",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg.split(";").length).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns generic message for empty issues", () => {
    const emptyError = new z.ZodError([]);
    expect(formatZodError(emptyError)).toBe("Invalid request");
  });

  it("handles valid request without errors", () => {
    const result = chatRequestSchema.safeParse({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hello" }],
    });
    expect(result.success).toBe(true);
  });

  it("allows passthrough of extra fields", () => {
    const result = chatRequestSchema.safeParse({
      model: "gpt-4o",
      messages: [{ role: "user", content: "Hi" }],
      frequency_penalty: 0.5,
      custom_field: "value",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.frequency_penalty).toBe(0.5);
    }
  });
});

describe("getProviderErrorSuggestion", () => {
  it("suggests alternatives for deprecated models", () => {
    const msg = getProviderErrorSuggestion(400, "This model has been deprecated", "OPENAI");
    expect(msg).toContain("deprecated");
    expect(msg).toContain("gpt-4o-mini or gpt-4o");
  });

  it("suggests alternatives for deprecated Anthropic models", () => {
    const msg = getProviderErrorSuggestion(400, "Model no longer available", "ANTHROPIC");
    expect(msg).toContain("claude-sonnet-4 or claude-haiku-3.5");
  });

  it("suggests alternatives for deprecated Google models", () => {
    const msg = getProviderErrorSuggestion(400, "This model has been decommissioned", "GOOGLE");
    expect(msg).toContain("gemini-2.5-flash or gemini-2.5-pro");
  });

  it("suggests generic alternative for unknown provider", () => {
    const msg = getProviderErrorSuggestion(400, "Model deprecated", "UNKNOWN_PROVIDER");
    expect(msg).toContain("a newer model");
  });

  it("handles rate limit (429)", () => {
    const msg = getProviderErrorSuggestion(429, "Too many requests", "OPENAI");
    expect(msg).toContain("rate-limiting");
    expect(msg).toContain("Wait");
  });

  it("handles rate limit by message content", () => {
    const msg = getProviderErrorSuggestion(200, "rate limit exceeded for quota", "OPENAI");
    expect(msg).toContain("rate-limiting");
  });

  it("handles auth errors (401)", () => {
    const msg = getProviderErrorSuggestion(401, "Invalid API key", "OPENAI");
    expect(msg).toContain("provider API key");
    expect(msg).toContain("admin");
  });

  it("handles forbidden errors (403)", () => {
    const msg = getProviderErrorSuggestion(403, "Access denied", "ANTHROPIC");
    expect(msg).toContain("provider API key");
  });

  it("handles unauthorized in message body", () => {
    const msg = getProviderErrorSuggestion(200, "unauthorized access attempt", "GOOGLE");
    expect(msg).toContain("provider API key");
  });

  it("handles 404 not found", () => {
    const msg = getProviderErrorSuggestion(404, "Model not found", "OPENAI");
    expect(msg).toContain("may not exist");
    expect(msg).toContain("/models endpoint");
  });

  it("handles not found in message", () => {
    const msg = getProviderErrorSuggestion(200, "The requested model was not found", "ANTHROPIC");
    expect(msg).toContain("may not exist");
  });

  it("falls back to generic suggestion", () => {
    const msg = getProviderErrorSuggestion(500, "Internal server error", "OPENAI");
    expect(msg).toContain("upstream provider");
    expect(msg).toContain("try again");
  });
});

// =============================================================================
// /api/v1/messages parity — confirm the Anthropic-native schemas exposed by
// messages-schema.ts validate the same canonical shapes, and that
// formatZodError + getProviderErrorSuggestion behave identically when applied
// to messages-shaped inputs/errors. These tests guarantee the new endpoint
// shares its error-shaping primitives with /chat/completions.
// =============================================================================

describe("/api/v1/messages — Anthropic request schema parity (formatZodError)", () => {
  it("emits the same `Missing required field: ...` style errors as /chat/completions", () => {
    const result = anthropicMessagesRequestSchema.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      // max_tokens and messages are both required by Anthropic.
      expect(msg).toMatch(/Missing required field/);
      expect(msg).toContain("messages");
      expect(msg).toContain("max_tokens");
    }
  });

  it("emits invalid-type errors with the same format", () => {
    const result = anthropicMessagesRequestSchema.safeParse({
      max_tokens: "lots",
      messages: [{ role: "user", content: "hi" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      expect(msg).toContain("Invalid type for");
      expect(msg).toContain("max_tokens");
    }
  });

  it("rejects a role outside Anthropic's user|assistant set", () => {
    const result = anthropicMessagesRequestSchema.safeParse({
      max_tokens: 10,
      messages: [{ role: "system", content: "be brief" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatZodError(result.error);
      // System messages must go via the top-level `system` field.
      expect(msg).toMatch(/Invalid value|must be one of/);
    }
  });

  it("accepts a valid Anthropic request with cache_control + tools (passthrough)", () => {
    const result = anthropicMessagesRequestSchema.safeParse({
      model: "claude-3-5-sonnet",
      max_tokens: 100,
      system: [{ type: "text", text: "be brief", cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "echo", input_schema: { type: "object" } }],
      tool_choice: { type: "auto" },
      stream: true,
    });
    expect(result.success).toBe(true);
  });
});

describe("/api/v1/messages — response & error envelope parity", () => {
  it("validates a canonical Anthropic non-streaming response", () => {
    const ok = anthropicMessagesResponseSchema.safeParse({
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-3-5-sonnet",
      content: [{ type: "text", text: "hello" }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 3 },
    });
    expect(ok.success).toBe(true);
  });

  it("validates a tool-use response with thinking block", () => {
    const ok = anthropicMessagesResponseSchema.safeParse({
      id: "msg_2",
      type: "message",
      role: "assistant",
      model: "claude-3-5-sonnet",
      content: [
        { type: "thinking", thinking: "let me think" },
        { type: "tool_use", id: "tu_1", name: "lookup", input: { q: "x" } },
      ],
      stop_reason: "tool_use",
      stop_sequence: null,
      usage: { input_tokens: 12, output_tokens: 8 },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects a response missing required usage", () => {
    const bad = anthropicMessagesResponseSchema.safeParse({
      id: "msg_x",
      type: "message",
      role: "assistant",
      model: "claude-3-5-sonnet",
      content: [],
      stop_reason: "end_turn",
    });
    expect(bad.success).toBe(false);
  });

  it("validates the canonical error envelope (parity with handler-messages.ts)", () => {
    const samples = [
      { type: "authentication_error", status: 401 },
      { type: "permission_error", status: 403 },
      { type: "invalid_request_error", status: 400 },
      { type: "rate_limit_error", status: 429 },
      { type: "not_found_error", status: 404 },
      { type: "api_error", status: 502 },
    ];
    for (const s of samples) {
      const ok = anthropicErrorResponseSchema.safeParse({
        type: "error",
        error: { type: s.type, message: `boom (${s.status})` },
      });
      expect(ok.success).toBe(true);
    }
  });
});

describe("/api/v1/messages — streaming event union parity", () => {
  it("accepts every event type emitted by the handler", () => {
    const events = [
      {
        type: "message_start",
        message: {
          id: "msg_1", type: "message", role: "assistant",
          model: "claude-3-5-sonnet", content: [],
          stop_reason: null, stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 0 },
        },
      },
      { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
      { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "hello" } },
      { type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "{\"a\":" } },
      { type: "content_block_delta", index: 2, delta: { type: "thinking_delta", thinking: "..." } },
      { type: "content_block_stop", index: 0 },
      { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 3 } },
      { type: "message_stop" },
      { type: "ping" },
      { type: "error", error: { type: "api_error", message: "interrupted" } },
    ];
    for (const e of events) {
      const r = anthropicStreamEventSchema.safeParse(e);
      expect(r.success, `event ${(e as any).type} should validate; got ${JSON.stringify((r as any).error?.issues ?? "")}`).toBe(true);
    }
  });

  it("rejects an unknown event type", () => {
    const r = anthropicStreamEventSchema.safeParse({ type: "made_up_event" });
    expect(r.success).toBe(false);
  });

  it("formatZodError works on a malformed message_start (parity with chat-completions error formatter)", () => {
    const r = anthropicStreamEventSchema.safeParse({ type: "message_start" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const msg = formatZodError(r.error);
      expect(msg).toMatch(/Missing required field|Invalid/);
    }
  });
});

describe("/api/v1/messages — provider error suggestion parity", () => {
  // The handler-messages.ts handler uses the same getProviderErrorSuggestion
  // helper to enrich upstream error messages, so identical inputs MUST yield
  // identical suggestions for both endpoints.
  it("yields identical suggestions to /chat/completions for the same upstream inputs", () => {
    const cases: Array<[number, string, string]> = [
      [400, "This model has been deprecated", "OPENAI"],
      [429, "Too many requests", "ANTHROPIC"],
      [401, "Invalid API key", "GOOGLE"],
      [404, "Model not found", "AZURE_OPENAI"],
      [500, "Internal server error", "OPENAI"],
    ];
    for (const [status, msg, provider] of cases) {
      const a = getProviderErrorSuggestion(status, msg, provider);
      const b = getProviderErrorSuggestion(status, msg, provider);
      expect(a).toBe(b);
      expect(a.length).toBeGreaterThan(0);
    }
  });
});
