import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  vouchers,
  voucherRedemptions,
  allotlyApiKeys,
  auditLogs,
} from "@shared/schema";
import {
  computeTeamAllocationCents,
  assertTeamAllocationWithin,
  assertTeamAllocationNotExceeded,
  assertTeamCeilingChange,
  assertOrgCeilingChange,
  CeilingExceededError,
  ceilingErrorResponse,
} from "../server/lib/budget-ceiling";
import { claimVoucherSlot } from "../server/lib/vouchers/redeem-inline";
import { storage } from "../server/storage";
import { createMemberHandler } from "../server/lib/members/create-member";

/**
 * Hierarchical budget-CEILING (allocation cap) enforcement.
 *
 * Covers: pool math, full voucher exposure, redemption net-zero invariant,
 * concurrency (no breach under Promise.all), ceiling-change floors/reserve,
 * transitivity, and NULL-incompatibility. All money is whole integer USD-cents.
 */

const TAG = `ceil-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId: string;
let adminId: string;

async function mkOrg(orgCeilingCents: number | null): Promise<string> {
  const [org] = await db
    .insert(organizations)
    .values({ name: `ceil-org-${TAG}-${Math.random().toString(36).slice(2, 6)}`, plan: "TEAM", orgBudgetCeilingCents: orgCeilingCents })
    .returning();
  return org.id;
}

// teams.admin_id is UNIQUE, so every team needs its own admin user.
async function mkAdminFor(theOrgId: string): Promise<string> {
  const [a] = await db
    .insert(users)
    .values({
      email: `tadmin-${TAG}-${Math.random().toString(36).slice(2, 10)}@allotly.test`,
      name: "TAdmin",
      passwordHash: "x",
      orgId: theOrgId,
      orgRole: "TEAM_ADMIN",
      status: "ACTIVE",
    })
    .returning();
  return a.id;
}

async function mkTeam(theOrgId: string, ceilingCents: number | null): Promise<string> {
  const teamAdminId = await mkAdminFor(theOrgId);
  const [team] = await db
    .insert(teams)
    .values({ name: `ceil-team-${TAG}-${Math.random().toString(36).slice(2, 6)}`, orgId: theOrgId, adminId: teamAdminId, monthlyBudgetCeilingCents: ceilingCents })
    .returning();
  return team.id;
}

async function mkMember(teamId: string, budgetCents: number, opts?: { accessType?: "TEAM" | "VOUCHER"; status?: string; periodEnd?: Date }) {
  const [u] = await db
    .insert(users)
    .values({
      email: `m-${TAG}-${Math.random().toString(36).slice(2, 8)}@allotly.test`,
      name: "M",
      passwordHash: "x",
      orgId,
      orgRole: "MEMBER",
      status: "ACTIVE",
    })
    .returning();
  const now = new Date();
  const periodEnd = opts?.periodEnd ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const [m] = await db
    .insert(teamMemberships)
    .values({
      userId: u.id,
      teamId,
      accessType: opts?.accessType ?? "TEAM",
      monthlyBudgetCents: budgetCents,
      currentPeriodSpendCents: 0,
      periodStart: now,
      periodEnd,
      status: (opts?.status ?? "ACTIVE") as any,
    })
    .returning();
  return m;
}

async function mkVoucher(teamId: string, budgetCents: number, maxRedemptions: number, opts?: { currentRedemptions?: number; status?: string; expiresAt?: Date }) {
  const [v] = await db
    .insert(vouchers)
    .values({
      code: `ALLOT-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      orgId,
      teamId,
      createdById: adminId,
      label: TAG,
      budgetCents,
      allowedProviders: ["OPENAI"],
      allowedModels: null,
      expiresAt: opts?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxRedemptions,
      currentRedemptions: opts?.currentRedemptions ?? 0,
      status: (opts?.status ?? "ACTIVE") as any,
    })
    .returning();
  return v;
}

beforeAll(async () => {
  orgId = await mkOrg(null);
  const [admin] = await db
    .insert(users)
    .values({
      email: `ceil-admin-${TAG}@allotly.test`,
      name: "Ceil Admin",
      passwordHash: "x",
      orgId,
      orgRole: "ROOT_ADMIN",
      status: "ACTIVE",
    })
    .returning();
  adminId = admin.id;
});

afterAll(async () => {
  // Members are created under the shared org but can live in per-test-org teams,
  // so memberships in one org may reference users in another. Clean in strict FK
  // order across ALL orgs (children fully, then users, then orgs) to avoid
  // cross-org FK violations.
  for (const oid of createdOrgIds) {
    await db.delete(auditLogs).where(eq(auditLogs.orgId, oid));
    const ourVouchers = await db.select({ id: vouchers.id }).from(vouchers).where(eq(vouchers.orgId, oid));
    for (const v of ourVouchers) {
      await db.delete(voucherRedemptions).where(eq(voucherRedemptions.voucherId, v.id));
    }
    const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.orgId, oid));
    for (const t of teamRows) {
      const ms = await db.select({ id: teamMemberships.id }).from(teamMemberships).where(eq(teamMemberships.teamId, t.id));
      for (const m of ms) {
        await db.delete(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, m.id));
      }
      await db.delete(teamMemberships).where(eq(teamMemberships.teamId, t.id));
      await db.delete(vouchers).where(eq(vouchers.teamId, t.id));
    }
  }
  // teams.admin_id -> users, so drop all teams before any users.
  for (const oid of createdOrgIds) {
    await db.delete(teams).where(eq(teams.orgId, oid));
  }
  for (const oid of createdOrgIds) {
    await db.delete(users).where(eq(users.orgId, oid));
  }
  for (const oid of createdOrgIds) {
    await db.delete(organizations).where(eq(organizations.id, oid));
  }
});

const createdOrgIds: string[] = [];
// Register the shared org for cleanup once adminId exists.
beforeAll(() => {
  createdOrgIds.push(orgId);
});

describe("pool math (computeTeamAllocationCents)", () => {
  it("sums member budgets + full unredeemed voucher exposure", async () => {
    const tid = await mkTeam(orgId, null);
    await mkMember(tid, 1000);
    await mkMember(tid, 2500);
    // voucher: 500 budget * (4 - 1 redeemed) = 1500 unredeemed exposure
    await mkVoucher(tid, 500, 4, { currentRedemptions: 1 });
    const alloc = await computeTeamAllocationCents(db, tid);
    expect(alloc).toBe(1000 + 2500 + 1500);
  });

  it("excludes EXPIRED/REVOKED vouchers and expired VOUCHER memberships", async () => {
    const tid = await mkTeam(orgId, null);
    await mkMember(tid, 1000); // counts
    // VOUCHER membership past period_end -> excluded
    await mkMember(tid, 9999, { accessType: "VOUCHER", periodEnd: new Date(Date.now() - 1000) });
    // TEAM membership past period_end -> still counts (TEAM never expires from pool)
    await mkMember(tid, 700, { accessType: "TEAM", periodEnd: new Date(Date.now() - 1000) });
    await mkVoucher(tid, 5000, 2, { status: "REVOKED" }); // excluded
    await mkVoucher(tid, 5000, 2, { expiresAt: new Date(Date.now() - 1000) }); // expired -> excluded
    const alloc = await computeTeamAllocationCents(db, tid);
    expect(alloc).toBe(1000 + 700);
  });
});

describe("assertTeamAllocationWithin", () => {
  it("allows a delta that fits under the ceiling", async () => {
    const tid = await mkTeam(orgId, 10000);
    await mkMember(tid, 4000);
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, 6000))).resolves.toBeUndefined();
  });

  it("throws when current + delta exceeds the ceiling", async () => {
    const tid = await mkTeam(orgId, 10000);
    await mkMember(tid, 4000);
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, 6001))).rejects.toBeInstanceOf(CeilingExceededError);
  });

  it("treats NULL ceiling as unlimited", async () => {
    const tid = await mkTeam(orgId, null);
    await mkMember(tid, 999999);
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, 999999))).resolves.toBeUndefined();
  });

  it("no-ops on non-positive deltas (releases never breach)", async () => {
    const tid = await mkTeam(orgId, 1000);
    await mkMember(tid, 1000); // already at ceiling
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, 0))).resolves.toBeUndefined();
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, -500))).resolves.toBeUndefined();
  });

  it("counts full voucher exposure (budget * maxRedemptions) at creation", async () => {
    const tid = await mkTeam(orgId, 10000);
    // Reserving a 2000 * 5 = 10000 voucher exactly fills the ceiling.
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, 2000 * 5))).resolves.toBeUndefined();
    // One cent more must fail.
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, tid, 2000 * 5 + 1))).rejects.toBeInstanceOf(CeilingExceededError);
  });
});

describe("assertTeamAllocationNotExceeded (post-write re-inclusion guard)", () => {
  it("passes when allocation is within the ceiling", async () => {
    const tid = await mkTeam(orgId, 10000);
    await mkMember(tid, 6000);
    await expect(db.transaction((tx) => assertTeamAllocationNotExceeded(tx, tid))).resolves.toBeUndefined();
  });

  it("throws once allocation already exceeds the ceiling (re-included exposure)", async () => {
    const tid = await mkTeam(orgId, 5000);
    // An EXPIRED membership is excluded from the pool; flip it to ACTIVE to
    // simulate the reactivate write, then the post-write guard must catch it.
    const m = await mkMember(tid, 6000, { status: "EXPIRED" });
    expect(await computeTeamAllocationCents(db, tid)).toBe(0);
    await expect(
      db.transaction(async (tx) => {
        await tx.update(teamMemberships).set({ status: "ACTIVE" }).where(eq(teamMemberships.id, m.id));
        await assertTeamAllocationNotExceeded(tx, tid);
      }),
    ).rejects.toBeInstanceOf(CeilingExceededError);
  });

  it("treats a NULL ceiling as unlimited", async () => {
    const tid = await mkTeam(orgId, null);
    await mkMember(tid, 999999);
    await expect(db.transaction((tx) => assertTeamAllocationNotExceeded(tx, tid))).resolves.toBeUndefined();
  });
});

describe("redemption net-zero invariant", () => {
  it("keeps team allocation invariant across an atomic redemption", async () => {
    const tid = await mkTeam(orgId, null);
    const v = await mkVoucher(tid, 1000, 3, { currentRedemptions: 0 });
    const before = await computeTeamAllocationCents(db, tid);
    expect(before).toBe(3000); // 1000 * 3 unredeemed

    // Simulate the membership half of a redemption while consuming a slot.
    await db.transaction(async (tx) => {
      await claimVoucherSlot(tx, v.id);
      await mkMemberInTx(tx, tid, 1000);
    });

    const after = await computeTeamAllocationCents(db, tid);
    // slot moved from voucher term (-1000) to membership term (+1000) => net 0
    expect(after).toBe(before);
  });
});

describe("concurrency — no breach under Promise.all", () => {
  it("only allows allocations that collectively fit the ceiling", async () => {
    const tid = await mkTeam(orgId, 3000);
    // Six concurrent attempts to reserve 1000 each; only 3 can fit.
    const attempts = Array.from({ length: 6 }, () =>
      db
        .transaction(async (tx) => {
          await assertTeamAllocationWithin(tx, tid, 1000);
          await mkMemberInTx(tx, tid, 1000);
          return "ok";
        })
        .catch((e) => (e instanceof CeilingExceededError ? "rejected" : Promise.reject(e))),
    );
    const results = await Promise.all(attempts);
    const ok = results.filter((r) => r === "ok").length;
    expect(ok).toBe(3);
    const alloc = await computeTeamAllocationCents(db, tid);
    expect(alloc).toBe(3000);
    expect(alloc).toBeLessThanOrEqual(3000);
  });
});

describe("team ceiling change (assertTeamCeilingChange)", () => {
  it("rejects a ceiling below the team's live allocation (floor)", async () => {
    const oid = await mkOrg(null);
    createdOrgIds.push(oid);
    const tid = await mkTeam(oid, 5000);
    await mkMember(tid, 4000);
    await expect(db.transaction((tx) => assertTeamCeilingChange(tx, oid, tid, 3999))).rejects.toBeInstanceOf(CeilingExceededError);
    await expect(db.transaction((tx) => assertTeamCeilingChange(tx, oid, tid, 4000))).resolves.toBeUndefined();
  });

  it("enforces the org reserve: Σ team ceilings <= org ceiling", async () => {
    const oid = await mkOrg(10000);
    createdOrgIds.push(oid);
    await mkTeam(oid, 6000); // other team
    const tid = await mkTeam(oid, 1000);
    // 6000 + 4000 = 10000 fits
    await expect(db.transaction((tx) => assertTeamCeilingChange(tx, oid, tid, 4000))).resolves.toBeUndefined();
    // 6000 + 4001 = 10001 breaches
    await expect(db.transaction((tx) => assertTeamCeilingChange(tx, oid, tid, 4001))).rejects.toBeInstanceOf(CeilingExceededError);
  });

  it("forbids making a team unlimited under a finite org ceiling", async () => {
    const oid = await mkOrg(10000);
    createdOrgIds.push(oid);
    const tid = await mkTeam(oid, 1000);
    await expect(db.transaction((tx) => assertTeamCeilingChange(tx, oid, tid, null))).rejects.toBeInstanceOf(CeilingExceededError);
  });
});

describe("org ceiling change (assertOrgCeilingChange)", () => {
  it("rejects an org ceiling below the sum of team ceilings (floor)", async () => {
    const oid = await mkOrg(null);
    createdOrgIds.push(oid);
    await mkTeam(oid, 6000);
    await mkTeam(oid, 3000);
    await expect(db.transaction((tx) => assertOrgCeilingChange(tx, oid, 8999))).rejects.toBeInstanceOf(CeilingExceededError);
    await expect(db.transaction((tx) => assertOrgCeilingChange(tx, oid, 9000))).resolves.toBeUndefined();
  });

  it("forbids a finite org ceiling while any team is unlimited", async () => {
    const oid = await mkOrg(null);
    createdOrgIds.push(oid);
    await mkTeam(oid, 5000);
    await mkTeam(oid, null); // unlimited team
    await expect(db.transaction((tx) => assertOrgCeilingChange(tx, oid, 100000))).rejects.toBeInstanceOf(CeilingExceededError);
  });

  it("treats NULL org ceiling as unlimited (no constraint)", async () => {
    const oid = await mkOrg(null);
    createdOrgIds.push(oid);
    await mkTeam(oid, null);
    await expect(db.transaction((tx) => assertOrgCeilingChange(tx, oid, null))).resolves.toBeUndefined();
  });
});

describe("transitivity", () => {
  it("org total stays bounded because each team is independently bounded", async () => {
    const oid = await mkOrg(10000);
    createdOrgIds.push(oid);
    const t1 = await mkTeam(oid, 6000);
    const t2 = await mkTeam(oid, 4000);
    // Fill both teams to their ceilings.
    await db.transaction(async (tx) => {
      await assertTeamAllocationWithin(tx, t1, 6000);
      await mkMemberInTx(tx, t1, 6000);
    });
    await db.transaction(async (tx) => {
      await assertTeamAllocationWithin(tx, t2, 4000);
      await mkMemberInTx(tx, t2, 4000);
    });
    const total = (await computeTeamAllocationCents(db, t1)) + (await computeTeamAllocationCents(db, t2));
    expect(total).toBe(10000);
    expect(total).toBeLessThanOrEqual(10000); // org ceiling
    // No further allocation fits in either team.
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, t1, 1))).rejects.toBeInstanceOf(CeilingExceededError);
    await expect(db.transaction((tx) => assertTeamAllocationWithin(tx, t2, 1))).rejects.toBeInstanceOf(CeilingExceededError);
  });
});

describe("ceilingErrorResponse", () => {
  it("maps to a 409 with a branded code", () => {
    const r = ceilingErrorResponse(
      new CeilingExceededError({ scope: "team", kind: "allocation", limitCents: 1000, currentCents: 800, requestedCents: 500 }),
    );
    expect(r.status).toBe(409);
    expect(r.body.code).toBe("BUDGET_CEILING_EXCEEDED");
    expect(r.body.scope).toBe("team");
  });
});

// --- helpers that operate inside an existing transaction ---

async function mkMemberInTx(tx: any, teamId: string, budgetCents: number) {
  const [u] = await tx
    .insert(users)
    .values({
      email: `mtx-${TAG}-${Math.random().toString(36).slice(2, 10)}@allotly.test`,
      name: "Mtx",
      passwordHash: "x",
      orgId,
      orgRole: "MEMBER",
      status: "ACTIVE",
    })
    .returning();
  const now = new Date();
  await tx.insert(teamMemberships).values({
    userId: u.id,
    teamId,
    accessType: "TEAM",
    monthlyBudgetCents: budgetCents,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
    status: "ACTIVE",
  });
}

// --- ceiling-rejection atomicity (no orphaned side effects on 409) ---

function mockRes() {
  const r: any = {
    statusCode: 200,
    body: undefined as any,
    status(c: number) { this.statusCode = c; return this; },
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

async function mkEnterpriseOrg(): Promise<string> {
  const [o] = await db
    .insert(organizations)
    .values({
      name: `ceil-atom-${TAG}-${Math.random().toString(36).slice(2, 6)}`,
      // ENTERPRISE so plan member limits never interfere with the route flow.
      plan: "ENTERPRISE",
      orgBudgetCeilingCents: null,
    })
    .returning();
  createdOrgIds.push(o.id);
  return o.id;
}

async function mkUserIn(oid: string, role: "ROOT_ADMIN" | "TEAM_ADMIN" | "MEMBER", name = "U"): Promise<any> {
  const [u] = await db
    .insert(users)
    .values({
      email: `atom-${role.toLowerCase()}-${TAG}-${Math.random().toString(36).slice(2, 10)}@allotly.test`,
      name,
      passwordHash: "x",
      orgId: oid,
      orgRole: role,
      status: "ACTIVE",
    })
    .returning();
  return u;
}

async function mkTeamIn(oid: string, adminId: string, ceilingCents: number | null): Promise<any> {
  const [t] = await db
    .insert(teams)
    .values({ name: `atom-team-${TAG}-${Math.random().toString(36).slice(2, 6)}`, orgId: oid, adminId, monthlyBudgetCeilingCents: ceilingCents })
    .returning();
  return t;
}

describe("ceiling-rejection atomicity (no orphaned side effects on 409)", () => {
  it("create-member: a ceiling 409 rolls back the invited user row (no orphan)", async () => {
    const oid = await mkEnterpriseOrg();
    const root = await mkUserIn(oid, "ROOT_ADMIN", "Atom Root");
    const tAdmin = await mkUserIn(oid, "TEAM_ADMIN", "Atom TAdmin");
    const team = await mkTeamIn(oid, tAdmin.id, 1000);

    // Fill the team to its ceiling: one member at 1000c => allocation == ceiling.
    const fillUser = await mkUserIn(oid, "MEMBER", "Fill");
    const now = new Date();
    await db.insert(teamMemberships).values({
      userId: fillUser.id,
      teamId: team.id,
      accessType: "TEAM",
      monthlyBudgetCents: 1000,
      currentPeriodSpendCents: 0,
      periodStart: now,
      periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      status: "ACTIVE",
    });

    const newEmail = `atom-new-${TAG}-${Math.random().toString(36).slice(2, 10)}@allotly.test`;
    const res = mockRes();
    await createMemberHandler(
      mockReq({ session: { userId: root.id }, body: { email: newEmail, name: "New One", teamId: team.id, budgetCents: 500 } }),
      res,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body?.code).toBe("BUDGET_CEILING_EXCEEDED");
    // The invited user row must NOT persist after the rejection (rolled back
    // because createUser now runs inside the ceiling tx).
    const orphan = await db.select().from(users).where(eq(users.email, newEmail));
    expect(orphan.length).toBe(0);
  });

  it("member budget update: a ceiling 409 rolls back the profile (name) write", async () => {
    // Mirrors PATCH /api/members/:id/budget: the profile (updateUser) write and
    // the ceiling-checked membership update share ONE tx. Write the profile
    // FIRST then trip the ceiling to prove TRUE rollback (not just fail-fast).
    const oid = await mkEnterpriseOrg();
    const tAdmin = await mkUserIn(oid, "TEAM_ADMIN", "Atom2 TAdmin");
    const team = await mkTeamIn(oid, tAdmin.id, 1000);
    const memberUser = await mkUserIn(oid, "MEMBER", "Original Name");

    const now = new Date();
    const [m] = await db
      .insert(teamMemberships)
      .values({
        userId: memberUser.id,
        teamId: team.id,
        accessType: "TEAM",
        monthlyBudgetCents: 800,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
        status: "ACTIVE",
      })
      .returning();

    await expect(
      db.transaction(async (tx) => {
        await storage.updateUser(memberUser.id, { name: "Changed Name" }, tx);
        const deltaCents = 5000 - m.monthlyBudgetCents; // 800 -> 5000 exceeds 1000 ceiling
        await assertTeamAllocationWithin(tx, team.id, deltaCents);
        await storage.updateMembership(m.id, { monthlyBudgetCents: 5000 }, tx);
      }),
    ).rejects.toBeInstanceOf(CeilingExceededError);

    const afterUser = await db.select().from(users).where(eq(users.id, memberUser.id));
    expect(afterUser[0].name).toBe("Original Name");
    const afterM = await db.select().from(teamMemberships).where(eq(teamMemberships.id, m.id));
    expect(afterM[0].monthlyBudgetCents).toBe(800);
  });
});
