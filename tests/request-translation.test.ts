import { describe, it, expect } from "vitest";
import {
  translateToProvider,
  translateResponseToOpenAI,
  detectProvider,
  setProviderAuth,
} from "../server/lib/proxy/translate";

const openaiRequest = {
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi there!" },
    { role: "user", content: "How are you?" },
  ],
  max_tokens: 1000,
  temperature: 0.7,
  stream: false,
};

describe("detectProvider", () => {
  it("detects OpenAI models", () => {
    expect(detectProvider("gpt-4o")).toBe("OPENAI");
    expect(detectProvider("gpt-3.5-turbo")).toBe("OPENAI");
    expect(detectProvider("o3-mini")).toBe("OPENAI");
    expect(detectProvider("o4-mini")).toBe("OPENAI");
  });

  it("detects Anthropic models", () => {
    expect(detectProvider("claude-3-5-sonnet-20241022")).toBe("ANTHROPIC");
    expect(detectProvider("claude-3-opus-20240229")).toBe("ANTHROPIC");
  });

  it("detects Google models", () => {
    expect(detectProvider("gemini-1.5-pro")).toBe("GOOGLE");
    expect(detectProvider("gemini-2.0-flash")).toBe("GOOGLE");
  });

  it("returns null for unknown models", () => {
    expect(detectProvider("llama-3")).toBeNull();
    expect(detectProvider("mistral-7b")).toBeNull();
  });
});

describe("translateToProvider — OpenAI passthrough", () => {
  it("passes through OpenAI requests with minor changes", () => {
    const result = translateToProvider(openaiRequest, "OPENAI", 1000);
    expect(result.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(result.method).toBe("POST");
    expect(result.body.model).toBe("gpt-4o");
    expect(result.body.messages).toEqual(openaiRequest.messages);
    expect(result.body.max_tokens).toBe(1000);
  });
});

describe("translateToProvider — OpenAI to Anthropic", () => {
  it("extracts system message into system field", () => {
    const result = translateToProvider(openaiRequest, "ANTHROPIC", 1000);
    expect(result.body.system).toBe("You are a helpful assistant.");
  });

  it("filters system messages from messages array", () => {
    const result = translateToProvider(openaiRequest, "ANTHROPIC", 1000);
    const roles = result.body.messages.map((m: any) => m.role);
    expect(roles).not.toContain("system");
  });

  it("maps roles correctly", () => {
    const result = translateToProvider(openaiRequest, "ANTHROPIC", 1000);
    expect(result.body.messages[0].role).toBe("user");
    expect(result.body.messages[1].role).toBe("assistant");
    expect(result.body.messages[2].role).toBe("user");
  });

  it("sets correct URL", () => {
    const result = translateToProvider(openaiRequest, "ANTHROPIC");
    expect(result.url).toBe("https://api.anthropic.com/v1/messages");
  });

  it("sets anthropic-version header", () => {
    const result = translateToProvider(openaiRequest, "ANTHROPIC");
    expect(result.headers["anthropic-version"]).toBe("2023-06-01");
  });

  it("passes temperature and top_p", () => {
    const reqWithTopP = { ...openaiRequest, top_p: 0.9 };
    const result = translateToProvider(reqWithTopP, "ANTHROPIC");
    expect(result.body.temperature).toBe(0.7);
    expect(result.body.top_p).toBe(0.9);
  });

  it("defaults max_tokens to 4096 when not specified", () => {
    const noMaxTokens = { ...openaiRequest, max_tokens: undefined };
    const result = translateToProvider(noMaxTokens, "ANTHROPIC");
    expect(result.body.max_tokens).toBe(4096);
  });

  it("handles request with no system message", () => {
    const noSystem = {
      ...openaiRequest,
      messages: [{ role: "user", content: "Hello" }],
    };
    const result = translateToProvider(noSystem, "ANTHROPIC");
    expect(result.body.system).toBeUndefined();
    expect(result.body.messages.length).toBe(1);
  });
});

describe("translateToProvider — OpenAI to Google", () => {
  it("maps messages to contents with parts format", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE", 1000);
    expect(result.body.contents).toBeDefined();
    expect(result.body.contents[0].role).toBe("user");
    expect(result.body.contents[0].parts[0].text).toBe("Hello");
  });

  it("maps assistant role to model", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE");
    expect(result.body.contents[1].role).toBe("model");
  });

  it("extracts system message into systemInstruction", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE");
    expect(result.body.systemInstruction).toEqual({
      parts: [{ text: "You are a helpful assistant." }],
    });
  });

  it("excludes system messages from contents", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE");
    const roles = result.body.contents.map((c: any) => c.role);
    expect(roles).not.toContain("system");
  });

  it("sets maxOutputTokens in generationConfig", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE", 1000);
    expect(result.body.generationConfig.maxOutputTokens).toBe(1000);
  });

  it("sets temperature in generationConfig", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE");
    expect(result.body.generationConfig.temperature).toBe(0.7);
  });

  it("constructs correct URL for non-streaming", () => {
    const result = translateToProvider(openaiRequest, "GOOGLE");
    expect(result.url).toContain("generativelanguage.googleapis.com");
    expect(result.url).toContain(":generateContent");
    expect(result.url).not.toContain("streamGenerateContent");
  });

  it("constructs correct URL for streaming", () => {
    const streamReq = { ...openaiRequest, stream: true };
    const result = translateToProvider(streamReq, "GOOGLE");
    expect(result.url).toContain(":streamGenerateContent?alt=sse");
  });

  it("maps top_p to topP", () => {
    const reqWithTopP = { ...openaiRequest, top_p: 0.95 };
    const result = translateToProvider(reqWithTopP, "GOOGLE");
    expect(result.body.generationConfig.topP).toBe(0.95);
  });
});

describe("translateResponseToOpenAI — Anthropic response", () => {
  const anthropicResponse = {
    id: "msg_123",
    content: [{ type: "text", text: "Hello from Claude!" }],
    model: "claude-3-5-sonnet-20241022",
    stop_reason: "end_turn",
    usage: { input_tokens: 10, output_tokens: 20 },
  };

  it("translates to OpenAI format", () => {
    const result = translateResponseToOpenAI("ANTHROPIC", anthropicResponse, "claude-3-5-sonnet-20241022");
    expect(result.object).toBe("chat.completion");
    expect(result.choices[0].message.content).toBe("Hello from Claude!");
    expect(result.choices[0].message.role).toBe("assistant");
    expect(result.choices[0].finish_reason).toBe("stop");
  });

  it("maps usage correctly", () => {
    const result = translateResponseToOpenAI("ANTHROPIC", anthropicResponse, "claude-3-5-sonnet-20241022");
    expect(result.usage.prompt_tokens).toBe(10);
    expect(result.usage.completion_tokens).toBe(20);
    expect(result.usage.total_tokens).toBe(30);
  });
});

describe("translateResponseToOpenAI — Google response", () => {
  const googleResponse = {
    candidates: [{
      content: { parts: [{ text: "Hello from Gemini!" }] },
      finishReason: "STOP",
    }],
    usageMetadata: { promptTokenCount: 15, candidatesTokenCount: 25, totalTokenCount: 40 },
  };

  it("translates to OpenAI format", () => {
    const result = translateResponseToOpenAI("GOOGLE", googleResponse, "gemini-1.5-pro");
    expect(result.object).toBe("chat.completion");
    expect(result.choices[0].message.content).toBe("Hello from Gemini!");
    expect(result.choices[0].finish_reason).toBe("stop");
  });

  it("maps usage correctly", () => {
    const result = translateResponseToOpenAI("GOOGLE", googleResponse, "gemini-1.5-pro");
    expect(result.usage.prompt_tokens).toBe(15);
    expect(result.usage.completion_tokens).toBe(25);
    expect(result.usage.total_tokens).toBe(40);
  });
});

describe("setProviderAuth", () => {
  it("sets Bearer token for OpenAI", () => {
    const { headers } = setProviderAuth({}, "OPENAI", "sk-test", "https://api.openai.com/v1/chat/completions");
    expect(headers["Authorization"]).toBe("Bearer sk-test");
  });

  it("sets x-api-key for Anthropic", () => {
    const { headers } = setProviderAuth({}, "ANTHROPIC", "sk-ant-test", "https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("sk-ant-test");
  });

  it("appends key as query param for Google", () => {
    const { url } = setProviderAuth({}, "GOOGLE", "google-key", "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent");
    expect(url).toContain("?key=google-key");
  });

  it("uses & separator when URL already has query params", () => {
    const { url } = setProviderAuth({}, "GOOGLE", "google-key", "https://example.com?alt=sse");
    expect(url).toContain("&key=google-key");
  });
});
