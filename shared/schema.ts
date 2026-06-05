import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  json,
  jsonb,
  numeric,
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

export const session = pgTable("session", {
  sid: varchar("sid").primaryKey(),
  sess: json("sess").notNull(),
  expire: timestamp("expire").notNull(),
}, (table) => [
  index("IDX_session_expire").on(table.expire),
]);

export const planEnum = pgEnum("plan", ["FREE", "TEAM", "ENTERPRISE"]);
export const orgRoleEnum = pgEnum("org_role", ["ROOT_ADMIN", "TEAM_ADMIN", "MEMBER"]);
export const userStatusEnum = pgEnum("user_status", ["ACTIVE", "SUSPENDED", "INVITED", "EXPIRED"]);
export const accessTypeEnum = pgEnum("access_type", ["TEAM", "VOUCHER"]);
export const membershipStatusEnum = pgEnum("membership_status", ["ACTIVE", "SUSPENDED", "BUDGET_EXHAUSTED", "EXPIRED"]);
export const providerEnum = pgEnum("provider", ["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"]);
export const azureEndpointModeEnum = pgEnum("azure_endpoint_mode", ["v1", "legacy"]);
export const providerStatusEnum = pgEnum("provider_status", ["ACTIVE", "INVALID", "DISCONNECTED"]);
export const allotlyKeyStatusEnum = pgEnum("allotly_key_status", ["ACTIVE", "REVOKED", "EXPIRED"]);
export const voucherStatusEnum = pgEnum("voucher_status", ["ACTIVE", "EXPIRED", "FULLY_REDEEMED", "REVOKED"]);
export const bundleStatusEnum = pgEnum("bundle_status", ["ACTIVE", "EXHAUSTED", "EXPIRED"]);
export const currencyEnum = pgEnum("currency", ["USD", "GBP", "EUR", "BRL"]);

export const organizations = pgTable("organizations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  billingEmail: text("billing_email"),
  description: text("description"),
  plan: planEnum("plan").default("FREE").notNull(),
  stripeCustomerId: text("stripe_customer_id").unique(),
  stripeSubId: text("stripe_subscription_id"),
  maxTeamAdmins: integer("max_team_admins").default(0).notNull(),
  // MONEY UNIT: all *Cents columns store whole integer USD CENTS. Columns are
  // bigint(mode:"number") for headroom, but values are plain cents end-to-end
  // (storage, compute, wire, display) with no sub-cent scaling.
  orgBudgetCeilingCents: bigint("org_budget_ceiling_cents", { mode: "number" }),
  defaultMemberBudgetCents: bigint("default_member_budget_cents", { mode: "number" }),
  currency: currencyEnum("currency").default("USD").notNull(),
  settings: jsonb("settings"),
  graceEndsAt: timestamp("grace_ends_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const fxRates = pgTable("fx_rates", {
  currency: currencyEnum("currency").primaryKey(),
  rateFromUsd: numeric("rate_from_usd", { precision: 20, scale: 10 }).notNull(),
  source: text("source").notNull(),
  asOf: timestamp("as_of").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFxRateSchema = createInsertSchema(fxRates).omit({ updatedAt: true });
export type InsertFxRate = z.infer<typeof insertFxRateSchema>;
export type FxRate = typeof fxRates.$inferSelect;

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
  description: text("description"),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  adminId: varchar("admin_id").notNull().unique().references(() => users.id),
  monthlyBudgetCeilingCents: bigint("monthly_budget_ceiling_cents", { mode: "number" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("teams_org_id_idx").on(table.orgId),
]);

export const teamMemberships = pgTable("team_memberships", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  accessType: accessTypeEnum("access_type").notNull(),
  monthlyBudgetCents: bigint("monthly_budget_cents", { mode: "number" }).notNull(),
  allowedModels: json("allowed_models"),
  allowedProviders: json("allowed_providers"),
  currentPeriodSpendCents: bigint("current_period_spend_cents", { mode: "number" }).default(0).notNull(),
  // Hidden sub-cent carry accumulator (Bug 1). Settlement rounds true cost to
  // whole cents; any sub-cent request would otherwise debit 0 and the spend
  // would silently under-count. We accumulate the TRUE cost in micro-cents here
  // and debit whole cents to current_period_spend_cents only when the carry
  // crosses 1c. Always < 1_000_000 (one whole cent); written ONLY by
  // storage.settleSpendWithCarry and zeroed on period reset. Never displayed.
  costRemainderMicroCents: bigint("cost_remainder_micro_cents", { mode: "number" }).default(0).notNull(),
  periodStart: timestamp("period_start").notNull(),
  periodEnd: timestamp("period_end").notNull(),
  status: membershipStatusEnum("status").default("ACTIVE").notNull(),
  voucherRedemptionId: varchar("voucher_redemption_id"),
  voucherExpiresAt: timestamp("voucher_expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("memberships_team_id_idx").on(table.teamId),
  // Was the index backing the prior UNIQUE(user_id) constraint. The unique
  // restriction blocked a single user from being on more than one team and
  // also prevented an EXPIRED row from coexisting with a freshly issued
  // ACTIVE one. The index itself is still essential — getMembershipByUser
  // / getActiveMembershipForUser / cascade-delete-member all probe by
  // user_id — so we keep a non-unique index in its place.
  index("memberships_user_id_idx").on(table.userId),
  // Per-team uniqueness still holds: a user may belong to many teams but
  // only once per team. The invite handler also enforces this at the app
  // level, but a DB constraint closes the concurrent-invite race window.
  uniqueIndex("memberships_team_user_unique_idx").on(table.teamId, table.userId),
]);

export const providerConnections = pgTable("provider_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").notNull().references(() => organizations.id),
  provider: providerEnum("provider").notNull(),
  displayName: text("display_name"),
  adminApiKeyEncrypted: bytea("admin_api_key_encrypted").notNull(),
  adminApiKeyIv: bytea("admin_api_key_iv").notNull(),
  adminApiKeyTag: bytea("admin_api_key_tag").notNull(),
  status: providerStatusEnum("status").default("ACTIVE").notNull(),
  lastValidatedAt: timestamp("last_validated_at"),
  orgAllowedModels: json("org_allowed_models"),
  azureBaseUrl: text("azure_base_url"),
  azureApiVersion: text("azure_api_version"),
  azureEndpointMode: azureEndpointModeEnum("azure_endpoint_mode"),
  azureDeployments: json("azure_deployments"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("provider_connections_org_provider_idx").on(table.orgId, table.provider),
]);

export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id),
  name: text("name").notNull(),
  description: text("description"),
  createdById: varchar("created_by_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("projects_team_idx").on(table.teamId),
]);

export const allotlyApiKeys = pgTable("allotly_api_keys", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  membershipId: varchar("membership_id").notNull(),
  projectId: varchar("project_id").references(() => projects.id),
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
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  snapshotAt: timestamp("snapshot_at").notNull(),
  inputTokens: integer("input_tokens").default(0).notNull(),
  outputTokens: integer("output_tokens").default(0).notNull(),
  totalCostCents: bigint("total_cost_cents", { mode: "number" }).default(0).notNull(),
  periodCostCents: bigint("period_cost_cents", { mode: "number" }).default(0).notNull(),
  model: text("model"),
  rawData: json("raw_data"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
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
  /**
   * Nullable. NON-NULL for "key" and "voucher" bearer requests; NULL for
   * OAuth-bearer requests where attribution lives on oauthClientId instead.
   */
  apiKeyId: varchar("api_key_id").references(() => allotlyApiKeys.id),
  /**
   * NON-NULL exactly when the request was authenticated with an OAuth
   * access token; NULL otherwise. Carries the DCR client_id so audit
   * queries can attribute usage to the calling OAuth client without
   * borrowing an arbitrary API key from the membership.
   */
  oauthClientId: varchar("oauth_client_id"),
  provider: providerEnum("provider").notNull(),
  model: text("model").notNull(),
  inputTokens: integer("input_tokens").notNull(),
  outputTokens: integer("output_tokens").notNull(),
  costCents: bigint("cost_cents", { mode: "number" }).notNull(),
  // True per-request cost in micro-cents (Bug 1). cost_cents stays the rounded
  // whole-cent value for single-row display; aggregate spend queries SUM this
  // micro-cent column instead so sub-cent requests don't round to 0 and make
  // the breakdowns under-report. DEFAULT 0; COALESCE covers pre-existing rows.
  costMicroCents: bigint("cost_micro_cents", { mode: "number" }).default(0).notNull(),
  durationMs: integer("duration_ms").notNull(),
  statusCode: integer("status_code").notNull(),
  maxTokensApplied: integer("max_tokens_applied"),
  deploymentName: text("deployment_name"),
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
  budgetCents: bigint("budget_cents", { mode: "number" }).notNull(),
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
  maxBudgetPerVoucherCents: bigint("max_budget_per_voucher_cents", { mode: "number" }).notNull(),
  maxBudgetPerRecipientCents: bigint("max_budget_per_recipient_cents", { mode: "number" }).notNull(),
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

export const platformAuditLogs = pgTable("platform_audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: json("metadata"),
  performedBy: text("performed_by").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const modelPricing = pgTable("model_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: providerEnum("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  inputPricePerMTok: integer("input_price_per_m_tok").notNull(),
  outputPricePerMTok: integer("output_price_per_m_tok").notNull(),
  // M4: nullable per-model max output token cap. When populated, the
  // streaming reservation falls back to this value instead of the
  // hardcoded 4096 used by the buffered handler. Existing rows default
  // to NULL, preserving prior behaviour.
  maxOutputTokens: integer("max_output_tokens"),
  isActive: boolean("is_active").default(true).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("model_pricing_unique_idx").on(table.provider, table.modelId),
]);

export const mcpAuditLog = pgTable("mcp_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  membershipId: varchar("membership_id").references(() => teamMemberships.id, { onDelete: "set null" }),
  toolName: text("tool_name").notNull(),
  inputHash: text("input_hash").notNull(),
  ok: boolean("ok").notNull(),
  errorCode: integer("error_code"),
  latencyMs: integer("latency_ms").notNull(),
  clientId: text("client_id"),
  audience: text("audience"),
  streamed: boolean("streamed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("mcp_audit_log_membership_idx").on(table.membershipId, table.createdAt),
  index("mcp_audit_log_tool_idx").on(table.toolName, table.createdAt),
]);

export const oauthClients = pgTable("oauth_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientName: text("client_name").notNull(),
  redirectUris: jsonb("redirect_uris").notNull(),
  clientSecretHash: text("client_secret_hash"),
  registrationAccessTokenHash: text("registration_access_token_hash").notNull(),
  scopesAllowed: jsonb("scopes_allowed").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export const oauthAuthorizationCodes = pgTable("oauth_authorization_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: varchar("client_id").notNull().references(() => oauthClients.id),
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  resource: text("resource"),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
});

export const oauthTokens = pgTable("oauth_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => oauthClients.id),
  membershipId: varchar("membership_id").notNull().references(() => teamMemberships.id),
  accessTokenJti: text("access_token_jti").notNull().unique(),
  refreshTokenHash: text("refresh_token_hash").unique(),
  // sha256 hex of the authorization code that produced this token (nullable for tokens
  // minted via refresh). Used to revoke the whole token chain on RFC 6749 §4.1.2 code reuse.
  authorizationCodeHash: text("authorization_code_hash"),
  scope: text("scope").notNull(),
  resource: text("resource"),
  issuedAt: timestamp("issued_at").defaultNow().notNull(),
  accessExpiresAt: timestamp("access_expires_at").notNull(),
  refreshExpiresAt: timestamp("refresh_expires_at"),
  revokedAt: timestamp("revoked_at"),
}, (t) => [
  index("oauth_tokens_membership_idx").on(t.membershipId),
  index("oauth_tokens_auth_code_idx").on(t.authorizationCodeHash),
]);

export const mcpIdempotency = pgTable("mcp_idempotency", {
  scope: text("scope").notNull(),
  key: text("key").notNull(),
  principalId: text("principal_id").notNull(),
  responseJson: jsonb("response_json").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("mcp_idempotency_pk").on(table.scope, table.key, table.principalId),
]);

export const voucherTopupRequests = pgTable("voucher_topup_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  voucherId: varchar("voucher_id").notNull().references(() => vouchers.id),
  membershipId: varchar("membership_id"),
  requestedByPrincipalHash: text("requested_by_principal_hash").notNull(),
  amountCentsRequested: bigint("amount_cents_requested", { mode: "number" }),
  reason: text("reason"),
  status: text("status").default("pending").notNull(),
  notificationSent: boolean("notification_sent").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
}, (table) => [
  index("voucher_topup_requests_voucher_idx").on(table.voucherId, table.createdAt),
]);

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("password_reset_tokens_user_idx").on(table.userId),
]);

export const insertOrganizationSchema = createInsertSchema(organizations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamSchema = createInsertSchema(teams).omit({ id: true, createdAt: true, updatedAt: true });
export const insertTeamMembershipSchema = createInsertSchema(teamMemberships).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProviderConnectionSchema = createInsertSchema(providerConnections).omit({ id: true, createdAt: true, updatedAt: true });
export const insertVoucherSchema = createInsertSchema(vouchers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertModelPricingSchema = createInsertSchema(modelPricing).omit({ id: true, updatedAt: true });
export const insertProjectSchema = createInsertSchema(projects).omit({ id: true, createdAt: true });

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
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type ProxyRequestLog = typeof proxyRequestLogs.$inferSelect;
export type UsageSnapshot = typeof usageSnapshots.$inferSelect;
export type BudgetAlert = typeof budgetAlerts.$inferSelect;
export type AllotlyApiKey = typeof allotlyApiKeys.$inferSelect;
export type VoucherRedemption = typeof voucherRedemptions.$inferSelect;
export type PlatformAuditLog = typeof platformAuditLogs.$inferSelect;
export type McpAuditLog = typeof mcpAuditLog.$inferSelect;
export type McpIdempotency = typeof mcpIdempotency.$inferSelect;
export type VoucherTopupRequest = typeof voucherTopupRequests.$inferSelect;
export type OauthClient = typeof oauthClients.$inferSelect;
export type OauthAuthorizationCode = typeof oauthAuthorizationCodes.$inferSelect;
export type OauthToken = typeof oauthTokens.$inferSelect;

export interface AzureDeploymentMapping {
  deploymentName: string;
  modelId: string;
  inputPricePerMTok: number;
  outputPricePerMTok: number;
}

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
