---
name: Sub-cent carry ledger & settlement invariants
description: How per-request spend is settled into the member ledger without losing sub-cent spend, and the two invariants every settlement site must hold.
---

# Sub-cent carry ledger (Bug 1)

Per-request cost rounded to whole cents (`calculateSettledCostCents`) collapses any
sub-1c request to 0, so naive `spend += round(cost)` lost spend AND never tripped
the Redis cap. Fix: a hidden micro-cent carry on `team_memberships`
(`cost_remainder_micro_cents`, always in `[0, 1_000_000)`), plus true per-request
cost in micro-cents on `proxy_request_logs` (`cost_micro_cents`).
`settleSpendWithCarry` adds micro to the carry, debits whole cents as it crosses
1c, and returns `crossedCents` (computed from the OLD remainder). Visible money
stays whole USD-cents everywhere.

## Invariant 1 — feed crossedCents (not the rounded cost) to the cap
`adjustBudgetAfterResponse` must receive `crossedCents`, otherwise sub-cent spend
decrements the Redis cap by `round(0.18c)=0` and the cap never trips.

## Invariant 2 — zero the reservation immediately after settling
**Why:** every non-streaming success path settles the ledger, then awaits more
(`releaseConcurrency`, etc.). The outer `catch` refunds when `reservedCostCents > 0`.
If a post-settle await throws, the catch refunds the reservation a SECOND time and
inflates the Redis budget (double-refund → under-bill). A code review caught this.
**How to apply:** set `reservedCostCents = 0` right after
`adjustBudgetAfterResponse`, BEFORE any further await. Capture the value into a
local first if a later log line needs it (REST `budget-obs`). All 4 sites
(handler MCP + REST, handler-messages, handler-streaming) follow this.

## Other rules
- Aggregates that report per-request spend must `FLOOR(SUM(...)/1e6)` (floor, to
  match the ledger's floor), and rehydrate legacy rows with
  `CASE WHEN cost_micro_cents=0 AND cost_cents>0 THEN cost_cents*1e6 ELSE cost_micro_cents END`
  — NOT plain `COALESCE`, because the column is NOT NULL DEFAULT 0 (legacy rows are
  0, not NULL, so COALESCE would zero real historical `cost_cents`).
- Period reset must zero `cost_remainder_micro_cents` alongside spend, or a
  leftover carry bleeds into the next period.
- `settleSpendWithCarry` clamps negative/non-finite inputs to 0 — Postgres `%`
  follows the dividend sign and would push the remainder out of `[0, 1e6)`.
- Org/team rollups read `team_memberships.current_period_spend_cents` (already
  carry-accurate) — do NOT re-sum `proxy_request_logs` for those.
