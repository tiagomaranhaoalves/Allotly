/**
 * tests/members/multi-team-invite.test.ts
 *
 * Regression coverage for the multi-team invite flow on POST /api/members.
 * The route was changed so the "user already a member" check is scoped to
 * the *target* team via storage.getMembershipByUserAndTeam — without this
 * guarantee in tests, a future refactor could re-introduce the global
 * single-team block (storage.getMembershipByUser) and silently break the
 * "invite the same person to a second team in the same org" workflow.
 *
 * The two scenarios covered:
 *   1. Existing user with a membership in team A is invited to team B —
 *      both memberships must exist after the call.
 *   2. Re-inviting the same user to team A still fails with the
 *      "already a member of this team" error.
 *
 * The handler is exercised directly (extracted to
 * server/lib/members/create-member.ts) using the mockReq/mockRes pattern
 * already established in tests/oauth/credential-paths.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  allotlyApiKeys,
  auditLogs,
  passwordResetTokens,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { createMemberHandler } from "../../server/lib/members/create-member";

function mockRes() {
  const r: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    status(c: number) { this.statusCode = c; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
    json(b: any) { this.body = b; return this; },
    send(b: any) { this.body = b; return this; },
  };
  return r;
}

function mockReq(opts: { body?: any; session?: any } = {}) {
  return {
    body: opts.body || {},
    session: opts.session || {},
    protocol: "http",
    get(_h: string) { return "localhost"; },
  } as any;
}

const seedTag = `multi-team-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;

let orgId = "";
let rootAdminId = "";
let teamBAdminId = "";
let teamAId = "";
let teamBId = "";
let invitedUserEmail = "";
let invitedUserId = "";

beforeAll(async () => {
  // Use ENTERPRISE so plan member limits never interfere with the flow.
  const org = await storage.createOrganization({
    name: `multi-team-${seedTag}`,
    plan: "ENTERPRISE",
  } as any);
  orgId = org.id;

  const adminPwHash = await hashPassword("admin-pw-" + seedTag);
  const rootAdmin = await storage.createUser({
    email: `root-${seedTag}@allotly.test`,
    name: "Root Admin",
    passwordHash: adminPwHash,
    orgId,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  rootAdminId = rootAdmin.id;

  const teamA = await storage.createTeam({
    name: `team-A-${seedTag}`,
    orgId,
    adminId: rootAdminId,
  } as any);
  teamAId = teamA.id;

  // teams.admin_id is UNIQUE, so team B needs its own admin user.
  const teamBAdminPwHash = await hashPassword("teamb-admin-pw-" + seedTag);
  const teamBAdmin = await storage.createUser({
    email: `teamb-admin-${seedTag}@allotly.test`,
    name: "Team B Admin",
    passwordHash: teamBAdminPwHash,
    orgId,
    orgRole: "TEAM_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  teamBAdminId = teamBAdmin.id;

  const teamB = await storage.createTeam({
    name: `team-B-${seedTag}`,
    orgId,
    adminId: teamBAdminId,
  } as any);
  teamBId = teamB.id;

  // Pre-existing user with an ACTIVE membership in team A.
  invitedUserEmail = `invited-${seedTag}@allotly.test`;
  const invitedPwHash = await hashPassword("invited-pw-" + seedTag);
  const invited = await storage.createUser({
    email: invitedUserEmail,
    name: "Invited User",
    passwordHash: invitedPwHash,
    orgId,
    orgRole: "MEMBER",
    status: "ACTIVE",
    isVoucherUser: false,
  } as any);
  invitedUserId = invited.id;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  await storage.createMembership({
    teamId: teamAId,
    userId: invitedUserId,
    accessType: "TEAM",
    monthlyBudgetCents: 5_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);
});

afterAll(async () => {
  // FK-safe cleanup. Some test cases create extra invitee users beyond the
  // ones tracked in module-scope vars, so delete every row owned by this
  // org rather than relying on a hand-maintained id list.
  if (!orgId) return;
  await db.delete(auditLogs).where(eq(auditLogs.orgId, orgId));
  const orgUsers = await db.select({ id: users.id }).from(users).where(eq(users.orgId, orgId));
  const orgUserIds = orgUsers.map((u) => u.id);
  if (orgUserIds.length) {
    await db.delete(passwordResetTokens).where(inArray(passwordResetTokens.userId, orgUserIds));
    await db.delete(allotlyApiKeys).where(inArray(allotlyApiKeys.userId, orgUserIds));
  }
  await db.delete(teamMemberships).where(inArray(teamMemberships.teamId, [teamAId, teamBId].filter(Boolean)));
  await db.delete(teams).where(inArray(teams.id, [teamAId, teamBId].filter(Boolean)));
  if (orgUserIds.length) {
    await db.delete(users).where(inArray(users.id, orgUserIds));
  }
  await db.delete(organizations).where(eq(organizations.id, orgId));
});

describe("POST /api/members — multi-team invite", () => {
  it("invites an existing user (membership in team A) into team B and keeps both memberships", async () => {
    const req = mockReq({
      session: { userId: rootAdminId },
      body: {
        email: invitedUserEmail,
        teamId: teamBId,
        budgetCents: 5_000,
        accessType: "TEAM",
      },
    });
    const res = mockRes();

    await createMemberHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.message).toBeUndefined();
    expect(res.body?.user?.id).toBe(invitedUserId);
    expect(res.body?.membership?.teamId).toBe(teamBId);

    // Both team-A and team-B memberships must coexist for this user.
    const allMemberships = await storage.getMembershipsByUser(invitedUserId);
    const teamIds = allMemberships.map((m) => m.teamId).sort();
    expect(teamIds).toEqual([teamAId, teamBId].sort());

    const onA = await storage.getMembershipByUserAndTeam(invitedUserId, teamAId);
    const onB = await storage.getMembershipByUserAndTeam(invitedUserId, teamBId);
    expect(onA).toBeTruthy();
    expect(onB).toBeTruthy();
  });

  it("lets the TEAM_ADMIN of team B invite a user who is already on team A", async () => {
    // Distinct invitee (separate from the ROOT_ADMIN scenario above) so
    // this test is independent of execution order.
    const email = `ta-invited-${seedTag}@allotly.test`;
    const pwHash = await hashPassword("ta-invited-pw-" + seedTag);
    const u = await storage.createUser({
      email,
      name: "TA Invited",
      passwordHash: pwHash,
      orgId,
      orgRole: "MEMBER",
      status: "ACTIVE",
      isVoucherUser: false,
    } as any);
    const now = new Date();
    const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    await storage.createMembership({
      teamId: teamAId,
      userId: u.id,
      accessType: "TEAM",
      monthlyBudgetCents: 5_000,
      allowedModels: null,
      allowedProviders: null,
      currentPeriodSpendCents: 0,
      periodStart: now,
      periodEnd,
      status: "ACTIVE",
    } as any);

    // Acting as the TEAM_ADMIN of team B. The handler resolves the target
    // team from getTeamByAdmin(actor) for TEAM_ADMINs, so we don't pass
    // teamId in the body — that's the production code path for that role.
    const req = mockReq({
      session: { userId: teamBAdminId },
      body: {
        email,
        budgetCents: 5_000,
        accessType: "TEAM",
      },
    });
    const res = mockRes();
    await createMemberHandler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body?.message).toBeUndefined();
    expect(res.body?.membership?.teamId).toBe(teamBId);

    const memberships = await storage.getMembershipsByUser(u.id);
    const teamIds = memberships.map((m) => m.teamId).sort();
    expect(teamIds).toEqual([teamAId, teamBId].sort());
  });

  it("rejects re-inviting the same user to team A with the existing-member error", async () => {
    const req = mockReq({
      session: { userId: rootAdminId },
      body: {
        email: invitedUserEmail,
        teamId: teamAId,
        budgetCents: 5_000,
        accessType: "TEAM",
      },
    });
    const res = mockRes();

    await createMemberHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.body?.message).toBe("This user is already a member of this team");

    // Exactly one team-A membership for this user — the duplicate invite
    // must not have created a second row.
    const teamAMemberships = await db
      .select({ id: teamMemberships.id })
      .from(teamMemberships)
      .where(
        and(
          eq(teamMemberships.userId, invitedUserId),
          eq(teamMemberships.teamId, teamAId),
        ),
      );
    expect(teamAMemberships.length).toBe(1);
  });
});
