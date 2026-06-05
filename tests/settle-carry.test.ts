import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  proxyRequestLogs,
} from "@shared/schema";
import { storage } from "../server/storage";
import {
  calculateSettledCostMicroCents,
  calculateSettledCostCents,
  adjustBudgetAfterResponse,
} from "../server/lib/proxy/safeguards";
import { redisGet, redisSet, redisDel, REDIS_KEYS } from "../server/lib/redis";
import type { ModelPricing } from "@shared/schema";

/**
 * Bug 1 — sub-cent settlement leak.
 *
 * Settlement rounds the per-request cost to whole cents for display, so any
 * request whose TRUE cost is < 1c used to debit 0 to the member ledger AND 0 to
 * the Redis cap. A member could therefore run unlimited sub-cent requests for
 * free and the cap would never trip. The fix accumulates the true cost in a
 * hidden micro-cent carry (`cost_remainder_micro_cents`) and debits whole cents
 * only when the carry crosses 1c — so cumulative spend is exact and the cap
 * always trips, while every visible value stays whole USD-cents.
 */

const TAG = `carry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// Prices in USD-cents per million tokens (same convention as settled-cost.test).
const pricing: ModelPricing = {
  id: "carry-model",
  provider: "OPENAI",
  modelId: "carry-test",
  displayName: "Carry Test",
  inputPricePerMTok: 300, // $3.00 / MTok
  outputPricePerMTok: 1500, // $15.00 / MTok
  maxOutputTokens: null,
  isActive: true,
  updatedAt: new Date(),
};

let orgId: string;
let teamId: string;

async function newMembership(budgetCents: number): Promise<string> {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);
  // A fresh member per membership — the (team_id, user_id) unique index forbids
  // reusing the same user for multiple memberships on the same team.
  const [member] = await db
    .insert(users)
    .values({
      email: `carry-member-${TAG}-${Math.random().toString(36).slice(2, 10)}@allotly.test`,
      name: "Carry Member",
      passwordHash: "x",
      orgId,
      orgRole: "MEMBER",
      status: "ACTIVE",
    })
    .returning();
  const [m] = await db
    .insert(teamMemberships)
    .values({
      teamId,
      userId: member.id,
      accessType: "TEAM",
      monthlyBudgetCents: budgetCents,
      currentPeriodSpendCents: 0,
      costRemainderMicroCents: 0,
      periodStart: now,
      periodEnd,
      status: "ACTIVE",
    })
    .returning();
  return m.id;
}

async function readLedger(membershipId: string): Promise<{ spend: number; rem: number }> {
  const [m] = await db
    .select({
      spend: teamMemberships.currentPeriodSpendCents,
      rem: teamMemberships.costRemainderMicroCents,
    })
    .from(teamMemberships)
    .where(eq(teamMemberships.id, membershipId));
  return { spend: Number(m.spend), rem: Number(m.rem) };
}

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: `carry-org-${TAG}`, plan: "TEAM" })
    .returning();
  orgId = org.id;

  const [admin] = await db
    .insert(users)
    .values({
      email: `carry-admin-${TAG}@allotly.test`,
      name: "Carry Admin",
      passwordHash: "x",
      orgId,
      orgRole: "TEAM_ADMIN",
      status: "ACTIVE",
    })
    .returning();

  const [team] = await db
    .insert(teams)
    .values({ name: `carry-team-${TAG}`, orgId, adminId: admin.id })
    .returning();
  teamId = team.id;
});

afterAll(async () => {
  if (teamId) {
    const memberships = await db
      .select({ id: teamMemberships.id })
      .from(teamMemberships)
      .where(eq(teamMemberships.teamId, teamId));
    for (const m of memberships) {
      await db.delete(proxyRequestLogs).where(eq(proxyRequestLogs.membershipId, m.id));
      await redisDel(REDIS_KEYS.budget(m.id));
    }
    await db.delete(teamMemberships).where(eq(teamMemberships.teamId, teamId));
    await db.delete(teams).where(eq(teams.id, teamId));
  }
  if (orgId) {
    await db.delete(users).where(eq(users.orgId, orgId));
    await db.delete(organizations).where(eq(organizations.id, orgId));
  }
  // Do not close the shared pool — sibling tests in this worker reuse it.
});

describe("calculateSettledCostMicroCents", () => {
  it("returns the true cost in micro-cents WITHOUT rounding to whole cents", () => {
    // 600 input @ 300c/MTok = 180,000 micro-cents = 0.18c.
    const micro = calculateSettledCostMicroCents({ inputTokens: 600, outputTokens: 0 }, pricing);
    expect(micro).toBe(180_000);
    // The whole-cent display value rounds the same request to 0c — that 0 is
    // exactly the leak the carry recovers.
    expect(calculateSettledCostCents({ inputTokens: 600, outputTokens: 0 }, pricing)).toBe(0);
  });

  it("agrees with calculateSettledCostCents * 1e6 for whole-cent requests", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
    // 300c input + 1500c output = 1800c.
    expect(calculateSettledCostMicroCents(usage, pricing)).toBe(1_800 * 1_000_000);
    expect(calculateSettledCostCents(usage, pricing)).toBe(1_800);
  });
});

describe("settleSpendWithCarry — ledger accumulation", () => {
  it("never loses sub-cent spend: 1000 × 0.18c settles to exactly 180c with zero remainder", async () => {
    const id = await newMembership(100_000);
    const micro = calculateSettledCostMicroCents({ inputTokens: 600, outputTokens: 0 }, pricing); // 180,000
    let crossedTotal = 0;
    for (let i = 0; i < 1000; i++) {
      const { crossedCents } = await storage.settleSpendWithCarry(id, micro);
      crossedTotal += crossedCents;
    }
    const { spend, rem } = await readLedger(id);
    expect(spend).toBe(180);
    expect(rem).toBe(0);
    expect(crossedTotal).toBe(180);
  }, 60_000);

  it("carries the remainder across requests: 3 × 0.3c => 0c/900000, 4th crosses to 1c/200000", async () => {
    const id = await newMembership(100_000);
    const micro = 300_000; // 0.3c

    for (let i = 0; i < 3; i++) {
      const { crossedCents } = await storage.settleSpendWithCarry(id, micro);
      expect(crossedCents).toBe(0);
    }
    let { spend, rem } = await readLedger(id);
    expect(spend).toBe(0);
    expect(rem).toBe(900_000);

    const { crossedCents, newSpendCents } = await storage.settleSpendWithCarry(id, micro);
    expect(crossedCents).toBe(1);
    expect(newSpendCents).toBe(1);
    ({ spend, rem } = await readLedger(id));
    expect(spend).toBe(1);
    expect(rem).toBe(200_000);
  });

  it("is equivalent to whole-cent rounding when every request is already >= 1c", async () => {
    const id = await newMembership(100_000);
    const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 }; // 1800c exactly
    const micro = calculateSettledCostMicroCents(usage, pricing);
    const wholeCents = calculateSettledCostCents(usage, pricing);

    const { crossedCents } = await storage.settleSpendWithCarry(id, micro);
    expect(crossedCents).toBe(wholeCents);
    const { spend, rem } = await readLedger(id);
    expect(spend).toBe(wholeCents);
    expect(rem).toBe(0);
  });

  it("handles a large (> $21) single request without overflow and keeps remainder < 1c", async () => {
    const id = await newMembership(10_000_000);
    // Seed a non-zero carry so the big request also exercises the carry add.
    await storage.settleSpendWithCarry(id, 999_999); // rem -> 999,999, spend 0
    const big = 2_500_000_000; // $25.00 in micro-cents (well past int32)
    const { crossedCents, newSpendCents } = await storage.settleSpendWithCarry(id, big);
    // (999,999 + 2,500,000,000) / 1e6 = 2500 (floor), remainder 999,999.
    expect(crossedCents).toBe(2500);
    expect(newSpendCents).toBe(2500);
    const { spend, rem } = await readLedger(id);
    expect(spend).toBe(2500);
    expect(rem).toBe(999_999);
    expect(rem).toBeLessThan(1_000_000);
  });
});

describe("settleSpendWithCarry — defensive input clamping", () => {
  it("never decreases spend or corrupts the remainder on a negative cost", async () => {
    const id = await newMembership(100_000);
    await storage.settleSpendWithCarry(id, 700_000); // rem 700,000, spend 0
    // A negative micro cost must be a no-op (clamped to 0), not a Postgres
    // sign-following modulo that drives the remainder out of [0, 1e6).
    const { crossedCents, newSpendCents } = await storage.settleSpendWithCarry(id, -5_000_000);
    expect(crossedCents).toBe(0);
    expect(newSpendCents).toBe(0);
    const { spend, rem } = await readLedger(id);
    expect(spend).toBe(0);
    expect(rem).toBe(700_000);
    expect(rem).toBeGreaterThanOrEqual(0);
    expect(rem).toBeLessThan(1_000_000);
  });
});

describe("settleSpendWithCarry — concurrency", () => {
  it("loses no carry under concurrent settlements on the same membership", async () => {
    const id = await newMembership(100_000);
    const N = 50;
    const micro = 333_333; // deliberately leaves a fractional tail
    await Promise.all(
      Array.from({ length: N }, () => storage.settleSpendWithCarry(id, micro)),
    );
    const total = N * micro; // 16,666,650
    const { spend, rem } = await readLedger(id);
    // Atomic FOR UPDATE => no lost updates: spend*1e6 + rem must equal the sum.
    expect(spend * 1_000_000 + rem).toBe(total);
    expect(spend).toBe(Math.floor(total / 1_000_000)); // 16
    expect(rem).toBe(total % 1_000_000); // 666,650
  });
});

describe("Redis cap trips on accumulated sub-cent spend", () => {
  beforeEach(async () => {});

  it("decrements the real-time cap by accumulated whole-cents (cap trips), not 0", async () => {
    const id = await newMembership(150);
    const budgetKey = REDIS_KEYS.budget(id);
    await redisSet(budgetKey, "150"); // 150c remaining
    const micro = 180_000; // 0.18c per request

    // Faithful net model of the proxy path: reserve+refund cancel, so the net
    // Redis decrement per request is exactly `crossedCents`. Old code passed
    // Math.round(0.18)=0 here, so the cap NEVER moved.
    for (let i = 0; i < 1000; i++) {
      const { crossedCents } = await storage.settleSpendWithCarry(id, micro);
      await adjustBudgetAfterResponse(id, 0, crossedCents);
    }

    const remaining = parseInt((await redisGet(budgetKey)) || "0", 10);
    // 1000 × 0.18c = 180c spent against a 150c cap => cap is now negative.
    expect(remaining).toBe(-30);
    expect(remaining).toBeLessThanOrEqual(0); // cap tripped
  }, 60_000);
});

describe("period reset zeroes the carry", () => {
  it("does not bleed a leftover remainder into the next period", async () => {
    const id = await newMembership(100_000);
    await storage.settleSpendWithCarry(id, 700_000); // rem 700,000, spend 0
    let { rem } = await readLedger(id);
    expect(rem).toBe(700_000);

    // Mirror what budget-reset.ts / the manual reset route write.
    await storage.updateMembership(id, {
      currentPeriodSpendCents: 0,
      costRemainderMicroCents: 0,
    });
    ({ rem } = await readLedger(id));
    expect(rem).toBe(0);

    // Fresh period: the same sub-cent request starts a new carry from 0.
    const { crossedCents } = await storage.settleSpendWithCarry(id, 300_000);
    expect(crossedCents).toBe(0);
    const after = await readLedger(id);
    expect(after.spend).toBe(0);
    expect(after.rem).toBe(300_000);
  });
});

describe("Part B — per-request aggregates match the member ledger", () => {
  it("getSpendByProvider rehydrates sub-cent rows so the provider sum equals ledger spend", async () => {
    const id = await newMembership(100_000);
    const micro = 300_000; // 0.3c -> cost_cents rounds to 0 (the visible echo bug)
    const displayCents = calculateSettledCostCents({ inputTokens: 1000, outputTokens: 0 }, pricing);
    expect(displayCents).toBe(0);

    for (let i = 0; i < 5; i++) {
      await storage.createProxyRequestLog({
        membershipId: id,
        apiKeyId: null,
        oauthClientId: null,
        provider: "OPENAI",
        model: "carry-test",
        inputTokens: 1000,
        outputTokens: 0,
        costCents: displayCents, // 0 — what the old SUM(cost_cents) would total
        costMicroCents: micro,
        durationMs: 10,
        statusCode: 200,
      });
      await storage.settleSpendWithCarry(id, micro);
    }

    const ledger = await readLedger(id);
    // 5 × 0.3c = 1.5c => floor => 1c on the ledger, 500,000 remainder.
    expect(ledger.spend).toBe(1);
    expect(ledger.rem).toBe(500_000);

    const byProvider = await storage.getSpendByProvider(orgId);
    const openai = byProvider.find((p) => p.provider === "OPENAI");
    expect(openai).toBeDefined();
    // The aggregate now floors SUM(micro)/1e6 == 1c, matching the ledger exactly
    // instead of the old SUM(cost_cents) == 0c under-report.
    expect(openai!.spendCents).toBe(ledger.spend);
    expect(openai!.spendCents).toBe(1);
  });
});
