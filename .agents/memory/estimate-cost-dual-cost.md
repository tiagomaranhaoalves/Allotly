---
name: estimate_cost dual-cost rule
description: Why the estimate_cost MCP tool keeps two separate cost computations (display vs ranking) and which is which.
---

# estimate_cost: conservative display cost vs precise ranking cost

`server/lib/mcp/tools/consumption/estimate-cost.ts` computes model cost two
ways on purpose:

- **`maxCostCents` (component-wise `Math.ceil` to whole USD-cents)** — the ONLY
  value ever DISPLAYED (`max_cost_usd_cents` / `max_cost_display`) for both the
  requested model and each alternative.
- **`preciseCostCents` (unrounded fractional cents)** — used ONLY to
  filter/rank alternatives and to compute `savings_pct`. Never displayed.

**Why:** The displayed/whole-cent ceil must match what the proxy actually
reserves against budget in `processChatCompletion`; a preview must never
undercut the real reservation. But at low `max_tokens` each cost component
rounds up to the 1-cent floor, so many models collapse to the same whole-cent
value — ranking/filtering on those rounded cents wrongly drops genuinely
cheaper models (e.g. gpt-4o-mini hidden when requesting gpt-4o at
max_tokens=500). Precise cost separates them.

**How to apply:** If you touch alternative selection, ordering, or
`savings_pct`, drive them from precise cost. If you touch any displayed amount,
keep it on the conservative ceil. Never swap one for the other. Two models can
legitimately show equal rounded cents while one has a non-zero `savings_pct`.
