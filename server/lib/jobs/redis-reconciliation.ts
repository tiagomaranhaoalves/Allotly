import { storage } from "../../storage";
import { redisGet, redisSet, REDIS_KEYS } from "../redis";

let running = false;

export async function runRedisReconciliation(): Promise<{ synced: number; restored: number; drifts: number }> {
  if (running) {
    console.log("[redis-reconciliation] Already running, skipping");
    return { synced: 0, restored: 0, drifts: 0 };
  }

  running = true;
  let synced = 0;
  let restored = 0;
  let drifts = 0;

  try {
    const teamMembers = await storage.getActiveMembershipsByAccessType("TEAM");
    const voucherMembers = await storage.getActiveMembershipsByAccessType("VOUCHER");
    const allActive = [...teamMembers, ...voucherMembers];

    for (const membership of allActive) {
      const budgetKey = REDIS_KEYS.budget(membership.id);
      const redisBudget = await redisGet(budgetKey);

      let pgRemaining: number;
      if (membership.accessType === "TEAM") {
        pgRemaining = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
      } else {
        pgRemaining = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
      }

      if (redisBudget === null) {
        await redisSet(budgetKey, String(pgRemaining));
        restored++;
        continue;
      }

      const redisRemaining = parseInt(redisBudget);
      const driftCents = Math.abs(redisRemaining - pgRemaining);

      if (driftCents > 100) {
        console.warn(
          `[redis-reconciliation] Budget drift detected for membership ${membership.id}: ` +
          `Redis=${redisRemaining} cents, PG=${pgRemaining} cents, drift=$${(driftCents / 100).toFixed(2)}`
        );
        drifts++;

        await redisSet(budgetKey, String(pgRemaining));
        synced++;
      }
    }

    if (restored > 0 || drifts > 0) {
      console.log(`[redis-reconciliation] Restored ${restored}, synced ${synced}, drifts ${drifts}`);
    }

    return { synced, restored, drifts };
  } finally {
    running = false;
  }
}
