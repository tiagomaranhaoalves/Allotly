import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, sql } from "drizzle-orm";
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
  type Voucher,
} from "@shared/schema";
import { claimVoucherSlot, redeemVoucherInline } from "../server/lib/vouchers/redeem-inline";
import { storage } from "../server/storage";

/**
 * Race-condition regression: two concurrent voucher redemptions used to both
 * pass the read-time `currentRedemptions < maxRedemptions` check and then both
 * increment, overshooting `maxRedemptions`. The fix is an atomic conditional
 * UPDATE (mirroring the bundle-pool pattern). This test exercises the race
 * directly against a real Postgres voucher row and asserts that exactly N of
 * N+K concurrent claims succeed.
 */

const TAG = `race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let orgId: string;
let teamId: string;
let adminId: string;

async function createVoucher(maxRedemptions: number): Promise<Voucher> {
  const [v] = await db
    .insert(vouchers)
    .values({
      code: `ALLOT-RACE-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      orgId,
      teamId,
      createdById: adminId,
      label: TAG,
      budgetCents: 1000,
      allowedProviders: ["OPENAI"],
      allowedModels: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxRedemptions,
      currentRedemptions: 0,
      status: "ACTIVE",
    })
    .returning();
  return v;
}

beforeAll(async () => {
  const [org] = await db
    .insert(organizations)
    .values({ name: `race-org-${TAG}`, plan: "TEAM" })
    .returning();
  orgId = org.id;

  const [admin] = await db
    .insert(users)
    .values({
      email: `race-admin-${TAG}@allotly.test`,
      name: "Race Admin",
      passwordHash: "x",
      orgId,
      orgRole: "TEAM_ADMIN",
      status: "ACTIVE",
    })
    .returning();
  adminId = admin.id;

  const [team] = await db
    .insert(teams)
    .values({ name: `race-team-${TAG}`, orgId, adminId })
    .returning();
  teamId = team.id;
});

afterAll(async () => {
  // Cleanup in FK order. The compensation tests exercise the full
  // redeemVoucherInline path, so user/membership/redemption/api-key/audit
  // rows can exist for this run. Delete them before the parent rows.
  if (orgId) {
    await db.delete(auditLogs).where(eq(auditLogs.orgId, orgId));
  }
  // voucher_redemptions FK -> vouchers; deleting vouchers later requires
  // these be gone first.
  const ourVouchers = await db
    .select({ id: vouchers.id })
    .from(vouchers)
    .where(eq(vouchers.label, TAG));
  for (const v of ourVouchers) {
    await db.delete(voucherRedemptions).where(eq(voucherRedemptions.voucherId, v.id));
  }
  if (teamId) {
    const memberships = await db
      .select({ id: teamMemberships.id, userId: teamMemberships.userId })
      .from(teamMemberships)
      .where(eq(teamMemberships.teamId, teamId));
    for (const m of memberships) {
      await db.delete(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, m.id));
    }
    await db.delete(teamMemberships).where(eq(teamMemberships.teamId, teamId));
  }
  await db.delete(vouchers).where(eq(vouchers.label, TAG));
  if (teamId) await db.delete(teams).where(eq(teams.id, teamId));
  // Voucher-synthetic users and the admin user.
  if (orgId) await db.delete(users).where(eq(users.orgId, orgId));
  if (orgId) await db.delete(organizations).where(eq(organizations.id, orgId));
  // Note: do not close the shared pool — other tests in the same Vitest
  // worker process rely on it.
});

describe("voucher redemption race", () => {
  it("never exceeds maxRedemptions when N+K claims race the same voucher", async () => {
    const MAX = 3;
    const ATTEMPTS = 8; // N + K, with K = 5 racing on the last slot
    const v = await createVoucher(MAX);

    const results = await Promise.all(
      Array.from({ length: ATTEMPTS }, () => claimVoucherSlot(db, v.id)),
    );

    const claimed = results.filter((r) => r !== null) as Voucher[];
    const rejected = results.filter((r) => r === null);

    expect(claimed.length).toBe(MAX);
    expect(rejected.length).toBe(ATTEMPTS - MAX);

    const [final] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(final.currentRedemptions).toBe(MAX);
    expect(final.status).toBe("FULLY_REDEEMED");
  });

  it("returns null and leaves counter untouched once the voucher is fully redeemed", async () => {
    const v = await createVoucher(1);

    const first = await claimVoucherSlot(db, v.id);
    expect(first).not.toBeNull();
    expect(first!.currentRedemptions).toBe(1);
    expect(first!.status).toBe("FULLY_REDEEMED");

    const second = await claimVoucherSlot(db, v.id);
    expect(second).toBeNull();

    const [final] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(final.currentRedemptions).toBe(1);
    expect(final.status).toBe("FULLY_REDEEMED");
  });

  it("flips status to FULLY_REDEEMED on the slot-filling claim, not before", async () => {
    const v = await createVoucher(2);

    const first = await claimVoucherSlot(db, v.id);
    expect(first).not.toBeNull();
    expect(first!.currentRedemptions).toBe(1);
    expect(first!.status).toBe("ACTIVE");

    const second = await claimVoucherSlot(db, v.id);
    expect(second).not.toBeNull();
    expect(second!.currentRedemptions).toBe(2);
    expect(second!.status).toBe("FULLY_REDEEMED");

    // Tighten the race assertion: a *third* concurrent burst on a now-full
    // voucher must all return null (no overshoot via stale snapshots).
    const overshoot = await Promise.all(
      Array.from({ length: 5 }, () => claimVoucherSlot(db, v.id)),
    );
    expect(overshoot.every((r) => r === null)).toBe(true);

    const [final] = await db
      .select({ c: vouchers.currentRedemptions })
      .from(vouchers)
      .where(eq(vouchers.id, v.id));
    expect(final.c).toBe(2);
  });
});

describe("voucher redemption compensation", () => {
  it("releases the reserved slot when downstream user creation fails", async () => {
    const v = await createVoucher(2);

    // Force `createUser` to throw on the next call so the post-claim path
    // explodes after the atomic claim has already incremented the counter.
    const original = storage.createUser.bind(storage);
    let calls = 0;
    (storage as any).createUser = async (...args: any[]) => {
      calls += 1;
      if (calls === 1) throw new Error("simulated downstream failure");
      return (original as any)(...args);
    };

    try {
      await expect(redeemVoucherInline({ code: v.code, instant: true })).rejects.toThrow(
        /simulated downstream failure/,
      );
    } finally {
      (storage as any).createUser = original;
    }

    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    // Slot was reserved then released — counter back to zero, status still ACTIVE.
    expect(after.currentRedemptions).toBe(0);
    expect(after.status).toBe("ACTIVE");
  });

  it("does NOT release the slot when failure happens AFTER the redemption row is persisted", async () => {
    // Late-failure regression: once `createVoucherRedemption` commits, the
    // redemption is durable. A subsequent failure (Redis, audit log, key
    // creation) must NOT release the voucher slot — releasing would
    // re-open capacity that the persisted redemption row already occupies,
    // allowing a real over-redemption on retry.
    const v = await createVoucher(1);

    const original = storage.createAllotlyApiKey.bind(storage);
    (storage as any).createAllotlyApiKey = async () => {
      throw new Error("simulated late failure after redemption persisted");
    };

    try {
      await expect(redeemVoucherInline({ code: v.code, instant: true })).rejects.toThrow(
        /simulated late failure/,
      );
    } finally {
      (storage as any).createAllotlyApiKey = original;
    }

    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    // Counter must remain at 1 and status must remain FULLY_REDEEMED — the
    // redemption row exists, the slot is genuinely consumed.
    expect(after.currentRedemptions).toBe(1);
    expect(after.status).toBe("FULLY_REDEEMED");
  });

  it("re-activates a FULLY_REDEEMED voucher when the slot-filling claim is compensated", async () => {
    const v = await createVoucher(1);

    const original = storage.createUser.bind(storage);
    (storage as any).createUser = async () => {
      throw new Error("simulated downstream failure");
    };

    try {
      await expect(redeemVoucherInline({ code: v.code, instant: true })).rejects.toThrow();
    } finally {
      (storage as any).createUser = original;
    }

    const [after] = await db.select().from(vouchers).where(eq(vouchers.id, v.id));
    expect(after.currentRedemptions).toBe(0);
    // The atomic claim flipped status to FULLY_REDEEMED; release must flip it
    // back to ACTIVE so the next caller can still redeem.
    expect(after.status).toBe("ACTIVE");
  });
});

// Sanity: assert the SQL guard mirrors the bundle pattern. This catches a
// future refactor that accidentally drops the `currentRedemptions <
// maxRedemptions` clause from the WHERE.
describe("voucher claim SQL shape", () => {
  it("the WHERE clause includes a currentRedemptions<maxRedemptions guard", async () => {
    // Build the same conditional UPDATE shape and inspect that it actually
    // refuses to update a row whose counter is at the limit.
    const v = await createVoucher(1);
    await db
      .update(vouchers)
      .set({ currentRedemptions: 1 })
      .where(eq(vouchers.id, v.id));

    const result = await claimVoucherSlot(db, v.id);
    expect(result).toBeNull();

    // Sanity: raw SQL guard the test depends on
    const res = await db.execute<{ ok: boolean }>(
      sql`SELECT (current_redemptions < max_redemptions) AS ok FROM vouchers WHERE id = ${v.id}`,
    );
    expect(res.rows[0].ok).toBe(false);
  });
});
