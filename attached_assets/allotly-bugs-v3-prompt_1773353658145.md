# Allotly Proxy — Full Test Report & Fix Requests

We ran a comprehensive automated test of the proxy using a fresh voucher key. The core proxy is working well — routing, auth, budget enforcement on errors, streaming, and Anthropic translation all pass. But we found 7 issues that need attention, ordered by severity.

Please check each one, verify it exists, and fix it.

---

## Bug 1 (CRITICAL): gemini-2.5-pro returns empty response but charges budget

**Evidence:**
A request to `gemini-2.5-pro` returned HTTP 200 with an empty `content` field (`""`) and `completion_tokens: 0`. Despite producing no usable output, 2¢ was deducted from the budget.

**Why it's critical:** Users pay for nothing. This silently drains voucher budgets.

**What to fix:**
In the proxy response handler (Step 10 of the lifecycle), after receiving the provider response:
1. Check if `completion_tokens === 0` or if the response content is empty/null
2. If so, treat it as a failed request — refund the full reserved budget via `INCRBY`
3. Return a clear error to the client: `{"error":{"code":"empty_response","message":"The model returned an empty response. No budget was charged. Try again or use a different model.","type":"allotly_error"}}`
4. Do NOT log it as a successful request or decrement the requests-remaining counter

Alternatively, if the upstream returns a valid 200 with empty content, you could retry once before giving up. But at minimum, don't charge for it.

---

## Bug 2 (HIGH): Google total_tokens includes thinking/reasoning tokens

**Evidence from two Google requests:**

| Model | prompt_tokens | completion_tokens | total_tokens | Expected | Excess |
|-------|--------------|-------------------|-------------|----------|--------|
| gemini-2.5-flash | 9 | 2 | 55 | 11 | +44 |
| gemini-2.5-pro | 12 | 0 | 59 | 12 | +47 |

In both cases, `total_tokens` is ~45-47 higher than `prompt + completion`. Google's Gemini 2.5 models use internal chain-of-thought reasoning, and these thinking tokens are being included in the total.

**Why it matters:**
- If cost calculation uses `total_tokens`, users are overcharged for invisible thinking tokens
- If cost calculation uses `prompt + completion`, the `total_tokens` field misleads API consumers
- Either way, the OpenAI-format response contract (`total_tokens = prompt + completion`) is broken

**What to fix:**
In the Google provider adapter's `translateResponse` or `extractUsage` function:
1. Check Google's raw response for `usageMetadata.thoughtsTokenCount` or similar thinking token field
2. Set `total_tokens = prompt_tokens + completion_tokens` in the translated response (matching OpenAI convention)
3. Optionally expose thinking tokens as a separate field: `usage.thinking_tokens` or in a custom `x-allotly-thinking-tokens` header
4. Verify that cost calculation uses `prompt_tokens` and `completion_tokens` separately (with their respective per-token prices), NOT `total_tokens`

---

## Bug 3 (HIGH): Deprecated/broken models still listed in /models

**Evidence:**
The `/models` endpoint returns 86 models, but several fail at runtime:

| Model | Listed in /models? | Actually works? | Error |
|-------|-------------------|----------------|-------|
| `gemini-2.0-flash` | ✅ Yes | ❌ No | Google says "no longer available to new users" |
| `claude-3-5-haiku-20241022` | Unknown | ❌ No | "Pricing for model not found" |
| `claude-3-5-sonnet-20241022` | Unknown | ❌ No | "Pricing for model not found" |
| `gemini-1.5-flash` | Not listed | ❌ No | "Pricing for model not found" |

**Why it matters:** Users pick models from the `/models` list, try them, get errors, and lose trust. This is especially bad for automated integrations that enumerate available models.

**What to fix:**
1. Remove `gemini-2.0-flash` from the ModelPricing table — it's deprecated upstream
2. Verify every model in the seed data actually works by calling each provider's model listing endpoint:
   - OpenAI: `GET https://api.openai.com/v1/models`
   - Anthropic: `GET https://api.anthropic.com/v1/models`
   - Google: `GET https://generativelanguage.googleapis.com/v1/models`
3. Remove any model from the seed data that the provider doesn't recognize
4. For models that exist at the provider but fail for other reasons, investigate and fix the translation layer
5. Consider: the `/models` endpoint could filter to only return models that have valid pricing AND are confirmed active at the provider

---

## Bug 4 (MEDIUM): Budget headers missing on error responses

**Evidence:**
All 4 failed requests (HTTP 400 and 502) returned NO `X-Allotly-*` headers. Only successful requests include them.

**Why it matters:** Clients that track budget via headers lose visibility after errors. They don't know if budget was deducted or not. This is especially important given the previous budget-leak bug — clients need to verify their balance after every request, including errors.

**What to fix:**
In the proxy error handling path, always include the budget headers before returning the error response:
```
X-Allotly-Budget-Remaining: {current Redis value}
X-Allotly-Budget-Total: {total budget}
X-Allotly-Expires: {expiry}
X-Allotly-Requests-Remaining: {remaining}
```
This means the header-setting logic should run AFTER error handling and budget refund, not only on success. Even if the request failed, the client should see their current budget state.

---

## Bug 5 (MEDIUM): Requests-remaining counter is inconsistent

**Evidence from sequential requests:**

| Request # | Model | HTTP | requests-remaining |
|-----------|-------|------|--------------------|
| 1 | gpt-4o-mini | 200 | 29 |
| 2 | claude-sonnet-4 | 200 | 28 |
| 3 | gemini-2.5-flash | 200 | **29** ← went UP |
| 4 | gpt-4o-mini (stream) | 200 | **29** ← still 29 |
| 5 | gemini-2.5-pro | 200 | **29** |

The counter went from 30→29→28 then back to 29. This suggests:
- The counter might not be using atomic Redis operations
- Or a background reconciliation job is resetting it
- Or different code paths read/decrement it inconsistently

**What to fix:**
1. Check how `x-allotly-requests-remaining` is calculated — is it read from Redis atomically with the decrement?
2. It should be: `DECR allotly:bundle:{bundleId}:requests` → use the return value as the remaining count
3. If it's being read separately from the decrement, there's a race condition
4. Verify the reconciliation job isn't resetting the counter between requests

---

## Bug 6 (MEDIUM): Raw Zod validation in error messages

**Evidence:**
When a request is sent with a missing `model` field, the error message contains raw Zod validation output as a JSON array string. Instead of a clean message, the user sees something like `[{"code":"invalid_type","expected":"string","received":"undefined","path":["model"]...}]`.

**What to fix:**
In the request validation middleware, catch Zod validation errors and transform them into clean messages:
```javascript
// Instead of returning raw zod error
// Return:
{
  "error": {
    "code": "invalid_request",
    "message": "Missing required field: model",
    "type": "allotly_error"
  }
}
```
Parse the Zod error array and extract the field names and issue types. Common patterns:
- Missing required field → "Missing required field: {fieldName}"
- Wrong type → "Invalid type for '{fieldName}': expected {expected}, got {received}"
- Invalid enum → "Invalid value for '{fieldName}': must be one of [{values}]"

---

## Bug 7 (LOW): provider_error suggestions are too generic

**Evidence:**
When `gemini-2.0-flash` fails because it's deprecated, the suggestion says: "Check your request or try again later." This doesn't help — the model is permanently dead, retrying won't fix it.

**What to fix:**
Parse the upstream error message and provide smarter suggestions:
- If the error mentions "deprecated" or "no longer available" → `"This model has been deprecated. Try gemini-2.5-flash instead."`
- If it's a 429 rate limit → `"The provider is rate-limiting requests. Wait a moment and try again."`
- If it's a 401/403 from upstream → `"There may be an issue with the provider API key. Contact your admin."`
- For generic 500s → Keep the current generic message

---

## Verified Working (No Changes Needed)

These all passed testing:

- ✅ `allotly_sk_` key authentication with clear error messages for invalid/revoked keys
- ✅ OpenAI passthrough (gpt-4o-mini works end-to-end)
- ✅ Anthropic translation (claude-sonnet-4 works end-to-end)
- ✅ Google translation (gemini-2.5-flash works end-to-end, minus token count issue)
- ✅ SSE streaming with proper `data:` prefix and `[DONE]` terminator
- ✅ Budget NOT deducted on failed requests (400s and 502s) — this was previously broken and is now fixed
- ✅ Error response structure is consistent JSON with `code`, `message`, `suggestion`, `type`
- ✅ Error messages are no longer truncated (previously broken, now fixed)

---

## Fix Priority Summary

| # | Bug | Severity | User Impact |
|---|-----|----------|-------------|
| 1 | Empty response charges budget | 🔴 Critical | Users pay for nothing |
| 2 | Google total_tokens includes thinking tokens | 🔴 High | Misleading usage data, possible overcharge |
| 3 | Deprecated models in /models catalog | 🔴 High | Users get errors on advertised models |
| 4 | No budget headers on error responses | 🟡 Medium | Clients lose budget visibility |
| 5 | Requests-remaining counter inconsistent | 🟡 Medium | Unreliable usage tracking |
| 6 | Raw Zod in error messages | 🟡 Medium | Poor developer experience |
| 7 | Generic provider_error suggestions | 🟢 Low | Unhelpful error guidance |
