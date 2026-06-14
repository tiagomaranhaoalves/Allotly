---
name: MCP cost estimation — display vs affordability
description: How recommend_model / estimate_cost must price tasks; base-rate display vs proxy-reservation budget gating.
---

# MCP cost estimation: display cost vs affordability gate

Two different cost numbers, do not conflate them:

- **Display / ranking cost** (what users see, what we sort by): base input + base
  output rate. Helpers: `preciseCostCents` (true fractional cents) and
  `maxCostCents` (per-component `Math.ceil`) in `server/lib/proxy/cost-utils.ts`.
  `estimate_cost` shows base-rate figures on purpose.
- **Affordability / budget gate** (can the proxy actually run this without
  rejecting for budget): MUST mirror the proxy's pre-flight *reservation*, which
  holds input at the 1.25x cache-write rate. Use the proxy's own functions:
  `estimateInputReservationCents(inputTokens, pricing)` (input ×
  `CACHE_WRITE_MULTIPLIER` = 1.25) + `calculateOutputCostCents(outputTokens, pricing)`
  from `server/lib/proxy/safeguards.ts`. Gate candidates on
  `reserveCost <= remaining_cents`.

**Why:** `processChatCompletion` reserves input at 1.25x (worst-case cache-write
bucket) so a cached prompt can never overshoot the cap; the extra hold is
refunded at settlement. If `recommend_model` gates on the base-rate ceil instead,
it can recommend a model whose base ceil fits remaining budget but whose actual
reservation (1.25x input) does not — the proxy then rejects the very model we
recommended. For tiny prompts the 1.25x rarely changes the rounded cent, which is
why this slips through naive tests; it bites for input-heavy / high-input-price
(custom) models.

**How to apply:** Any tool that decides "will this fit the budget" must price the
*reservation*, not the display cost. Keep display on base rate (don't leak the
1.25x into user-facing `estimate_cost`). When testing the gate, construct a case
where the 1.25x crosses a cent boundary (e.g. ~252 input tokens × high input
price, zero output price) so base ceil = remaining but reservation > remaining.
