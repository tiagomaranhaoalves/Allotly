/**
 * Task #75 — Verify cached/streaming AI requests are billed correctly end-to-end.
 *
 * These tests drive the streaming token-extraction plumbing that feeds the
 * pure cost function (covered separately by tests/settled-cost.test.ts). The
 * risk they guard against is the Anthropic two-phase usage shape: input +
 * cache counts arrive at `message_start`, output tokens arrive at
 * `message_delta` (with prompt_tokens 0 and no cache buckets). Any code that
 * overwrites instead of merging would clobber the input/cache counts captured
 * at message_start, under-billing cache work and mis-billing input.
 *
 * Coverage:
 *   - streamProviderResponse main loop (Anthropic → OpenAI-shaped output).
 *   - streamProviderResponse trailing-buffer handler (final frame is a
 *     message_delta with no trailing newline).
 *   - streamProviderResponseAsAnthropic (native Anthropic re-frame).
 *   - Fully cache-served prompt (input_tokens: 0, cache_read > 0) — no estimate
 *     substitution, the 0 survives.
 */
import { describe, it, expect } from "vitest";
import {
  streamProviderResponse,
  streamProviderResponseAsAnthropic,
} from "../server/lib/proxy/streaming";

// ---- Test doubles ---------------------------------------------------------

/** Minimal Express Response stand-in capturing writes and end state. */
function makeFakeRes() {
  const writes: string[] = [];
  return {
    headers: {} as Record<string, string>,
    writableEnded: false,
    setHeader(k: string, v: string) {
      this.headers[k] = v;
    },
    write(s: string) {
      writes.push(s);
      return true;
    },
    end() {
      this.writableEnded = true;
    },
    _writes: writes,
  };
}

/**
 * Build an upstream SSE Response from raw bytes so we can control the exact
 * framing — in particular whether the final frame ends in a trailing newline.
 */
function rawSseResponse(raw: string): globalThis.Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(raw));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  }) as any;
}

/**
 * Serialize a list of SSE event objects into `data: <json>` frames.
 * When `trailingNewline` is false the LAST frame is emitted without its
 * terminating "\n\n", so it lands in the consumer's leftover buffer and is
 * handled by the trailing-buffer code path instead of the main loop.
 */
function sseFrames(objs: any[], trailingNewline = true): string {
  const parts = objs.map((o) => `data: ${JSON.stringify(o)}`);
  let raw = parts.join("\n\n");
  raw += trailingNewline ? "\n\n" : "";
  return raw;
}

// Standard Anthropic streaming event sequence with prompt caching.
const MESSAGE_START_CACHED = {
  type: "message_start",
  message: {
    id: "msg_1",
    usage: {
      input_tokens: 1000,
      cache_creation_input_tokens: 200,
      cache_read_input_tokens: 300,
    },
  },
};
const CONTENT_DELTA_A = {
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text: "Hello" },
};
const CONTENT_DELTA_B = {
  type: "content_block_delta",
  index: 0,
  delta: { type: "text_delta", text: " world" },
};
// message_delta carries output_tokens but NO input/cache buckets (prompt 0).
const MESSAGE_DELTA = {
  type: "message_delta",
  delta: { stop_reason: "end_turn" },
  usage: { output_tokens: 50 },
};

// Fully cache-served prompt: input_tokens 0, cache_read > 0, no cache_creation.
const MESSAGE_START_FULLY_CACHED = {
  type: "message_start",
  message: {
    id: "msg_2",
    usage: {
      input_tokens: 0,
      cache_read_input_tokens: 800,
    },
  },
};

// ---------------------------------------------------------------------------
describe("streamProviderResponse — Anthropic usage extraction (OpenAI-shaped)", () => {
  it("retains input + both cache buckets across the message_delta merge (main loop)", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_CACHED, CONTENT_DELTA_A, CONTENT_DELTA_B, MESSAGE_DELTA], true),
    );

    const { usage, fullContent } = await streamProviderResponse(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    expect(usage!.prompt_tokens).toBe(1000);
    expect(usage!.completion_tokens).toBe(50);
    expect(usage!.total_tokens).toBe(1050);
    expect(usage!.cache_creation_input_tokens).toBe(200);
    expect(usage!.cache_read_input_tokens).toBe(300);
    expect(fullContent).toBe("Hello world");
    expect(res.writableEnded).toBe(true);
  });

  it("retains input + cache buckets when the final message_delta lands in the trailing buffer", async () => {
    const res = makeFakeRes();
    // No trailing newline → the message_delta frame is the leftover buffer and
    // is processed by streamProviderResponse's trailing-buffer MERGE handler.
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_CACHED, CONTENT_DELTA_A, CONTENT_DELTA_B, MESSAGE_DELTA], false),
    );

    const { usage, fullContent } = await streamProviderResponse(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    // The trailing message_delta carries prompt_tokens 0 and no cache buckets;
    // the merge must keep the message_start values rather than clobber them.
    expect(usage!.prompt_tokens).toBe(1000);
    expect(usage!.completion_tokens).toBe(50);
    expect(usage!.total_tokens).toBe(1050);
    expect(usage!.cache_creation_input_tokens).toBe(200);
    expect(usage!.cache_read_input_tokens).toBe(300);
    expect(fullContent).toBe("Hello world");
  });

  it("does not substitute an estimate for a fully cache-served prompt (input_tokens 0)", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_FULLY_CACHED, CONTENT_DELTA_A, MESSAGE_DELTA], true),
    );

    const { usage } = await streamProviderResponse(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    // The valid 0 must survive — billing reads it as "no fresh input tokens".
    expect(usage!.prompt_tokens).toBe(0);
    expect(usage!.cache_read_input_tokens).toBe(800);
    // No cache_creation in this prompt → omitted, not fabricated.
    expect(usage!.cache_creation_input_tokens).toBeUndefined();
    expect(usage!.completion_tokens).toBe(50);
    expect(usage!.total_tokens).toBe(50);
  });

  it("retains cache buckets even when the fully-cached message_delta is in the trailing buffer", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_FULLY_CACHED, CONTENT_DELTA_A, MESSAGE_DELTA], false),
    );

    const { usage } = await streamProviderResponse(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    expect(usage!.prompt_tokens).toBe(0);
    expect(usage!.cache_read_input_tokens).toBe(800);
    expect(usage!.cache_creation_input_tokens).toBeUndefined();
    expect(usage!.completion_tokens).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Task #77 — Google streaming usage extraction.
//
// Google reports token usage via `usageMetadata` (promptTokenCount /
// candidatesTokenCount / thoughtsTokenCount) on its final chunk, not as an
// OpenAI-shaped `usage` object. These tests confirm the proxy captures all
// three counts (prompt / candidate / thinking) so settlement bills the real
// provider cost rather than a chars/4 estimate.

// Plain text chunks carry no usageMetadata.
const G_CHUNK_TEXT_A = {
  candidates: [{ content: { parts: [{ text: "Hello" }] }, index: 0 }],
};
const G_CHUNK_TEXT_B = {
  candidates: [{ content: { parts: [{ text: " world" }] }, index: 0 }],
};
// Final chunk: finishReason STOP + authoritative usageMetadata.
const G_FINAL_USAGE = {
  candidates: [{ content: { parts: [] }, finishReason: "STOP", index: 0 }],
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 50,
    thoughtsTokenCount: 30,
  },
};

describe("streamProviderResponse — Google usageMetadata extraction", () => {
  it("captures prompt, candidate, and thinking tokens from the final chunk (main loop)", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([G_CHUNK_TEXT_A, G_CHUNK_TEXT_B, G_FINAL_USAGE], true),
    );

    const { usage, fullContent } = await streamProviderResponse(
      upstream,
      "GOOGLE",
      "gemini-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    expect(usage!.prompt_tokens).toBe(100);
    expect(usage!.completion_tokens).toBe(50);
    expect(usage!.total_tokens).toBe(150);
    // thoughtsTokenCount surfaces as thinking_tokens on the usage object.
    expect((usage as any).thinking_tokens).toBe(30);
    expect(fullContent).toBe("Hello world");
    expect(res.writableEnded).toBe(true);
  });

  it("captures prompt/candidate tokens when the final usageMetadata frame lands in the trailing buffer", async () => {
    const res = makeFakeRes();
    // No trailing newline → the usageMetadata frame is the leftover buffer and
    // is processed by streamProviderResponse's trailing-buffer handler.
    const upstream = rawSseResponse(
      sseFrames([G_CHUNK_TEXT_A, G_CHUNK_TEXT_B, G_FINAL_USAGE], false),
    );

    const { usage, fullContent } = await streamProviderResponse(
      upstream,
      "GOOGLE",
      "gemini-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    // The billing-relevant counts (input + output) must survive the
    // trailing-buffer path; thinking_tokens is informational and not used by
    // calculateSettledCostCents, so the merge intentionally omits it.
    expect(usage!.prompt_tokens).toBe(100);
    expect(usage!.completion_tokens).toBe(50);
    expect(usage!.total_tokens).toBe(150);
    expect(fullContent).toBe("Hello world");
  });
});

// ---------------------------------------------------------------------------
// Task #77 — OpenAI / Azure trailing-usage chunk extraction.
//
// With stream_options.include_usage (which the proxy sets), OpenAI and Azure
// emit a trailing chunk with empty `choices` and a populated `usage` object
// AFTER the finish_reason chunk. These tests confirm that trailing usage is
// captured so settlement bills the real prompt/completion counts.

const O_CHUNK_A = {
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta: { content: "Hello" }, finish_reason: null }],
};
const O_CHUNK_B = {
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta: { content: " world" }, finish_reason: null }],
};
const O_CHUNK_STOP = {
  object: "chat.completion.chunk",
  choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
};
const O_FINAL_USAGE = {
  object: "chat.completion.chunk",
  choices: [],
  usage: { prompt_tokens: 120, completion_tokens: 60, total_tokens: 180 },
};

describe.each(["OPENAI", "AZURE_OPENAI"] as const)(
  "streamProviderResponse — %s trailing usage chunk",
  (provider) => {
    it("captures prompt/completion tokens from the trailing usage chunk (main loop)", async () => {
      const res = makeFakeRes();
      const upstream = rawSseResponse(
        sseFrames([O_CHUNK_A, O_CHUNK_B, O_CHUNK_STOP, O_FINAL_USAGE], true),
      );

      const { usage, fullContent } = await streamProviderResponse(
        upstream,
        provider,
        "gpt-test",
        res as any,
      );

      expect(usage).not.toBeNull();
      expect(usage!.prompt_tokens).toBe(120);
      expect(usage!.completion_tokens).toBe(60);
      expect(usage!.total_tokens).toBe(180);
      expect(fullContent).toBe("Hello world");
      expect(res.writableEnded).toBe(true);
    });

    it("captures usage when the trailing usage chunk lands in the leftover buffer", async () => {
      const res = makeFakeRes();
      // No trailing newline → the empty-choices usage chunk is the leftover
      // buffer, handled by streamProviderResponse's trailing-buffer path.
      const upstream = rawSseResponse(
        sseFrames([O_CHUNK_A, O_CHUNK_B, O_CHUNK_STOP, O_FINAL_USAGE], false),
      );

      const { usage, fullContent } = await streamProviderResponse(
        upstream,
        provider,
        "gpt-test",
        res as any,
      );

      expect(usage).not.toBeNull();
      expect(usage!.prompt_tokens).toBe(120);
      expect(usage!.completion_tokens).toBe(60);
      expect(usage!.total_tokens).toBe(180);
      expect(fullContent).toBe("Hello world");
    });
  },
);

// ---------------------------------------------------------------------------
describe("streamProviderResponseAsAnthropic — native re-frame usage extraction", () => {
  it("retains input_tokens, both cache buckets, and output_tokens", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_CACHED, CONTENT_DELTA_A, CONTENT_DELTA_B, MESSAGE_DELTA], true),
    );

    const { usage, stopReason } = await streamProviderResponseAsAnthropic(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    expect(usage!.input_tokens).toBe(1000);
    expect(usage!.output_tokens).toBe(50);
    expect(usage!.cache_creation_input_tokens).toBe(200);
    expect(usage!.cache_read_input_tokens).toBe(300);
    expect(stopReason).toBe("end_turn");
  });

  it("retains usage when the final message_delta lands in the trailing buffer", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_CACHED, CONTENT_DELTA_A, CONTENT_DELTA_B, MESSAGE_DELTA], false),
    );

    const { usage } = await streamProviderResponseAsAnthropic(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    expect(usage).not.toBeNull();
    expect(usage!.input_tokens).toBe(1000);
    expect(usage!.output_tokens).toBe(50);
    expect(usage!.cache_creation_input_tokens).toBe(200);
    expect(usage!.cache_read_input_tokens).toBe(300);
  });

  it("reports usage (not null) for a fully cache-served prompt so no estimate is substituted", async () => {
    const res = makeFakeRes();
    const upstream = rawSseResponse(
      sseFrames([MESSAGE_START_FULLY_CACHED, CONTENT_DELTA_A, MESSAGE_DELTA], true),
    );

    const { usage } = await streamProviderResponseAsAnthropic(
      upstream,
      "ANTHROPIC",
      "claude-test",
      res as any,
    );

    // usage must be a real object (usageObserved=true via cache_read), NOT null
    // — null would push the caller to estimate input from the prompt text and
    // over-bill a prompt that was entirely a cache hit.
    expect(usage).not.toBeNull();
    expect(usage!.input_tokens).toBe(0);
    expect(usage!.cache_read_input_tokens).toBe(800);
    expect(usage!.cache_creation_input_tokens).toBeUndefined();
    expect(usage!.output_tokens).toBe(50);
  });
});
