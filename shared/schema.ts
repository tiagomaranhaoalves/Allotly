import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  boolean,
  timestamp,
  json,
  pgEnum,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

export const planEnum = pgEnum("plan", ["FREE", "TEAM", "ENTERPRISE"]);
export const orgRoleEnum = pgEnum("org_role", ["ROOT_ADMIN", "TEAM_ADMIN", "MEMBER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "INVITED", "EXPIRED"]);
export const accessModeEnum = pgEnum("access_mode", ["DIRECT", "PROXY"]);
export const membershipStatusEnum = pgEnum("membership_status", ["ACTIVE", "SUSPENDED", "BUDGET_EXHAUSTED", "EXPIRED"]);
export const providerEnum = pgEnum("provider", ["OPENAI", "ANTHROPIC", "GOOGLE"]);
export const automationLevelEnum = pgEnum("automation_level", ["FULL_AUTO", "SEMI_AUTO", "GUIDED"]);
export const providerStatusEnum = pgEnum("provider_status", ["ACTIVE", "INVALID", "DISCONNECTED"]);
export const setupStatusEnum = pgEnum("setup_status", ["PENDING", "PROVISIONING", "AWAITING_MEMBER", "COMPLETE", "FAILED"]);
export const linkStatusEnum = pgEnum("link_status", ["ACTIVE", "REVOKED", "EXPIRED"]);
export const allotlyKeyStatusEnum = pgEnum("allotly_key_status", ["ACTIVE", "REVOKED", "EXPIRED"]);
export const usageSourceEnum = pgEnum("usage_source", ["POLL", "PROXY"]);
export const voucherStatusEnum = pgEnum("voucher_status", ["ACTIVE", "EXPIRED", "FULLY_REDEEMED", "REVOKED"]);
export const bundleStatusEnum = pgEnum("bundle_status", ["ACTIVE", "EXHAUSTED", "EXPIRED"]);

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  plan: planEnum("plan").default("FREE").notNull(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubId: text("stripe_subscription_id"),
  maxTeamAdmins: integer("max_team_admins").default(0).notNull(),
  orgBudgetCeilingCents: integer("org_budget_ceiling_cents"),
  defaultMemberBudgetCents: integer("default_member_budget_cents"),
  lastPolledAt: timestamp("last_polled_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  name: text("name"),
  passwordHash: text("password_hash"),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  orgRole: orgRoleEnum("org_role").notNull(),
  status: userStatusEnum("status").default("ACTIVE").notNull(),
  isVoucherUser: boolean("is_voucher_user").default(false).notNull(),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("users_org_id_idx").on(table.orgId),
]);

export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  adminId: varchar("admin_id").notNull().unique().references(() => users.id),
  monthlyBudgetCeilingCents: integer("monthly_budget_ceiling_cents"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("teams_org_id_idx").on(table.orgId),
]);

export const teamMemberships = pgTable("team_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  accessMode: accessModeEnum("access_mode").notNull(),
  monthlyBudgetCents: integer("monthly_budget_cents").notNull(),
  allowedModels: json("allowed_models"),
  allowedProviders: json("allowed_providers"),
  currentPeriodSpendCents: integer("current_period_spend_cents").default(0).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: membershipStatusEnum("status").default("ACTIVE").notNull(),
  voucherRedemptionId: varchar("voucher_redemption_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("memberships_team_id_idx").on(table.teamId),
]);

export const providerConnections = pgTable("provider_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  provider: providerEnum("provider").notNull(),
  displayName: text("display_name"),
  adminApiKeyEncrypted: bytea("admin_api_key_encrypted").notNull(),
  adminApiKeyIv: bytea("admin_api_key_iv").notNull(),
  adminApiKeyTag: bytea("admin_api_key_tag").notNull(),
  automationLevel: automationLevelEnum("automation_level").notNull(),
  status: providerStatusEnum("status").default("ACTIVE").notNull(),
  lastValidatedAt: timestamp("last_validated_at"),
  orgAllowedModels: json("org_allowed_models"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("provider_connections_org_provider_idx").on(table.orgId, table.provider),
]);

export const providerMemberLinks = pgTable("provider_member_links", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  providerConnectionId: varchar("provider_connection_id").notNull().references(() => providerConnections.id),
  providerProjectId: text("provider_project_id"),
  providerWorkspaceId: text("provider_workspace_id"),
  providerApiKeyId: text("provider_api_key_id"),
  providerSvcAcctId: text("provider_svc_acct_id"),
  providerBudgetCents: integer("provider_budget_cents"),
  setupStatus: setupStatusEnum("setup_status").default("PENDING").notNull(),
  setupInstructions: text("setup_instructions"),
  keyDeliveredAt: timestamp("key_delivered_at"),
  status: linkStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("provider_member_links_unique_idx").on(table.membershipId, table.providerConnectionId),
  index("provider_member_links_connection_idx").on(table.providerConnectionId),
]);

export const allotlyApiKeys = pgTable("allotly_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  membershipId: varchar("membership_id").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  keyPrefix: text("key_prefix").notNull(),
  status: allotlyKeyStatusEnum("status").default("ACTIVE").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("allotly_api_keys_hash_idx").on(table.keyHash),
]);

export const usageSnapshots = pgTable("usage_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  providerMemberLinkId: varchar("provider_member_link_id"),
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  snapshotAt: timestamp("snapshot_at").notNull(),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  totalCostCents: integer("total_cost_cents").default(0).notNull(),
  periodCostCents: integer("period_cost_cents").default(0).notNull(),
  model: text("model"),
  source: usageSourceEnum("source").default("POLL").notNull(),
  rawData: json("raw_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("usage_snapshots_link_idx").on(table.providerMemberLinkId, table.snapshotAt),
  index("usage_snapshots_membership_idx").on(table.membershipId, table.snapshotAt),
]);

export const budgetAlerts = pgTable("budget_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  thresholdPercent: integer("threshold_percent").notNull(),
  triggeredAt: timestamp("triggered_at").notNull(),
  notified: boolean("notified").default(false).notNull(),
  actionTaken: text("action_taken"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("budget_alerts_unique_idx").on(table.membershipId, table.thresholdPercent),
]);

export const proxyRequestLogs = pgTable("proxy_request_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  provider: providerEnum("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costCents: integer("cost_cents").notNull(),
  durationMs: integer("duration_ms").notNull(),
  statusCode: integer("status_code").notNull(),
  maxTokensApplied: integer("max_tokens_applied"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("proxy_request_logs_idx").on(table.membershipId, table.createdAt),
]);

export const vouchers = pgTable("vouchers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  createdById: varchar("created_by_id").notNull().references(() => users.id),
  bundleId: varchar("bundle_id"),
  label: text("label"),
  budgetCents: integer("budget_cents").notNull(),
  allowedProviders: json("allowed_providers").notNull(),
  allowedModels: json("allowed_models"),
  expiresAt: timestamp("expires_at").notNull(),
  maxRedemptions: integer("max_redemptions").default(1).notNull(),
  currentRedemptions: integer("current_redemptions").default(0).notNull(),
  status: voucherStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("vouchers_code_idx").on(table.code),
  index("vouchers_org_id_idx").on(table.orgId),
  index("vouchers_bundle_id_idx").on(table.bundleId),
]);

export const voucherRedemptions = pgTable("voucher_redemptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  voucherId: varchar("voucher_id").notNull().references(() => vouchers.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  redeemedAt: timestamp("redeemed_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("voucher_redemptions_unique_idx").on(table.voucherId, table.userId),
]);

export const voucherBundles = pgTable("voucher_bundles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  purchasedById: varchar("purchased_by_id").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  totalRedemptions: integer("total_redemptions").notNull(),
  usedRedemptions: integer("used_redemptions").default(0).notNull(),
  totalProxyRequests: integer("total_proxy_requests").notNull(),
  usedProxyRequests: integer("used_proxy_requests").default(0).notNull(),
  maxBudgetPerVoucherCents: integer("max_budget_per_voucher_cents").notNull(),
  maxBudgetPerRecipientCents: integer("max_budget_per_recipient_cents").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  status: bundleStatusEnum("status").default("ACTIVE").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("voucher_bundles_org_id_idx").on(table.orgId),
]);

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  actorId: varchar("actor_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  targetType: text("target_type"),
  targetId: text("target_id"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("audit_logs_org_created_idx").on(table.orgId, table.createdAt),
]);

export const modelPricing = pgTable("model_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: providerEnum("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  inputPricePerMTok: integer("input_price_per_m_tok").notNull(),
  outputPricePerMTok: integer("output_price_per_m_tok").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("model_pricing_unique_idx").on(table.provider, table.modelId),
]);

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamMembershipSchema = createInsertSchema(teamMemberships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProviderConnectionSchema = createInsertSchema(providerConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProviderMemberLinkSchema = createInsertSchema(providerMemberLinks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVoucherSchema = createInsertSchema(vouchers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertModelPricingSchema = createInsertSchema(modelPricing).omit({ id: true, updatedAt: true });

export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;
export type TeamMembership = typeof teamMemberships.$inferSelect;
export type InsertTeamMembership = z.infer<typeof insertTeamMembershipSchema>;
export type ProviderConnection = typeof providerConnections.$inferSelect;
export type InsertProviderConnection = z.infer<typeof insertProviderConnectionSchema>;
export type Voucher = typeof vouchers.$inferSelect;
export type InsertVoucher = z.infer<typeof insertVoucherSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type ModelPricing = typeof modelPricing.$inferSelect;
export type VoucherBundle = typeof voucherBundles.$inferSelect;
export type ProxyRequestLog = typeof proxyRequestLogs.$inferSelect;
export type UsageSnapshot = typeof usageSnapshots.$inferSelect;
export type BudgetAlert = typeof budgetAlerts.$inferSelect;
export type ProviderMemberLink = typeof providerMemberLinks.$inferSelect;
export type InsertProviderMemberLink = z.infer<typeof insertProviderMemberLinkSchema>;
export type AllotlyApiKey = typeof allotlyApiKeys.$inferSelect;
export type VoucherRedemption = typeof voucherRedemptions.$inferSelect;

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  orgName: z.string().min(1),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
