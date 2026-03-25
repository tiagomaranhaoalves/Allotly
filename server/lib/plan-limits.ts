import { storage } from "../storage";

export const PLAN_LIMITS = {
  FREE: {
    maxTeams: 1,
    maxTeamAdmins: 0,
    maxMembersPerTeam: 5,
    maxProviders: 4,
    maxActiveVouchers: 1,
    maxRedemptionsPerVoucher: 25,
    retentionDays: 7,
  },
  TEAM: {
    maxTeams: 10,
    maxTeamAdmins: 10,
    maxMembersPerTeam: 20,
    maxProviders: 4,
    maxActiveVouchersPerAdmin: 5,
    maxRedemptionsPerVoucher: 50,
    retentionDays: 90,
  },
  ENTERPRISE: {
    maxTeams: 999,
    maxTeamAdmins: 999,
    maxMembersPerTeam: 999,
    maxProviders: 999,
    maxActiveVouchersPerAdmin: 999,
    maxRedemptionsPerVoucher: 999,
    retentionDays: 365,
  },
} as const;

export type PlanResource =
  | "team"
  | "team_admin"
  | "member"
  | "provider"
  | "voucher";

export async function checkPlanLimit(
  orgId: string,
  resource: PlanResource,
  teamId?: string
): Promise<{ allowed: boolean; message?: string }> {
  const org = await storage.getOrganization(orgId);
  if (!org) return { allowed: false, message: "Organization not found" };

  let effectivePlan = org.plan as keyof typeof PLAN_LIMITS;
  if (org.graceEndsAt) {
    if (new Date(org.graceEndsAt) > new Date()) {
      effectivePlan = "TEAM";
    } else {
      if (org.plan !== "FREE") {
        await storage.updateOrganization(orgId, { plan: "FREE", maxTeamAdmins: 0, graceEndsAt: null });
        effectivePlan = "FREE";
      }
    }
  }
  const plan = effectivePlan;
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;

  switch (resource) {
    case "team": {
      const teams = await storage.getTeamsByOrg(orgId);
      if (teams.length >= limits.maxTeams) {
        return {
          allowed: false,
          message: `Maximum ${limits.maxTeams} team(s) on the ${plan} plan`,
        };
      }
      return { allowed: true };
    }

    case "team_admin": {
      const maxAdmins = org.maxTeamAdmins || limits.maxTeamAdmins;
      const allUsers = await storage.getUsersByOrg(orgId);
      const currentAdmins = allUsers.filter(
        (u) => u.orgRole === "TEAM_ADMIN" && u.status === "ACTIVE"
      );
      if (currentAdmins.length >= maxAdmins) {
        return {
          allowed: false,
          message: `Maximum ${maxAdmins} Team Admin(s) on your current plan`,
        };
      }
      return { allowed: true };
    }

    case "member": {
      if (!teamId)
        return { allowed: false, message: "Team ID required for member check" };
      const memberships = await storage.getMembershipsByTeam(teamId);
      const maxMembers =
        plan === "FREE"
          ? PLAN_LIMITS.FREE.maxMembersPerTeam
          : plan === "TEAM"
            ? PLAN_LIMITS.TEAM.maxMembersPerTeam
            : PLAN_LIMITS.ENTERPRISE.maxMembersPerTeam;
      if (memberships.length >= maxMembers) {
        return {
          allowed: false,
          message: `Maximum ${maxMembers} members per team on the ${plan} plan`,
        };
      }
      return { allowed: true };
    }

    case "provider": {
      const connections = await storage.getProviderConnectionsByOrg(orgId);
      const activeConnections = connections.filter(
        (c) => c.status !== "DISCONNECTED"
      );
      if (activeConnections.length >= limits.maxProviders) {
        return {
          allowed: false,
          message: `Maximum ${limits.maxProviders} provider connection(s) on the ${plan} plan`,
        };
      }
      return { allowed: true };
    }

    case "voucher": {
      const teams = await storage.getTeamsByOrg(orgId);
      let totalActive = 0;
      for (const t of teams) {
        const vouchers = await storage.getVouchersByTeam(t.id);
        totalActive += vouchers.filter(
          (v) => v.status === "ACTIVE" && !v.bundleId
        ).length;
      }
      const maxVouchers =
        plan === "FREE"
          ? PLAN_LIMITS.FREE.maxActiveVouchers
          : plan === "TEAM"
            ? (PLAN_LIMITS.TEAM.maxActiveVouchersPerAdmin * (org.maxTeamAdmins || 1))
            : 999;
      if (totalActive >= maxVouchers) {
        return {
          allowed: false,
          message: `Maximum ${maxVouchers} active plan voucher(s) on the ${plan} plan`,
        };
      }
      return { allowed: true };
    }

    default:
      return { allowed: true };
  }
}

export function getRetentionDays(plan: string): number {
  const p = plan as keyof typeof PLAN_LIMITS;
  return (PLAN_LIMITS[p] || PLAN_LIMITS.FREE).retentionDays;
}
