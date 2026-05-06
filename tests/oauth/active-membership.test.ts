/**
 * Real-DB integration tests for getActiveMembershipForUser.
 *
 * Regression: when a user has multiple memberships, the prior implementation
 * returned an unordered LIMIT 1 row. If Postgres surfaced an
 * EXPIRED/SUSPENDED row first, OAuth denied access even though the user had
 * a perfectly valid ACTIVE membership elsewhere.
 *
 * Until task #54 the live `team_memberships.user_id` carried a UNIQUE
 * constraint that blocked the very scenario this file exercises. With the
 * constraint dropped in the schema (and mirrored to the live DB via
 * `drizzle-kit push`) we can now seed multiple membership rows for a single
 * user directly — no DROP/ADD CONSTRAINT dance, no advisory lock required.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { eq, inArray } from "drizzle-orm";

import { db, pool } from "../../server/db";
import { organizations, users, teams, teamMemberships } from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { getActiveMembershipForUser } from "../../server/lib/oauth/authorize";

const seedTag = `am-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let testOrgId = "";
let testUserId = "";
const teamIds: string[] = [];
const extraUserIds: string[] = [];
const membershipIds: string[] = [];

async function insertMembership(opts: {
  teamId: string;
  userId: string;
  status: "ACTIVE" | "SUSPENDED" | "EXPIRED" | "BUDGET_EXHAUSTED";
  updatedAt: Date;
}): Promise<string> {
  const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const r = await pool.query(
    `INSERT INTO team_memberships
       (team_id, user_id, access_type, monthly_budget_cents,
        current_period_spend_cents, period_start, period_end,
        status, created_at, updated_at)
     VALUES ($1, $2, 'TEAM', 50000, 0, NOW(), $3, $4, $5, $5)
     RETURNING id`,
    [opts.teamId, opts.userId, periodEnd, opts.status, opts.updatedAt],
  );
  return r.rows[0].id as string;
}

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `active-membership-${seedTag}`,
    plan: "ENTERPRISE",
    maxTeamAdmins: 5,
  } as any);
  testOrgId = org.id;

  const passwordHash = await hashPassword("test-password-123");
  const user = await storage.createUser({
    email: `active-membership-${seedTag}@allotly.local`,
    name: "Active Membership Test User",
    passwordHash,
    orgId: org.id,
    orgRole: "MEMBER",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  testUserId = user.id;

  // Create three teams so the multi-membership scenarios have somewhere to
  // attach. `teams.admin_id` is UNIQUE, so each team needs a distinct admin
  // user. We make a throwaway admin per team — they are FK targets only and
  // never used by the function under test.
  for (let i = 0; i < 3; i++) {
    const adminUser = await storage.createUser({
      email: `am-admin-${seedTag}-${i}@allotly.local`,
      name: `Throwaway Admin ${i}`,
      passwordHash,
      orgId: org.id,
      orgRole: "MEMBER",
      status: "ACTIVE",
      isVoucherUser: false,
    } as any);
    extraUserIds.push(adminUser.id);
    const t = await storage.createTeam({
      name: `am-team-${seedTag}-${i}`,
      orgId: org.id,
      adminId: adminUser.id,
      monthlyBudgetCeilingCents: 100_000,
    });
    teamIds.push(t.id);
  }
});

afterAll(async () => {
  if (membershipIds.length > 0) {
    await db.delete(teamMemberships).where(inArray(teamMemberships.id, membershipIds));
  }
  if (teamIds.length > 0) {
    await db.delete(teams).where(inArray(teams.id, teamIds));
  }
  if (testUserId) {
    await db.delete(users).where(eq(users.id, testUserId));
  }
  if (extraUserIds.length > 0) {
    await db.delete(users).where(inArray(users.id, extraUserIds));
  }
  if (testOrgId) {
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
  }
});

async function clearMemberships(): Promise<void> {
  if (membershipIds.length === 0) return;
  await db.delete(teamMemberships).where(inArray(teamMemberships.id, membershipIds));
  membershipIds.length = 0;
}

describe("getActiveMembershipForUser", () => {
  it("returns null when the user has no memberships", async () => {
    await clearMemberships();
    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toBeNull();
  });

  it("returns the row when the user has a single ACTIVE membership", async () => {
    await clearMemberships();
    const id = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "ACTIVE",
      updatedAt: new Date(),
    });
    membershipIds.push(id);
    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toEqual({ id });
  });

  it("denies when the only membership is SUSPENDED", async () => {
    await clearMemberships();
    const id = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "SUSPENDED",
      updatedAt: new Date(),
    });
    membershipIds.push(id);
    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toBeNull();
  });

  it("denies when the only membership is EXPIRED", async () => {
    await clearMemberships();
    const id = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "EXPIRED",
      updatedAt: new Date(),
    });
    membershipIds.push(id);
    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toBeNull();
  });

  it("regression: when an EXPIRED row exists alongside an ACTIVE row, the ACTIVE row wins even when the EXPIRED row is the more recently updated one (the exact shape that broke OAuth pre-fix)", async () => {
    await clearMemberships();
    // ACTIVE inserted FIRST and OLDER — so without status-priority ordering,
    // the most-recent EXPIRED row would shadow it (or the prior unordered
    // LIMIT 1 could surface either, denying access).
    const activeId = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "ACTIVE",
      updatedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    });
    membershipIds.push(activeId);
    const expiredId = await insertMembership({
      teamId: teamIds[1],
      userId: testUserId,
      status: "EXPIRED",
      updatedAt: new Date(),
    });
    membershipIds.push(expiredId);

    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toEqual({ id: activeId });
  });

  it("regression: SUSPENDED + ACTIVE — same shape, different non-active status — also picks ACTIVE", async () => {
    await clearMemberships();
    const suspendedId = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "SUSPENDED",
      updatedAt: new Date(),
    });
    membershipIds.push(suspendedId);
    const activeId = await insertMembership({
      teamId: teamIds[1],
      userId: testUserId,
      status: "ACTIVE",
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    membershipIds.push(activeId);

    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toEqual({ id: activeId });
  });

  it("prefers ACTIVE over BUDGET_EXHAUSTED even when BUDGET_EXHAUSTED is more recently updated", async () => {
    await clearMemberships();
    const activeId = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "ACTIVE",
      updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    membershipIds.push(activeId);
    const budgetId = await insertMembership({
      teamId: teamIds[1],
      userId: testUserId,
      status: "BUDGET_EXHAUSTED",
      updatedAt: new Date(),
    });
    membershipIds.push(budgetId);

    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toEqual({ id: activeId });
  });

  it("falls back to BUDGET_EXHAUSTED when no ACTIVE row exists, in preference to EXPIRED/SUSPENDED", async () => {
    await clearMemberships();
    const expiredId = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "EXPIRED",
      updatedAt: new Date(),
    });
    membershipIds.push(expiredId);
    const budgetId = await insertMembership({
      teamId: teamIds[1],
      userId: testUserId,
      status: "BUDGET_EXHAUSTED",
      updatedAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    membershipIds.push(budgetId);

    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toEqual({ id: budgetId });
  });

  it("among multiple ACTIVE rows, the most recently updated one wins", async () => {
    await clearMemberships();
    const olderId = await insertMembership({
      teamId: teamIds[0],
      userId: testUserId,
      status: "ACTIVE",
      updatedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    });
    membershipIds.push(olderId);
    const newerId = await insertMembership({
      teamId: teamIds[1],
      userId: testUserId,
      status: "ACTIVE",
      updatedAt: new Date(),
    });
    membershipIds.push(newerId);

    const out = await getActiveMembershipForUser(testUserId);
    expect(out).toEqual({ id: newerId });
  });
});
