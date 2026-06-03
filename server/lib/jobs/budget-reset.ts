import { storage } from "../../storage";
import { db } from "../../db";
import { allotlyApiKeys } from "@shared/schema";
import { eq } from "drizzle-orm";
import { redisSet, redisDel, REDIS_KEYS } from "../redis";
import { sendEmail, emailTemplates } from "../email";

let isResetting = false;

export async function runBudgetReset(): Promise<{ membersReset: number; membersReactivated: number; errors: number }> {
  if (isResetting) {
    console.log("[budget-reset] Skipping — previous reset still running");
    return { membersReset: 0, membersReactivated: 0, errors: 0 };
  }

  isResetting = true;
  const stats = { membersReset: 0, membersReactivated: 0, errors: 0 };
  const now = new Date();

  try {
    const teamMemberships = await storage.getActiveMembershipsByAccessType("TEAM");

    for (const membership of teamMemberships) {
      try {
        if (new Date(membership.periodEnd) > now) {
          continue;
        }

        const newPeriodStart = new Date(membership.periodEnd);
        const newPeriodEnd = new Date(newPeriodStart);
        newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

        const updateData: any = {
          currentPeriodSpendCents: 0,
          periodStart: newPeriodStart,
          periodEnd: newPeriodEnd,
        };

        if (membership.status === "BUDGET_EXHAUSTED") {
          updateData.status = "ACTIVE";
          stats.membersReactivated++;

          const keys = await storage.getApiKeysByMembership(membership.id);
          for (const key of keys) {
            if (key.status === "REVOKED") {
              await db.update(allotlyApiKeys)
                .set({ status: "ACTIVE", updatedAt: new Date() })
                .where(eq(allotlyApiKeys.id, key.id));
            }
            await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
          }
        }

        await redisSet(REDIS_KEYS.budget(membership.id), String(membership.monthlyBudgetCents));

        await storage.deleteBudgetAlertsByMembership(membership.id);
        await storage.updateMembership(membership.id, updateData);
        stats.membersReset++;

        const team = await storage.getTeam(membership.teamId);
        if (team) {
          await storage.createAuditLog({
            orgId: team.orgId,
            actorId: "system",
            action: "budget.period_reset",
            targetType: "team_membership",
            targetId: membership.id,
            metadata: {
              previousSpend: membership.currentPeriodSpendCents,
              newPeriodStart: newPeriodStart.toISOString(),
              newPeriodEnd: newPeriodEnd.toISOString(),
            },
          });
        }

        const memberUser = await storage.getUser(membership.userId);
        if (memberUser?.email) {
          const budgetDollars = (membership.monthlyBudgetCents / 100).toFixed(2);
          const tmpl = emailTemplates.budgetReset(memberUser.name || "User", budgetDollars, "/dashboard");
          try { await sendEmail(memberUser.email, tmpl.subject, tmpl.html); } catch {}
        }
      } catch (e: any) {
        stats.errors++;
        console.error(`[budget-reset] Error resetting member=${membership.id}: ${e.message}`);
      }
    }
  } catch (e: any) {
    console.error("[budget-reset] Fatal error:", e.message);
    stats.errors++;
  } finally {
    isResetting = false;
  }

  console.log(`[budget-reset] Complete: reset=${stats.membersReset} reactivated=${stats.membersReactivated} errors=${stats.errors}`);
  return stats;
}
