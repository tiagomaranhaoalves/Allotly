import { sql } from "drizzle-orm";
import { db } from "../db";

/**
 * Hierarchical budget-CEILING enforcement (allocation cap, NOT spend).
 *
 * Two tiers, both un-breachable by construction:
 *
 *  - TEAM tier  (hot path): a team's live ALLOCATION must never exceed its
 *    `monthly_budget_ceiling_cents`. Allocation is the single shared pool:
 *      Σ membership.monthly_budget_cents  (TEAM + VOUCHER, any non-EXPIRED
 *        status; VOUCHER memberships drop out once past period_end)
 *    + Σ over ACTIVE, not-yet-expired vouchers of
 *        budget_cents * (max_redemptions - current_redemptions)   (unredeemed
 *        exposure — the budget already promised to slots nobody has claimed).
 *    Redemption moves a slot from the voucher term to a membership term, so the
 *    pool is invariant across redemption (net-zero) PROVIDED redemption is
 *    atomic (see redeem-inline.ts).
 *
 *  - ORG tier (ceiling-change path only): the org ceiling is a RESERVE cap —
 *    Σ team ceilings must never exceed `org_budget_ceiling_cents`. Because every
 *    team independently keeps allocation <= its ceiling, transitivity gives
 *    Σ team allocations <= Σ team ceilings <= org ceiling, so the org total is
 *    enforced WITHOUT an org-wide sum on the hot path.
 *
 * NULL ceiling = unlimited. To keep the reserve invariant sound, a finite org
 * ceiling is incompatible with an unlimited (NULL) team ceiling: such mixes are
 * rejected at the ceiling-change guards (you cannot cap the org while a team is
 * unlimited, nor make a team unlimited under a finite org cap).
 *
 * Money: whole integer USD-cents end-to-end. Columns are bigint(mode:number).
 * Serialization: allocation locks the TEAM row FOR UPDATE; ceiling changes lock
 * the ORG row FOR UPDATE. Lock order never inverts, so no deadlock.
 */

export type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

type CeilingScope = "team" | "org";
type CeilingKind = "allocation" | "reserve" | "floor" | "incompatible";

export class CeilingExceededError extends Error {
  readonly scope: CeilingScope;
  readonly kind: CeilingKind;
  readonly limitCents: number | null;
  readonly currentCents: number;
  readonly requestedCents: number;

  constructor(opts: {
    scope: CeilingScope;
    kind: CeilingKind;
    limitCents: number | null;
    currentCents: number;
    requestedCents?: number;
    message?: string;
  }) {
    super(opts.message ?? "Budget ceiling exceeded");
    this.name = "CeilingExceededError";
    this.scope = opts.scope;
    this.kind = opts.kind;
    this.limitCents = opts.limitCents;
    this.currentCents = opts.currentCents;
    this.requestedCents = opts.requestedCents ?? 0;
  }
}

function rowsOf(result: any): any[] {
  return (result?.rows ?? result ?? []) as any[];
}

function toNullableNumber(v: any): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** Locks the team row and returns its ceiling (null = unlimited). */
async function lockTeamCeiling(executor: DbExecutor, teamId: string): Promise<number | null> {
  const r = await executor.execute(sql`
    SELECT monthly_budget_ceiling_cents AS ceiling
    FROM teams WHERE id = ${teamId} FOR UPDATE
  `);
  return toNullableNumber(rowsOf(r)[0]?.ceiling);
}

/** Locks the org row and returns its ceiling (null = unlimited). */
async function lockOrgCeiling(executor: DbExecutor, orgId: string): Promise<number | null> {
  const r = await executor.execute(sql`
    SELECT org_budget_ceiling_cents AS ceiling
    FROM organizations WHERE id = ${orgId} FOR UPDATE
  `);
  return toNullableNumber(rowsOf(r)[0]?.ceiling);
}

/**
 * Live allocation of one team (the single shared pool). Reads committed data;
 * callers that need a consistent check must hold the team row lock first.
 */
export async function computeTeamAllocationCents(executor: DbExecutor, teamId: string): Promise<number> {
  const r = await executor.execute(sql`
    SELECT
      (SELECT COALESCE(SUM(monthly_budget_cents), 0)
         FROM team_memberships
        WHERE team_id = ${teamId}
          AND status <> 'EXPIRED'
          AND (access_type = 'TEAM' OR period_end > NOW()))
      +
      (SELECT COALESCE(SUM(budget_cents * (max_redemptions - current_redemptions)), 0)
         FROM vouchers
        WHERE team_id = ${teamId}
          AND status = 'ACTIVE'
          AND expires_at > NOW())
      AS allocation
  `);
  return Number(rowsOf(r)[0]?.allocation ?? 0);
}

/** Sum of ceilings for all teams in an org, plus whether any team is unlimited. */
async function teamCeilingSummary(
  executor: DbExecutor,
  orgId: string,
  excludeTeamId?: string,
): Promise<{ sumCents: number; hasUnlimited: boolean }> {
  const r = await executor.execute(sql`
    SELECT
      COALESCE(SUM(monthly_budget_ceiling_cents), 0) AS sum_cents,
      COUNT(*) FILTER (WHERE monthly_budget_ceiling_cents IS NULL) AS unlimited_count
    FROM teams
    WHERE org_id = ${orgId}
      ${excludeTeamId ? sql`AND id <> ${excludeTeamId}` : sql``}
  `);
  const row = rowsOf(r)[0];
  return {
    sumCents: Number(row?.sum_cents ?? 0),
    hasUnlimited: Number(row?.unlimited_count ?? 0) > 0,
  };
}

/**
 * HOT PATH — call inside the same transaction that performs the allocating
 * write (member/voucher create/update/top-up). Locks the team row, then throws
 * if the team's allocation + delta would exceed its ceiling. NULL ceiling and
 * non-positive deltas are no-ops (releases never breach).
 */
export async function assertTeamAllocationWithin(
  executor: DbExecutor,
  teamId: string,
  deltaCents: number,
): Promise<void> {
  if (!Number.isFinite(deltaCents) || deltaCents <= 0) {
    // Still take the lock to read the ceiling? No — a release/no-op can never
    // breach a ceiling, so we skip the lock entirely to avoid needless
    // contention.
    return;
  }
  const ceiling = await lockTeamCeiling(executor, teamId);
  if (ceiling === null) return; // unlimited
  const current = await computeTeamAllocationCents(executor, teamId);
  if (current + deltaCents > ceiling) {
    throw new CeilingExceededError({
      scope: "team",
      kind: "allocation",
      limitCents: ceiling,
      currentCents: current,
      requestedCents: deltaCents,
    });
  }
}

/**
 * HOT PATH (post-write variant) — call inside the same transaction AFTER a
 * write that can re-include previously-excluded allocation (e.g. reactivating an
 * EXPIRED membership, or extending a lapsed voucher's expiry so its exposure and
 * VOUCHER memberships re-enter the pool). Where the re-added delta is awkward to
 * compute up front, write first, then assert the resulting allocation fits.
 * Locks the team row; NULL ceiling is a no-op.
 */
export async function assertTeamAllocationNotExceeded(
  executor: DbExecutor,
  teamId: string,
): Promise<void> {
  const ceiling = await lockTeamCeiling(executor, teamId);
  if (ceiling === null) return; // unlimited
  const current = await computeTeamAllocationCents(executor, teamId);
  if (current > ceiling) {
    throw new CeilingExceededError({
      scope: "team",
      kind: "allocation",
      limitCents: ceiling,
      currentCents: current,
      requestedCents: 0,
      message: `This would exceed the team budget ceiling: ${fmtCents(current)} allocated is over the ${fmtCents(ceiling)} limit.`,
    });
  }
}

/**
 * CEILING CHANGE — setting/raising/lowering a TEAM ceiling. Enforces both:
 *  - floor: the new ceiling cannot be below the team's current allocation;
 *  - reserve: Σ (other team ceilings) + newCeiling must fit under the org
 *    ceiling. A finite org ceiling forbids an unlimited (NULL) team ceiling.
 * Locks the org row first (FOR UPDATE) to serialize concurrent ceiling edits.
 */
export async function assertTeamCeilingChange(
  executor: DbExecutor,
  orgId: string,
  teamId: string,
  newCeilingCents: number | null,
): Promise<void> {
  const orgCeiling = await lockOrgCeiling(executor, orgId);
  // Lock the team row too (order: org -> team, never inverted) so the floor
  // check is serialized against concurrent allocation writes that lock the same
  // team row. Without this, an allocation could slip in between the floor read
  // and the ceiling commit, leaving allocation > ceiling.
  await lockTeamCeiling(executor, teamId);

  // Floor: never strand already-committed allocation.
  if (newCeilingCents !== null) {
    const allocation = await computeTeamAllocationCents(executor, teamId);
    if (newCeilingCents < allocation) {
      throw new CeilingExceededError({
        scope: "team",
        kind: "floor",
        limitCents: newCeilingCents,
        currentCents: allocation,
        message: "Team ceiling cannot be set below the team's current allocation",
      });
    }
  }

  if (orgCeiling === null) return; // unlimited org — no reserve constraint

  if (newCeilingCents === null) {
    throw new CeilingExceededError({
      scope: "team",
      kind: "incompatible",
      limitCents: orgCeiling,
      currentCents: 0,
      message: "Cannot make a team unlimited while the organization has a finite budget ceiling",
    });
  }

  const { sumCents: otherCeilings } = await teamCeilingSummary(executor, orgId, teamId);
  if (otherCeilings + newCeilingCents > orgCeiling) {
    throw new CeilingExceededError({
      scope: "org",
      kind: "reserve",
      limitCents: orgCeiling,
      currentCents: otherCeilings,
      requestedCents: newCeilingCents,
      message: "Sum of team ceilings would exceed the organization budget ceiling",
    });
  }
}

/**
 * CEILING CHANGE — setting/raising/lowering the ORG ceiling. The new org
 * ceiling must be >= Σ team ceilings, and every team must already have a finite
 * ceiling (an unlimited team cannot be bounded by a finite org cap). NULL =
 * unlimited org, which lifts all reserve constraints. Locks the org row.
 */
export async function assertOrgCeilingChange(
  executor: DbExecutor,
  orgId: string,
  newOrgCeilingCents: number | null,
): Promise<void> {
  await lockOrgCeiling(executor, orgId);
  if (newOrgCeilingCents === null) return; // unlimited — no constraint

  const { sumCents, hasUnlimited } = await teamCeilingSummary(executor, orgId);
  if (hasUnlimited) {
    throw new CeilingExceededError({
      scope: "org",
      kind: "incompatible",
      limitCents: newOrgCeilingCents,
      currentCents: sumCents,
      message: "Set a finite ceiling on every team before capping the organization budget",
    });
  }
  if (newOrgCeilingCents < sumCents) {
    throw new CeilingExceededError({
      scope: "org",
      kind: "floor",
      limitCents: newOrgCeilingCents,
      currentCents: sumCents,
      message: "Organization ceiling cannot be set below the sum of existing team ceilings",
    });
  }
}

function fmtCents(c: number | null): string {
  if (c === null) return "unlimited";
  return `$${(c / 100).toFixed(2)}`;
}

/** Maps a CeilingExceededError to a 409 response payload. */
export function ceilingErrorResponse(e: CeilingExceededError): {
  status: number;
  body: Record<string, unknown>;
} {
  let message = e.message;
  if (e.kind === "allocation" || e.kind === "reserve") {
    const scopeWord = e.scope === "org" ? "organization" : "team";
    message = `This would exceed the ${scopeWord} budget ceiling: ${fmtCents(e.currentCents)} already committed + ${fmtCents(e.requestedCents)} requested is over the ${fmtCents(e.limitCents)} limit.`;
  }
  return {
    status: 409,
    body: {
      message,
      code: "BUDGET_CEILING_EXCEEDED",
      scope: e.scope,
      kind: e.kind,
      limitCents: e.limitCents,
      currentCents: e.currentCents,
      requestedCents: e.requestedCents,
    },
  };
}
