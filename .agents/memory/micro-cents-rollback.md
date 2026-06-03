---
name: Micro-cents money migration was rolled back to whole cents
description: Why Allotly money is whole integer USD-cents (not micro-cents), and what to fix if sub-cent precision is re-attempted.
---

# Money is whole integer USD-cents (micro-cents migration reverted)

**Rule:** All `*_cents` columns and all money compute use whole integer USD-CENTS
end-to-end (storage, settlement, wire, display). Columns are `bigint(mode:"number")`
for headroom but hold plain cents. Settlement rounds to cents once in
`server/lib/proxy/safeguards.ts`. There is NO cents↔micro-cents conversion layer.

**Why:** A migration re-based money to micro-cents (1¢ = 1,000,000) for exact
sub-cent billing, but it shipped incompletely on two fronts and broke production:
1. Several boundaries never applied the conversion (team members list, vouchers
   list, admin org-settings PATCH) — they emitted/stored raw values, so the UI
   read micro-cents as cents (a $50 budget showed "$50,000,000").
2. The one-time prod data backfill (×1e6) never ran — Publish migrates schema, not
   data — so prod still held cents while converting read paths divided by 1e6 and
   showed ~$0, blocking members.
Because prod was still uniformly in cents, reverting the migration commit restored
correctness with NO prod data change.

**How to apply:**
- If exact sub-cent billing is re-attempted: audit EVERY `*Cents` emit and ingest
  site so the conversion is applied uniformly (the gaps above are the ones that
  bit us), and make the prod data backfill an explicit, verified part of the
  rollout — never a dev-only step.
- Before any bulk unit rescale of a table, VERIFY the actual stored scale first
  (sample real rows). Do not assume an environment matches a migration's claimed
  state — assuming dev was in micro-cents and dividing by 1e6 zeroed dev's
  cent-scale budgets (rounded to 0, irreversible).
