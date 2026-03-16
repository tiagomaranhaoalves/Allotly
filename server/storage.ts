import {
  type User, type InsertUser, type Organization, type InsertOrganization,
  type Team, type InsertTeam, type TeamMembership, type InsertTeamMembership,
  type ProviderConnection, type InsertProviderConnection, type Voucher, type InsertVoucher,
  type AuditLog, type InsertAuditLog, type ModelPricing,
  type VoucherBundle, type ProxyRequestLog, type UsageSnapshot,
  type AllotlyApiKey, type VoucherRedemption, type BudgetAlert,
  organizations, users, teams, teamMemberships, providerConnections,
  vouchers, voucherRedemptions, voucherBundles, auditLogs, modelPricing,
  allotlyApiKeys, usageSnapshots, proxyRequestLogs, budgetAlerts,
  passwordResetTokens,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, asc, gte, lte, count, inArray } from "drizzle-orm";

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
  bulkCreateVouchers(voucherData: InsertVoucher[]): Promise<Voucher[]>;
  getMembershipsByVoucherId(voucherId: string): Promise<TeamMembership[]>;
  getVouchersFiltered(orgId: string, filters: { status?: string; bundleId?: string; createdAfter?: string; createdBefore?: string }): Promise<Voucher[]>;

  createVoucherRedemption(data: { voucherId: string; userId: string }): Promise<VoucherRedemption>;
  getVoucherRedemptionsByVoucherId(voucherId: string): Promise<(VoucherRedemption & { user?: User })[]>;

  createVoucherBundle(data: any): Promise<VoucherBundle>;
  getVoucherBundle(id: string): Promise<VoucherBundle | undefined>;
  getVoucherBundlesByOrg(orgId: string): Promise<VoucherBundle[]>;
  updateVoucherBundle(id: string, data: Partial<VoucherBundle>): Promise<VoucherBundle | undefined>;

  getMemberCountByTeam(teamId: string): Promise<number>;
  getMemberCountByOrg(orgId: string): Promise<number>;
  deleteMembership(id: string): Promise<void>;
  deleteUser(id: string): Promise<void>;

  createAllotlyApiKey(data: { userId: string; membershipId: string; keyHash: string; keyPrefix: string }): Promise<AllotlyApiKey>;
  getApiKeyByHash(hash: string): Promise<AllotlyApiKey | undefined>;
  updateAllotlyApiKey(id: string, data: Partial<AllotlyApiKey>): Promise<AllotlyApiKey | undefined>;
  getActiveKeyByUserId(userId: string): Promise<AllotlyApiKey | undefined>;

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

  getActiveMembershipsByAccessType(accessType: string): Promise<TeamMembership[]>;

  getDashboardStats(orgId: string): Promise<any>;
  getTeamDashboardStats(teamId: string): Promise<any>;

  getSpendByTeam(orgId: string): Promise<{ teamId: string; teamName: string; spendCents: number }[]>;
  getSpendByProvider(orgId: string): Promise<{ provider: string; spendCents: number }[]>;
  getMemberDetailsForTeam(teamId: string): Promise<any[]>;
  getApiKeysByMembership(membershipId: string): Promise<AllotlyApiKey[]>;
  getRecentAlerts(orgId: string, limit?: number): Promise<any[]>;
  getMemberDashboardData(userId: string): Promise<any>;
  getVoucherById(id: string): Promise<Voucher | undefined>;

  createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<any>;
  getPasswordResetToken(tokenHash: string): Promise<any>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  deletePasswordResetTokensForUser(userId: string): Promise<void>;
  resetPasswordAtomically(tokenHash: string, newPasswordHash: string): Promise<{ success: boolean; userId?: string }>;
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

  async bulkCreateVouchers(voucherData: InsertVoucher[]): Promise<Voucher[]> {
    if (voucherData.length === 0) return [];
    return db.insert(vouchers).values(voucherData).returning();
  }

  async getMembershipsByVoucherId(voucherId: string): Promise<TeamMembership[]> {
    return db.select().from(teamMemberships).where(eq(teamMemberships.voucherRedemptionId, voucherId));
  }

  async getVouchersFiltered(orgId: string, filters: { status?: string; bundleId?: string; createdAfter?: string; createdBefore?: string }): Promise<Voucher[]> {
    const conditions = [eq(vouchers.orgId, orgId)];
    if (filters.status && filters.status !== "all") {
      conditions.push(eq(vouchers.status, filters.status as any));
    }
    if (filters.bundleId) {
      conditions.push(eq(vouchers.bundleId, filters.bundleId));
    }
    if (filters.createdAfter) {
      conditions.push(gte(vouchers.createdAt, new Date(filters.createdAfter)));
    }
    if (filters.createdBefore) {
      conditions.push(lte(vouchers.createdAt, new Date(filters.createdBefore)));
    }
    return db.select().from(vouchers).where(and(...conditions)).orderBy(desc(vouchers.createdAt));
  }

  async getVoucherRedemptionsByVoucherId(voucherId: string): Promise<(VoucherRedemption & { user?: User })[]> {
    const redemptions = await db.select().from(voucherRedemptions).where(eq(voucherRedemptions.voucherId, voucherId));
    const results = [];
    for (const r of redemptions) {
      const [user] = await db.select().from(users).where(eq(users.id, r.userId));
      results.push({ ...r, user: user || undefined });
    }
    return results;
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
    await db.delete(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, id));
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

  async updateAllotlyApiKey(id: string, data: Partial<AllotlyApiKey>): Promise<AllotlyApiKey | undefined> {
    const [result] = await db.update(allotlyApiKeys).set({ ...data, updatedAt: new Date() }).where(eq(allotlyApiKeys.id, id)).returning();
    return result;
  }

  async getActiveKeyByUserId(userId: string): Promise<AllotlyApiKey | undefined> {
    const [result] = await db.select().from(allotlyApiKeys)
      .where(and(eq(allotlyApiKeys.userId, userId), eq(allotlyApiKeys.status, "ACTIVE")));
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
    const [orgTeams, orgUsers, orgVouchers, providers, org] = await Promise.all([
      this.getTeamsByOrg(orgId),
      this.getUsersByOrg(orgId),
      this.getVouchersByOrg(orgId),
      this.getProviderConnectionsByOrg(orgId),
      this.getOrganization(orgId),
    ]);

    const totalMembers = orgUsers.filter(u => u.orgRole === "MEMBER").length;
    const activeTeamAdmins = orgUsers.filter(u => u.orgRole === "TEAM_ADMIN" && u.status === "ACTIVE").length;
    const activeVouchers = orgVouchers.filter(v => v.status === "ACTIVE").length;
    const maxTeamAdmins = org?.maxTeamAdmins || 0;

    const teamIds = orgTeams.map(t => t.id);
    let totalSpendCents = 0;
    if (teamIds.length > 0) {
      const spendResult = await db.select({
        total: sql<number>`COALESCE(SUM(${teamMemberships.currentPeriodSpendCents}), 0)`,
      }).from(teamMemberships).where(inArray(teamMemberships.teamId, teamIds));
      totalSpendCents = Number(spendResult[0]?.total || 0);
    }

    return {
      totalSpendCents,
      totalMembers,
      activeTeamAdmins,
      maxTeamAdmins,
      activeVouchers,
      totalTeams: orgTeams.length,
      providerCount: providers.length,
      providers: providers.map(p => ({ provider: p.provider, status: p.status })),
    };
  }

  async getTeamDashboardStats(teamId: string): Promise<any> {
    const memberships = await this.getMembershipsByTeam(teamId);
    const teamMembers = memberships.filter(m => m.accessType === "TEAM");
    const voucherMembers = memberships.filter(m => m.accessType === "VOUCHER");
    const totalSpendCents = memberships.reduce((sum, m) => sum + m.currentPeriodSpendCents, 0);

    return {
      totalSpendCents,
      teamMemberCount: teamMembers.length,
      voucherMemberCount: voucherMembers.length,
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

  async getActiveMembershipsByAccessType(accessType: string): Promise<TeamMembership[]> {
    return db.select().from(teamMemberships).where(
      and(eq(teamMemberships.accessType, accessType as any), eq(teamMemberships.status, "ACTIVE"))
    );
  }

  async getSpendByTeam(orgId: string): Promise<{ teamId: string; teamName: string; spendCents: number }[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    if (orgTeams.length === 0) return [];

    const teamIds = orgTeams.map(t => t.id);
    const spendRows = await db.select({
      teamId: teamMemberships.teamId,
      total: sql<number>`COALESCE(SUM(${teamMemberships.currentPeriodSpendCents}), 0)`,
    }).from(teamMemberships)
      .where(inArray(teamMemberships.teamId, teamIds))
      .groupBy(teamMemberships.teamId);

    const spendMap = new Map(spendRows.map(r => [r.teamId, Number(r.total)]));
    return orgTeams.map(team => ({
      teamId: team.id,
      teamName: team.name,
      spendCents: spendMap.get(team.id) || 0,
    }));
  }

  async getSpendByProvider(orgId: string): Promise<{ provider: string; spendCents: number }[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    if (orgTeams.length === 0) return [];

    const teamIds = orgTeams.map(t => t.id);
    const membershipIds = await db.select({ id: teamMemberships.id })
      .from(teamMemberships)
      .where(inArray(teamMemberships.teamId, teamIds));

    if (membershipIds.length === 0) return [];

    const mIds = membershipIds.map(m => m.id);
    const rows = await db.select({
      provider: proxyRequestLogs.provider,
      total: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
    }).from(proxyRequestLogs)
      .where(inArray(proxyRequestLogs.membershipId, mIds))
      .groupBy(proxyRequestLogs.provider);

    return rows.map(r => ({ provider: r.provider, spendCents: Number(r.total) }));
  }

  async getMemberDetailsForTeam(teamId: string): Promise<any[]> {
    const memberships = await this.getMembershipsByTeam(teamId);
    const result: any[] = [];
    for (const m of memberships) {
      const user = await this.getUser(m.userId);
      const keys = await db.select().from(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, m.id));
      const proxyLogCount = await db.select({ count: count() }).from(proxyRequestLogs).where(eq(proxyRequestLogs.membershipId, m.id));

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
            accessType: m.accessType,
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
    const snapshots = await this.getUsageSnapshotsByMembership(membership.id, 100);
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

    return {
      membership,
      accessType: membership.accessType,
      budgetCents: membership.monthlyBudgetCents,
      spendCents: membership.currentPeriodSpendCents,
      periodStart: membership.periodStart,
      periodEnd: membership.periodEnd,
      status: membership.status,
      teamName: team?.name || "Unknown",
      keyPrefix: activeKey?.keyPrefix || null,
      proxyLogs,
      usageSnapshots: snapshots,
      availableModels,
      voucherInfo,
      voucherExpiresAt: membership.voucherExpiresAt,
      proxyRequestCount: proxyLogs.length,
    };
  }

  async getVoucherById(id: string): Promise<Voucher | undefined> {
    return this.getVoucher(id);
  }

  async createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<any> {
    const [result] = await db.insert(passwordResetTokens).values(data).returning();
    return result;
  }

  async getPasswordResetToken(tokenHash: string): Promise<any> {
    const [result] = await db.select().from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.tokenHash, tokenHash), sql`${passwordResetTokens.usedAt} IS NULL`));
    return result;
  }

  async markPasswordResetTokenUsed(id: string): Promise<void> {
    await db.update(passwordResetTokens).set({ usedAt: new Date() }).where(eq(passwordResetTokens.id, id));
  }

  async deletePasswordResetTokensForUser(userId: string): Promise<void> {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));
  }

  async resetPasswordAtomically(tokenHash: string, newPasswordHash: string): Promise<{ success: boolean; userId?: string }> {
    return await db.transaction(async (tx) => {
      const [token] = await tx.select().from(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          sql`${passwordResetTokens.usedAt} IS NULL`,
          sql`${passwordResetTokens.expiresAt} > NOW()`
        ))
        .for("update");

      if (!token) return { success: false };

      await tx.update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));

      await tx.update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, token.userId));

      await tx.delete(passwordResetTokens)
        .where(and(
          eq(passwordResetTokens.userId, token.userId),
          sql`${passwordResetTokens.id} != ${token.id}`
        ));

      return { success: true, userId: token.userId };
    });
  }
}

export const storage = new DrizzleStorage();
