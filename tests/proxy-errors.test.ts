import { describe, it, expect } from "vitest";
import { z } from "zod";
import { formatZodError, getProviderErrorSuggestion } from "../server/lib/proxy/handler";

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
