import {
  type User, type InsertUser, type Organization, type InsertOrganization,
  type Team, type InsertTeam, type TeamMembership, type InsertTeamMembership,
  type ProviderConnection, type InsertProviderConnection, type Voucher, type InsertVoucher,
  type AuditLog, type InsertAuditLog, type ModelPricing,
  type VoucherBundle, type ProxyRequestLog, type UsageSnapshot,
  type AllotlyApiKey, type VoucherRedemption, type BudgetAlert,
  type Project, type InsertProject,
  organizations, users, teams, teamMemberships, providerConnections,
  vouchers, voucherRedemptions, voucherBundles, auditLogs, modelPricing,
  allotlyApiKeys, usageSnapshots, proxyRequestLogs, budgetAlerts,
  passwordResetTokens, projects,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, sql, asc, gte, lte, count, inArray } from "drizzle-orm";

// Lets allocating writes run inside a caller-supplied transaction so a budget
// ceiling check and the write it guards commit atomically. Defaults to `db`.
type DbExecutor =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface IStorage {
  createOrganization(org: InsertOrganization): Promise<Organization>;
  getOrganization(id: string): Promise<Organization | undefined>;
  updateOrganization(id: string, data: Partial<Organization>, executor?: DbExecutor): Promise<Organization | undefined>;

  createUser(user: InsertUser, executor?: DbExecutor): Promise<User>;
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUsersByOrg(orgId: string): Promise<User[]>;
  updateUser(id: string, data: Partial<User>, executor?: DbExecutor): Promise<User | undefined>;

  createTeam(team: InsertTeam): Promise<Team>;
  getTeam(id: string): Promise<Team | undefined>;
  getTeamsByOrg(orgId: string): Promise<Team[]>;
  getTeamByAdmin(adminId: string): Promise<Team | undefined>;
  updateTeam(id: string, data: Partial<Team>, executor?: DbExecutor): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<void>;

  createMembership(membership: InsertTeamMembership, executor?: DbExecutor): Promise<TeamMembership>;
  getMembership(id: string): Promise<TeamMembership | undefined>;
  getMembershipByUser(userId: string): Promise<TeamMembership | undefined>;
  getMembershipsByUser(userId: string): Promise<TeamMembership[]>;
  getMembershipByUserAndTeam(userId: string, teamId: string): Promise<TeamMembership | undefined>;
  getMembershipsByTeam(teamId: string): Promise<TeamMembership[]>;
  updateMembership(id: string, data: Partial<TeamMembership>, executor?: DbExecutor): Promise<TeamMembership | undefined>;

  createProviderConnection(conn: InsertProviderConnection): Promise<ProviderConnection>;
  getProviderConnection(id: string): Promise<ProviderConnection | undefined>;
  getProviderConnectionsByOrg(orgId: string): Promise<ProviderConnection[]>;
  updateProviderConnection(id: string, data: Partial<ProviderConnection>): Promise<ProviderConnection | undefined>;
  deleteProviderConnection(id: string): Promise<void>;

  createVoucher(voucher: InsertVoucher, executor?: DbExecutor): Promise<Voucher>;
  getVoucher(id: string): Promise<Voucher | undefined>;
  getVoucherByCode(code: string): Promise<Voucher | undefined>;
  getVouchersByOrg(orgId: string): Promise<Voucher[]>;
  getVouchersByTeam(teamId: string): Promise<Voucher[]>;
  getVouchersByBundle(bundleId: string): Promise<Voucher[]>;
  getActiveVoucherCountByOrg(orgId: string): Promise<number>;
  getActiveVoucherCountByCreator(createdById: string): Promise<number>;
  updateVoucher(id: string, data: Partial<Voucher>, executor?: DbExecutor): Promise<Voucher | undefined>;
  bulkCreateVouchers(voucherData: InsertVoucher[], executor?: DbExecutor): Promise<Voucher[]>;
  getMembershipsByVoucherId(voucherId: string, executor?: DbExecutor): Promise<TeamMembership[]>;
  getVouchersFiltered(orgId: string, filters: { status?: string; bundleId?: string; createdAfter?: string; createdBefore?: string }): Promise<Voucher[]>;

  createVoucherRedemption(data: { voucherId: string; userId: string }, executor?: DbExecutor): Promise<VoucherRedemption>;
  getVoucherRedemptionsByVoucherId(voucherId: string): Promise<(VoucherRedemption & { user?: User })[]>;

  createVoucherBundle(data: any, executor?: DbExecutor): Promise<VoucherBundle>;
  getVoucherBundle(id: string): Promise<VoucherBundle | undefined>;
  getVoucherBundlesByOrg(orgId: string): Promise<VoucherBundle[]>;
  updateVoucherBundle(id: string, data: Partial<VoucherBundle>): Promise<VoucherBundle | undefined>;

  getMemberCountByTeam(teamId: string): Promise<number>;
  getMemberCountByOrg(orgId: string): Promise<number>;
  deleteMembership(id: string, executor?: DbExecutor): Promise<void>;
  deleteUser(id: string): Promise<void>;

  createAllotlyApiKey(data: { userId: string; membershipId: string; keyHash: string; keyPrefix: string; projectId?: string }): Promise<AllotlyApiKey>;
  getApiKeyByHash(hash: string): Promise<AllotlyApiKey | undefined>;
  updateAllotlyApiKey(id: string, data: Partial<AllotlyApiKey>): Promise<AllotlyApiKey | undefined>;
  getActiveKeyByUserId(userId: string): Promise<AllotlyApiKey | undefined>;
  getActiveKeysByUserId(userId: string): Promise<AllotlyApiKey[]>;
  getActiveKeyCountByMembership(membershipId: string): Promise<number>;

  createProject(data: InsertProject): Promise<Project>;
  getProject(id: string): Promise<Project | undefined>;
  getProjectsByTeam(teamId: string): Promise<Project[]>;
  updateProject(id: string, data: Partial<Project>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
  getActiveKeyCountByProject(projectId: string): Promise<number>;

  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogsByOrg(orgId: string, limit?: number, offset?: number): Promise<AuditLog[]>;
  getFilteredAuditLogs(orgId: string, filters: {
    action?: string; targetType?: string; targetId?: string; actorId?: string;
    startDate?: string; endDate?: string; page?: number; limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }>;

  getModelPricing(): Promise<ModelPricing[]>;
  getModelPricingByProvider(provider: string): Promise<ModelPricing[]>;

  createUsageSnapshot(data: any): Promise<UsageSnapshot>;
  getUsageSnapshotsByMembership(membershipId: string, limit?: number): Promise<UsageSnapshot[]>;

  createProxyRequestLog(data: any): Promise<ProxyRequestLog>;
  settleSpendWithCarry(membershipId: string, costMicroCents: number): Promise<{ crossedCents: number; newSpendCents: number }>;
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
  getMemberDashboardData(userId: string, membershipId?: string): Promise<any>;
  getVoucherById(id: string): Promise<Voucher | undefined>;

  createPasswordResetToken(data: { userId: string; tokenHash: string; expiresAt: Date }): Promise<any>;
  getPasswordResetToken(tokenHash: string): Promise<any>;
  markPasswordResetTokenUsed(id: string): Promise<void>;
  deletePasswordResetTokensForUser(userId: string): Promise<void>;
  resetPasswordAtomically(tokenHash: string, newPasswordHash: string): Promise<{ success: boolean; userId?: string }>;

  getProxyLogsByProvider(orgId: string, provider: string, since: Date): Promise<ProxyRequestLog[]>;
  getAllApiKeysWithOwnerInfo(orgId: string, filters?: { status?: string; teamId?: string; type?: string; search?: string }): Promise<any[]>;
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

  async updateOrganization(id: string, data: Partial<Organization>, executor: DbExecutor = db): Promise<Organization | undefined> {
    const [result] = await executor.update(organizations).set({ ...data, updatedAt: new Date() }).where(eq(organizations.id, id)).returning();
    return result;
  }

  async createUser(user: InsertUser, executor: DbExecutor = db): Promise<User> {
    const [result] = await executor.insert(users).values(user).returning();
    return result;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.id, id));
    return result;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [result] = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim()));
    return result;
  }

  async getUsersByOrg(orgId: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.orgId, orgId));
  }

  async updateUser(id: string, data: Partial<User>, executor: DbExecutor = db): Promise<User | undefined> {
    const [result] = await executor.update(users).set({ ...data, updatedAt: new Date() }).where(eq(users.id, id)).returning();
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

  async updateTeam(id: string, data: Partial<Team>, executor: DbExecutor = db): Promise<Team | undefined> {
    const [result] = await executor.update(teams).set({ ...data, updatedAt: new Date() }).where(eq(teams.id, id)).returning();
    return result;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teamMemberships).where(eq(teamMemberships.teamId, id));
    await db.delete(teams).where(eq(teams.id, id));
  }

  async createMembership(membership: InsertTeamMembership, executor: DbExecutor = db): Promise<TeamMembership> {
    const [result] = await executor.insert(teamMemberships).values(membership).returning();
    return result;
  }

  async getMembership(id: string): Promise<TeamMembership | undefined> {
    const [result] = await db.select().from(teamMemberships).where(eq(teamMemberships.id, id));
    return result;
  }

  // Picks the user's "primary" membership when several exist. Historically
  // team_memberships.user_id was UNIQUE so this was an unordered LIMIT 1; now
  // that a user can belong to more than one team (or accumulate EXPIRED rows
  // alongside a fresh ACTIVE one) we apply the same status-priority +
  // updatedAt ordering as OAuth's getActiveMembershipForUser. Callers that
  // need to see *every* membership should use getMembershipsByUser; callers
  // operating on a specific team should use getMembershipByUserAndTeam.
  async getMembershipByUser(userId: string): Promise<TeamMembership | undefined> {
    const [result] = await db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, userId))
      .orderBy(
        sql`CASE
          WHEN ${teamMemberships.status} = 'ACTIVE' THEN 0
          WHEN ${teamMemberships.status} = 'BUDGET_EXHAUSTED' THEN 1
          WHEN ${teamMemberships.status} = 'SUSPENDED' THEN 2
          ELSE 3
        END`,
        desc(teamMemberships.updatedAt),
      )
      .limit(1);
    return result;
  }

  async getMembershipsByUser(userId: string): Promise<TeamMembership[]> {
    return db
      .select()
      .from(teamMemberships)
      .where(eq(teamMemberships.userId, userId))
      .orderBy(desc(teamMemberships.updatedAt));
  }

  async getMembershipByUserAndTeam(userId: string, teamId: string): Promise<TeamMembership | undefined> {
    const [result] = await db
      .select()
      .from(teamMemberships)
      .where(and(eq(teamMemberships.userId, userId), eq(teamMemberships.teamId, teamId)));
    return result;
  }

  async getMembershipsByTeam(teamId: string): Promise<TeamMembership[]> {
    return db.select().from(teamMemberships).where(eq(teamMemberships.teamId, teamId));
  }

  async updateMembership(id: string, data: Partial<TeamMembership>, executor: DbExecutor = db): Promise<TeamMembership | undefined> {
    const [result] = await executor.update(teamMemberships).set({ ...data, updatedAt: new Date() }).where(eq(teamMemberships.id, id)).returning();
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

  async createVoucher(voucher: InsertVoucher, executor: DbExecutor = db): Promise<Voucher> {
    const [result] = await executor.insert(vouchers).values(voucher).returning();
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

  async updateVoucher(id: string, data: Partial<Voucher>, executor: DbExecutor = db): Promise<Voucher | undefined> {
    const [result] = await executor.update(vouchers).set({ ...data, updatedAt: new Date() }).where(eq(vouchers.id, id)).returning();
    return result;
  }

  async bulkCreateVouchers(voucherData: InsertVoucher[], executor: DbExecutor = db): Promise<Voucher[]> {
    if (voucherData.length === 0) return [];
    return executor.insert(vouchers).values(voucherData).returning();
  }

  async getMembershipsByVoucherId(voucherId: string, executor: DbExecutor = db): Promise<TeamMembership[]> {
    return executor.select().from(teamMemberships).where(eq(teamMemberships.voucherRedemptionId, voucherId));
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

  async createVoucherRedemption(data: { voucherId: string; userId: string }, executor: DbExecutor = db): Promise<VoucherRedemption> {
    const [result] = await executor.insert(voucherRedemptions).values(data).returning();
    return result;
  }

  async createVoucherBundle(data: any, executor: DbExecutor = db): Promise<VoucherBundle> {
    const [result] = await executor.insert(voucherBundles).values(data).returning();
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

  async deleteMembership(id: string, executor: DbExecutor = db): Promise<void> {
    await executor.delete(allotlyApiKeys).where(eq(allotlyApiKeys.membershipId, id));
    await executor.delete(teamMemberships).where(eq(teamMemberships.id, id));
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async createAllotlyApiKey(data: { userId: string; membershipId: string; keyHash: string; keyPrefix: string; projectId?: string }): Promise<AllotlyApiKey> {
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

  async getActiveKeysByUserId(userId: string): Promise<AllotlyApiKey[]> {
    return db.select().from(allotlyApiKeys)
      .where(and(eq(allotlyApiKeys.userId, userId), eq(allotlyApiKeys.status, "ACTIVE")))
      .orderBy(desc(allotlyApiKeys.createdAt));
  }

  async getActiveKeyCountByMembership(membershipId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(allotlyApiKeys)
      .where(and(eq(allotlyApiKeys.membershipId, membershipId), eq(allotlyApiKeys.status, "ACTIVE")));
    return Number(result?.count || 0);
  }

  async createProject(data: InsertProject): Promise<Project> {
    const [result] = await db.insert(projects).values(data).returning();
    return result;
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [result] = await db.select().from(projects).where(eq(projects.id, id));
    return result;
  }

  async getProjectsByTeam(teamId: string): Promise<Project[]> {
    return db.select().from(projects).where(eq(projects.teamId, teamId)).orderBy(asc(projects.name));
  }

  async updateProject(id: string, data: Partial<Project>): Promise<Project | undefined> {
    const [result] = await db.update(projects).set(data).where(eq(projects.id, id)).returning();
    return result;
  }

  async deleteProject(id: string): Promise<void> {
    await db.update(allotlyApiKeys).set({ projectId: null }).where(eq(allotlyApiKeys.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getActiveKeyCountByProject(projectId: string): Promise<number> {
    const [result] = await db.select({ count: count() }).from(allotlyApiKeys)
      .where(and(eq(allotlyApiKeys.projectId, projectId), eq(allotlyApiKeys.status, "ACTIVE")));
    return Number(result?.count || 0);
  }

  async createAuditLog(log: InsertAuditLog): Promise<AuditLog> {
    const [result] = await db.insert(auditLogs).values(log).returning();
    return result;
  }

  async getAuditLogsByOrg(orgId: string, limit = 50, offset = 0): Promise<AuditLog[]> {
    return db.select().from(auditLogs).where(eq(auditLogs.orgId, orgId)).orderBy(desc(auditLogs.createdAt)).limit(limit).offset(offset);
  }

  async getFilteredAuditLogs(orgId: string, filters: {
    action?: string; targetType?: string; targetId?: string; actorId?: string;
    startDate?: string; endDate?: string; page?: number; limit?: number;
  }): Promise<{ logs: AuditLog[]; total: number }> {
    const conditions = [eq(auditLogs.orgId, orgId)];
    if (filters.action) conditions.push(eq(auditLogs.action, filters.action));
    if (filters.targetType) conditions.push(eq(auditLogs.targetType, filters.targetType));
    if (filters.targetId) conditions.push(eq(auditLogs.targetId, filters.targetId));
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

  /**
   * Sub-cent carry settlement (Bug 1). Accumulates the TRUE per-request cost
   * (in integer micro-cents) into team_memberships.cost_remainder_micro_cents
   * and debits the WHOLE cents that cross 1c to current_period_spend_cents — in
   * a SINGLE atomic statement.
   *
   * Why one CTE with FOR UPDATE rather than a JS read-modify-write: this is the
   * sole writer of current_period_spend_cents on settle, and concurrent proxy
   * requests for one membership (MCP retries, parallel calls) would otherwise
   * lose updates. The row lock in `prev` serialises concurrent settlements, so
   * no carry is ever dropped.
   *
   * `crossed_cents` is derived from the OLD remainder via the CTE — a plain
   * UPDATE ... RETURNING only sees post-update values. The arithmetic runs in
   * bigint (overflow-safe even for a single >$21 request); only the <1_000_000
   * remainder is ever stored. The returned `crossedCents` is what the caller
   * feeds to adjustBudgetAfterResponse so the Redis real-time cap decrements by
   * true accumulated whole-cents (not Math.round(cost), which would let sub-cent
   * spend never trip the cap).
   */
  async settleSpendWithCarry(membershipId: string, costMicroCents: number): Promise<{ crossedCents: number; newSpendCents: number }> {
    // Defensive: settlement must never DECREASE spend. Costs are always >= 0
    // (Math.round of a non-negative weighted token sum), but a negative input
    // would make Postgres' truncating `/` and sign-following `%` corrupt the
    // remainder invariant (0 <= rem < 1_000_000). Clamp to a safe integer.
    const micro = Number.isFinite(costMicroCents) ? Math.max(0, Math.round(costMicroCents)) : 0;
    const result: any = await db.execute(sql`
      WITH prev AS (
        SELECT cost_remainder_micro_cents AS old_rem
        FROM team_memberships WHERE id = ${membershipId} FOR UPDATE
      ), upd AS (
        UPDATE team_memberships m
        SET cost_remainder_micro_cents = (prev.old_rem + ${micro}::bigint) % 1000000,
            current_period_spend_cents = m.current_period_spend_cents
              + (prev.old_rem + ${micro}::bigint) / 1000000,
            updated_at = NOW()
        FROM prev WHERE m.id = ${membershipId}
        RETURNING m.current_period_spend_cents AS new_spend
      )
      SELECT ((prev.old_rem + ${micro}::bigint) / 1000000)::bigint AS crossed_cents,
             upd.new_spend
      FROM prev, upd
    `);
    const row = (result.rows ?? result)[0];
    return {
      crossedCents: Number(row?.crossed_cents ?? 0),
      newSpendCents: Number(row?.new_spend ?? 0),
    };
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
      total: sql<number>`COALESCE(FLOOR(SUM(CASE WHEN ${proxyRequestLogs.costMicroCents} = 0 AND ${proxyRequestLogs.costCents} > 0 THEN ${proxyRequestLogs.costCents} * 1000000 ELSE ${proxyRequestLogs.costMicroCents} END) / 1000000), 0)`,
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

  async getMemberDashboardData(userId: string, membershipId?: string): Promise<any> {
    let membership: TeamMembership | undefined;
    if (membershipId) {
      membership = await this.getMembership(membershipId);
      // Reject memberships that don't belong to this user — caller passes the
      // requested id straight from the query string, so we MUST verify the
      // ownership here rather than trust the route layer.
      if (!membership || membership.userId !== userId) return null;
    } else {
      membership = await this.getMembershipByUser(userId);
    }
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

    const activeKeys = keys.filter(k => k.status === "ACTIVE");
    const teamProjects = await this.getProjectsByTeam(membership.teamId);
    const projectMap = new Map(teamProjects.map(p => [p.id, p.name]));
    const keysWithProjects = activeKeys.map(k => ({
      id: k.id,
      keyPrefix: k.keyPrefix,
      projectId: k.projectId,
      projectName: k.projectId ? (projectMap.get(k.projectId) || null) : null,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));

    const allKeys = keys;
    const keyProjectMap = new Map<string, string | null>();
    for (const k of allKeys) {
      keyProjectMap.set(k.id, k.projectId ? (projectMap.get(k.projectId) || null) : null);
    }
    const enrichedLogs = proxyLogs.map(log => ({
      ...log,
      projectName: log.apiKeyId ? (keyProjectMap.get(log.apiKeyId) || null) : null,
    }));

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
      activeKeys: keysWithProjects,
      projects: teamProjects,
      proxyLogs: enrichedLogs,
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

  async getProxyLogsByProvider(orgId: string, provider: string, since: Date): Promise<ProxyRequestLog[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    if (orgTeams.length === 0) return [];
    const teamIds = orgTeams.map(t => t.id);
    const memberships = await db.select({ id: teamMemberships.id })
      .from(teamMemberships)
      .where(inArray(teamMemberships.teamId, teamIds));
    if (memberships.length === 0) return [];
    const membershipIds = memberships.map(m => m.id);
    return db.select().from(proxyRequestLogs)
      .where(and(
        inArray(proxyRequestLogs.membershipId, membershipIds),
        eq(proxyRequestLogs.provider, provider as any),
        gte(proxyRequestLogs.createdAt, since)
      ))
      .orderBy(desc(proxyRequestLogs.createdAt));
  }

  async getAllApiKeysWithOwnerInfo(orgId: string, filters?: { status?: string; teamId?: string; type?: string; search?: string }): Promise<any[]> {
    const orgTeams = await this.getTeamsByOrg(orgId);
    if (orgTeams.length === 0) return [];
    const teamMap = new Map(orgTeams.map(t => [t.id, t.name]));
    let targetTeams = orgTeams;
    if (filters?.teamId) {
      targetTeams = orgTeams.filter(t => t.id === filters.teamId);
      if (targetTeams.length === 0) return [];
    }
    const teamIds = targetTeams.map(t => t.id);
    const memberships = await db.select().from(teamMemberships)
      .where(inArray(teamMemberships.teamId, teamIds));
    if (memberships.length === 0) return [];

    const results: any[] = [];
    for (const m of memberships) {
      if (filters?.type === "team" && m.accessType !== "TEAM") continue;
      if (filters?.type === "voucher" && m.accessType !== "VOUCHER") continue;

      const keys = await this.getApiKeysByMembership(m.id);
      const user = await this.getUser(m.userId);

      for (const key of keys) {
        if (filters?.status && filters.status !== "all") {
          if (filters.status.toUpperCase() !== key.status) continue;
        }

        const ownerName = user?.name || "anonymous";
        const ownerEmail = user?.email || "anonymous";
        if (filters?.search) {
          const s = filters.search.toLowerCase();
          if (!ownerName.toLowerCase().startsWith(s) && !ownerEmail.toLowerCase().startsWith(s)) continue;
        }

        let projectName: string | null = null;
        if (key.projectId) {
          const project = await this.getProject(key.projectId);
          projectName = project?.name || null;
        }

        results.push({
          id: key.id,
          keyPrefix: key.keyPrefix,
          ownerName,
          ownerEmail,
          ownerType: m.accessType === "VOUCHER" ? "voucher" : "team",
          teamName: teamMap.get(m.teamId) || "Unknown",
          teamId: m.teamId,
          createdAt: key.createdAt,
          lastUsed: key.lastUsedAt,
          status: key.status,
          membershipId: m.id,
          projectId: key.projectId,
          projectName,
          allowedProviders: m.allowedProviders,
        });
      }
    }
    return results;
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
