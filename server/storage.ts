import {
  type User, type InsertUser, type Organization, type InsertOrganization,
  type Team, type InsertTeam, type TeamMembership, type InsertTeamMembership,
  type ProviderConnection, type InsertProviderConnection, type Voucher, type InsertVoucher,
  type AuditLog, type InsertAuditLog, type ModelPricing,
  type VoucherBundle, type ProxyRequestLog, type UsageSnapshot,
  type AllotlyApiKey, type VoucherRedemption, type BudgetAlert,
  type ProviderMemberLink, type InsertProviderMemberLink,
  organizations, users, teams, teamMemberships, providerConnections,
  vouchers, voucherRedemptions, voucherBundles, auditLogs, modelPricing,
  allotlyApiKeys, usageSnapshots, proxyRequestLogs, budgetAlerts,
  providerMemberLinks,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, asc, gte, lte, count } from "drizzle-orm";

export interface IStorage {
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  updateOrganization(id: string, data: Partial<Organization>): Promise<Organization | undefined>;

  createUser(user: InsertUser): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByOrg(orgId: string): Promise<User[]>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;

  createTeam(team: InsertTeam): Promise<Team>;
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByOrg(orgId: string): Promise<Team[]>;
  getTeamByAdmin(adminId: string): Promise<Team | undefined>;
  updateTeam(id: string, data: Partial<Team>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<void>;

  createMembership(membership: InsertTeamMembership): Promise<TeamMembership>;
  getMembership(id: string): Promise<TeamMembership | undefined>;
  getMembershipByUser(userId: string): Promise<TeamMembership | undefined>;
  getMembershipsByTeam(teamId: string): Promise<TeamMembership[]>;
  updateMembership(id: string, data: Partial<TeamMembership>): Promise<TeamMembership | undefined>;

  createProviderConnection(conn: InsertProviderConnection): Promise<ProviderConnection>;
  getProviderConnection(id: string): Promise<ProviderConnection | undefined>;
  getProviderConnectionsByOrg(orgId: string): Promise<ProviderConnection[]>;
  updateProviderConnection(id: string, data: Partial<ProviderConnection>): Promise<ProviderConnection | undefined>;
  deleteProviderConnection(id: string): Promise<void>;

  createVoucher(voucher: InsertVoucher): Promise<Voucher>;
  getVoucher(id: string): Promise<Voucher | undefined>;
  getVoucherByCode(code: string): Promise<Voucher | undefined>;
  getVouchersByOrg(orgId: string): Promise<Voucher[]>;
  getVouchersByTeam(teamId: string): Promise<Voucher[]>;
  getVouchersByBundle(bundleId: string): Promise<Voucher[]>;
  getActiveVoucherCountByOrg(orgId: string): Promise<number>;
  getActiveVoucherCountByCreator(createdById: string): Promise<number>;
  updateVoucher(id: string, data: Partial<Voucher>): Promise<Voucher | undefined>;

  createVoucherRedemption(data: { voucherId: string; userId: string }): Promise<VoucherRedemption>;

  createVoucherBundle(data: any): Promise<VoucherBundle>;
  getVoucherBundle(id: string): Promise<VoucherBundle | undefined>;
  getVoucherBundlesByOrg(orgId: string): Promise<VoucherBundle[]>;
  updateVoucherBundle(id: string, data: Partial<VoucherBundle>): Promise<VoucherBundle | undefined>;

  createProviderMemberLink(link: InsertProviderMemberLink): Promise<ProviderMemberLink>;
  getProviderMemberLink(id: string): Promise<ProviderMemberLink | undefined>;
  getProviderMemberLinksByMembership(membershipId: string): Promise<ProviderMemberLink[]>;
  getProviderMemberLinksByConnection(connectionId: string): Promise<ProviderMemberLink[]>;
  getProviderMemberLinkByMembershipAndConnection(membershipId: string, connectionId: string): Promise<ProviderMemberLink | undefined>;
  updateProviderMemberLink(id: string, data: Partial<ProviderMemberLink>): Promise<ProviderMemberLink | undefined>;
  deleteProviderMemberLink(id: string): Promise<void>;

  getMemberCountByTeam(teamId: string): Promise<number>;
  getMemberCountByOrg(orgId: string): Promise<number>;
  deleteMembership(id: string): Promise<void>;
  deleteUser(id: string): Promise<void>;

  createAllotlyApiKey(data: { userId: string; membershipId: string; keyHash: string; keyPrefix: string }): Promise<AllotlyApiKey>;
  getApiKeyByHash(hash: string): Promise<AllotlyApiKey | undefined>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByOrg(orgId: string, limit?: number, offset?: number): Promise<AuditLog[]>;
  getFilteredAuditLogs(orgId: string, filters: {
    action?: string; targetType?: string; actorId?: string;
    startDate?: string; endDate?: string; page?: number; limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }>;

  getModelPricing(): Promise<ModelPricing[]>;
  getModelPricingByProvider(provider: string): Promise<ModelPricing[]>;

  createUsageSnapshot(data: any): Promise<UsageSnapshot>;
  getUsageSnapshotsByMembership(membershipId: string, limit?: number): Promise<UsageSnapshot[]>;

  createProxyRequestLog(data: any): Promise<ProxyRequestLog>;
  getProxyRequestLogsByMembership(membershipId: string, limit?: number): Promise<ProxyRequestLog[]>;

  getAllOrganizations(): Promise<Organization[]>;

  createBudgetAlert(data: { membershipId: string; thresholdPercent: number; triggeredAt: Date; actionTaken?: string }): Promise<BudgetAlert>;
  getBudgetAlertsByMembership(membershipId: string): Promise<BudgetAlert[]>;
  getBudgetAlert(membershipId: string, thresholdPercent: number): Promise<BudgetAlert | undefined>;
  deleteBudgetAlertsByMembership(membershipId: string): Promise<void>;

  getActiveMembershipsByAccessMode(accessMode: string): Promise<TeamMembership[]>;
  getActiveProviderMemberLinks(): Promise<ProviderMemberLink[]>;

  getDashboardStats(orgId: string): Promise<any>;
  getTeamDashboardStats(teamId: string): Promise<any>;

  getSpendByTeam(orgId: string): Promise<{ teamId: string; teamName: string; spendCents: number }[]>;
  getSpendByProvider(orgId: string): Promise<{ provider: string; spendCents: number }[]>;
  getMemberDetailsForTeam(teamId: string): Promise<any[]>;
  getApiKeysByMembership(membershipId: string): Promise<AllotlyApiKey[]>;
  getRecentAlerts(orgId: string, limit?: number): Promise<any[]>;
  getMemberDashboardData(userId: string): Promise<any>;
  getVoucherById(id: string): Promise<Voucher | undefined>;
}

export class DrizzleStorage implements IStorage {
  async createOrganization(org: InsertOrganization): Promise<Organization> {
    const [result] = await db.insert(organizations).values(org).returning();
    return result;
  }

  async getOrganization(id: string): Promise<Organization | undefined> {
    const [result] = await db.select().from(organizations).where(eq(organizations.id, id));
    return result;
  }

  async updateOrganization(id: string, data: Partial<Organization>): Promise<Organization | undefined> {
    const [result] = await db.update(organizations).set({ ...data, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();
    return result;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [result] = await db.insert(users).values(user).returning();
    return result;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.email, email));
    return result;
  }

  async getUsersByOrg(orgId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.orgId, orgId));
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [result] = await db.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
    return result;
  }

  async createTeam(team: InsertTeam): Promise<Team> {
    const [result] = await db.insert(teams).values(team).returning();
    return result;
  }

  async getTeam(id: string): Promise<Team | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.id, id));
    return result;
  }

  async getTeamsByOrg(orgId: string): Promise<Team[]> {
    return db.select().from(teams).where(eq(teams.orgId, orgId));
  }

  async getTeamByAdmin(adminId: string): Promise<Team | undefined> {
    const [result] = await db.select().from(teams).where(eq(teams.adminId, adminId));
    return result;
  }

  async updateTeam(id: string, data: Partial<Team>): Promise<Team | undefined> {
    const [result] = await db.update(teams).set({ ...data, updatedAt: new Date() }).where(eq(teams.id, id)).returning();
    return result;
  }

  async deleteTeam(id: string): Promise<void> {
    const memberships = await this.getMembershipsByTeam(id);
    for (const m of memberships) {
      await db.delete(providerMemberLinks).where(eq(providerMemberLinks.membershipId, m.id));
    }
    await db.delete(teamMemberships).where(eq(teamMemberships.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  async createMembership(membership: InsertTeamMembership): Promise<TeamMembership> {
    const [result] = await db.insert(teamMemberships).values(membership).returning();
    return result;
  }

  async getMembership(id: string): Promise<TeamMembership | undefined> {
    const [result] = await db.select().from(teamMemberships).where(eq(teamMemberships.id, id));
    return result;
  }

  async getMembershipByUser(userId: string): Promise<TeamMembership | undefined> {
    const [result] = await db.select().from(teamMemberships).where(eq(teamMemberships.userId, userId));
    return result;
  }

  async getMembershipsByTeam(teamId: string): Promise<TeamMembership[]> {
    return db.select().from(teamMemberships).where(eq(teamMemberships.teamId, teamId));
  }

  async updateMembership(id: string, data: Partial<TeamMembership>): Promise<TeamMembership | undefined> {
    const [result] = await db.update(teamMemberships).set({ ...data, updatedAt: new Date() }).where(eq(teamMemberships.id, id)).returning();
    return result;
  }

  async createProviderConnection(conn: InsertProviderConnection): Promise<ProviderConnection> {
    const [result] = await db.insert(providerConnections).values(conn).returning();
    return result;
  }

  async getProviderConnection(id: string): Promise<ProviderConnection | undefined> {
    const [result] = await db.select().from(providerConnections).where(eq(providerConnections.id, id));
    return result;
  }

  async getProviderConnectionsByOrg(orgId: string): Promise<ProviderConnection[]> {
    return db.select().from(providerConnections).where(eq(providerConnections.orgId, orgId));
  }

  async updateProviderConnection(id: string, data: Partial<ProviderConnection>): Promise<ProviderConnection | undefined> {
    const [result] = await db.update(providerConnections).set({ ...data, updatedAt: new Date() }).where(eq(providerConnections.id, id)).returning();
    return result;
  }

  async deleteProviderConnection(id: string): Promise<void> {
    await db.delete(providerConnections).where(eq(providerConnections.id, id));
  }

  async createVoucher(voucher: InsertVoucher): Promise<Voucher> {
    const [result] = await db.insert(vouchers).values(voucher).returning();
    return result;
  }

  async getVoucher(id: string): Promise<Voucher | undefined> {
    const [result] = await db.select().from(vouchers).where(eq(vouchers.id, id));
    return result;
  }

  async getVoucherByCode(code: string): Promise<Voucher | undefined> {
    const [result] = await db.select().from(vouchers).where(eq(vouchers.code, code));
    return result;
  }

  async getVouchersByOrg(orgId: string): Promise<Voucher[]> {
    return db.select().from(vouchers).where(eq(vouchers.orgId, orgId)).orderBy(desc(vouchers.createdAt));
  }

  async getVouchersByTeam(teamId: string): Promise<Voucher[]> {
    return db.select().from(vouchers).where(eq(vouchers.teamId, teamId)).orderBy(desc(vouchers.createdAt));
  }

  async getVouchersByBundle(bundleId: string): Promise<Voucher[]> {
    return db.select().from(vouchers).where(eq(vouchers.bundleId, bundleId)).orderBy(desc(vouchers.createdAt));
  }

  async getActiveVoucherCountByOrg(orgId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(vouchers).where(and(eq(vouchers.orgId, orgId), eq(vouchers.status, "ACTIVE")));
    return result?.count || 0;
  }

  async getActiveVoucherCountByCreator(createdById: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(vouchers).where(and(eq(vouchers.createdById, createdById), eq(vouchers.status, "ACTIVE")));
    return result?.count || 0;
  }

  async updateVoucher(id: string, data: Partial<Voucher>): Promise<Voucher | undefined> {
    const [result] = await db.update(vouchers).set({ ...data, updatedAt: new Date() }).where(eq(vouchers.id, id)).returning();
    return result;
  }

  async createVoucherRedemption(data: { voucherId: string; userId: string }): Promise<VoucherRedemption> {
    const [result] = await db.insert(voucherRedemptions).values(data).returning();
    return result;
  }

  async createVoucherBundle(data: any): Promise<VoucherBundle> {
    const [result] = await db.insert(voucherBundles).values(data).returning();
    return result;
  }

  async getVoucherBundle(id: string): Promise<VoucherBundle | undefined> {
    const [result] = await db.select().from(voucherBundles).where(eq(voucherBundles.id, id));
    return result;
  }

  async getVoucherBundlesByOrg(orgId: string): Promise<VoucherBundle[]> {
    return db.select().from(voucherBundles).where(eq(voucherBundles.orgId, orgId)).orderBy(desc(voucherBundles.createdAt));
  }

  async updateVoucherBundle(id: string, data: Partial<VoucherBundle>): Promise<VoucherBundle | undefined> {
    const [result] = await db.update(voucherBundles).set({ ...data, updatedAt: new Date() }).where(eq(voucherBundles.id, id)).returning();
    return result;
  }

  async createProviderMemberLink(link: InsertProviderMemberLink): Promise<ProviderMemberLink> {
    const [result] = await db.insert(providerMemberLinks).values(link).returning();
    return result;
  }

  async getProviderMemberLink(id: string): Promise<ProviderMemberLink | undefined> {
    const [result] = await db.select().from(providerMemberLinks).where(eq(providerMemberLinks.id, id));
    return result;
  }

  async getProviderMemberLinksByMembership(membershipId: string): Promise<ProviderMemberLink[]> {
    return db.select().from(providerMemberLinks).where(eq(providerMemberLinks.membershipId, membershipId));
  }

  async getProviderMemberLinksByConnection(connectionId: string): Promise<ProviderMemberLink[]> {
    return db.select().from(providerMemberLinks).where(eq(providerMemberLinks.providerConnectionId, connectionId));
  }

  async getProviderMemberLinkByMembershipAndConnection(membershipId: string, connectionId: string): Promise<ProviderMemberLink | undefined> {
    const [result] = await db.select().from(providerMemberLinks).where(
      and(eq(providerMemberLinks.membershipId, membershipId), eq(providerMemberLinks.providerConnectionId, connectionId))
    );
    return result;
  }

  async updateProviderMemberLink(id: string, data: Partial<ProviderMemberLink>): Promise<ProviderMemberLink | undefined> {
    const [result] = await db.update(providerMemberLinks).set({ ...data, updatedAt: new Date() }).where(eq(providerMemberLinks.id, id)).returning();
    return result;
  }

  async deleteProviderMemberLink(id: string): Promise<void> {
    await db.delete(providerMemberLinks).where(eq(providerMemberLinks.id, id));
  }

  async getMemberCountByTeam(teamId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(teamMemberships).where(eq(teamMemberships.teamId, teamId));
    return result?.count || 0;
  }

  async getMemberCountByOrg(orgId: string): Promise<number> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    let total = 0;
    for (const team of orgTeams) {
      total += await this.getMemberCountByTeam(team.id);
    }
    return total;
  }

  async deleteMembership(id: string): Promise<void> {
    await db.delete(providerMemberLinks).where(eq(providerMemberLinks.membershipId, id));
    await db.delete(teamMemberships).where(eq(teamMemberships.id, id));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async createAllotlyApiKey(data: { userId: string; membershipId: string; keyHash: string; keyPrefix: string }): Promise<AllotlyApiKey> {
    const [result] = await db.insert(allotlyApiKeys).values(data).returning();
    return result;
  }

  async getApiKeyByHash(hash: string): Promise<AllotlyApiKey | undefined> {
    const [result] = await db.select().from(allotlyApiKeys).where(eq(allotlyApiKeys.keyHash, hash));
    return result;
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(log).returning();
    return result;
  }

  async getAuditLogsByOrg(orgId: string, limit = 50, offset = 0): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId)).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
  }

  async getFilteredAuditLogs(orgId: string, filters: {
    action?: string; targetType?: string; actorId?: string;
    startDate?: string; endDate?: string; page?: number; limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const conditions = [eq(auditLogs.orgId, orgId)];
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.targetType) conditions.push(eq(auditLogs.targetType, filters.targetType));
    if (filters.actorId) conditions.push(eq(auditLogs.actorId, filters.actorId));
    if (filters.startDate) conditions.push(gte(auditLogs.createdAt, new Date(filters.startDate)));
    if (filters.endDate) conditions.push(lte(auditLogs.createdAt, new Date(filters.endDate)));

    const whereClause = conditions.length === 1 ? conditions[0] : and(...conditions);
    const limit = filters.limit || 50;
    const offset = ((filters.page || 1) - 1) * limit;

    const [countResult] = await db.select({ count: count() }).from(auditLogs).where(whereClause!);
    const logs = await db.select().from(auditLogs).where(whereClause!).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);

    return { logs, total: Number(countResult?.count || 0) };
  }

  async getModelPricing(): Promise<ModelPricing[]> {
    return db.select().from(modelPricing).where(eq(modelPricing.isActive, true));
  }

  async getModelPricingByProvider(provider: string): Promise<ModelPricing[]> {
    return db.select().from(modelPricing).where(and(eq(modelPricing.provider, provider as any), eq(modelPricing.isActive, true)));
  }

  async createUsageSnapshot(data: any): Promise<UsageSnapshot> {
    const [result] = await db.insert(usageSnapshots).values(data).returning();
    return result;
  }

  async getUsageSnapshotsByMembership(membershipId: string, limit = 50): Promise<UsageSnapshot[]> {
    return db.select().from(usageSnapshots).where(eq(usageSnapshots.membershipId, membershipId)).orderBy(desc(usageSnapshots.snapshotAt)).limit(limit);
  }

  async createProxyRequestLog(data: any): Promise<ProxyRequestLog> {
    const [result] = await db.insert(proxyRequestLogs).values(data).returning();
    return result;
  }

  async getProxyRequestLogsByMembership(membershipId: string, limit = 50): Promise<ProxyRequestLog[]> {
    return db.select().from(proxyRequestLogs).where(eq(proxyRequestLogs.membershipId, membershipId)).orderBy(desc(proxyRequestLogs.createdAt)).limit(limit);
  }

  async getDashboardStats(orgId: string): Promise<any> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    const orgUsers = await this.getUsersByOrg(orgId);
    const orgVouchers = await this.getVouchersByOrg(orgId);
    const providers = await this.getProviderConnectionsByOrg(orgId);

    const totalMembers = orgUsers.filter(u => u.orgRole === "MEMBER").length;
    const activeVouchers = orgVouchers.filter(v => v.status === "ACTIVE").length;

    let totalSpendCents = 0;
    for (const team of orgTeams) {
      const memberships = await this.getMembershipsByTeam(team.id);
      totalSpendCents += memberships.reduce((sum, m) => sum + m.currentPeriodSpendCents, 0);
    }

    return {
      totalSpendCents,
      totalMembers,
      activeVouchers,
      totalTeams: orgTeams.length,
      providerCount: providers.length,
      providers: providers.map(p => ({ provider: p.provider, status: p.status })),
    };
  }

  async getTeamDashboardStats(teamId: string): Promise<any> {
    const memberships = await this.getMembershipsByTeam(teamId);
    const directMembers = memberships.filter(m => m.accessMode === "DIRECT");
    const proxyMembers = memberships.filter(m => m.accessMode === "PROXY");
    const totalSpendCents = memberships.reduce((sum, m) => sum + m.currentPeriodSpendCents, 0);

    return {
      totalSpendCents,
      directMemberCount: directMembers.length,
      proxyMemberCount: proxyMembers.length,
      totalMembers: memberships.length,
    };
  }

  async getAllOrganizations(): Promise<Organization[]> {
    return db.select().from(organizations);
  }

  async createBudgetAlert(data: { membershipId: string; thresholdPercent: number; triggeredAt: Date; actionTaken?: string }): Promise<BudgetAlert> {
    const [result] = await db.insert(budgetAlerts).values(data).returning();
    return result;
  }

  async getBudgetAlertsByMembership(membershipId: string): Promise<BudgetAlert[]> {
    return db.select().from(budgetAlerts).where(eq(budgetAlerts.membershipId, membershipId));
  }

  async getBudgetAlert(membershipId: string, thresholdPercent: number): Promise<BudgetAlert | undefined> {
    const [result] = await db.select().from(budgetAlerts).where(
      and(eq(budgetAlerts.membershipId, membershipId), eq(budgetAlerts.thresholdPercent, thresholdPercent))
    );
    return result;
  }

  async deleteBudgetAlertsByMembership(membershipId: string): Promise<void> {
    await db.delete(budgetAlerts).where(eq(budgetAlerts.membershipId, membershipId));
  }

  async getActiveMembershipsByAccessMode(accessMode: string): Promise<TeamMembership[]> {
    return db.select().from(teamMemberships).where(
      and(eq(teamMemberships.accessMode, accessMode as any), eq(teamMemberships.status, "ACTIVE"))
    );
  }

  async getActiveProviderMemberLinks(): Promise<ProviderMemberLink[]> {
    return db.select().from(providerMemberLinks).where(
      and(eq(providerMemberLinks.status, "ACTIVE"), eq(providerMemberLinks.setupStatus, "COMPLETE"))
    );
  }

  async getSpendByTeam(orgId: string): Promise<{ teamId: string; teamName: string; spendCents: number }[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    const result: { teamId: string; teamName: string; spendCents: number }[] = [];
    for (const team of orgTeams) {
      const memberships = await this.getMembershipsByTeam(team.id);
      const spendCents = memberships.reduce((sum, m) => sum + m.currentPeriodSpendCents, 0);
      result.push({ teamId: team.id, teamName: team.name, spendCents });
    }
    return result;
  }

  async getSpendByProvider(orgId: string): Promise<{ provider: string; spendCents: number }[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    const providerMap: Record<string, number> = {};
    for (const team of orgTeams) {
      const memberships = await this.getMembershipsByTeam(team.id);
      for (const m of memberships) {
        const logs = await db.select({
          provider: proxyRequestLogs.provider,
          total: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
        }).from(proxyRequestLogs)
          .where(eq(proxyRequestLogs.membershipId, m.id))
          .groupBy(proxyRequestLogs.provider);
        for (const log of logs) {
          providerMap[log.provider] = (providerMap[log.provider] || 0) + Number(log.total);
        }

        const links = await this.getProviderMemberLinksByMembership(m.id);
        for (const link of links) {
          const conn = await this.getProviderConnection(link.providerConnectionId);
          if (conn) {
            const snapshots = await db.select({
              total: sql<number>`COALESCE(SUM(${usageSnapshots.periodCostCents}), 0)`,
            }).from(usageSnapshots)
              .where(eq(usageSnapshots.providerMemberLinkId, link.id));
            if (snapshots[0]) {
              providerMap[conn.provider] = (providerMap[conn.provider] || 0) + Number(snapshots[0].total);
            }
          }
        }
      }
    }
    return Object.entries(providerMap).map(([provider, spendCents]) => ({ provider, spendCents }));
  }

  async getMemberDetailsForTeam(teamId: string): Promise<any[]> {
    const memberships = await this.getMembershipsByTeam(teamId);
    const result: any[] = [];
    for (const m of memberships) {
      const user = await this.getUser(m.userId);
      const keys = await db.select().from(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, m.id));
      const proxyLogCount = await db.select({ count: count() }).from(proxyRequestLogs).where(eq(proxyRequestLogs.membershipId, m.id));
      const providerLinks = await this.getProviderMemberLinksByMembership(m.id);

      let voucherCode: string | null = null;
      if (m.voucherRedemptionId) {
        const voucher = await this.getVoucher(m.voucherRedemptionId);
        voucherCode = voucher?.code || null;
      }

      result.push({
        ...m,
        userName: user?.name || user?.email?.split("@")[0] || "Unknown",
        userEmail: user?.email || "",
        isVoucherUser: user?.isVoucherUser || false,
        voucherCode,
        keyPrefix: keys.find(k => k.status === "ACTIVE")?.keyPrefix || null,
        proxyRequestCount: Number(proxyLogCount[0]?.count || 0),
        providerLinks: providerLinks.map(l => ({
          id: l.id,
          provider: l.providerConnectionId,
          setupStatus: l.setupStatus,
          status: l.status,
        })),
      });
    }
    return result;
  }

  async getApiKeysByMembership(membershipId: string): Promise<AllotlyApiKey[]> {
    return db.select().from(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, membershipId));
  }

  async getRecentAlerts(orgId: string, limit = 20): Promise<any[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    const allAlerts: any[] = [];
    for (const team of orgTeams) {
      const memberships = await this.getMembershipsByTeam(team.id);
      for (const m of memberships) {
        const alerts = await db.select().from(budgetAlerts)
          .where(eq(budgetAlerts.membershipId, m.id))
          .orderBy(desc(budgetAlerts.triggeredAt))
          .limit(5);
        const user = await this.getUser(m.userId);
        for (const alert of alerts) {
          allAlerts.push({
            ...alert,
            userName: user?.name || user?.email || "Unknown",
            userEmail: user?.email || "",
            teamName: team.name,
            accessMode: m.accessMode,
          });
        }
      }
    }
    allAlerts.sort((a, b) => new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime());
    return allAlerts.slice(0, limit);
  }

  async getMemberDashboardData(userId: string): Promise<any> {
    const membership = await this.getMembershipByUser(userId);
    if (!membership) return null;

    const user = await this.getUser(userId);
    const keys = await this.getApiKeysByMembership(membership.id);
    const activeKey = keys.find(k => k.status === "ACTIVE");
    const proxyLogs = await this.getProxyRequestLogsByMembership(membership.id, 50);
    const usageSnapshots = await this.getUsageSnapshotsByMembership(membership.id, 100);
    const providerLinks = await this.getProviderMemberLinksByMembership(membership.id);
    const models = await this.getModelPricing();

    let voucherInfo: any = null;
    if (membership.voucherRedemptionId) {
      const voucher = await this.getVoucher(membership.voucherRedemptionId);
      if (voucher) {
        voucherInfo = {
          code: voucher.code,
          expiresAt: voucher.expiresAt,
          budgetCents: voucher.budgetCents,
          allowedProviders: voucher.allowedProviders,
          allowedModels: voucher.allowedModels,
        };
      }
    }

    const allowedProviders = (membership.allowedProviders as string[]) || [];
    const allowedModelIds = (membership.allowedModels as string[]) || [];
    const availableModels = models.filter(m => {
      if (allowedModelIds.length > 0) return allowedModelIds.includes(m.modelId);
      return allowedProviders.includes(m.provider);
    });

    const team = await this.getTeam(membership.teamId);

    const providerLinksWithInfo = [];
    for (const link of providerLinks) {
      const conn = await this.getProviderConnection(link.providerConnectionId);
      providerLinksWithInfo.push({
        ...link,
        provider: conn?.provider || "UNKNOWN",
        providerDisplayName: conn?.displayName || conn?.provider || "Unknown",
      });
    }

    return {
      membership,
      accessMode: membership.accessMode,
      budgetCents: membership.monthlyBudgetCents,
      spendCents: membership.currentPeriodSpendCents,
      periodStart: membership.periodStart,
      periodEnd: membership.periodEnd,
      status: membership.status,
      teamName: team?.name || "Unknown",
      keyPrefix: activeKey?.keyPrefix || null,
      proxyLogs,
      usageSnapshots,
      providerLinks: providerLinksWithInfo,
      availableModels,
      voucherInfo,
      proxyRequestCount: proxyLogs.length,
    };
  }

  async getVoucherById(id: string): Promise<Voucher | undefined> {
    return this.getVoucher(id);
  }
}

export const storage = new DrizzleStorage();
