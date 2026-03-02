import { storage } from "../../storage";
import { db } from "../../db";
import { voucherBundles, vouchers } from "@shared/schema";
import { eq, and, lte, inArray } from "drizzle-orm";
import { redisDel, REDIS_KEYS } from "../redis";
import { expireMembershipsForVoucher } from "./voucher-expiry";

let running = false;

export async function runBundleExpiry(): Promise<{ expired: number; vouchersExpired: number }> {
  if (running) {
    console.log("[bundle-expiry] Already running, skipping");
    return { expired: 0, vouchersExpired: 0 };
  }

  running = true;
  let expired = 0;
  let vouchersExpired = 0;

  try {
    const expiredBundles = await db.select().from(voucherBundles).where(
      and(
        eq(voucherBundles.status, "ACTIVE"),
        lte(voucherBundles.expiresAt, new Date())
      )
    );

    for (const bundle of expiredBundles) {
      await db.update(voucherBundles)
        .set({ status: "EXPIRED", updatedAt: new Date() })
        .where(eq(voucherBundles.id, bundle.id));
      expired++;

      const bundleVouchers = await storage.getVouchersByBundle(bundle.id);
      for (const voucher of bundleVouchers) {
        if (voucher.status === "ACTIVE" || voucher.status === "FULLY_REDEEMED") {
          await db.update(vouchers)
            .set({ status: "EXPIRED", updatedAt: new Date() })
            .where(eq(vouchers.id, voucher.id));
          vouchersExpired++;
        }

        await expireMembershipsForVoucher(voucher.id);
      }

      await redisDel(REDIS_KEYS.bundleRequests(bundle.id));
      await redisDel(REDIS_KEYS.bundleRedemptions(bundle.id));

      await storage.createAuditLog({
        orgId: bundle.orgId,
        actorId: bundle.purchasedById,
        action: "bundle.expired",
        targetType: "voucher_bundle",
        targetId: bundle.id,
      });
    }

    if (expired > 0) {
      console.log(`[bundle-expiry] Expired ${expired} bundles, ${vouchersExpired} vouchers`);
    }

    return { expired, vouchersExpired };
  } finally {
    running = false;
  }
}
