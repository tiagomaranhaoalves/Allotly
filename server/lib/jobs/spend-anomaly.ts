import { db } from "../../db";
import { storage } from "../../storage";
import { organizations, teams, teamMemberships, proxyRequestLogs, usageSnapshots, users } from "@shared/schema";
import { eq, sql, gte, and, inArray } from "drizzle-orm";
import { sendEmail, emailTemplates } from "../email";

export async function runSpendAnomalyCheck(): Promise<void> {
  const allOrgs = await db.select().from(organizations);
  let anomalies = 0;

  for (const org of allOrgs) {
    const orgTeams = await db.select().from(teams).where(eq(teams.orgId, org.id));

    for (const team of orgTeams) {
      const memberships = await db.select().from(teamMemberships).where(eq(teamMemberships.teamId, team.id));

      for (const membership of memberships) {
        try {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const [avgResult] = await db.select({
            avgCost: sql<number>`COALESCE(AVG(daily_cost), 0)`,
          }).from(
            sql`(
              SELECT DATE(${proxyRequestLogs.requestedAt}) as day, SUM(${proxyRequestLogs.costCents}) as daily_cost
              FROM ${proxyRequestLogs}
              WHERE ${proxyRequestLogs.membershipId} = ${membership.id}
                AND ${proxyRequestLogs.requestedAt} >= ${sevenDaysAgo}
              GROUP BY DATE(${proxyRequestLogs.requestedAt})
            ) as daily_costs`
          );

          const avgDaily = Number(avgResult?.avgCost || 0);
          if (avgDaily < 100) continue;

          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const [todayResult] = await db.select({
            totalCost: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
          }).from(proxyRequestLogs)
            .where(and(
              eq(proxyRequestLogs.membershipId, membership.id),
              gte(proxyRequestLogs.requestedAt, today)
            ));

          const todaySpend = Number(todayResult?.totalCost || 0);

          if (todaySpend > avgDaily * 3) {
            anomalies++;
            const multiplier = (todaySpend / avgDaily).toFixed(1);

            const member = await storage.getUser(membership.userId);
            if (!member) continue;

            await storage.createBudgetAlert({
              membershipId: membership.id,
              thresholdPercent: 0,
              triggeredAt: new Date(),
              actionTaken: `spend_anomaly:${multiplier}x`,
            });

            await storage.createAuditLog({
              orgId: org.id,
              actorId: "system",
              action: "spend.anomaly_detected",
              targetType: "team_membership",
              targetId: membership.id,
              metadata: {
                memberEmail: member.email,
                todaySpendCents: todaySpend,
                avgDailyCents: Math.round(avgDaily),
                multiplier,
              },
            });

            const teamAdmin = team.adminId ? await storage.getUser(team.adminId) : null;
            if (teamAdmin) {
              const tmpl = emailTemplates.spendAnomaly(
                teamAdmin.name || teamAdmin.email,
                member.name || member.email,
                member.email,
                (todaySpend / 100).toFixed(2),
                (avgDaily / 100).toFixed(2),
                multiplier
              );
              await sendEmail(teamAdmin.email, tmpl.subject, tmpl.html);
            }
          }
        } catch (e: any) {
          console.error(`[spend-anomaly] Error checking membership ${membership.id}:`, e.message);
        }
      }
    }
  }

  if (anomalies > 0) {
    console.log(`[spend-anomaly] Detected ${anomalies} anomalies`);
  }
}
