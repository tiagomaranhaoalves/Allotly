import { db } from "../db";
import { eq, and, inArray } from "drizzle-orm";
import {
  organizations, users, teams, teamMemberships, providerConnections,
  allotlyApiKeys, usageSnapshots, proxyRequestLogs, budgetAlerts,
  vouchers, voucherRedemptions, voucherBundles, auditLogs, platformAuditLogs,
  passwordResetTokens,
} from "@shared/schema";
import { redisDel, redisKeys, REDIS_KEYS } from "./redis";

export interface CascadeDeleteResult {
  success: boolean;
  deletedCounts: Record<string, number>;
  error?: string;
}

async function cleanAllRedisForMemberships(membershipIds: string[]) {
  for (const mid of membershipIds) {
    await redisDel(REDIS_KEYS.budget(mid));
    await redisDel(REDIS_KEYS.concurrent(mid));
    await redisDel(REDIS_KEYS.ratelimit(mid));
    const reqKeys = await redisKeys(REDIS_KEYS.requestPattern(mid));
    for (const k of reqKeys) {
      await redisDel(k);
    }
  }
}

async function revokeKeysAndClearRedis(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  membershipIds: string[]
) {
  if (membershipIds.length === 0) return 0;

  const keys = await tx.select().from(allotlyApiKeys)
    .where(and(
      inArray(allotlyApiKeys.membershipId, membershipIds),
      eq(allotlyApiKeys.status, "ACTIVE")
    ));

  if (keys.length > 0) {
    await tx.update(allotlyApiKeys)
      .set({ status: "REVOKED", updatedAt: new Date() })
      .where(inArray(allotlyApiKeys.id, keys.map(k => k.id)));
  }

  await cleanAllRedisForMemberships(membershipIds);

  for (const key of keys) {
    await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
  }

  return keys.length;
}

export async function cascadeDeleteOrganization(
  orgId: string,
  confirmName: string,
  performedById: string,
  retainAuditLogs: boolean = false
): Promise<CascadeDeleteResult> {
  const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).then(r => r[0]);
  if (!org) return { success: false, deletedCounts: {}, error: "Organization not found" };
  if (org.name !== confirmName) return { success: false, deletedCounts: {}, error: "Organization name does not match" };

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    await tx.insert(platformAuditLogs).values({
      action: "DELETE_ORG",
      entityType: "ORG",
      entityId: orgId,
      metadata: { orgName: org.name, performedBy: performedById, retainAuditLogs },
      performedBy: performedById,
    });

    const orgTeams = await tx.select().from(teams).where(eq(teams.orgId, orgId));
    const teamIds = orgTeams.map(t => t.id);

    let allMembershipIds: string[] = [];
    if (teamIds.length > 0) {
      const allMemberships = await tx.select().from(teamMemberships)
        .where(inArray(teamMemberships.teamId, teamIds));
      allMembershipIds = allMemberships.map(m => m.id);
    }

    const revokedKeys = await revokeKeysAndClearRedis(tx, allMembershipIds);
    counts.revokedKeys = revokedKeys;

    if (allMembershipIds.length > 0) {
      const proxyResult = await tx.delete(proxyRequestLogs)
        .where(inArray(proxyRequestLogs.membershipId, allMembershipIds))
        .returning();
      counts.proxyRequestLogs = proxyResult.length;

      const usageResult = await tx.delete(usageSnapshots)
        .where(inArray(usageSnapshots.membershipId, allMembershipIds))
        .returning();
      counts.usageSnapshots = usageResult.length;

      const alertResult = await tx.delete(budgetAlerts)
        .where(inArray(budgetAlerts.membershipId, allMembershipIds))
        .returning();
      counts.budgetAlerts = alertResult.length;
    }

    if (!retainAuditLogs) {
      const auditResult = await tx.delete(auditLogs)
        .where(eq(auditLogs.orgId, orgId))
        .returning();
      counts.auditLogs = auditResult.length;
    }

    if (allMembershipIds.length > 0) {
      const apiKeyResult = await tx.delete(allotlyApiKeys)
        .where(inArray(allotlyApiKeys.membershipId, allMembershipIds))
        .returning();
      counts.apiKeys = apiKeyResult.length;
    }

    if (teamIds.length > 0) {
      const voucherList = await tx.select().from(vouchers)
        .where(inArray(vouchers.teamId, teamIds));
      const voucherIds = voucherList.map(v => v.id);

      if (voucherIds.length > 0) {
        const redemptionResult = await tx.delete(voucherRedemptions)
          .where(inArray(voucherRedemptions.voucherId, voucherIds))
          .returning();
        counts.voucherRedemptions = redemptionResult.length;
      }
    }

    if (allMembershipIds.length > 0) {
      const membershipResult = await tx.delete(teamMemberships)
        .where(inArray(teamMemberships.teamId, teamIds))
        .returning();
      counts.teamMemberships = membershipResult.length;
    }

    if (teamIds.length > 0) {
      const voucherResult = await tx.delete(vouchers)
        .where(inArray(vouchers.teamId, teamIds))
        .returning();
      counts.vouchers = voucherResult.length;
    }

    const bundleResult = await tx.delete(voucherBundles)
      .where(eq(voucherBundles.orgId, orgId))
      .returning();
    counts.bundles = bundleResult.length;

    const providerResult = await tx.delete(providerConnections)
      .where(eq(providerConnections.orgId, orgId))
      .returning();
    counts.providerConnections = providerResult.length;

    if (teamIds.length > 0) {
      const teamResult = await tx.delete(teams)
        .where(inArray(teams.id, teamIds))
        .returning();
      counts.teams = teamResult.length;
    }

    const orgUsers = await tx.select().from(users).where(eq(users.orgId, orgId));
    const userIdsToDelete = orgUsers.map(u => u.id);

    if (userIdsToDelete.length > 0) {
      await tx.delete(passwordResetTokens)
        .where(inArray(passwordResetTokens.userId, userIdsToDelete));

      const userResult = await tx.delete(users)
        .where(inArray(users.id, userIdsToDelete))
        .returning();
      counts.users = userResult.length;
    }

    await tx.delete(organizations).where(eq(organizations.id, orgId));
    counts.organizations = 1;
  });

  return { success: true, deletedCounts: counts };
}

export async function cascadeDeleteTeam(
  teamId: string,
  confirmName: string,
  performedById: string,
  orgId: string
): Promise<CascadeDeleteResult> {
  const team = await db.select().from(teams).where(eq(teams.id, teamId)).then(r => r[0]);
  if (!team) return { success: false, deletedCounts: {}, error: "Team not found" };
  if (team.name !== confirmName) return { success: false, deletedCounts: {}, error: "Team name does not match" };
  if (team.orgId !== orgId) return { success: false, deletedCounts: {}, error: "Team does not belong to this organization" };

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    const memberships = await tx.select().from(teamMemberships)
      .where(eq(teamMemberships.teamId, teamId));
    const membershipIds = memberships.map(m => m.id);

    const revokedKeys = await revokeKeysAndClearRedis(tx, membershipIds);
    counts.revokedKeys = revokedKeys;

    if (membershipIds.length > 0) {
      const proxyResult = await tx.delete(proxyRequestLogs)
        .where(inArray(proxyRequestLogs.membershipId, membershipIds))
        .returning();
      counts.proxyRequestLogs = proxyResult.length;

      const usageResult = await tx.delete(usageSnapshots)
        .where(inArray(usageSnapshots.membershipId, membershipIds))
        .returning();
      counts.usageSnapshots = usageResult.length;

      const alertResult = await tx.delete(budgetAlerts)
        .where(inArray(budgetAlerts.membershipId, membershipIds))
        .returning();
      counts.budgetAlerts = alertResult.length;

      const apiKeyResult = await tx.delete(allotlyApiKeys)
        .where(inArray(allotlyApiKeys.membershipId, membershipIds))
        .returning();
      counts.apiKeys = apiKeyResult.length;

      const membershipResult = await tx.delete(teamMemberships)
        .where(eq(teamMemberships.teamId, teamId))
        .returning();
      counts.teamMemberships = membershipResult.length;
    }

    const voucherList = await tx.select().from(vouchers).where(eq(vouchers.teamId, teamId));
    if (voucherList.length > 0) {
      const voucherIds = voucherList.map(v => v.id);
      await tx.delete(voucherRedemptions)
        .where(inArray(voucherRedemptions.voucherId, voucherIds));
      const voucherResult = await tx.delete(vouchers)
        .where(eq(vouchers.teamId, teamId))
        .returning();
      counts.vouchers = voucherResult.length;
    }

    await tx.delete(teams).where(eq(teams.id, teamId));
    counts.teams = 1;

    await tx.insert(auditLogs).values({
      orgId,
      actorId: performedById,
      action: "team.cascade_deleted",
      targetType: "team",
      targetId: teamId,
      metadata: { teamName: team.name, deletedCounts: counts },
    });
  });

  return { success: true, deletedCounts: counts };
}

export async function cascadeDeleteMember(
  membershipId: string,
  performedById: string,
  orgId: string
): Promise<CascadeDeleteResult> {
  const membership = await db.select().from(teamMemberships)
    .where(eq(teamMemberships.id, membershipId)).then(r => r[0]);
  if (!membership) return { success: false, deletedCounts: {}, error: "Membership not found" };

  const counts: Record<string, number> = {};
  let deletedUserEmail: string | null = null;

  await db.transaction(async (tx) => {
    const revokedKeys = await revokeKeysAndClearRedis(tx, [membershipId]);
    counts.revokedKeys = revokedKeys;

    const apiKeyResult = await tx.delete(allotlyApiKeys)
      .where(eq(allotlyApiKeys.membershipId, membershipId))
      .returning();
    counts.apiKeys = apiKeyResult.length;

    const proxyResult = await tx.delete(proxyRequestLogs)
      .where(eq(proxyRequestLogs.membershipId, membershipId))
      .returning();
    counts.proxyRequestLogs = proxyResult.length;

    const usageResult = await tx.delete(usageSnapshots)
      .where(eq(usageSnapshots.membershipId, membershipId))
      .returning();
    counts.usageSnapshots = usageResult.length;

    const alertResult = await tx.delete(budgetAlerts)
      .where(eq(budgetAlerts.membershipId, membershipId))
      .returning();
    counts.budgetAlerts = alertResult.length;

    await tx.delete(teamMemberships).where(eq(teamMemberships.id, membershipId));
    counts.teamMemberships = 1;

    const userId = membership.userId;
    const remainingMemberships = await tx.select().from(teamMemberships)
      .where(eq(teamMemberships.userId, userId));

    if (remainingMemberships.length === 0) {
      const user = await tx.select().from(users).where(eq(users.id, userId)).then(r => r[0]);
      deletedUserEmail = user?.email || null;

      await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));

      await tx.delete(voucherRedemptions)
        .where(eq(voucherRedemptions.userId, userId));

      await tx.delete(users).where(eq(users.id, userId));
      counts.users = 1;
    } else {
      counts.users = 0;
    }

    await tx.insert(auditLogs).values({
      orgId,
      actorId: performedById,
      action: "member.cascade_deleted",
      targetType: "team_membership",
      targetId: membershipId,
      metadata: {
        userId: membership.userId,
        teamId: membership.teamId,
        deletedCounts: counts,
        emailFreed: deletedUserEmail,
      },
    });
  });

  return { success: true, deletedCounts: counts };
}

export async function cascadeDeleteVoucher(
  voucherId: string,
  performedById: string,
  orgId: string
): Promise<CascadeDeleteResult> {
  const voucher = await db.select().from(vouchers)
    .where(eq(vouchers.id, voucherId)).then(r => r[0]);
  if (!voucher) return { success: false, deletedCounts: {}, error: "Voucher not found" };
  if (voucher.orgId !== orgId) return { success: false, deletedCounts: {}, error: "Voucher does not belong to this organization" };

  const counts: Record<string, number> = {};

  await db.transaction(async (tx) => {
    if (voucher.currentRedemptions > 0) {
      const redemptions = await tx.select().from(voucherRedemptions)
        .where(eq(voucherRedemptions.voucherId, voucherId));

      const userIdsToCleanup: string[] = [];

      for (const r of redemptions) {
        const membership = await tx.select().from(teamMemberships)
          .where(and(
            eq(teamMemberships.userId, r.userId),
            eq(teamMemberships.voucherRedemptionId, voucherId)
          )).then(res => res[0]);

        if (membership) {
          await revokeKeysAndClearRedis(tx, [membership.id]);

          await tx.delete(allotlyApiKeys)
            .where(eq(allotlyApiKeys.membershipId, membership.id));
          await tx.delete(proxyRequestLogs)
            .where(eq(proxyRequestLogs.membershipId, membership.id));
          await tx.delete(usageSnapshots)
            .where(eq(usageSnapshots.membershipId, membership.id));
          await tx.delete(budgetAlerts)
            .where(eq(budgetAlerts.membershipId, membership.id));
          await tx.delete(teamMemberships)
            .where(eq(teamMemberships.id, membership.id));

          counts.membershipsCleaned = (counts.membershipsCleaned || 0) + 1;
          userIdsToCleanup.push(r.userId);
        }
      }

      await tx.delete(voucherRedemptions)
        .where(eq(voucherRedemptions.voucherId, voucherId));
      counts.redemptions = redemptions.length;

      for (const userId of userIdsToCleanup) {
        const remainingMemberships = await tx.select().from(teamMemberships)
          .where(eq(teamMemberships.userId, userId));

        if (remainingMemberships.length === 0) {
          const user = await tx.select().from(users)
            .where(eq(users.id, userId)).then(res => res[0]);
          if (user?.isVoucherUser) {
            await tx.delete(passwordResetTokens)
              .where(eq(passwordResetTokens.userId, userId));
            await tx.delete(users).where(eq(users.id, userId));
            counts.usersDeleted = (counts.usersDeleted || 0) + 1;
          }
        }
      }
    }

    await tx.delete(vouchers).where(eq(vouchers.id, voucherId));
    counts.vouchers = 1;

    await tx.insert(auditLogs).values({
      orgId,
      actorId: performedById,
      action: "voucher.cascade_deleted",
      targetType: "voucher",
      targetId: voucherId,
      metadata: {
        voucherCode: voucher.code,
        wasRedeemed: voucher.currentRedemptions > 0,
        deletedCounts: counts,
      },
    });
  });

  return { success: true, deletedCounts: counts };
}
