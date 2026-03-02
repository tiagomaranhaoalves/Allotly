import { db } from "../../db";
import { usageSnapshots, proxyRequestLogs, organizations, teamMemberships, teams } from "@shared/schema";
import { sql, eq, lt, and, inArray } from "drizzle-orm";
import { getRetentionDays } from "../plan-limits";

export async function runSnapshotCleanup(): Promise<void> {
  const allOrgs = await db.select().from(organizations);
  let snapshotsDeleted = 0;
  let logsDeleted = 0;

  for (const org of allOrgs) {
    const retentionDays = getRetentionDays(org.plan);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const orgTeams = await db.select().from(teams).where(eq(teams.orgId, org.id));
    const teamIds = orgTeams.map(t => t.id);
    if (teamIds.length === 0) continue;

    const memberships = await db.select().from(teamMemberships).where(inArray(teamMemberships.teamId, teamIds));
    const membershipIds = memberships.map(m => m.id);
    if (membershipIds.length === 0) continue;

    const snapResult = await db.delete(usageSnapshots)
      .where(and(
        inArray(usageSnapshots.membershipId, membershipIds),
        lt(usageSnapshots.snapshotAt, cutoff)
      ));
    snapshotsDeleted += (snapResult as any).rowCount || 0;

    const logResult = await db.delete(proxyRequestLogs)
      .where(and(
        inArray(proxyRequestLogs.membershipId, membershipIds),
        lt(proxyRequestLogs.requestedAt, cutoff)
      ));
    logsDeleted += (logResult as any).rowCount || 0;
  }

  if (snapshotsDeleted > 0 || logsDeleted > 0) {
    console.log(`[snapshot-cleanup] Deleted ${snapshotsDeleted} snapshots, ${logsDeleted} proxy logs`);
  }
}
