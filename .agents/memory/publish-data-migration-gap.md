---
name: Publish migrates schema, not data
description: Why a one-off data backfill done during a task can leave production broken after Publish, and how to remediate safely.
---

# Publish applies the schema diff, never your data backfill

**Rule:** Replit's Publish flow diffs the dev vs prod *schema* and applies that
DDL to production. It does **not** run any one-off DATA migration you executed
during a task. Post-merge `db:push` and any manual `UPDATE`/backfill you ran hit
the **development** database only.

**Why this bites:** If a task both (a) changes a column's *meaning/unit* and
(b) backfills existing rows to the new unit, only the schema half reaches prod on
Publish. Prod rows keep the OLD values while the deployed code interprets them
with the NEW meaning.

**Real incident (Allotly):** money was re-based from integer **cents** to
**micro-cents** (1¢ = 1_000_000). The task widened the 12 `*_cents` columns
(int→bigint) AND multiplied existing rows ×1e6 — but that multiply ran on dev
only. After Publish, prod columns were bigint but still held cent values, and the
read path applies `microCentsToCents` (÷1e6), so a $50 budget (5000) displayed as
`round(5000/1e6)=$0`. Every prod budget read ~$0 and enforcement was wrong.

**Resolution of this incident:** the team chose to ROLL BACK to whole cents
(revert the migration commit) rather than backfill prod — prod was still
uniformly in cents and the migration had also shipped incomplete boundary
conversions. No prod data backfill is pending. See micro-cents-rollback.md.

**How to apply / remediate:**
- Treat any unit/semantics change to stored money as a TWO-part prod rollout:
  schema (via Publish) **and** a separate, explicit prod data backfill.
- The agent cannot and must not write prod data itself: `executeSql({environment:"production"})`
  is read-only, and hand-rolled prod migration scripts / startup DDL are forbidden
  (see database-migrations-on-publish reference). Prepare the exact idempotent SQL
  and have the user run it against the production DB.
- Backfill is only a safe blanket `×N` while prod data is still uniformly in the
  OLD unit. The deployed new code starts writing NEW-unit values immediately, so
  rows get mixed over time — verify "no row already at new scale" (e.g. none
  `>= 1e6`) right before applying, and do it ASAP after the bad publish.
- 12 money columns to keep in lockstep: organizations(org_budget_ceiling_cents,
  default_member_budget_cents), teams(monthly_budget_ceiling_cents),
  team_memberships(monthly_budget_cents, current_period_spend_cents),
  vouchers(budget_cents), voucher_bundles(max_budget_per_voucher_cents,
  max_budget_per_recipient_cents), voucher_topup_requests(amount_cents_requested),
  usage_snapshots(total_cost_cents, period_cost_cents), proxy_request_logs(cost_cents).
  Also flush the Redis `allotly:budget:*` cache after backfill.
