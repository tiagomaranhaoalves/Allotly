import { runBudgetReset } from "./budget-reset";
import { runVoucherExpiry } from "./voucher-expiry";
import { runBundleExpiry } from "./bundle-expiry";
import { runRedisReconciliation } from "./redis-reconciliation";
import { runProviderValidation } from "./provider-validation";
import { runSnapshotCleanup } from "./snapshot-cleanup";
import { runSpendAnomalyCheck } from "./spend-anomaly";
import { runModelSync } from "./model-sync";
import { selfHealConcurrency } from "../proxy/safeguards";

let budgetResetTimer: ReturnType<typeof setInterval> | null = null;
let concurrencyHealTimer: ReturnType<typeof setInterval> | null = null;
let voucherExpiryTimer: ReturnType<typeof setInterval> | null = null;
let bundleExpiryTimer: ReturnType<typeof setInterval> | null = null;
let redisReconciliationTimer: ReturnType<typeof setInterval> | null = null;
let providerValidationTimer: ReturnType<typeof setInterval> | null = null;
let snapshotCleanupTimer: ReturnType<typeof setInterval> | null = null;
let spendAnomalyTimer: ReturnType<typeof setInterval> | null = null;
let modelSyncTimer: ReturnType<typeof setInterval> | null = null;

const BUDGET_RESET_INTERVAL = 60 * 60 * 1000;
const CONCURRENCY_HEAL_INTERVAL = 30 * 1000;
const VOUCHER_EXPIRY_INTERVAL = 60 * 60 * 1000;
const BUNDLE_EXPIRY_INTERVAL = 60 * 60 * 1000;
const REDIS_RECONCILIATION_INTERVAL = 60 * 1000;
const PROVIDER_VALIDATION_INTERVAL = 24 * 60 * 60 * 1000;
const SNAPSHOT_CLEANUP_INTERVAL = 7 * 24 * 60 * 60 * 1000;
const SPEND_ANOMALY_INTERVAL = 60 * 60 * 1000;
const MODEL_SYNC_INTERVAL = 6 * 60 * 60 * 1000;

export function startJobScheduler() {
  console.log("[scheduler] Starting background job scheduler...");

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

  providerValidationTimer = setInterval(async () => {
    try {
      console.log("[scheduler] Running provider validation job...");
      await runProviderValidation();
    } catch (e: any) {
      console.error("[scheduler] Provider validation failed:", e.message);
    }
  }, PROVIDER_VALIDATION_INTERVAL);

  snapshotCleanupTimer = setInterval(async () => {
    try {
      console.log("[scheduler] Running snapshot cleanup job...");
      await runSnapshotCleanup();
    } catch (e: any) {
      console.error("[scheduler] Snapshot cleanup failed:", e.message);
    }
  }, SNAPSHOT_CLEANUP_INTERVAL);

  spendAnomalyTimer = setInterval(async () => {
    try {
      await runSpendAnomalyCheck();
    } catch (e: any) {
      console.error("[scheduler] Spend anomaly check failed:", e.message);
    }
  }, SPEND_ANOMALY_INTERVAL);

  modelSyncTimer = setInterval(async () => {
    try {
      console.log("[scheduler] Running model sync job...");
      await runModelSync();
    } catch (e: any) {
      console.error("[scheduler] Model sync failed:", e.message);
    }
  }, MODEL_SYNC_INTERVAL);

  setTimeout(async () => {
    try {
      console.log("[scheduler] Running initial model sync...");
      await runModelSync();
    } catch (e: any) {
      console.error("[scheduler] Initial model sync failed:", e.message);
    }
  }, 10_000);

  console.log(`[scheduler] Budget reset: every ${BUDGET_RESET_INTERVAL / 1000}s`);
  console.log(`[scheduler] Concurrency self-heal: every ${CONCURRENCY_HEAL_INTERVAL / 1000}s`);
  console.log(`[scheduler] Voucher expiry: every ${VOUCHER_EXPIRY_INTERVAL / 1000}s`);
  console.log(`[scheduler] Bundle expiry: every ${BUNDLE_EXPIRY_INTERVAL / 1000}s`);
  console.log(`[scheduler] Redis reconciliation: every ${REDIS_RECONCILIATION_INTERVAL / 1000}s`);
  console.log(`[scheduler] Provider validation: every ${PROVIDER_VALIDATION_INTERVAL / 1000}s`);
  console.log(`[scheduler] Snapshot cleanup: every ${SNAPSHOT_CLEANUP_INTERVAL / 1000}s`);
  console.log(`[scheduler] Spend anomaly: every ${SPEND_ANOMALY_INTERVAL / 1000}s`);
  console.log(`[scheduler] Model sync: every ${MODEL_SYNC_INTERVAL / 1000}s`);
}

export function stopJobScheduler() {
  if (budgetResetTimer) { clearInterval(budgetResetTimer); budgetResetTimer = null; }
  if (concurrencyHealTimer) { clearInterval(concurrencyHealTimer); concurrencyHealTimer = null; }
  if (voucherExpiryTimer) { clearInterval(voucherExpiryTimer); voucherExpiryTimer = null; }
  if (bundleExpiryTimer) { clearInterval(bundleExpiryTimer); bundleExpiryTimer = null; }
  if (redisReconciliationTimer) { clearInterval(redisReconciliationTimer); redisReconciliationTimer = null; }
  if (providerValidationTimer) { clearInterval(providerValidationTimer); providerValidationTimer = null; }
  if (snapshotCleanupTimer) { clearInterval(snapshotCleanupTimer); snapshotCleanupTimer = null; }
  if (spendAnomalyTimer) { clearInterval(spendAnomalyTimer); spendAnomalyTimer = null; }
  if (modelSyncTimer) { clearInterval(modelSyncTimer); modelSyncTimer = null; }
  console.log("[scheduler] Job scheduler stopped");
}
