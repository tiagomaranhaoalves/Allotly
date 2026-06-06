---
name: Budget-ceiling allocation enforcement
description: Where allocation can grow, how to guard it, lock order, and side-effect ordering for the hierarchical budget-ceiling feature.
---

# Budget-ceiling (allocation cap) enforcement

The team ceiling caps a team's live **allocation pool**: Σ memberships (status<>EXPIRED, TEAM or period_end>now) + Σ ACTIVE non-expired vouchers of budget*(max-current). Org ceiling is a reserve cap on Σ team ceilings; the hot path only checks the team (transitivity covers org). NULL ceiling = unlimited.

## Every allocation-growth point needs a guard — including re-inclusion
Two non-obvious growth points beyond create/update/top-up/transfer:
- **Member reactivate**: EXPIRED→ACTIVE re-includes the membership budget (the pool excludes only EXPIRED; SUSPENDED/BUDGET_EXHAUSTED already count, so only the EXPIRED transition grows).
- **Voucher extend**: pushing `expires_at` back when a voucher already lapsed (status still ACTIVE in the cron-lag window) re-introduces both its unredeemed exposure AND its VOUCHER memberships (period_end past now).

**How to apply:** when a new endpoint can move allocation from an excluded state into the counted pool, guard it. For awkward re-inclusion deltas, prefer the post-write pattern: write inside a tx, then call `assertTeamAllocationNotExceeded(tx, teamId)` which locks the team row, recomputes, and throws (rolling back) if over ceiling. For simple known deltas use `assertTeamAllocationWithin(tx, teamId, delta)`.

## Lock order is org → team, never inverted
Allocation writes lock the **team** row FOR UPDATE only. Ceiling-change guards lock **org** then **team**. No path locks team-then-org, so no deadlock. When adding a new guard, keep this order.
**Why:** the team-ceiling floor check must be serialized against concurrent allocation writes on the same team row, or an allocation can slip between the floor read and the ceiling commit.

## Irreversible side effects go AFTER the ceiling-checked tx commits
Member transfer revokes the source member's keys and clears Redis. These must run only after the atomic (ceiling-checked) transaction commits — never before.
**Why:** a 409 ceiling rejection rolls back DB rows but not key revocations / Redis clears, silently breaking a member's access on a transfer that didn't happen. Note `deleteMembership` cascade-deletes the membership's API keys inside the tx, so post-commit you only need cache invalidation (apiKeyCache by keyHash + budget/concurrent/ratelimit for the old membership id), captured before the tx.
