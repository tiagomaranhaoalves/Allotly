import {
  type User, type InsertUser, type Organization, type InsertOrganization,
  type Team, type InsertTeam, type TeamMembership, type InsertTeamMembership,
  type ProviderConnection, type InsertProviderConnection, type Voucher, type InsertVoucher,
  type AuditLog, type InsertAuditLog, type ModelPricing,
  type VoucherBundle, type ProxyRequestLog, type UsageSnapshot,
  type AllotlyApiKey, type VoucherRedemption,
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

  getModelPricing(): Promise<ModelPricing[]>;
  getModelPricingByProvider(provider: string): Promise<ModelPricing[]>;

  createUsageSnapshot(data: any): Promise<UsageSnapshot>;
  getUsageSnapshotsByMembership(membershipId: string, limit?: number): Promise<UsageSnapshot[]>;

  createProxyRequestLog(data: any): Promise<ProxyRequestLog>;
  getProxyRequestLogsByMembership(membershipId: string, limit?: number): Promise<ProxyRequestLog[]>;

  getDashboardStats(orgId: string): Promise<any>;
  getTeamDashboardStats(teamId: string): Promise<any>;
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
}

export const storage = new DrizzleStorage();
