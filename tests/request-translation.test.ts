import { describe, it, expect } from "vitest";
import {
  translateToProvider,
  translateResponseToOpenAI,
  detectProvider,
  setProviderAuth,
  sanitizeProviderBody,
} from "../server/lib/proxy/translate";
import { effectiveAzureApiVersion } from "../server/lib/providers/azure-openai";

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
  it("detects OpenAI models", async () => {
    expect((await detectProvider("gpt-4o"))?.provider).toBe("OPENAI");
    expect((await detectProvider("gpt-3.5-turbo"))?.provider).toBe("OPENAI");
    expect((await detectProvider("o3-mini"))?.provider).toBe("OPENAI");
    expect((await detectProvider("o4-mini"))?.provider).toBe("OPENAI");
  });

  it("detects Anthropic models", async () => {
    expect((await detectProvider("claude-3-5-sonnet-20241022"))?.provider).toBe("ANTHROPIC");
    expect((await detectProvider("claude-3-opus-20240229"))?.provider).toBe("ANTHROPIC");
  });

  it("detects Google models", async () => {
    expect((await detectProvider("gemini-1.5-pro"))?.provider).toBe("GOOGLE");
    expect((await detectProvider("gemini-2.0-flash"))?.provider).toBe("GOOGLE");
  });

  it("returns null for unknown models", async () => {
    expect(await detectProvider("llama-3")).toBeNull();
    expect(await detectProvider("mistral-7b")).toBeNull();
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

  it("sets api-key header for Azure OpenAI", () => {
    const { headers } = setProviderAuth({}, "AZURE_OPENAI", "azure-key-123", "https://myresource.openai.azure.com/openai/v1/chat/completions");
    expect(headers["api-key"]).toBe("azure-key-123");
    expect(headers["Authorization"]).toBeUndefined();
  });
});

describe("translateToProvider — Azure OpenAI v1 mode", () => {
  const azureContextV1 = {
    baseUrl: "https://myresource.openai.azure.com",
    endpointMode: "v1" as const,
    deploymentName: "nebula-gpt4o",
    modelId: "gpt-4o",
  };

  it("constructs v1 URL correctly", () => {
    const result = translateToProvider(openaiRequest, "AZURE_OPENAI", 1000, azureContextV1);
    expect(result.url).toBe("https://myresource.openai.azure.com/openai/v1/chat/completions");
  });

  it("sets model to deployment name in v1 mode", () => {
    const result = translateToProvider(openaiRequest, "AZURE_OPENAI", 1000, azureContextV1);
    expect(result.body.model).toBe("nebula-gpt4o");
  });

  it("preserves messages and max_tokens", () => {
    const result = translateToProvider(openaiRequest, "AZURE_OPENAI", 1000, azureContextV1);
    expect(result.body.messages).toEqual(openaiRequest.messages);
    expect(result.body.max_tokens).toBe(1000);
  });
});

describe("translateToProvider — Azure OpenAI legacy mode", () => {
  const azureContextLegacy = {
    baseUrl: "https://myresource.openai.azure.com",
    endpointMode: "legacy" as const,
    apiVersion: "2024-10-21",
    deploymentName: "nebula-gpt4o",
    modelId: "gpt-4o",
  };

  it("constructs legacy URL with deployment and api-version", () => {
    const result = translateToProvider(openaiRequest, "AZURE_OPENAI", 1000, azureContextLegacy);
    expect(result.url).toBe("https://myresource.openai.azure.com/openai/deployments/nebula-gpt4o/chat/completions?api-version=2024-10-21");
  });

  it("removes model from body in legacy mode", () => {
    const result = translateToProvider(openaiRequest, "AZURE_OPENAI", 1000, azureContextLegacy);
    expect(result.body.model).toBeUndefined();
  });
});

describe("translateToProvider — Azure OpenAI reasoning models", () => {
  const azureContextReasoning = {
    baseUrl: "https://myresource.openai.azure.com",
    endpointMode: "v1" as const,
    deploymentName: "nebula-o4-mini",
    modelId: "o4-mini",
  };

  it("uses max_completion_tokens for reasoning models", () => {
    const result = translateToProvider(
      { ...openaiRequest, model: "nebula-o4-mini" },
      "AZURE_OPENAI",
      2000,
      azureContextReasoning
    );
    expect(result.body.max_completion_tokens).toBe(2000);
    expect(result.body.max_tokens).toBeUndefined();
  });
});

describe("sanitizeProviderBody — Azure OpenAI", () => {
  it("reuses OpenAI allow-list for Azure", () => {
    const body = {
      model: "nebula-gpt4o",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 100,
      temperature: 0.5,
      custom_param: "should_be_removed",
    };
    const result = sanitizeProviderBody(body, "AZURE_OPENAI");
    expect(result.model).toBe("nebula-gpt4o");
    expect(result.messages).toEqual(body.messages);
    expect(result.max_tokens).toBe(100);
    expect(result.temperature).toBe(0.5);
    expect(result.custom_param).toBeUndefined();
  });
});

describe("translateToProvider — Azure gpt-5 family uses max_completion_tokens", () => {
  it("uses max_completion_tokens for azure/gpt-5", () => {
    const azureCtx = {
      baseUrl: "https://mygateway.azure-api.net",
      endpointMode: "legacy" as const,
      apiVersion: "2024-12-01-preview",
      deploymentName: "gpt-5",
      modelId: "gpt-5",
    };
    const result = translateToProvider(
      { ...openaiRequest, model: "gpt-5" },
      "AZURE_OPENAI",
      10,
      azureCtx,
    );
    expect(result.body.max_completion_tokens).toBe(10);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("uses max_completion_tokens for azure/gpt-5-mini", () => {
    const azureCtx = {
      baseUrl: "https://mygateway.azure-api.net",
      endpointMode: "legacy" as const,
      apiVersion: "2024-12-01-preview",
      deploymentName: "gpt-5-mini",
      modelId: "gpt-5-mini",
    };
    const result = translateToProvider(
      { ...openaiRequest, model: "gpt-5-mini" },
      "AZURE_OPENAI",
      10,
      azureCtx,
    );
    expect(result.body.max_completion_tokens).toBe(10);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("still uses max_tokens for azure/gpt-4o (non-reasoning)", () => {
    const azureCtx = {
      baseUrl: "https://mygateway.azure-api.net",
      endpointMode: "legacy" as const,
      apiVersion: "2024-12-01-preview",
      deploymentName: "gpt-4o",
      modelId: "gpt-4o",
    };
    const result = translateToProvider(
      { ...openaiRequest, model: "gpt-4o" },
      "AZURE_OPENAI",
      1000,
      azureCtx,
    );
    expect(result.body.max_tokens).toBe(1000);
    expect(result.body.max_completion_tokens).toBeUndefined();
  });

  it("constructs URL with default api-version 2024-12-01-preview for azure/o3", () => {
    const azureCtx = {
      baseUrl: "https://mygateway.azure-api.net",
      endpointMode: "legacy" as const,
      deploymentName: "o3",
      modelId: "o3",
    };
    const result = translateToProvider(
      { ...openaiRequest, model: "o3" },
      "AZURE_OPENAI",
      100,
      azureCtx,
    );
    expect(result.url).toContain("api-version=2024-12-01-preview");
  });
});

describe("translateResponseToOpenAI — Azure OpenAI", () => {
  it("passes through Azure response (same as OpenAI)", () => {
    const azureResponse = {
      id: "chatcmpl-abc123",
      object: "chat.completion",
      created: 1700000000,
      model: "gpt-4o",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Hello from Azure!" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    };
    const result = translateResponseToOpenAI("AZURE_OPENAI", azureResponse, "nebula-gpt4o");
    expect(result).toBe(azureResponse);
  });
});

describe("effectiveAzureApiVersion", () => {
  it("returns 2024-12-01-preview for o3 with no user value", () => {
    expect(effectiveAzureApiVersion("o3", null)).toBe("2024-12-01-preview");
  });

  it("overrides old user-pinned value for o3", () => {
    expect(effectiveAzureApiVersion("o3", "2024-10-21")).toBe("2024-12-01-preview");
  });

  it("respects newer user value for o3", () => {
    expect(effectiveAzureApiVersion("o3", "2025-04-01-preview")).toBe("2025-04-01-preview");
  });

  it("returns 2024-12-01-preview for gpt-5 with no user value", () => {
    expect(effectiveAzureApiVersion("gpt-5", null)).toBe("2024-12-01-preview");
  });

  it("returns 2024-12-01-preview for gpt-4o with no user value (default floor)", () => {
    expect(effectiveAzureApiVersion("gpt-4o", null)).toBe("2024-12-01-preview");
  });

  it("floors gpt-4o at default even when user pinned older", () => {
    expect(effectiveAzureApiVersion("gpt-4o", "2024-10-21")).toBe("2024-12-01-preview");
  });

  it("end-to-end: azure/o3 with stored 2024-10-21 produces correct URL", () => {
    const azureCtx = {
      baseUrl: "https://mygateway.azure-api.net",
      endpointMode: "legacy" as const,
      apiVersion: effectiveAzureApiVersion("o3", "2024-10-21"),
      deploymentName: "o3",
      modelId: "o3",
    };
    const result = translateToProvider(
      { ...openaiRequest, model: "o3" },
      "AZURE_OPENAI",
      100,
      azureCtx,
    );
    expect(result.url).toContain("api-version=2024-12-01-preview");
    expect(result.url).not.toContain("2024-10-21");
  });
});

describe("max_tokens / max_completion_tokens normalization", () => {
  const baseReq = {
    model: "gpt-4o",
    messages: [{ role: "user", content: "hi" }],
    stream: false,
  };

  it("TEST 1 — injection invariant: never sends both fields (property test)", () => {
    const combos = [
      { max_tokens: undefined, max_completion_tokens: undefined },
      { max_tokens: 100, max_completion_tokens: undefined },
      { max_tokens: undefined, max_completion_tokens: 100 },
      { max_tokens: 100, max_completion_tokens: 200 },
    ];
    const caps = [undefined, 500, 4000, 100000];
    const models = ["gpt-4o", "gpt-4.1-mini", "o3", "gpt-5", "o4-mini"];
    const providers: Array<{ p: "OPENAI" | "AZURE_OPENAI"; ctx?: any }> = [
      { p: "OPENAI" },
      { p: "AZURE_OPENAI", ctx: { baseUrl: "https://test.azure.com", endpointMode: "legacy" as const, apiVersion: "2024-12-01-preview", deploymentName: "gpt-4o", modelId: "gpt-4o" } },
    ];
    let tested = 0;
    for (const combo of combos) {
      for (const cap of caps) {
        for (const model of models) {
          for (const { p, ctx } of providers) {
            const req = { ...baseReq, model, ...combo };
            const azCtx = ctx ? { ...ctx, deploymentName: model, modelId: model } : undefined;
            if (p === "AZURE_OPENAI" && !azCtx) continue;
            const result = translateToProvider(req, p, cap, azCtx);
            const hasBoth = result.body.max_tokens !== undefined && result.body.max_completion_tokens !== undefined;
            expect(hasBoth, `both fields set for model=${model} provider=${p} cap=${cap} combo=${JSON.stringify(combo)}`).toBe(false);
            tested++;
          }
        }
      }
    }
    expect(tested).toBeGreaterThan(100);
  });

  it("TEST 2 — modern SDK: client sends only max_completion_tokens → preserved for gpt-4o (OpenAI)", () => {
    const req = { ...baseReq, max_completion_tokens: 10 };
    const result = translateToProvider(req, "OPENAI");
    expect(result.body.max_completion_tokens).toBe(10);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("TEST 3 — modern SDK: client sends only max_completion_tokens → preserved for azure/gpt-4o", () => {
    const req = { ...baseReq, max_completion_tokens: 10 };
    const azCtx = { baseUrl: "https://test.azure.com", endpointMode: "legacy" as const, apiVersion: "2024-12-01-preview", deploymentName: "gpt-4o", modelId: "gpt-4o" };
    const result = translateToProvider(req, "AZURE_OPENAI", undefined, azCtx);
    expect(result.body.max_completion_tokens).toBe(10);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("TEST 4 — legacy field preserved: client sends only max_tokens → kept as max_tokens", () => {
    const req = { ...baseReq, max_tokens: 10 };
    const result = translateToProvider(req, "OPENAI");
    expect(result.body.max_tokens).toBe(10);
    expect(result.body.max_completion_tokens).toBeUndefined();
  });

  it("TEST 5 — budget clamp (modern): cap=4000, client sends max_completion_tokens=10000 → clamped", () => {
    const req = { ...baseReq, max_completion_tokens: 10000 };
    const result = translateToProvider(req, "OPENAI", 4000);
    expect(result.body.max_completion_tokens).toBe(4000);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("TEST 6 — budget clamp (legacy): cap=4000, client sends max_tokens=10000 → clamped, field preserved", () => {
    const req = { ...baseReq, max_tokens: 10000 };
    const result = translateToProvider(req, "OPENAI", 4000);
    expect(result.body.max_tokens).toBe(4000);
    expect(result.body.max_completion_tokens).toBeUndefined();
  });

  it("TEST 7 — neither supplied + cap exists → injects max_completion_tokens (modern)", () => {
    const req = { ...baseReq };
    const result = translateToProvider(req, "OPENAI", 4000);
    expect(result.body.max_completion_tokens).toBe(4000);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("TEST 8 — reasoning model: client sends max_completion_tokens → preserved, no max_tokens", () => {
    const req = { ...baseReq, model: "gpt-5", max_completion_tokens: 50 };
    const result = translateToProvider(req, "OPENAI");
    expect(result.body.max_completion_tokens).toBe(50);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("TEST 10 — cross-path parity: same body via OpenAI and Azure both succeed", () => {
    const req = { ...baseReq, max_completion_tokens: 10 };
    const openaiResult = translateToProvider(req, "OPENAI");
    const azCtx = { baseUrl: "https://test.azure.com", endpointMode: "legacy" as const, apiVersion: "2024-12-01-preview", deploymentName: "gpt-4o", modelId: "gpt-4o" };
    const azureResult = translateToProvider(req, "AZURE_OPENAI", undefined, azCtx);

    expect(openaiResult.body.max_completion_tokens).toBe(10);
    expect(openaiResult.body.max_tokens).toBeUndefined();
    expect(azureResult.body.max_completion_tokens).toBe(10);
    expect(azureResult.body.max_tokens).toBeUndefined();
  });

  it("TEST 11 — neither supplied + no cap → no cap field injected (provider decides)", () => {
    const req = { ...baseReq };
    const result = translateToProvider(req, "OPENAI");
    expect(result.body.max_tokens).toBeUndefined();
    expect(result.body.max_completion_tokens).toBeUndefined();
  });

  it("TEST 12 — neither supplied + no cap → no cap field injected (Azure)", () => {
    const req = { ...baseReq };
    const azCtx = { baseUrl: "https://test.azure.com", endpointMode: "legacy" as const, apiVersion: "2024-12-01-preview", deploymentName: "gpt-4o", modelId: "gpt-4o" };
    const result = translateToProvider(req, "AZURE_OPENAI", undefined, azCtx);
    expect(result.body.max_tokens).toBeUndefined();
    expect(result.body.max_completion_tokens).toBeUndefined();
  });
});

describe("parity-by-shape: forwarded body shape per model/cap combo", () => {
  const msg = [{ role: "user", content: "hi" }] as any;
  const azCtxFor = (model: string) => ({
    baseUrl: "https://test.azure.com",
    endpointMode: "legacy" as const,
    apiVersion: "2024-12-01-preview",
    deploymentName: model,
    modelId: model,
  });

  const cases: Array<{
    label: string;
    model: string;
    provider: "OPENAI" | "AZURE_OPENAI";
    input: Record<string, any>;
    cap?: number;
    expectMT?: number;
    expectMCT?: number;
  }> = [
    { label: "azure/gpt-5 no-cap", model: "gpt-5", provider: "AZURE_OPENAI", input: {}, expectMT: undefined, expectMCT: undefined },
    { label: "azure/gpt-5 max_tokens:10", model: "gpt-5", provider: "AZURE_OPENAI", input: { max_tokens: 10 }, expectMCT: 10 },
    { label: "azure/gpt-5 max_completion_tokens:50", model: "gpt-5", provider: "AZURE_OPENAI", input: { max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "azure/gpt-5 both", model: "gpt-5", provider: "AZURE_OPENAI", input: { max_tokens: 10, max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "azure/gpt-4o no-cap", model: "gpt-4o", provider: "AZURE_OPENAI", input: {}, expectMT: undefined, expectMCT: undefined },
    { label: "azure/gpt-4o max_tokens:10", model: "gpt-4o", provider: "AZURE_OPENAI", input: { max_tokens: 10 }, expectMT: 10 },
    { label: "azure/gpt-4o max_completion_tokens:50", model: "gpt-4o", provider: "AZURE_OPENAI", input: { max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "azure/gpt-4o both", model: "gpt-4o", provider: "AZURE_OPENAI", input: { max_tokens: 10, max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "gpt-5 no-cap", model: "gpt-5", provider: "OPENAI", input: {}, expectMT: undefined, expectMCT: undefined },
    { label: "gpt-5 max_tokens:10", model: "gpt-5", provider: "OPENAI", input: { max_tokens: 10 }, expectMCT: 10 },
    { label: "gpt-5 max_completion_tokens:50", model: "gpt-5", provider: "OPENAI", input: { max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "gpt-5 both", model: "gpt-5", provider: "OPENAI", input: { max_tokens: 10, max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "gpt-4o no-cap", model: "gpt-4o", provider: "OPENAI", input: {}, expectMT: undefined, expectMCT: undefined },
    { label: "gpt-4o max_tokens:10", model: "gpt-4o", provider: "OPENAI", input: { max_tokens: 10 }, expectMT: 10 },
    { label: "gpt-4o max_completion_tokens:50", model: "gpt-4o", provider: "OPENAI", input: { max_completion_tokens: 50 }, expectMCT: 50 },
    { label: "gpt-4o both", model: "gpt-4o", provider: "OPENAI", input: { max_tokens: 10, max_completion_tokens: 50 }, expectMCT: 50 },
  ];

  for (const c of cases) {
    it(c.label, () => {
      const req = { model: c.model, messages: msg, stream: false, ...c.input };
      const cap = c.input.max_completion_tokens ?? c.input.max_tokens;
      const azCtx = c.provider === "AZURE_OPENAI" ? azCtxFor(c.model) : undefined;
      const result = translateToProvider(req, c.provider, cap, azCtx);
      if (c.expectMT !== undefined) {
        expect(result.body.max_tokens).toBe(c.expectMT);
      } else {
        expect(result.body.max_tokens).toBeUndefined();
      }
      if (c.expectMCT !== undefined) {
        expect(result.body.max_completion_tokens).toBe(c.expectMCT);
      } else {
        expect(result.body.max_completion_tokens).toBeUndefined();
      }
    });
  }
});

describe("client-cap-honored: budget cap does not override client cap", () => {
  const msg = [{ role: "user", content: "hi" }] as any;

  it("reasoning model: client MCT:50, voucher cap 4000 → forwarded MCT:50", () => {
    const req = { model: "gpt-5", messages: msg, stream: false, max_completion_tokens: 50 };
    const result = translateToProvider(req, "OPENAI", 50);
    expect(result.body.max_completion_tokens).toBe(50);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("azure reasoning: client MCT:50, voucher cap 4000 → forwarded MCT:50", () => {
    const req = { model: "gpt-5", messages: msg, stream: false, max_completion_tokens: 50 };
    const azCtx = { baseUrl: "https://test.azure.com", endpointMode: "legacy" as const, apiVersion: "2024-12-01-preview", deploymentName: "gpt-5", modelId: "gpt-5" };
    const result = translateToProvider(req, "AZURE_OPENAI", 50, azCtx);
    expect(result.body.max_completion_tokens).toBe(50);
    expect(result.body.max_tokens).toBeUndefined();
  });

  it("non-reasoning: client MT:100, voucher cap 4000 → forwarded MT:100 (not 4000)", () => {
    const req = { model: "gpt-4o", messages: msg, stream: false, max_tokens: 100 };
    const result = translateToProvider(req, "OPENAI", 100);
    expect(result.body.max_tokens).toBe(100);
    expect(result.body.max_completion_tokens).toBeUndefined();
  });
});

describe("single-cap-field invariant — Azure adapter fuzz (100 random bodies)", () => {
  const msg = [{ role: "user", content: "hi" }] as any;
  const models = ["gpt-4o", "gpt-4.1-mini", "o3", "gpt-5", "o4-mini", "gpt-5-mini"];
  const azCtxFor = (model: string) => ({
    baseUrl: "https://test.azure.com",
    endpointMode: "legacy" as const,
    apiVersion: "2024-12-01-preview",
    deploymentName: model,
    modelId: model,
  });

  it("fuzz: never sends both cap fields for AZURE_OPENAI", () => {
    let tested = 0;
    for (let i = 0; i < 120; i++) {
      const model = models[i % models.length];
      const mt = Math.random() > 0.5 ? Math.floor(Math.random() * 10000) + 1 : undefined;
      const mct = Math.random() > 0.5 ? Math.floor(Math.random() * 10000) + 1 : undefined;
      const cap = Math.random() > 0.3 ? Math.floor(Math.random() * 8000) + 50 : undefined;

      const req: any = { model, messages: msg, stream: false };
      if (mt !== undefined) req.max_tokens = mt;
      if (mct !== undefined) req.max_completion_tokens = mct;

      const clientCap = mct ?? mt;
      const effectiveCap = cap !== undefined
        ? (clientCap !== undefined ? Math.min(clientCap, cap) : cap)
        : clientCap;

      const result = translateToProvider(req, "AZURE_OPENAI", effectiveCap, azCtxFor(model));
      const hasBoth = result.body.max_tokens !== undefined && result.body.max_completion_tokens !== undefined;
      expect(hasBoth, `both fields for i=${i} model=${model} mt=${mt} mct=${mct} cap=${cap}`).toBe(false);
      tested++;
    }
    expect(tested).toBeGreaterThanOrEqual(100);
  });
});
