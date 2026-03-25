# Allotly Proxy — Technical Architecture

Allotly exposes a single OpenAI-compatible endpoint that transparently proxies requests to OpenAI, Anthropic, and Google while enforcing per-user budgets, rate limits, and concurrency controls. Every request flows through a deterministic pipeline of authentication, validation, budget reservation, provider translation, and post-response reconciliation.

---

## Table of Contents

1. [API Surface](#1-api-surface)
2. [End-to-End Request Flow](#2-end-to-end-request-flow)
3. [Authentication](#3-authentication)
4. [Rate Limiting & Concurrency](#4-rate-limiting--concurrency)
5. [Budget System](#5-budget-system)
6. [Provider Translation Layer](#6-provider-translation-layer)
7. [Streaming Implementation](#7-streaming-implementation)
8. [Parameter Sanitization](#8-parameter-sanitization)
9. [Response Headers](#9-response-headers)
10. [Post-Response Processing](#10-post-response-processing)
11. [Background Jobs](#11-background-jobs)
12. [Redis Key Structure](#12-redis-key-structure)
13. [Security](#13-security)
14. [Error Handling](#14-error-handling)
15. [File Map](#15-file-map)

---

## 1. API Surface

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/chat/completions` | `POST` | Main proxy endpoint (OpenAI-compatible) |
| `/api/v1/models` | `GET` | List available models filtered by provider connections and membership permissions |

Both endpoints require `Authorization: Bearer allotly_sk_...` headers.

The chat completions endpoint accepts the standard OpenAI request schema:

```typescript
{
  model: string,                    // Required — determines provider routing
  messages: [{ role, content }],    // Required — at least one message
  stream?: boolean,                 // Default: false
  max_tokens?: number,              // Optional — subject to budget clamping
  temperature?: number,             // Optional — forwarded to provider
  top_p?: number,                   // Optional — forwarded to provider
  stop?: string | string[],         // Optional — provider-specific handling
  // ...additional params pass through if in provider allow-list
}
```

---

## 2. End-to-End Request Flow

Every request through `handleChatCompletion` follows these steps in order:

```
Request arrives
  │
  ├─ 1. authenticateKey()           → Validate allotly_sk_ key, load membership
  ├─ 2. Load team + organization    → Determine plan tier (FREE/TEAM/ENTERPRISE)
  ├─ 3. checkConcurrency()          → Redis INCR, reject if > maxConcurrent
  ├─ 4. checkRateLimit()            → Redis INCR + 60s EXPIRE, reject if > RPM
  ├─ 5. Parse & validate body       → Zod schema validation
  ├─ 6. detectProvider()            → Route model name to OPENAI/ANTHROPIC/GOOGLE
  ├─ 7. Check allowedProviders      → Membership-level provider restrictions
  ├─ 8. Check allowedModels         → Membership-level model restrictions
  ├─ 9. Load provider connection    → Find active connection with encrypted API key
  ├─ 10. getModelPricing()          → Lookup pricing (Redis cache, 1hr TTL)
  ├─ 11. estimateInputTokens()      → Heuristic: chars / 4
  ├─ 12. clampMaxTokens()           → Reduce max_tokens if budget is low
  ├─ 13. reserveBudget()            → Atomic Redis DECRBY
  ├─ 14. checkBundleRequestPool()   → Voucher bundle request limit (if applicable)
  ├─ 15. decryptProviderKey()       → AES-256-GCM decryption at request time
  ├─ 16. translateToProvider()      → Convert OpenAI format → provider format
  ├─ 17. sanitizeProviderBody()     → Strip unsupported params via allow-list
  ├─ 18. setProviderAuth()          → Inject provider credentials
  ├─ 19. fetch()                    → Send request to upstream provider
  ├─ 20. Response handling          → Stream or non-stream, translate back to OpenAI
  ├─ 21. adjustBudgetAfterResponse()→ Refund/deduct difference (estimated vs actual)
  ├─ 22. releaseConcurrency()       → Decrement concurrent counter
  └─ 23. Async post-processing      → Log, update spend, check alerts, bundle tracking
```

On any error at steps 3-19, all acquired resources are released (concurrency, rate limit, budget reservation) before returning the error.

---

## 3. Authentication

**File:** `server/lib/proxy/safeguards.ts` — `authenticateKey()`

Authentication validates the Allotly API key and loads the associated membership context.

### Flow

1. Extract `Bearer allotly_sk_...` from the `Authorization` header
2. SHA-256 hash the raw key: `crypto.createHash("sha256").update(token).digest("hex")`
3. Check Redis cache (`allotly:apikey:{hash}`, 60s TTL):
   - **Cache hit:** Return cached membership + userId + apiKeyId
   - **Cache miss:** Query database for the key hash
4. Validate key status (`ACTIVE` / `REVOKED` / `EXPIRED`)
5. Load the associated membership and check status:
   - `BUDGET_EXHAUSTED` → 402
   - `SUSPENDED` → 403
   - `EXPIRED` → 403
   - `periodEnd < now` → 403
6. Cache the result in Redis for 60 seconds

### Return Value

```typescript
interface AuthResult {
  membership: TeamMembership;  // Full membership record
  userId: string;              // Owner of the API key
  keyHash: string;             // SHA-256 hash
  apiKeyId: string;            // Database ID of the key
}
```

---

## 4. Rate Limiting & Concurrency

**File:** `server/lib/proxy/safeguards.ts`

### Plan Tiers

Defined in `handler.ts` — `getRateLimitTier()`:

| Plan | Access Type | RPM | Max Concurrent |
|------|------------|-----|----------------|
| FREE | any | 20 | 2 |
| TEAM | VOUCHER | 30 | 2 |
| TEAM | TEAM | 60 | 5 |
| ENTERPRISE | any | 120 | 10 |

### Rate Limiting (`checkRateLimit`)

Uses a Redis counter with a 60-second sliding window:

1. `INCR allotly:ratelimit:{membershipId}`
2. On first increment (count === 1), set `EXPIRE 60`
3. If count > RPM limit → reject with 429

When a rate-limit rejection occurs, the counter is **not** decremented (the request counts against quota by design). However, if a request passes the rate-limit check but fails at a later step (validation, budget, provider error), `releaseRateLimit()` is called to decrement the counter so the failed request doesn't consume quota.

### Concurrency Control (`checkConcurrency`)

Tracks active in-flight requests per membership:

1. `INCR allotly:concurrent:{membershipId}` — increment active count
2. `SET allotly:req:{membershipId}:{requestId} "1" EX 120` — heartbeat key with 120s TTL
3. If count > maxConcurrent → decrement and reject with 429

On request completion (success or error): `releaseConcurrency()` decrements the counter and deletes the heartbeat key. If the counter goes below 0, it's reset to 0.

### Self-Healing

`selfHealConcurrency()` runs every 30 seconds via the scheduler. It scans all `allotly:concurrent:*` keys. If a membership has a positive concurrency count but no active `allotly:req:{membershipId}:*` heartbeat keys (they've expired due to process crash), the counter is reset to 0.

---

## 5. Budget System

**File:** `server/lib/proxy/safeguards.ts`

The budget system uses a **Reservation → Adjustment** pattern to prevent overspending during streaming responses where final cost is unknown at request start.

### Token Estimation

```typescript
estimateInputTokens(messages): number
  → totalChars / 4  (heuristic, includes role names + 4 overhead per message)

estimateInputCostCents(inputTokens, pricing): number
  → ceil((inputTokens * pricing.inputPricePerMTok) / 1_000_000)

calculateOutputCostCents(outputTokens, pricing): number
  → ceil((outputTokens * pricing.outputPricePerMTok) / 1_000_000)
```

### Token Clamping (`clampMaxTokens`)

Dynamically reduces `max_tokens` if the user's remaining budget can't cover the full output:

```
budgetForOutput = remainingBudgetCents - inputCostCents
maxAffordable = floor((budgetForOutput * 1_000_000) / outputPricePerMTok)
```

Decision tree:
- If `budgetForOutput <= 0` → clamp to 50 tokens (minimum)
- If `requestedMaxTokens <= maxAffordable` → use requested value (no clamp)
- If no `requestedMaxTokens`, default to 4096; if that fits → use it
- Otherwise → clamp to `max(50, maxAffordable)`

Returns `{ effectiveMaxTokens, clamped: boolean }`. When clamped, the response includes `X-Allotly-Max-Tokens-Applied` header.

### Budget Reservation (`reserveBudget`)

1. Check Redis for `allotly:budget:{membershipId}`
2. If missing, initialize from PostgreSQL: `monthlyBudgetCents - currentPeriodSpendCents`
3. Atomic `DECRBY` the estimated total cost (input + max output)
4. If balance goes negative → undo with `INCRBY` and reject with 402

### Post-Response Adjustment (`adjustBudgetAfterResponse`)

After the provider returns actual token usage:

```typescript
diff = estimatedCost - actualCost
if diff > 0 → INCRBY (refund overpayment)
if diff < 0 → DECRBY (charge underpayment)
```

### Budget Refund (`refundBudget`)

On any pre-response error (provider unreachable, validation failure, empty response), the full reserved amount is refunded via `INCRBY`.

---

## 6. Provider Translation Layer

**File:** `server/lib/proxy/translate.ts`

### Provider Detection (`detectProvider`)

Routes based on model name prefix:

| Prefix | Provider |
|--------|----------|
| `gpt-*`, `o1*`, `o3*`, `o4*` | OPENAI |
| `claude-*` | ANTHROPIC |
| `gemini-*` | GOOGLE |

### OpenAI Translation

Mostly pass-through with one exception:

- **Reasoning models** (`o1*`, `o3*`, `o4*`): Translates `max_tokens` → `max_completion_tokens` (OpenAI's reasoning model API requires this field name)

**Endpoint:** `https://api.openai.com/v1/chat/completions`

### Anthropic Translation

| OpenAI Field | Anthropic Field |
|-------------|-----------------|
| `messages[role=system]` | Extracted into top-level `system` string |
| `messages[role=user/assistant]` | `messages` array (non-system only) |
| `max_tokens` | `max_tokens` (defaults to 4096 if not provided) |
| `stop` | `stop_sequences` (array) |
| `temperature` | `temperature` |
| `top_p` | `top_p` |

Additional header: `anthropic-version: 2023-06-01`

**Endpoint:** `https://api.anthropic.com/v1/messages`

### Google Translation

| OpenAI Field | Google Field |
|-------------|-------------|
| `messages[role=system]` | `systemInstruction.parts[].text` |
| `messages[role=user]` | `contents[].role = "user"` |
| `messages[role=assistant]` | `contents[].role = "model"` |
| `max_tokens` | `generationConfig.maxOutputTokens` |
| `temperature` | `generationConfig.temperature` |
| `top_p` | `generationConfig.topP` |
| `stop` | See below |

**Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/{model}:{method}`

- Non-streaming: `:generateContent`
- Streaming: `:streamGenerateContent?alt=sse`

#### Thinking Model Handling

Models matching `/^gemini-2\.5-(flash|pro)/` (excluding `lite`) are classified as "thinking models." These models use Google's extended thinking feature which consumes output tokens for internal reasoning before producing visible text.

Configuration for thinking models:
- `generationConfig.maxOutputTokens`: `max(maxTokens, 16384)` or `65536` if no `max_tokens` specified
- `generationConfig.thinkingConfig`: `{ thinkingBudget: 8192 }`

The high `maxOutputTokens` is necessary because thinking tokens and output tokens share the same budget. Without it, the model exhausts its token budget on reasoning and returns empty responses.

#### Proxy-Side Stop Sequence Handling

Google's thinking models fail when both `stopSequences` and `thinkingConfig` are present — the model spends its entire budget reasoning about stop conditions and produces no visible output.

Solution: For thinking models, stop sequences are **not** sent to Google. Instead, they're returned as `proxyStopSequences` from `translateToProvider()` and applied proxy-side after the response is received.

`applyStopSequences(text, stopSequences)` scans the response text for the earliest occurrence of any stop sequence and truncates at that position. When triggered, `finish_reason` is set to `"stop"`.

Non-thinking Google models (e.g., `gemini-2.5-flash-lite`) use native `stopSequences` in `generationConfig` as normal.

### Google Text Extraction

Google's response structure is complex, especially for thinking models. Two helper functions handle extraction:

**`extractGoogleText(candidate)`** — Non-streaming:
1. Filter `candidate.content.parts` to remove `thought` parts
2. Join visible parts' `.text` values
3. Fallback: if all parts are thought-only, use the last part's text
4. Fallback: check `candidate.output.text` and `candidate.groundingContent.parts`

**`extractGoogleStreamText(candidate)`** — Streaming:
1. Filter out `thought` parts
2. Return `{ text, isThinkingOnly }` — `isThinkingOnly` is true when parts exist but all are thinking

### Provider Authentication (`setProviderAuth`)

| Provider | Method |
|----------|--------|
| OPENAI | `Authorization: Bearer {key}` header |
| ANTHROPIC | `x-api-key: {key}` header |
| GOOGLE | `?key={key}` URL parameter |

---

## 7. Streaming Implementation

**File:** `server/lib/proxy/streaming.ts`

### SSE Setup

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
Transfer-Encoding: chunked
```

### Stream Processing

The stream reader consumes the provider's SSE response line by line. Each provider has different event formats:

**OpenAI:** Pass through `data:` events directly, extracting `choices[0].delta.content` for content accumulation and `usage` from the final chunk.

**Anthropic:** Translates event types:
- `message_start` → Extract `usage.input_tokens` for prompt tokens
- `content_block_delta` → Extract `delta.text`, wrap in OpenAI chunk format
- `message_delta` → Extract `usage.output_tokens`, emit final chunk with `finish_reason: "stop"`
- `message_stop` → Emit `[DONE]`
- `ping`, `content_block_start` → Ignored

**Google:** Translates each SSE chunk:
- Extract text via `extractGoogleStreamText()`, filtering thinking-only chunks
- Wrap in OpenAI `chat.completion.chunk` format with `delta.content`
- Extract `usageMetadata` for token counts (including `thoughtsTokenCount`)

### Proxy-Side Stop Sequence Buffering (Google Thinking Models)

When `proxyStopSequences` are present, the streaming handler uses a buffered approach to handle stop sequences that may span chunk boundaries:

1. **Accumulate** all visible text in `stopContentBuffer`
2. **Check** for stop sequences in the accumulated buffer after each chunk
3. **Send safely:** Only send content up to `buffer.length - maxStopLen` (where `maxStopLen` is the length of the longest stop sequence). This reserves a window to catch cross-chunk matches.
4. **On match:** Send any remaining unsent content up to the stop position, emit a final chunk with `finish_reason: "stop"`, and set `stopTriggered = true`
5. **After stop:** Continue reading chunks only to capture `usage` metadata, but don't send content
6. **On stream end:** Flush any remaining buffered content (if no stop was triggered)

### Return Value

```typescript
interface StreamResult {
  usage: { prompt_tokens; completion_tokens; total_tokens } | null;
  fullContent: string;  // Accumulated complete response text
}
```

`fullContent` is used for empty response detection and token estimation when `usage` metadata is unavailable.

---

## 8. Parameter Sanitization

**File:** `server/lib/proxy/translate.ts` — `sanitizeProviderBody()`

Each provider has an explicit allow-list of top-level request parameters. Any parameters not in the list are stripped before the request is forwarded.

**OpenAI allowed:** `model`, `messages`, `max_tokens`, `max_completion_tokens`, `temperature`, `top_p`, `n`, `stream`, `stop`, `presence_penalty`, `frequency_penalty`, `logit_bias`, `logprobs`, `top_logprobs`, `user`, `response_format`, `seed`, `tools`, `tool_choice`, `parallel_tool_calls`, `stream_options`, `reasoning_effort`, `modalities`, `audio`, `store`, `metadata`

**Anthropic allowed:** `model`, `messages`, `max_tokens`, `temperature`, `top_p`, `top_k`, `stream`, `stop_sequences`, `system`, `metadata`, `tools`, `tool_choice`

**Google allowed:** `contents`, `generationConfig`, `systemInstruction`, `safetySettings`, `tools`, `toolConfig`

---

## 9. Response Headers

Every proxy response includes budget context headers:

| Header | Description |
|--------|-------------|
| `X-Allotly-Budget-Remaining` | Remaining budget in cents |
| `X-Allotly-Budget-Total` | Total monthly budget in cents |
| `X-Allotly-Expires` | Period end timestamp (ISO 8601) |
| `X-Allotly-Requests-Remaining` | Remaining requests (RPM-based or bundle pool) |
| `X-Allotly-Max-Tokens-Applied` | Only set when token clamping was applied |

These headers are included on both success and error responses (when budget context is available).

---

## 10. Post-Response Processing

**File:** `server/lib/proxy/handler.ts` — runs asynchronously via `setImmediate()`

After the response is sent to the client, the following happens in the background:

### 1. Request Logging

```typescript
storage.createProxyRequestLog({
  membershipId, apiKeyId, provider, model,
  inputTokens, outputTokens, costCents,
  durationMs, statusCode: 200,
  maxTokensApplied: clamped ? effectiveMaxTokens : null,
});
```

### 2. Spend Update

Updates `currentPeriodSpendCents` in PostgreSQL:
```
newSpend = currentSpend + actualCostCents
```

### 3. Budget Alert Thresholds

| Threshold | Action |
|-----------|--------|
| >= 80% | Create alert record, email member |
| >= 90% | Create alert record, email member + team admin |
| >= 100% | Create alert, set membership `BUDGET_EXHAUSTED`, revoke all active API keys, email member + team admin, clear key caches |

Alert records prevent duplicate notifications — each threshold is only triggered once per period.

### 4. Bundle Request Tracking

For voucher-based memberships with bundles, increments the bundle's `usedProxyRequests` in both Redis and PostgreSQL.

---

## 11. Background Jobs

**File:** `server/lib/jobs/scheduler.ts`

| Job | Interval | Description |
|-----|----------|-------------|
| Budget Reset | 1 hour | Reset period spend for memberships past their `periodEnd` |
| Concurrency Self-Heal | 30 seconds | Reset stale concurrency counters where heartbeat keys expired |
| Voucher Expiry | 1 hour | Expire vouchers past their expiration date |
| Bundle Expiry | 1 hour | Expire bundles past their expiration date |
| Redis Reconciliation | 1 minute | Sync Redis budget counters with PostgreSQL (threshold: >$1.00 drift) |
| Provider Validation | 24 hours | Validate provider API key connectivity |
| Snapshot Cleanup | 7 days | Clean up old budget snapshots |
| Spend Anomaly | 1 hour | Detect unusual spending patterns |
| Model Sync | 6 hours | Refresh model catalog from providers (initial sync at startup +10s) |

### Redis Reconciliation Detail

**File:** `server/lib/jobs/redis-reconciliation.ts`

Fetches all active TEAM and VOUCHER memberships, then for each:
1. Read `allotly:budget:{membershipId}` from Redis
2. Calculate PostgreSQL remaining: `monthlyBudgetCents - currentPeriodSpendCents`
3. If Redis key missing → initialize it from PostgreSQL
4. If drift > 100 cents ($1.00) → overwrite Redis with PostgreSQL value and log a warning

---

## 12. Redis Key Structure

**File:** `server/lib/redis.ts` — `REDIS_KEYS`

| Key Pattern | TTL | Purpose |
|------------|-----|---------|
| `allotly:budget:{membershipId}` | None | Remaining budget in cents (source of truth during request) |
| `allotly:concurrent:{membershipId}` | None | Active in-flight request count |
| `allotly:req:{membershipId}:{requestId}` | 120s | Heartbeat for individual request (crash detection) |
| `allotly:ratelimit:{membershipId}` | 60s | Request count in current minute window |
| `allotly:apikey:{keyHash}` | 60s | Cached auth result (membership + userId) |
| `allotly:modelprice:{provider}:{model}` | 3600s | Cached model pricing |
| `allotly:bundle:{bundleId}:requests` | None | Used request count for voucher bundle |
| `allotly:bundle:{bundleId}:redemptions` | None | Redemption count for voucher bundle |

### Redis Fallback

If `REDIS_URL` is not set or connection fails, the system falls back to an in-memory `Map<string, { value, expiry }>` with the same API. This is suitable for development but not for production (no persistence, no cross-process sharing).

---

## 13. Security

### Provider Key Encryption

**File:** `server/lib/encryption.ts`

Provider API keys (OpenAI, Anthropic, Google) are stored encrypted in PostgreSQL using AES-256-GCM:

- **Algorithm:** `aes-256-gcm`
- **Key:** 256-bit key from `ENCRYPTION_KEY` environment variable (hex-encoded)
- **IV:** 16 random bytes generated per encryption
- **Storage:** Three columns per connection: `adminApiKeyEncrypted` (ciphertext), `adminApiKeyIv` (IV), `adminApiKeyTag` (auth tag)
- **Decryption:** Happens at request time in `handleChatCompletion()`, the plaintext key is never persisted or cached

### Allotly API Key Security

- Keys are generated with the format `allotly_sk_{random}`
- Only the SHA-256 hash is stored in the database (`keyHash` column)
- The plaintext key is shown to the user exactly once at creation time
- A `prefix` (first 8 chars) is stored for display purposes

### Request Sanitization

Provider-specific parameter allow-lists (`sanitizeProviderBody`) prevent:
- Internal Allotly parameters from leaking to providers
- Unsupported parameters causing provider errors
- Injection of unexpected fields

---

## 14. Error Handling

All proxy errors follow a consistent format:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable description",
    "suggestion": "Actionable fix suggestion",
    "type": "allotly_error"
  }
}
```

### Error Codes

| Code | HTTP Status | Trigger |
|------|------------|---------|
| `invalid_auth` | 401 | Missing/malformed Authorization header |
| `invalid_key_format` | 401 | Key doesn't start with `allotly_sk_` |
| `invalid_key` | 401 | Key hash not found in database |
| `key_revoked` | 401 | Key status is REVOKED |
| `membership_not_found` | 401 | No membership associated with the API key |
| `budget_exhausted` | 402 | Membership status is BUDGET_EXHAUSTED |
| `insufficient_budget` | 402 | Estimated cost exceeds remaining budget |
| `requests_exhausted` | 402 | Voucher bundle request pool depleted |
| `account_suspended` | 403 | Membership status is SUSPENDED |
| `account_expired` | 403 | Membership status is EXPIRED |
| `period_expired` | 403 | Membership period has ended |
| `provider_not_allowed` | 403 | Provider not in membership's allowedProviders |
| `model_not_allowed` | 403 | Model not in membership's allowedModels |
| `invalid_request` | 400 | Zod validation failure |
| `unsupported_model` | 400 | Model prefix doesn't match any provider |
| `model_not_found` | 400 | No pricing data for the model |
| `rate_limit` | 429 | RPM exceeded for plan tier |
| `concurrency_limit` | 429 | Max concurrent requests exceeded |
| `empty_response` | 502 | Provider returned no content |
| `provider_not_configured` | 502 | No active connection for the provider |
| `provider_unavailable` | 503 | Connection exists but is inactive |
| `provider_error` | 502 | Upstream provider returned an error |
| `internal_error` | 500 | Unexpected server error |

### Cleanup on Error

Every error path ensures:
1. Budget reservation is refunded (`refundBudget`)
2. Rate limit counter is decremented (`releaseRateLimit`)
3. Concurrency counter is decremented (`releaseConcurrency`)

The outer `try/catch` in `handleChatCompletion` serves as a safety net — if any unexpected error occurs, it refunds the budget and releases all locks before responding.

### Empty Response Detection

Both streaming and non-streaming paths check for empty responses:
- **Non-streaming:** `actualOutputTokens === 0 && content.trim() === ""`
- **Streaming:** `actualOutputTokens === 0 && fullContent.trim() === ""`

When detected, the full reserved budget is refunded and a `502 empty_response` error is returned.

### Provider Error Suggestions

`getProviderErrorSuggestion()` provides context-aware suggestions based on provider error messages:
- Deprecated models → suggests alternatives
- 429/rate limit → wait and retry
- 401/403 → contact admin about API key
- 404 → check /models endpoint

---

## 15. File Map

| File | Purpose |
|------|---------|
| `server/routes.ts` | Registers `/api/v1/chat/completions` and `/api/v1/models` routes |
| `server/lib/proxy/handler.ts` | Main request orchestrator — `handleChatCompletion()`, `handleListModels()`, plan tiers, error formatting |
| `server/lib/proxy/translate.ts` | Provider detection, request/response translation, parameter sanitization, stop sequence handling, Google text extraction |
| `server/lib/proxy/streaming.ts` | SSE stream reading, chunk translation, proxy-side stop buffering, `readNonStreamingResponse()` |
| `server/lib/proxy/safeguards.ts` | Authentication, rate limiting, concurrency, budget reservation/adjustment/refund, token estimation, self-healing |
| `server/lib/redis.ts` | Redis client with in-memory fallback, all Redis operations (get/set/incr/decr/etc.), key definitions |
| `server/lib/encryption.ts` | AES-256-GCM encrypt/decrypt for provider API keys |
| `server/lib/email.ts` | Budget alert email templates and sending |
| `server/lib/jobs/scheduler.ts` | Background job scheduler with all intervals |
| `server/lib/jobs/redis-reconciliation.ts` | Redis ↔ PostgreSQL budget drift correction |
