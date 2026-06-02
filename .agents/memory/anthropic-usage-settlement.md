---
name: Anthropic usage settlement & cost rounding
description: Gotchas when reading provider token usage for billing settlement in the proxy (cache tokens, streaming usage shape, rounding).
---

# Cost settlement gotchas (Allotly proxy)

## Round once at settlement, ceil at reservation
- Settlement must sum every priced token bucket in fractional cents and round
  **once** (`Math.round`). Rounding input and output cost separately (two
  `Math.ceil`s) double-counts the sub-cent remainder and over-charges small
  requests vs. the provider's own sub-cent invoice.
- The pre-request *reservation* helpers stay `Math.ceil` on purpose — reserving
  conservatively is correct; settling conservatively is over-billing.
- **Why:** money is stored as integer USD-cents (sub-cent storage is a separate,
  larger migration). True sub-cent fidelity for tiny requests needs that schema
  change; until then sub-0.5c requests settle to 0c.

## Anthropic prompt-caching token buckets
- `cache_creation_input_tokens` (cache write) bills at **1.25x** the base input
  rate; `cache_read_input_tokens` bills at **0.1x**. Both are separate from
  `input_tokens`.
- Anthropic's `input_tokens` **excludes** cached tokens — so input + cache_write
  + cache_read never double-count. Sum them all as distinct buckets.

## Reading streaming usage — merge, never overwrite
- In Anthropic streaming, the **input + cache** counts arrive at
  `message_start`; the **output** count arrives at `message_delta` (whose
  prompt_tokens is 0 with no cache buckets). Any code that does
  `usage = latestChunk.usage` will clobber the input/cache captured at
  message_start. Always MERGE, preferring the non-zero/defined value per field.
  This applies to the streamProviderResponse main loop, its trailing-buffer
  handler, and the handler-streaming processData merge.

## input_tokens can legitimately be 0
- When a prompt is fully served from cache, Anthropic reports `input_tokens: 0`
  with `cache_read_input_tokens > 0`. Use `?? estimate`, **never** `|| estimate`,
  when falling back — `|| ` treats the valid 0 as missing and over-charges by
  substituting the pre-request estimate.
