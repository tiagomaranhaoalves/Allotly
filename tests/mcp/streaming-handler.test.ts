/**
 * V1.5.0 M4 — behavioural tests for processChatCompletionStreaming.
 *
 * These tests mock the storage / redis / fetch boundary and exercise the
 * orchestration logic in handler-streaming.ts directly so we can assert
 * actual reservation / settlement / refund / disconnect accounting —
 * not just static source-string shapes. They complement the
 * source-shape parity guards in `streaming.test.ts`.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mocks must be declared BEFORE the import under test. ----

const safeguardCalls = {
  reserveBudget: vi.fn(),
  refundBudget: vi.fn(),
  adjustBudgetAfterResponse: vi.fn(),
  releaseRateLimit: vi.fn(),
  releaseConcurrency: vi.fn(),
  checkConcurrency: vi.fn(),
  checkRateLimit: vi.fn(),
  checkBundleRequestPool: vi.fn(),
  incrementBundleRequests: vi.fn(),
  getBundleRequestsRemaining: vi.fn(),
};

vi.mock("../../server/lib/proxy/safeguards", async () => {
  const actual: any = await vi.importActual("../../server/lib/proxy/safeguards");
  return {
    ...actual,
    checkConcurrency: (...a: any[]) => safeguardCalls.checkConcurrency(...a),
    checkRateLimit: (...a: any[]) => safeguardCalls.checkRateLimit(...a),
    releaseRateLimit: (...a: any[]) => safeguardCalls.releaseRateLimit(...a),
    releaseConcurrency: (...a: any[]) => safeguardCalls.releaseConcurrency(...a),
    reserveBudget: (...a: any[]) => safeguardCalls.reserveBudget(...a),
    refundBudget: (...a: any[]) => safeguardCalls.refundBudget(...a),
    adjustBudgetAfterResponse: (...a: any[]) => safeguardCalls.adjustBudgetAfterResponse(...a),
    checkBundleRequestPool: (...a: any[]) => safeguardCalls.checkBundleRequestPool(...a),
    incrementBundleRequests: (...a: any[]) => safeguardCalls.incrementBundleRequests(...a),
    getBundleRequestsRemaining: (...a: any[]) => safeguardCalls.getBundleRequestsRemaining(...a),
  };
});

vi.mock("../../server/storage", () => ({
  storage: {
    getTeam: vi.fn(),
    getOrganization: vi.fn(),
    getProviderConnectionsByOrg: vi.fn(),
    getModelPricingByProvider: vi.fn(),
    getMembership: vi.fn(),
    updateMembership: vi.fn(),
    createProxyRequestLog: vi.fn(),
    settleSpendWithCarry: vi.fn(),
  },
}));

vi.mock("../../server/lib/encryption", () => ({
  decryptProviderKey: vi.fn(() => "fake-key"),
}));

vi.mock("../../server/lib/redis", () => ({
  redisGet: vi.fn(async () => null),
  redisSet: vi.fn(async () => undefined),
  REDIS_KEYS: {
    budget: (id: string) => `budget:${id}`,
    ratelimit: (id: string) => `rl:${id}`,
    modelPrice: (p: string, m: string) => `mp:${p}:${m}`,
  },
}));

vi.mock("../../server/lib/proxy/translate", async () => {
  const actual: any = await vi.importActual("../../server/lib/proxy/translate");
  return {
    ...actual,
    detectProvider: vi.fn(() => ({ provider: "OPENAI", strippedModel: null })),
    translateToProvider: vi.fn((body: any) => ({
      method: "POST",
      url: "https://api.openai.com/v1/chat/completions",
      headers: { "content-type": "application/json" },
      body,
    })),
    setProviderAuth: vi.fn((headers: any, _p: string, _key: string, url: string) => ({ headers, url })),
    sanitizeProviderBody: (b: any) => b,
    translateStreamChunkToOpenAI: actual.translateStreamChunkToOpenAI,
  };
});

import { processChatCompletionStreaming } from "../../server/lib/proxy/handler-streaming";
import { storage } from "../../server/storage";
import { detectProvider } from "../../server/lib/proxy/translate";
import { calculateSettledCostCents } from "../../server/lib/proxy/safeguards";

function makeMembership() {
  return {
    id: "m-1",
    teamId: "t-1",
    monthlyBudgetCents: 100_000,
    currentPeriodSpendCents: 0,
    accessType: "MEMBER",
    voucherExpiresAt: null,
    periodEnd: new Date(Date.now() + 30 * 86_400_000),
  };
}

function makeUpstreamSse(chunks: string[]): globalThis.Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(`data: ${c}\n\n`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }) as any;
}

function setupHappyDeps() {
  (storage.getTeam as any).mockResolvedValue({ id: "t-1", orgId: "o-1" });
  (storage.getOrganization as any).mockResolvedValue({ id: "o-1", plan: "PRO" });
  (storage.getProviderConnectionsByOrg as any).mockResolvedValue([
    {
      provider: "OPENAI",
      status: "ACTIVE",
      adminApiKeyEncrypted: "x", adminApiKeyIv: "y", adminApiKeyTag: "z",
    },
  ]);
  (storage.getModelPricingByProvider as any).mockResolvedValue([
    { modelId: "gpt-4o-mini", inputPricePerMTok: 100, outputPricePerMTok: 200, isActive: true, maxOutputTokens: null },
  ]);
  (storage.getMembership as any).mockResolvedValue(makeMembership());
  (storage.updateMembership as any).mockResolvedValue(undefined);
  (storage.createProxyRequestLog as any).mockResolvedValue(undefined);
  // Mirror the real carry from a zero remainder: crossedCents = floor(micro/1c).
  // The handler now feeds crossedCents (not the rounded display cost) to
  // adjustBudgetAfterResponse, so the cap decrements by true whole-cents.
  (storage.settleSpendWithCarry as any).mockImplementation((_id: string, micro: number) =>
    Promise.resolve({ crossedCents: Math.floor(micro / 1_000_000), newSpendCents: Math.floor(micro / 1_000_000) }),
  );

  safeguardCalls.checkConcurrency.mockResolvedValue(null);
  safeguardCalls.checkRateLimit.mockResolvedValue(null);
  safeguardCalls.checkBundleRequestPool.mockResolvedValue(null);
  safeguardCalls.getBundleRequestsRemaining.mockResolvedValue(null);
  safeguardCalls.reserveBudget.mockResolvedValue({ ok: true });
  safeguardCalls.refundBudget.mockResolvedValue(undefined);
  safeguardCalls.adjustBudgetAfterResponse.mockResolvedValue(undefined);
  safeguardCalls.releaseRateLimit.mockResolvedValue(undefined);
  safeguardCalls.releaseConcurrency.mockResolvedValue(undefined);
  safeguardCalls.incrementBundleRequests.mockResolvedValue(undefined);
}

describe("processChatCompletionStreaming — behavioural accounting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyDeps();
  });

  it("happy path: reserves, settles to actual cost, releases concurrency only (RPM stays)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeUpstreamSse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: "Hello" } }] }),
      JSON.stringify({ choices: [{ index: 0, delta: { content: " world" }, finish_reason: "stop" }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }),
    ]));
    (globalThis as any).fetch = fetchMock;

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const ac = new AbortController();

    await processChatCompletionStreaming(
      {
        membership: makeMembership(),
        userId: "u-1",
        apiKeyId: null,
        body: { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 50 },
        requestId: "r-happy",
        abortSignal: ac.signal,
      },
      onChunk,
      onComplete,
      onError,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);
    // Reservation must have happened with input + output cap cost.
    expect(safeguardCalls.reserveBudget).toHaveBeenCalledTimes(1);
    // Adjust must have settled to ACTUAL cost (not the reservation).
    expect(safeguardCalls.adjustBudgetAfterResponse).toHaveBeenCalledTimes(1);
    // Success path: concurrency released, RPM (releaseRateLimit) NOT released.
    expect(safeguardCalls.releaseConcurrency).toHaveBeenCalledTimes(1);
    expect(safeguardCalls.releaseRateLimit).not.toHaveBeenCalled();
    // No refund on success.
    expect(safeguardCalls.refundBudget).not.toHaveBeenCalled();
  });

  it("empty response: refunds full reservation, releases BOTH rate-limit and concurrency, surfaces 502 empty_response", async () => {
    // Upstream returns no content delta and zero completion_tokens.
    const fetchMock = vi.fn().mockResolvedValue(makeUpstreamSse([
      JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 10, completion_tokens: 0, total_tokens: 10 } }),
    ]));
    (globalThis as any).fetch = fetchMock;

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();
    const ac = new AbortController();

    await processChatCompletionStreaming(
      {
        membership: makeMembership(),
        userId: "u-1",
        apiKeyId: null,
        body: { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 50 },
        requestId: "r-empty",
        abortSignal: ac.signal,
      },
      onChunk,
      onComplete,
      onError,
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const errArg = onError.mock.calls[0][0];
    expect(errArg.errorBody.code).toBe("empty_response");
    expect(errArg.status).toBe(502);
    // Full reservation refunded.
    expect(safeguardCalls.refundBudget).toHaveBeenCalledTimes(1);
    // Empty-response parity: BOTH counters released (treated as
    // non-billable failed call, matching handler.ts:434-436).
    expect(safeguardCalls.releaseConcurrency).toHaveBeenCalledTimes(1);
    expect(safeguardCalls.releaseRateLimit).toHaveBeenCalledTimes(1);
    // No partial settle on empty response.
    expect(safeguardCalls.adjustBudgetAfterResponse).not.toHaveBeenCalled();
  });

  it("client disconnect mid-stream: settles to actual-so-far, releases concurrency only, audits -32099", async () => {
    // Build a stream that yields one chunk then hangs until aborted.
    const ac = new AbortController();
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "Hi" } }] })}\n\n`));
        // Schedule an abort after the first chunk is delivered.
        setTimeout(() => {
          ac.abort();
          try { controller.error(new DOMException("aborted", "AbortError")); } catch {}
        }, 20);
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, {
      status: 200, headers: { "content-type": "text/event-stream" },
    }) as any);
    (globalThis as any).fetch = fetchMock;

    const onChunk = vi.fn();
    const onComplete = vi.fn();
    const onError = vi.fn();

    await processChatCompletionStreaming(
      {
        membership: makeMembership(),
        userId: "u-1",
        apiKeyId: null,
        body: { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 50 },
        requestId: "r-abort",
        abortSignal: ac.signal,
      },
      onChunk,
      onComplete,
      onError,
    );

    expect(onComplete).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    const errArg = onError.mock.calls[0][0];
    // Client-initiated abort MUST be deterministically classified as
    // client_disconnected (-32099) — never as provider_stream_interrupted.
    // If the abort surfaces via a thrown reader error, the catch block
    // must check abortSignal.aborted first and route to the disconnect
    // branch, not the upstream-failure branch.
    expect(errArg.errorBody.code).toBe("client_disconnected");
    expect(errArg.status).toBe(499);
    expect(errArg.errorCode).toBe(-32099);
    // Settled to actual-so-far (NOT a refund).
    expect(safeguardCalls.adjustBudgetAfterResponse).toHaveBeenCalledTimes(1);
    expect(safeguardCalls.refundBudget).not.toHaveBeenCalled();
    // Concurrency released, RPM kept (real upstream work happened).
    expect(safeguardCalls.releaseConcurrency).toHaveBeenCalledTimes(1);
    expect(safeguardCalls.releaseRateLimit).not.toHaveBeenCalled();
    // First chunk did make it to the caller before the abort.
    expect(onChunk).toHaveBeenCalled();
    expect(errArg.emittedChunks).toBe(true);
  });

  it("pre-upstream rate-limit rejection: refunds nothing, releases concurrency only (no reservation made yet)", async () => {
    safeguardCalls.checkRateLimit.mockResolvedValue({ status: 429, code: "rate_limit_exceeded", message: "too many requests" });
    const fetchMock = vi.fn();
    (globalThis as any).fetch = fetchMock;

    const onError = vi.fn();
    const ac = new AbortController();

    await processChatCompletionStreaming(
      {
        membership: makeMembership(),
        userId: "u-1",
        apiKeyId: null,
        body: { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }], max_tokens: 50 },
        requestId: "r-rl",
        abortSignal: ac.signal,
      },
      vi.fn(), vi.fn(), onError,
    );

    expect(onError).toHaveBeenCalledTimes(1);
    const errArg = onError.mock.calls[0][0];
    expect(errArg.errorBody.code).toBe("rate_limit_exceeded");
    // Never reached upstream.
    expect(fetchMock).not.toHaveBeenCalled();
    // Reservation never made → no refund needed.
    expect(safeguardCalls.reserveBudget).not.toHaveBeenCalled();
    expect(safeguardCalls.refundBudget).not.toHaveBeenCalled();
    // RPM-rejected requests release concurrency that was acquired before
    // the rate-limit check (mirrors handler.ts) — verify the flag is
    // honoured and concurrency is freed.
    expect(safeguardCalls.releaseConcurrency).toHaveBeenCalledTimes(1);
  });

  it("uses pricing.maxOutputTokens fallback when caller omits max_tokens (no 4096 reservation)", async () => {
    // Pricing row supplies a 8000-token cap.
    (storage.getModelPricingByProvider as any).mockResolvedValue([
      { modelId: "gpt-4o-mini", inputPricePerMTok: 100, outputPricePerMTok: 200, isActive: true, maxOutputTokens: 8000 },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(makeUpstreamSse([
      JSON.stringify({ choices: [{ index: 0, delta: { content: "ok" }, finish_reason: "stop" }] }),
      JSON.stringify({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 } }),
    ]));
    (globalThis as any).fetch = fetchMock;

    const ac = new AbortController();
    await processChatCompletionStreaming(
      {
        membership: makeMembership(),
        userId: "u-1",
        apiKeyId: null,
        // NB: NO max_tokens — must use pricing.maxOutputTokens.
        body: { model: "gpt-4o-mini", messages: [{ role: "user", content: "hi" }] },
        requestId: "r-cap",
        abortSignal: ac.signal,
      },
      vi.fn(), vi.fn(), vi.fn(),
    );

    expect(safeguardCalls.reserveBudget).toHaveBeenCalledTimes(1);
    const reservedAmount = safeguardCalls.reserveBudget.mock.calls[0][1] as number;
    // Output cost at 8000 tokens × 200 c/M = 1.6 cents; plus a few input
    // tokens. Reservation must be MUCH less than the 4096 floor would
    // imply if pricing.maxOutputTokens were ignored: 8000 vs 4096 yields
    // a different cost. Assert the reservation tracks the 8000 cap, not
    // the 4096 floor.
    const expectedAt8k = Math.ceil((8000 * 200) / 1_000_000); // cents
    const expectedAt4k = Math.ceil((4096 * 200) / 1_000_000);
    // The reservation includes input cost too, but must be at least the
    // 8000-token output cost (proves we used the pricing cap not 4096).
    expect(reservedAmount).toBeGreaterThanOrEqual(expectedAt8k);
    expect(expectedAt8k).toBeGreaterThan(expectedAt4k); // sanity
  });

  it("Anthropic stream: merges message_start input + cache buckets with message_delta output, settling on all four buckets", async () => {
    // Drive the ANTHROPIC branch so processData exercises the merge: input +
    // cache counts at message_start, output (prompt_tokens 0, no cache) at
    // message_delta. A naive overwrite would drop input + cache and under-bill.
    (detectProvider as any).mockReturnValue({ provider: "ANTHROPIC", strippedModel: null });
    (storage.getProviderConnectionsByOrg as any).mockResolvedValue([
      { provider: "ANTHROPIC", status: "ACTIVE", adminApiKeyEncrypted: "x", adminApiKeyIv: "y", adminApiKeyTag: "z" },
    ]);
    const pricing = { modelId: "claude-test", inputPricePerMTok: 300, outputPricePerMTok: 1500, isActive: true, maxOutputTokens: null };
    (storage.getModelPricingByProvider as any).mockResolvedValue([pricing]);

    const fetchMock = vi.fn().mockResolvedValue(makeUpstreamSse([
      JSON.stringify({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 1_000_000, cache_creation_input_tokens: 200_000, cache_read_input_tokens: 300_000 } } }),
      JSON.stringify({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi" } }),
      JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 100_000 } }),
    ]));
    (globalThis as any).fetch = fetchMock;

    const onComplete = vi.fn();
    const onError = vi.fn();
    const ac = new AbortController();

    await processChatCompletionStreaming(
      {
        membership: makeMembership(),
        userId: "u-1",
        apiKeyId: null,
        body: { model: "claude-test", messages: [{ role: "user", content: "hi" }], max_tokens: 500_000 },
        requestId: "r-anthropic-cache",
        abortSignal: ac.signal,
      },
      vi.fn(), onComplete, onError,
    );

    expect(onError).not.toHaveBeenCalled();
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Settlement must price all four buckets in a single rounding step.
    const expectedCost = calculateSettledCostCents(
      { inputTokens: 1_000_000, outputTokens: 100_000, cacheWriteTokens: 200_000, cacheReadTokens: 300_000 },
      pricing as any,
    );
    // input 300 + output 150 + cache-write 75 + cache-read 9 = 534c.
    expect(expectedCost).toBe(534);
    expect(safeguardCalls.adjustBudgetAfterResponse).toHaveBeenCalledTimes(1);
    const settledArg = safeguardCalls.adjustBudgetAfterResponse.mock.calls[0][2] as number;
    expect(settledArg).toBe(expectedCost);
    // Sanity: dropping the input + cache buckets (overwrite bug) would settle
    // to just the output cost (150c) — prove the merge kept them.
    expect(settledArg).toBeGreaterThan(150);

    // The completion body must report the merged input/output token counts.
    const completeArg = onComplete.mock.calls[0][0];
    expect(completeArg.inputTokens).toBe(1_000_000);
    expect(completeArg.outputTokens).toBe(100_000);
  });
});
