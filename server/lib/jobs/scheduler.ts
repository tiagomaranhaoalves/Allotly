import { runUsagePoll } from "./usage-poll";
import { runBudgetReset } from "./budget-reset";

let usagePollTimer: ReturnType<typeof setInterval> | null = null;
let budgetResetTimer: ReturnType<typeof setInterval> | null = null;

const USAGE_POLL_INTERVAL = 5 * 60 * 1000;
const BUDGET_RESET_INTERVAL = 60 * 60 * 1000;

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

  console.log(`[scheduler] Usage poll: every ${USAGE_POLL_INTERVAL / 1000}s`);
  console.log(`[scheduler] Budget reset: every ${BUDGET_RESET_INTERVAL / 1000}s`);
}

export function stopJobScheduler() {
  if (usagePollTimer) {
    clearInterval(usagePollTimer);
    usagePollTimer = null;
  }
  if (budgetResetTimer) {
    clearInterval(budgetResetTimer);
    budgetResetTimer = null;
  }
  console.log("[scheduler] Job scheduler stopped");
}
