import { runUsagePoll } from "./usage-poll";
import { runBudgetReset } from "./budget-reset";
import { runVoucherExpiry } from "./voucher-expiry";
import { runBundleExpiry } from "./bundle-expiry";
import { runRedisReconciliation } from "./redis-reconciliation";
import { selfHealConcurrency } from "../proxy/safeguards";

let usagePollTimer: ReturnType<typeof setInterval> | null = null;
let budgetResetTimer: ReturnType<typeof setInterval> | null = null;
let concurrencyHealTimer: ReturnType<typeof setInterval> | null = null;
let voucherExpiryTimer: ReturnType<typeof setInterval> | null = null;
let bundleExpiryTimer: ReturnType<typeof setInterval> | null = null;
let redisReconciliationTimer: ReturnType<typeof setInterval> | null = null;

const USAGE_POLL_INTERVAL = 5 * 60 * 1000;
const BUDGET_RESET_INTERVAL = 60 * 60 * 1000;
const CONCURRENCY_HEAL_INTERVAL = 30 * 1000;
const VOUCHER_EXPIRY_INTERVAL = 60 * 60 * 1000;
const BUNDLE_EXPIRY_INTERVAL = 60 * 60 * 1000;
const REDIS_RECONCILIATION_INTERVAL = 60 * 1000;

export function startJobScheduler() {
  console.log("[scheduler] Starting background job scheduler...");

  usagePollTimer = setInterval(async () => {
    try {
      console.log("[scheduler] Running usage poll job...");
      await runUsagePoll();
    } catch (e: any) {
      console.error("[scheduler] Usage poll job failed:", e.message);
    }
  }, USAGE_POLL_INTERVAL);

  budgetResetTimer = setInterval(async () => {
    try {
      console.log("[scheduler] Running budget reset job...");
      await runBudgetReset();
    } catch (e: any) {
      console.error("[scheduler] Budget reset job failed:", e.message);
    }
  }, BUDGET_RESET_INTERVAL);

  concurrencyHealTimer = setInterval(async () => {
    try {
      const healed = await selfHealConcurrency();
      if (healed > 0) {
        console.log(`[scheduler] Concurrency self-heal: reset ${healed} stale counters`);
      }
    } catch (e: any) {
      console.error("[scheduler] Concurrency self-heal failed:", e.message);
    }
  }, CONCURRENCY_HEAL_INTERVAL);

  voucherExpiryTimer = setInterval(async () => {
    try {
      await runVoucherExpiry();
    } catch (e: any) {
      console.error("[scheduler] Voucher expiry job failed:", e.message);
    }
  }, VOUCHER_EXPIRY_INTERVAL);

  bundleExpiryTimer = setInterval(async () => {
    try {
      await runBundleExpiry();
    } catch (e: any) {
      console.error("[scheduler] Bundle expiry job failed:", e.message);
    }
  }, BUNDLE_EXPIRY_INTERVAL);

  redisReconciliationTimer = setInterval(async () => {
    try {
      await runRedisReconciliation();
    } catch (e: any) {
      console.error("[scheduler] Redis reconciliation failed:", e.message);
    }
  }, REDIS_RECONCILIATION_INTERVAL);

  console.log(`[scheduler] Usage poll: every ${USAGE_POLL_INTERVAL / 1000}s`);
  console.log(`[scheduler] Budget reset: every ${BUDGET_RESET_INTERVAL / 1000}s`);
  console.log(`[scheduler] Concurrency self-heal: every ${CONCURRENCY_HEAL_INTERVAL / 1000}s`);
  console.log(`[scheduler] Voucher expiry: every ${VOUCHER_EXPIRY_INTERVAL / 1000}s`);
  console.log(`[scheduler] Bundle expiry: every ${BUNDLE_EXPIRY_INTERVAL / 1000}s`);
  console.log(`[scheduler] Redis reconciliation: every ${REDIS_RECONCILIATION_INTERVAL / 1000}s`);
}

export function stopJobScheduler() {
  if (usagePollTimer) { clearInterval(usagePollTimer); usagePollTimer = null; }
  if (budgetResetTimer) { clearInterval(budgetResetTimer); budgetResetTimer = null; }
  if (concurrencyHealTimer) { clearInterval(concurrencyHealTimer); concurrencyHealTimer = null; }
  if (voucherExpiryTimer) { clearInterval(voucherExpiryTimer); voucherExpiryTimer = null; }
  if (bundleExpiryTimer) { clearInterval(bundleExpiryTimer); bundleExpiryTimer = null; }
  if (redisReconciliationTimer) { clearInterval(redisReconciliationTimer); redisReconciliationTimer = null; }
  console.log("[scheduler] Job scheduler stopped");
}
