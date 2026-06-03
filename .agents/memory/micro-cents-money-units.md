---
name: Micro-cents money units (Allotly)
description: Canonical server money unit is micro-cents stored in ...Cents-named columns/props; convert to cents only at wire boundaries.
---

# Micro-cents money convention

Allotly stores money internally in **MICRO-CENTS** (1 cent = 1_000_000 micro-cents) in
`bigint` (mode `"number"`) columns. The point is that sub-cent AI requests (e.g. 0.18c)
accumulate their exact cost instead of rounding to 0 per request.

**The trap:** DB column names AND TS property names are deliberately KEPT as `...Cents`
(e.g. `monthlyBudgetCents`, `budgetCents`, `costCents`) but they hold MICRO-CENTS, not
cents. A name ending in `Cents` is *not* a reliable signal of the unit — check whether the
value crossed a wire boundary.

**Why:** keeping the names lets all the unit-agnostic compute sites (budget − spend,
spend + cost) and the entire frontend stay untouched; only the formulas and the wire
boundaries change.

**How to apply:**
- Convert micro↔cents ONLY at wire boundaries with `centsToMicroCents` /
  `microCentsToCents` (both `Math.round`) from `server/lib/currency.ts`.
  - INGEST (request body, webhooks, CSV import): cents → `centsToMicroCents` before DB write.
  - EMIT (JSON responses, proxy headers, snapshots, audit-log diffs): DB value →
    `microCentsToCents` before sending.
- Settlement/estimate helpers live in `server/lib/proxy/safeguards.ts` and are named
  `...MicroCents` (`calculateSettledCostMicroCents`, `estimateInputCostMicroCents`,
  `calculateOutputCostMicroCents`). Because pricing rates are cents/MTok,
  `tokens * ratePerMTok` is already an exact micro-cent count (no `/1e6`, no per-component
  rounding) — round once at settlement.
- `clampMaxTokens(remainingBudgetCents, inputCostCents, …)` keeps the cents-suffixed
  param names but now expects MICRO-CENTS budgets. Tests pass `cents * 1_000_000`.
- DO NOT convert: `model_pricing` rates (cents/MTok), Stripe `unit_amount` (real Stripe
  cents), `settings.defaults.defaultBudgetCents` (a JSON blob field, stays cents),
  `VOUCHER_LIMITS` constants (cents).
- `monthlyBudgetCeilingCents` lives on `teams`, NOT on `team_memberships` — don't try to
  read/convert it off a membership row.
- Migration when introducing this on an existing DB: `db:push` to widen int→bigint FIRST
  (so `* 1e6` won't overflow int32), THEN `UPDATE … * 1000000` existing rows, THEN flush
  redis `allotly:budget:*` (cached budgets are micro now).
