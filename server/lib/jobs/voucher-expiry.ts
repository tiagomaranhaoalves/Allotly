import { storage } from "../../storage";
import { db } from "../../db";
import { vouchers, allotlyApiKeys, teamMemberships } from "@shared/schema";
import { eq, and, lte } from "drizzle-orm";
import { redisDel, REDIS_KEYS } from "../redis";

let running = false;

export async function runVoucherExpiry(): Promise<{ expired: number; keysRevoked: number }> {
  if (running) {
    console.log("[voucher-expiry] Already running, skipping");
    return { expired: 0, keysRevoked: 0 };
  }

  running = true;
  let expired = 0;
  let keysRevoked = 0;

  try {
    const expiredVouchers = await db.select().from(vouchers).where(
      and(
        eq(vouchers.status, "ACTIVE"),
        lte(vouchers.expiresAt, new Date())
      )
    );

    for (const voucher of expiredVouchers) {
      await db.update(vouchers)
        .set({ status: "EXPIRED", updatedAt: new Date() })
        .where(eq(vouchers.id, voucher.id));
      expired++;

      const result = await expireMembershipsForVoucher(voucher.id);
      keysRevoked += result.keysRevoked;

      await storage.createAuditLog({
        orgId: voucher.orgId,
        actorId: voucher.createdById,
        action: "voucher.expired",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code: voucher.code },
      });
    }

    if (expired > 0) {
      console.log(`[voucher-expiry] Expired ${expired} vouchers, revoked ${keysRevoked} keys`);
    }

    return { expired, keysRevoked };
  } finally {
    running = false;
  }
}

export async function expireMembershipsForVoucher(voucherId: string): Promise<{ keysRevoked: number }> {
  let keysRevoked = 0;

  const memberships = await db.select().from(teamMemberships).where(
    and(
      eq(teamMemberships.voucherRedemptionId, voucherId),
      eq(teamMemberships.status, "ACTIVE")
    )
  );

  for (const membership of memberships) {
    const keys = await db.select().from(allotlyApiKeys).where(
      and(
        eq(allotlyApiKeys.membershipId, membership.id),
        eq(allotlyApiKeys.status, "ACTIVE")
      )
    );

    for (const apiKey of keys) {
      await db.update(allotlyApiKeys)
        .set({ status: "REVOKED", updatedAt: new Date() })
        .where(eq(allotlyApiKeys.id, apiKey.id));
      keysRevoked++;

      await redisDel(REDIS_KEYS.apiKeyCache(apiKey.keyHash));
    }

    await db.update(teamMemberships)
      .set({ status: "EXPIRED", updatedAt: new Date() })
      .where(eq(teamMemberships.id, membership.id));

    await redisDel(REDIS_KEYS.budget(membership.id));
    await redisDel(REDIS_KEYS.concurrent(membership.id));
    await redisDel(REDIS_KEYS.rateLimit(membership.id));
  }

  return { keysRevoked };
}
