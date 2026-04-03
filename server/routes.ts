import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole, requireAdmin } from "./auth";
import { hashPassword, comparePasswords } from "./lib/password";
import { signupSchema, loginSchema, voucherBundles, users as usersTable, allotlyApiKeys as allotlyApiKeysTable, teams, teamMemberships, proxyRequestLogs, usageSnapshots, budgetAlerts, vouchers, voucherRedemptions, providerConnections, auditLogs, platformAuditLogs, passwordResetTokens } from "@shared/schema";
import { eq, and, sql, inArray, desc, gte, lte, like, count } from "drizzle-orm";
import { db } from "./db";
import { encryptProviderKey, decryptProviderKey } from "./lib/encryption";
import { generateVoucherCode } from "./lib/voucher-codes";
import { generateAllotlyKey, hashKey } from "./lib/keys";
import { getProviderAdapter } from "./lib/providers";
import { stripeService } from "./stripeService";
import { getUncachableStripeClient, getStripePublishableKey } from "./stripeClient";
import { runBudgetReset } from "./lib/jobs/budget-reset";
import { runVoucherExpiry } from "./lib/jobs/voucher-expiry";
import { runBundleExpiry } from "./lib/jobs/bundle-expiry";
import { runRedisReconciliation } from "./lib/jobs/redis-reconciliation";
import { runModelSync } from "./lib/jobs/model-sync";
import { handleChatCompletion, handleListModels } from "./lib/proxy/handler";
import { redisSet, redisGet, redisDel, redisIncr, redisIncrBy, REDIS_KEYS } from "./lib/redis";
import { runProviderValidation } from "./lib/jobs/provider-validation";
import { runSnapshotCleanup } from "./lib/jobs/snapshot-cleanup";
import { runSpendAnomalyCheck } from "./lib/jobs/spend-anomaly";
import { checkPlanLimit, PLAN_LIMITS } from "./lib/plan-limits";
import { sendEmail, emailTemplates } from "./lib/email";
import { getCostPerModel, getTopSpenders, getSpendForecast, getAnomalies, getOptimizationRecommendations } from "./lib/analytics";
import { loginLimiter, redeemLimiter, regenerateKeyLimiter } from "./lib/rate-limiter";
import { z } from "zod";
import { cascadeDeleteOrganization, cascadeDeleteTeam, cascadeDeleteMember, cascadeDeleteVoucher } from "./lib/cascade-delete";

const VOUCHER_LIMITS = {
  FREE: {
    maxActiveCodes: 1,
    maxRedemptionsPerCode: 25,
    maxBudgetPerRecipientCents: 500,
    totalAllocatedBudgetCents: 1000,
    totalProxyRequests: 200,
    maxExpiryDays: 1,
    proxyRateLimitPerMin: 10,
    maxConcurrentRequests: 2,
  },
  TEAM: {
    maxActiveCodesPerAdmin: 5,
    maxRedemptionsPerCode: 50,
    maxBudgetPerRecipientCents: 2000,
    totalAllocatedBudgetCentsPerAdmin: 10000,
    totalProxyRequestsPerAdmin: 5000,
    maxExpiryDays: 30,
    proxyRateLimitPerMin: 30,
    maxConcurrentRequests: 2,
  },
  BUNDLE: {
    maxCodesPerBundle: 10,
    pooledRedemptions: 50,
    maxBudgetPerRecipientCents: 5000,
    maxBudgetPerVoucherCents: 10000,
    totalProxyRequests: 25000,
    maxExpiryDays: 30,
    proxyRateLimitPerMin: 30,
    maxConcurrentRequests: 2,
  },
};

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.post("/api/contact", async (req, res) => {
    try {
      const { name, email, message } = req.body;
      if (!name || !email || !message) {
        return res.status(400).json({ message: "All fields are required" });
      }
      const html = `<div style="font-family:sans-serif;max-width:560px">
        <h2 style="color:#6366F1">New Contact Form Submission</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Message:</strong></p>
        <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;white-space:pre-wrap">${message}</div>
      </div>`;
      await sendEmail("tiagomaranhaoalves14nov@gmail.com", `[Allotly Contact] from ${name}`, html);
      res.json({ success: true });
    } catch (e: any) {
      console.error("[contact] Error:", e.message);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  app.post("/api/auth/signup", async (req, res) => {
    try {
      const data = signupSchema.parse(req.body);
      const normalizedEmail = data.email.toLowerCase().trim();
      const existing = await storage.getUserByEmail(normalizedEmail);
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const org = await storage.createOrganization({ name: data.orgName, plan: "FREE", maxTeamAdmins: 0 });
      const passwordHash = await hashPassword(data.password);
      const user = await storage.createUser({
        email: normalizedEmail,
        name: data.name,
        passwordHash,
        orgId: org.id,
        orgRole: "ROOT_ADMIN",
        status: "ACTIVE",
        isVoucherUser: false,
      });

      const defaultTeam = await storage.createTeam({
        name: "Default",
        orgId: org.id,
        adminId: user.id,
      });

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const membership = await storage.createMembership({
        teamId: defaultTeam.id,
        userId: user.id,
        accessType: "TEAM",
        monthlyBudgetCents: 500,
        allowedModels: null,
        allowedProviders: null,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd,
        status: "ACTIVE",
      });

      const { key: rawKey, hash: keyHash, prefix: keyPrefix } = generateAllotlyKey();
      await storage.createAllotlyApiKey({
        userId: user.id,
        membershipId: membership.id,
        keyHash,
        keyPrefix,
      });

      await redisSet(REDIS_KEYS.budget(membership.id), String(500));
      await redisSet(`allotly:pending_key:${user.id}`, rawKey, 7 * 24 * 60 * 60);

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const welcomeEmail = emailTemplates.welcome(org.name, data.name, `${baseUrl}/dashboard`);
      sendEmail(data.email, welcomeEmail.subject, welcomeEmail.html);

      await storage.createAuditLog({
        orgId: org.id,
        actorId: user.id,
        action: "org.created",
        targetType: "organization",
        targetId: org.id,
      });

      await storage.createAuditLog({
        orgId: org.id,
        actorId: user.id,
        action: "key.generated",
        targetType: "allotly_api_key",
        targetId: membership.id,
        metadata: { keyPrefix, autoGenerated: true },
      });

      req.session.userId = user.id;
      req.session.orgId = org.id;
      req.session.orgRole = user.orgRole;

      res.json({ user: { id: user.id, email: user.email, name: user.name, orgRole: user.orgRole, orgId: org.id } });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: e.errors });
      }
      console.error("Signup error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const data = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(data.email);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const valid = await comparePasswords(data.password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      await storage.updateUser(user.id, { lastLoginAt: new Date() });

      req.session.userId = user.id;
      req.session.orgId = user.orgId;
      req.session.orgRole = user.orgRole;

      res.json({ user: { id: user.id, email: user.email, name: user.name, orgRole: user.orgRole, orgId: user.orgId } });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: e.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/auth/session", async (req, res) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const org = await storage.getOrganization(user.orgId);
    res.json({
      user: { id: user.id, email: user.email, name: user.name, orgRole: user.orgRole, orgId: user.orgId, isVoucherUser: user.isVoucherUser },
      organization: org ? { id: org.id, name: org.name, plan: org.plan } : null,
    });
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.post("/api/auth/forgot-password", loginLimiter, async (req, res) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user || !user.passwordHash) {
        return res.json({ message: "If an account with that email exists, a reset link has been sent." });
      }

      await storage.deletePasswordResetTokensForUser(user.id);

      const crypto = await import("crypto");
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

      await storage.createPasswordResetToken({ userId: user.id, tokenHash, expiresAt });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
      const emailContent = emailTemplates.passwordReset(user.name, resetUrl);
      sendEmail(user.email, emailContent.subject, emailContent.html);

      res.json({ message: "If an account with that email exists, a reset link has been sent." });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Please enter a valid email address." });
      }
      console.error("Forgot password error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/reset-password", loginLimiter, async (req, res) => {
    try {
      const { token, password } = z.object({
        token: z.string().min(1),
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);

      const crypto = await import("crypto");
      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const newHash = await hashPassword(password);
      const result = await storage.resetPasswordAtomically(tokenHash, newHash);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid or expired reset link. Please request a new one." });
      }

      if (result.userId) {
        await db.execute(sql`DELETE FROM session WHERE sess::jsonb->>'userId' = ${result.userId}`).catch(() => {});
      }

      res.json({ message: "Password has been reset successfully. You can now sign in." });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: e.errors[0]?.message || "Validation error" });
      }
      console.error("Reset password error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/invite/:token", async (req, res) => {
    try {
      const crypto = await import("crypto");
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const tokenRecord = await storage.getPasswordResetToken(tokenHash);

      if (!tokenRecord || tokenRecord.usedAt || new Date(tokenRecord.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Invalid or expired invite link" });
      }

      const invitedUser = await storage.getUser(tokenRecord.userId);
      if (!invitedUser) return res.status(404).json({ message: "User not found" });

      res.json({
        userId: invitedUser.id,
        email: invitedUser.email,
        name: invitedUser.name,
        orgRole: invitedUser.orgRole,
        status: invitedUser.status,
      });
    } catch (e: any) {
      console.error("Invite validate error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/invite/:token/accept", async (req, res) => {
    try {
      const { password } = z.object({
        password: z.string().min(8, "Password must be at least 8 characters"),
      }).parse(req.body);

      const crypto = await import("crypto");
      const tokenHash = crypto.createHash("sha256").update(req.params.token).digest("hex");
      const tokenRecord = await storage.getPasswordResetToken(tokenHash);

      if (!tokenRecord || tokenRecord.usedAt || new Date(tokenRecord.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Invalid or expired invite link" });
      }

      const invitedUser = await storage.getUser(tokenRecord.userId);
      if (!invitedUser) return res.status(404).json({ message: "User not found" });

      const newPasswordHash = await hashPassword(password);
      await storage.updateUser(invitedUser.id, {
        passwordHash: newPasswordHash,
        status: "ACTIVE",
      } as any);

      await storage.markPasswordResetTokenUsed(tokenRecord.id);
      await storage.deletePasswordResetTokensForUser(invitedUser.id);

      req.session.userId = invitedUser.id;
      req.session.orgId = invitedUser.orgId;
      req.session.orgRole = invitedUser.orgRole;

      const org = await storage.getOrganization(invitedUser.orgId);

      let welcomeData: any = null;
      if (invitedUser.orgRole === "MEMBER") {
        const membership = await storage.getMembershipByUser(invitedUser.id);
        if (membership) {
          const activeKey = await storage.getActiveKeyByUserId(invitedUser.id);
          const team = await storage.getTeam(membership.teamId);
          const providerConnections = await storage.getProviderConnectionsByOrg(invitedUser.orgId);
          const allowedModels = membership.allowedModels as string[] | null;
          const models = await storage.getModelPricing();
          const filteredModels = allowedModels
            ? models.filter(m => allowedModels.includes(m.modelId))
            : models;

          const pendingKey = await redisGet(`allotly:pending_key:${invitedUser.id}`);
          if (pendingKey) {
            await redisDel(`allotly:pending_key:${invitedUser.id}`);
          }

          welcomeData = {
            apiKey: pendingKey || null,
            keyPrefix: activeKey?.keyPrefix || null,
            teamName: team?.name || null,
            budgetCents: membership.monthlyBudgetCents,
            accessType: membership.accessType,
            periodEnd: membership.periodEnd,
            voucherExpiresAt: membership.voucherExpiresAt,
            allowedModels: filteredModels.map(m => ({
              modelId: m.modelId,
              displayName: m.displayName,
              provider: m.provider,
            })),
            allowedProviders: membership.allowedProviders || providerConnections.filter(c => c.status === "ACTIVE").map(c => c.provider),
          };
        }
      }

      res.json({
        user: {
          id: invitedUser.id,
          email: invitedUser.email,
          name: invitedUser.name,
          orgRole: invitedUser.orgRole,
          orgId: invitedUser.orgId,
        },
        organization: org ? { id: org.id, name: org.name, plan: org.plan } : null,
        welcomeData,
      });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: e.errors[0]?.message || "Validation error" });
      }
      console.error("Invite accept error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/members/me/welcome", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole !== "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembershipByUser(user.id);
      if (!membership) return res.status(404).json({ message: "No membership found" });

      const activeKey = await storage.getActiveKeyByUserId(user.id);
      const team = await storage.getTeam(membership.teamId);
      const providerConnections = await storage.getProviderConnectionsByOrg(user.orgId);
      const allowedModels = membership.allowedModels as string[] | null;
      const models = await storage.getModelPricing();
      const filteredModels = allowedModels
        ? models.filter(m => allowedModels.includes(m.modelId))
        : models;

      res.json({
        keyPrefix: activeKey?.keyPrefix || null,
        teamName: team?.name || null,
        budgetCents: membership.monthlyBudgetCents,
        spentCents: membership.currentPeriodSpendCents,
        accessType: membership.accessType,
        periodEnd: membership.periodEnd,
        voucherExpiresAt: membership.voucherExpiresAt,
        allowedModels: filteredModels.map(m => ({
          modelId: m.modelId,
          displayName: m.displayName,
          provider: m.provider,
        })),
        allowedProviders: membership.allowedProviders || providerConnections.filter(c => c.status === "ACTIVE").map(c => c.provider),
        status: membership.status,
      });
    } catch (e: any) {
      console.error("Welcome data error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/providers/available", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });
    const connections = await storage.getProviderConnectionsByOrg(user.orgId);
    const safe = connections.filter(c => c.status === "ACTIVE" || c.status === "CONNECTED").map(c => ({
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
    }));
    res.json(safe);
  });

  app.get("/api/providers", requireRole("ROOT_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    const connections = await storage.getProviderConnectionsByOrg(user.orgId);
    const sanitized = connections.map(c => ({
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
      status: c.status,
      lastValidatedAt: c.lastValidatedAt,
      orgAllowedModels: c.orgAllowedModels,
      createdAt: c.createdAt,
      ...(c.provider === "AZURE_OPENAI" && {
        azureBaseUrl: c.azureBaseUrl,
        azureApiVersion: c.azureApiVersion,
        azureEndpointMode: c.azureEndpointMode,
        azureDeployments: c.azureDeployments,
      }),
    }));
    res.json(sanitized);
  });

  app.post("/api/providers", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const providerSchema = z.object({
        provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"]),
        apiKey: z.string().min(1),
        displayName: z.string().max(100).optional(),
        azureBaseUrl: z.string().url().optional(),
        azureApiVersion: z.string().optional(),
        azureEndpointMode: z.enum(["v1", "legacy"]).optional(),
        azureDeployments: z.array(z.object({
          deploymentName: z.string().min(1),
          modelId: z.string().min(1),
          inputPricePerMTok: z.number().int().min(0),
          outputPricePerMTok: z.number().int().min(0),
        })).optional(),
      });
      const parsed = providerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const { provider, apiKey, displayName } = parsed.data;

      if (provider === "AZURE_OPENAI") {
        if (!parsed.data.azureBaseUrl) {
          return res.status(400).json({ message: "azureBaseUrl is required for Azure" });
        }
      }

      const providerCheck = await checkPlanLimit(user.orgId, "provider");
      if (!providerCheck.allowed) {
        return res.status(400).json({ message: providerCheck.message });
      }

      const adapter = getProviderAdapter(provider);
      if (!adapter) {
        return res.status(400).json({ message: "Unsupported AI Provider" });
      }

      const validationOptions = provider === "AZURE_OPENAI" ? {
        baseUrl: parsed.data.azureBaseUrl,
        deploymentName: parsed.data.azureDeployments?.[0]?.deploymentName || "gpt-4o",
        apiVersion: parsed.data.azureApiVersion,
        endpointMode: parsed.data.azureEndpointMode,
      } : undefined;

      const validation = await adapter.validateAdminKey(apiKey, validationOptions);
      if (!validation.valid) {
        return res.status(400).json({ message: `Key validation failed: ${validation.error}` });
      }

      const { encrypted, iv, tag } = encryptProviderKey(apiKey);

      const connection = await storage.createProviderConnection({
        orgId: user.orgId,
        provider,
        displayName: displayName || provider,
        adminApiKeyEncrypted: encrypted,
        adminApiKeyIv: iv,
        adminApiKeyTag: tag,
        status: "ACTIVE",
        lastValidatedAt: new Date(),
        ...(provider === "AZURE_OPENAI" && {
          azureBaseUrl: parsed.data.azureBaseUrl,
          azureApiVersion: parsed.data.azureApiVersion || null,
          azureEndpointMode: parsed.data.azureEndpointMode || "legacy",
          azureDeployments: parsed.data.azureDeployments,
        }),
      });

      if (provider === "AZURE_OPENAI") {
        await redisDel(REDIS_KEYS.azureDeployments(user.orgId));
        await redisDel(`azure_active:${user.orgId}`);
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "provider.connected",
        targetType: "provider_connection",
        targetId: connection.id,
        metadata: { provider },
      });

      res.json({
        id: connection.id,
        provider: connection.provider,
        displayName: connection.displayName,
        status: connection.status,
      });
    } catch (e: any) {
      if (e.code === "23505") {
        return res.status(400).json({ message: "AI Provider already connected" });
      }
      console.error("Provider connect error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/providers/:id", requireRole("ROOT_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    const conn = await storage.getProviderConnection(req.params.id);
    if (!conn || conn.orgId !== user.orgId) {
      return res.status(404).json({ message: "Not found" });
    }
    await storage.deleteProviderConnection(conn.id);
    if (conn.provider === "AZURE_OPENAI") {
      await redisDel(REDIS_KEYS.azureDeployments(user.orgId));
      await redisDel(`azure_active:${user.orgId}`);
    }
    await storage.createAuditLog({
      orgId: user.orgId,
      actorId: user.id,
      action: "provider.disconnected",
      targetType: "provider_connection",
      targetId: conn.id,
      metadata: { provider: conn.provider },
    });
    res.json({ message: "Disconnected" });
  });

  app.patch("/api/providers/:id", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      const patchSchema = z.object({
        displayName: z.string().min(1).max(100).optional(),
        orgAllowedModels: z.array(z.string()).nullable().optional(),
        azureBaseUrl: z.string().url().optional(),
        azureApiVersion: z.string().optional(),
        azureEndpointMode: z.enum(["v1", "legacy"]).optional(),
        azureDeployments: z.array(z.object({
          deploymentName: z.string().min(1),
          modelId: z.string().min(1),
          inputPricePerMTok: z.number().int().min(0),
          outputPricePerMTok: z.number().int().min(0),
        })).optional(),
      });
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      }

      const { displayName, orgAllowedModels } = parsed.data;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (displayName !== undefined) updates.displayName = displayName;
      if (orgAllowedModels !== undefined) updates.orgAllowedModels = orgAllowedModels;

      if (conn.provider === "AZURE_OPENAI") {
        if (parsed.data.azureBaseUrl !== undefined) updates.azureBaseUrl = parsed.data.azureBaseUrl;
        if (parsed.data.azureApiVersion !== undefined) updates.azureApiVersion = parsed.data.azureApiVersion;
        if (parsed.data.azureEndpointMode !== undefined) updates.azureEndpointMode = parsed.data.azureEndpointMode;
        if (parsed.data.azureDeployments !== undefined) {
          updates.azureDeployments = parsed.data.azureDeployments;
        }
      }

      const updated = await storage.updateProviderConnection(conn.id, updates);

      if (conn.provider === "AZURE_OPENAI") {
        await redisDel(REDIS_KEYS.azureDeployments(user.orgId));
        await redisDel(`azure_active:${user.orgId}`);
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "provider.updated",
        targetType: "provider_connection",
        targetId: conn.id,
        metadata: { provider: conn.provider, changes: Object.keys(updates).filter(k => k !== "updatedAt") },
      });

      res.json({
        id: updated!.id,
        provider: updated!.provider,
        displayName: updated!.displayName,
        status: updated!.status,
        orgAllowedModels: updated!.orgAllowedModels,
        lastValidatedAt: updated!.lastValidatedAt,
        ...(conn.provider === "AZURE_OPENAI" && {
          azureBaseUrl: updated!.azureBaseUrl,
          azureApiVersion: updated!.azureApiVersion,
          azureEndpointMode: updated!.azureEndpointMode,
          azureDeployments: updated!.azureDeployments,
        }),
      });
    } catch (e: any) {
      console.error("Provider update error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/providers/:id/validate", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      const adapter = getProviderAdapter(conn.provider);
      if (!adapter) {
        return res.status(400).json({ message: "Unsupported AI Provider" });
      }

      const plainKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);
      const result = await adapter.validateAdminKey(plainKey);

      const newStatus = result.valid ? "ACTIVE" : "INVALID";
      await storage.updateProviderConnection(conn.id, {
        status: newStatus as any,
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "provider.validated",
        targetType: "provider_connection",
        targetId: conn.id,
        metadata: { provider: conn.provider, valid: result.valid, error: result.error },
      });

      res.json({ valid: result.valid, error: result.error, status: newStatus });
    } catch (e: any) {
      console.error("Provider validate error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/providers/:id/rotate-key", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      const schema = z.object({ newApiKey: z.string().min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { newApiKey } = parsed.data;
      const adapter = getProviderAdapter(conn.provider);
      if (!adapter) return res.status(400).json({ message: "Unsupported AI Provider" });

      const validationOptions = conn.provider === "AZURE_OPENAI" ? {
        baseUrl: conn.azureBaseUrl || undefined,
        deploymentName: ((conn.azureDeployments as any[])?.[0])?.deploymentName || "gpt-4o",
        apiVersion: conn.azureApiVersion || "2024-10-21",
        endpointMode: (conn.azureEndpointMode === "v1" && conn.azureBaseUrl?.includes("azure-api.net")) ? "legacy" : (conn.azureEndpointMode || "legacy"),
      } : undefined;

      const validation = await adapter.validateAdminKey(newApiKey, validationOptions);
      if (!validation.valid) {
        return res.status(400).json({ message: `Key validation failed: ${validation.error}` });
      }

      const { encrypted, iv, tag } = encryptProviderKey(newApiKey);
      await storage.updateProviderConnection(conn.id, {
        adminApiKeyEncrypted: encrypted,
        adminApiKeyIv: iv,
        adminApiKeyTag: tag,
        status: "ACTIVE",
        lastValidatedAt: new Date(),
        updatedAt: new Date(),
      });

      if (conn.provider === "AZURE_OPENAI") {
        await redisDel(REDIS_KEYS.azureDeployments(user.orgId));
        await redisDel(`azure_active:${user.orgId}`);
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "provider.key_rotated",
        targetType: "provider_connection",
        targetId: conn.id,
        metadata: { provider: conn.provider },
      });

      res.json({ message: "Provider key rotated successfully", provider: conn.provider });
    } catch (e: any) {
      console.error("Provider rotate key error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/providers/:id/validate-now", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      const adapter = getProviderAdapter(conn.provider);
      if (!adapter) return res.status(400).json({ message: "Unsupported AI Provider" });

      const plainKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);
      const result = await adapter.validateAdminKey(plainKey);

      const newStatus = result.valid ? "ACTIVE" : "INVALID";
      const now = new Date();
      await storage.updateProviderConnection(conn.id, {
        status: newStatus as any,
        lastValidatedAt: now,
        updatedAt: now,
      });

      res.json({ valid: result.valid, lastValidated: now.toISOString(), error: result.error });
    } catch (e: any) {
      console.error("Provider validate-now error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/providers/:id/test-connection", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      const plainKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);

      const startTime = Date.now();
      let success = false;
      let model = "";
      let responseText = "";
      let error = "";

      if (conn.provider === "OPENAI") {
        model = "gpt-4o-mini";
        try {
          const resp = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${plainKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model, messages: [{ role: "user", content: "respond with OK" }], max_tokens: 5 }),
          });
          if (resp.ok) {
            const data = await resp.json();
            responseText = data.choices?.[0]?.message?.content || "";
            success = true;
          } else {
            const body = await resp.text();
            error = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
          }
        } catch (e: any) { error = e.message; }
      } else if (conn.provider === "ANTHROPIC") {
        model = "claude-3-haiku-20240307";
        try {
          const resp = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: { "x-api-key": plainKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
            body: JSON.stringify({ model, max_tokens: 5, messages: [{ role: "user", content: "respond with OK" }] }),
          });
          if (resp.ok) {
            const data = await resp.json();
            responseText = data.content?.[0]?.text || "";
            success = true;
          } else {
            const body = await resp.text();
            error = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
          }
        } catch (e: any) { error = e.message; }
      } else if (conn.provider === "GOOGLE") {
        model = "gemini-2.0-flash-lite";
        try {
          const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${plainKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: "respond with OK" }] }], generationConfig: { maxOutputTokens: 5 } }),
          });
          if (resp.ok) {
            const data = await resp.json();
            responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            success = true;
          } else {
            const body = await resp.text();
            error = `HTTP ${resp.status}: ${body.slice(0, 200)}`;
          }
        } catch (e: any) { error = e.message; }
      } else {
        return res.status(400).json({ message: "Unsupported provider" });
      }

      const latencyMs = Date.now() - startTime;
      res.json({ success, latencyMs, model, response: responseText || undefined, error: error || undefined });
    } catch (e: any) {
      console.error("Provider test-connection error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/providers/:id/models", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      if (conn.provider === "AZURE_OPENAI") {
        const deployments = (conn.azureDeployments || []) as Array<{ deploymentName: string; modelId: string; inputPricePerMTok: number; outputPricePerMTok: number }>;
        return res.json(deployments.map(d => ({
          modelId: d.deploymentName,
          displayName: d.deploymentName,
          underlyingModel: d.modelId,
          inputPricePerMTok: d.inputPricePerMTok,
          outputPricePerMTok: d.outputPricePerMTok,
        })));
      }

      let apiKey: string;
      try {
        apiKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);
      } catch {
        return res.status(500).json({ message: "Failed to decrypt API key" });
      }

      let models: Array<{ id: string; displayName: string }> = [];

      if (conn.provider === "OPENAI") {
        const r = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
        });
        if (!r.ok) return res.status(502).json({ message: `OpenAI API returned ${r.status}` });
        const data = await r.json() as { data: Array<{ id: string }> };
        const chatPatterns = [/^gpt-/, /^o[0-9]/, /^chatgpt-/];
        const excludePatterns = [/realtime/i, /audio/i, /whisper/i, /tts/i, /dall-e/i, /embedding/i, /moderation/i, /babbage/i, /davinci/i, /-search-/, /-instruct$/, /-vision$/];
        models = data.data
          .filter(m => chatPatterns.some(p => p.test(m.id)) && !excludePatterns.some(p => p.test(m.id)))
          .map(m => ({ id: m.id, displayName: m.id.replace(/^gpt-/, "GPT-").replace(/-mini$/, " Mini").replace(/-nano$/, " Nano") }));
      } else if (conn.provider === "ANTHROPIC") {
        let hasMore = true;
        let afterId: string | undefined;
        const allAnthropicModels: Array<{ id: string; display_name?: string }> = [];
        while (hasMore) {
          const url = new URL("https://api.anthropic.com/v1/models");
          url.searchParams.set("limit", "100");
          if (afterId) url.searchParams.set("after_id", afterId);
          const r = await fetch(url.toString(), {
            headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          });
          if (!r.ok) return res.status(502).json({ message: `Anthropic API returned ${r.status}` });
          const data = await r.json() as { data: Array<{ id: string; display_name?: string }>; has_more: boolean; last_id?: string };
          allAnthropicModels.push(...data.data);
          hasMore = data.has_more && !!data.last_id;
          afterId = data.last_id;
        }
        models = allAnthropicModels
          .filter(m => /^claude-/.test(m.id))
          .map(m => ({ id: m.id, displayName: m.display_name || m.id }));
      } else if (conn.provider === "GOOGLE") {
        const r = await fetch("https://generativelanguage.googleapis.com/v1/models", {
          headers: { "x-goog-api-key": apiKey },
        });
        if (!r.ok) return res.status(502).json({ message: `Google API returned ${r.status}` });
        const data = await r.json() as { models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
        models = data.models
          .filter(m => m.supportedGenerationMethods?.includes("generateContent") && /^gemini-/.test(m.name.replace("models/", "")))
          .map(m => {
            const id = m.name.replace("models/", "");
            return { id, displayName: m.displayName || id };
          });
      }

      const pricingRows = await storage.getModelPricingByProvider(conn.provider);
      const pricingMap = new Map(pricingRows.map(p => [p.modelId, p]));

      const result = models.map(m => {
        const pricing = pricingMap.get(m.id);
        return {
          modelId: m.id,
          displayName: m.displayName,
          inputPricePerMTok: pricing?.inputPricePerMTok ?? 0,
          outputPricePerMTok: pricing?.outputPricePerMTok ?? 0,
        };
      });

      res.json(result);
    } catch (e: any) {
      console.error("Provider models fetch error:", e);
      res.status(500).json({ message: "Failed to fetch models" });
    }
  });

  app.get("/api/providers/:id/health", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const conn = await storage.getProviderConnection(req.params.id);
      if (!conn || conn.orgId !== user.orgId) {
        return res.status(404).json({ message: "Not found" });
      }

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const logs24h = await storage.getProxyLogsByProvider(user.orgId, conn.provider, twentyFourHoursAgo);
      const logs1h = logs24h.filter(l => new Date(l.createdAt) >= oneHourAgo);

      const computeMetrics = (logs: typeof logs24h) => {
        const requests = logs.length;
        const errors = logs.filter(l => l.statusCode >= 400).length;
        const errorRate = requests > 0 ? Math.round((errors / requests) * 10000) / 10000 : 0;
        const avgLatencyMs = requests > 0 ? Math.round(logs.reduce((sum, l) => sum + l.durationMs, 0) / requests) : 0;
        return { requests, errors, errorRate, avgLatencyMs };
      };

      const successfulLogs = logs24h.filter(l => l.statusCode < 400);
      const errorLogs = logs24h.filter(l => l.statusCode >= 400);

      const lastSuccessfulRequest = successfulLogs.length > 0
        ? new Date(successfulLogs[0].createdAt).toISOString()
        : null;

      const lastError = errorLogs.length > 0 ? {
        timestamp: new Date(errorLogs[0].createdAt).toISOString(),
        statusCode: errorLogs[0].statusCode,
        message: `HTTP ${errorLogs[0].statusCode} on model ${errorLogs[0].model}`,
      } : null;

      res.json({
        lastValidated: conn.lastValidatedAt ? new Date(conn.lastValidatedAt).toISOString() : null,
        validationStatus: conn.status === "ACTIVE" ? "valid" : "invalid",
        last1h: computeMetrics(logs1h),
        last24h: computeMetrics(logs24h),
        lastSuccessfulRequest,
        lastError,
      });
    } catch (e: any) {
      console.error("Provider health error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/keys", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const filters = {
        status: req.query.status as string | undefined,
        teamId: req.query.teamId as string | undefined,
        type: req.query.type as string | undefined,
        search: req.query.search as string | undefined,
      };
      const keys = await storage.getAllApiKeysWithOwnerInfo(user.orgId, filters);
      res.json(keys);
    } catch (e: any) {
      console.error("Key audit error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/keys/bulk-revoke", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const schema = z.object({ keyIds: z.array(z.string()).min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { keyIds } = parsed.data;
      const results: { keyId: string; success: boolean; error?: string }[] = [];
      const revokedPrefixes: string[] = [];

      const orgKeys = await storage.getAllApiKeysWithOwnerInfo(user.orgId);
      const orgKeyMap = new Map(orgKeys.map(k => [k.id, k]));

      const { redisDel, REDIS_KEYS } = await import("./lib/redis");

      for (const keyId of keyIds) {
        try {
          const keyInfo = orgKeyMap.get(keyId);
          if (!keyInfo) {
            results.push({ keyId, success: false, error: "Key not found in org" });
            continue;
          }

          const updatedKey = await storage.updateAllotlyApiKey(keyId, { status: "REVOKED", updatedAt: new Date() });

          if (updatedKey) {
            await redisDel(REDIS_KEYS.budget(keyInfo.membershipId));
            await redisDel(REDIS_KEYS.concurrent(keyInfo.membershipId));
            await redisDel(REDIS_KEYS.ratelimit(keyInfo.membershipId));
            await redisDel(REDIS_KEYS.apiKeyCache(updatedKey.keyHash));
          }

          revokedPrefixes.push(keyInfo.keyPrefix);
          results.push({ keyId, success: true });
        } catch (e: any) {
          results.push({ keyId, success: false, error: e.message });
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "keys.bulk_revoked",
        targetType: "allotly_api_key",
        targetId: "bulk",
        metadata: { count: revokedPrefixes.length, keyPrefixes: revokedPrefixes },
      });

      res.json({ results });
    } catch (e: any) {
      console.error("Bulk key revoke error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/models", async (req, res) => {
    const provider = req.query.provider as string | undefined;
    if (provider) {
      const models = await storage.getModelPricingByProvider(provider);
      res.json(models);
    } else {
      const models = await storage.getModelPricing();
      res.json(models);
    }
  });

  app.get("/api/teams", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.orgRole === "ROOT_ADMIN") {
      const orgTeams = await storage.getTeamsByOrg(user.orgId);
      res.json(orgTeams);
    } else if (user.orgRole === "TEAM_ADMIN") {
      const team = await storage.getTeamByAdmin(user.id);
      res.json(team ? [team] : []);
    } else {
      res.json([]);
    }
  });

  app.get("/api/teams/capacity", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const teams = await storage.getTeamsByOrg(user.orgId);
      const allUsers = await storage.getUsersByOrg(user.orgId);
      const activeAdmins = allUsers.filter(u => u.orgRole === "TEAM_ADMIN" && u.status === "ACTIVE");
      const maxAdmins = org.maxTeamAdmins || (org.plan === "TEAM" ? PLAN_LIMITS.TEAM.maxTeamAdmins : 0);
      const maxTeams = org.plan === "TEAM" ? PLAN_LIMITS.TEAM.maxTeams : org.plan === "FREE" ? PLAN_LIMITS.FREE.maxTeams : PLAN_LIMITS.ENTERPRISE.maxTeams;

      res.json({
        plan: org.plan,
        currentTeams: teams.length,
        maxTeams,
        currentAdmins: activeAdmins.length,
        maxAdmins,
        hasSubscription: !!org.stripeSubId,
        canCreateTeam: teams.length < maxTeams && activeAdmins.length < maxAdmins,
        needsMoreSeats: activeAdmins.length >= maxAdmins,
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/teams", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const createTeamSchema = z.object({
        adminEmail: z.string().email(),
        adminName: z.string().optional(),
        teamName: z.string().min(1),
        adminPassword: z.string().min(6).optional(),
      });
      const parsed = createTeamSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const { adminName, teamName, adminPassword } = parsed.data;
      const adminEmail = parsed.data.adminEmail.toLowerCase().trim();

      const teamCheck = await checkPlanLimit(user.orgId, "team");
      if (!teamCheck.allowed) {
        return res.status(400).json({ message: teamCheck.message });
      }
      const adminCheck = await checkPlanLimit(user.orgId, "team_admin");
      if (!adminCheck.allowed) {
        return res.status(400).json({ message: adminCheck.message });
      }

      const crypto = await import("crypto");

      let adminUser;
      let isExistingUser = false;
      const existingUser = await storage.getUserByEmail(adminEmail);

      if (existingUser) {
        if (existingUser.orgId !== user.orgId) {
          return res.status(400).json({ message: "This email belongs to a user in another organization" });
        }
        const existingAdminTeam = await storage.getTeamByAdmin(existingUser.id);
        if (existingAdminTeam) {
          return res.status(400).json({ message: `This user is already the admin of team "${existingAdminTeam.name}". Each team needs a different admin.` });
        }
        adminUser = existingUser;
        isExistingUser = true;

        if (existingUser.orgRole === "MEMBER") {
          await storage.updateUser(existingUser.id, { orgRole: "TEAM_ADMIN" });
        }
      } else {
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const passwordHash = await hashPassword(randomPassword);
        adminUser = await storage.createUser({
          email: adminEmail,
          name: adminName || adminEmail.split("@")[0],
          passwordHash,
          orgId: user.orgId,
          orgRole: "TEAM_ADMIN",
          status: "INVITED",
          isVoucherUser: false,
        });
      }

      const team = await storage.createTeam({
        name: teamName,
        orgId: user.orgId,
        adminId: adminUser.id,
      });

      if (!isExistingUser) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await storage.createPasswordResetToken({ userId: adminUser.id, tokenHash, expiresAt });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const inviteUrl = `${baseUrl}/invite/${rawToken}`;
        const inviteEmailContent = emailTemplates.teamAdminInvite(
          adminName || adminEmail.split("@")[0],
          (await storage.getOrganization(user.orgId))?.name || "your organization",
          user.name || user.email,
          inviteUrl
        );
        sendEmail(adminEmail, inviteEmailContent.subject, inviteEmailContent.html);
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "team.created",
        targetType: "team",
        targetId: team.id,
        metadata: { teamName, adminEmail },
      });

      res.json({ team, admin: { id: adminUser.id, email: adminUser.email, name: adminUser.name, status: "INVITED" } });
    } catch (e: any) {
      if (e.code === "23505") {
        console.error("Team create 23505 constraint:", e.detail, e.constraint);
        return res.status(400).json({ message: "A user with this email already exists. Try a different email." });
      }
      console.error("Team create error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/members", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    let teamIds: string[] = [];
    if (user.orgRole === "ROOT_ADMIN") {
      const orgTeams = await storage.getTeamsByOrg(user.orgId);
      teamIds = orgTeams.map(t => t.id);
    } else if (user.orgRole === "TEAM_ADMIN") {
      const team = await storage.getTeamByAdmin(user.id);
      if (team) teamIds = [team.id];
    } else {
      return res.json([]);
    }

    const allMembers = [];
    for (const teamId of teamIds) {
      const memberships = await storage.getMembershipsByTeam(teamId);
      for (const m of memberships) {
        const memberUser = await storage.getUser(m.userId);
        allMembers.push({
          ...m,
          user: memberUser ? { id: memberUser.id, email: memberUser.email, name: memberUser.name, isVoucherUser: memberUser.isVoucherUser } : null,
        });
      }
    }
    res.json(allMembers);
  });

  app.post("/api/members", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      if (user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const addMemberSchema = z.object({
        email: z.string().email(),
        name: z.string().optional(),
        teamId: z.string().optional(),
        budgetCents: z.number().int().min(100),
        accessType: z.enum(["TEAM", "VOUCHER"]).optional(),
        allowedModels: z.array(z.string()).nullable().optional(),
        allowedProviders: z.array(z.string()).nullable().optional(),
      });
      const parsed = addMemberSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const { name, teamId, budgetCents, accessType, allowedModels, allowedProviders } = parsed.data;
      const email = parsed.data.email.toLowerCase().trim();

      let targetTeamId = teamId;
      if (user.orgRole === "TEAM_ADMIN") {
        const team = await storage.getTeamByAdmin(user.id);
        if (!team) return res.status(400).json({ message: "No team found" });
        targetTeamId = team.id;
      } else if (user.orgRole === "ROOT_ADMIN" && targetTeamId) {
        const team = await storage.getTeam(targetTeamId);
        if (!team || team.orgId !== user.orgId) return res.status(400).json({ message: "Team not found in your organization" });
      }

      if (!targetTeamId) {
        return res.status(400).json({ message: "Team is required" });
      }

      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const memberCheck = await checkPlanLimit(user.orgId, "member", targetTeamId);
      if (!memberCheck.allowed) {
        return res.status(400).json({ message: memberCheck.message });
      }

      const crypto = await import("crypto");

      const existingUser = await storage.getUserByEmail(email);
      let memberUser;
      let isExistingUser = false;

      if (existingUser) {
        if (existingUser.orgId !== user.orgId) {
          return res.status(400).json({ message: "This email belongs to a user in another organization" });
        }
        const existingMembership = await storage.getMembershipByUser(existingUser.id);
        if (existingMembership) {
          return res.status(400).json({ message: "This user already has an active team membership" });
        }
        memberUser = existingUser;
        isExistingUser = true;
      } else {
        const randomPassword = crypto.randomBytes(32).toString("hex");
        const passwordHash = await hashPassword(randomPassword);
        memberUser = await storage.createUser({
          email,
          name: name || email.split("@")[0],
          passwordHash,
          orgId: user.orgId,
          orgRole: "MEMBER",
          status: "INVITED",
          isVoucherUser: false,
        });
      }

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const membership = await storage.createMembership({
        teamId: targetTeamId,
        userId: memberUser.id,
        accessType: accessType || "TEAM",
        monthlyBudgetCents: budgetCents,
        allowedModels: allowedModels || null,
        allowedProviders: allowedProviders || null,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd,
        status: "ACTIVE",
      });

      const { key: rawKey, hash: keyHash, prefix: keyPrefix } = generateAllotlyKey();
      await storage.createAllotlyApiKey({
        userId: memberUser.id,
        membershipId: membership.id,
        keyHash: keyHash,
        keyPrefix: keyPrefix,
      });

      await redisSet(REDIS_KEYS.budget(membership.id), String(budgetCents));

      await redisSet(`allotly:pending_key:${memberUser.id}`, rawKey, 7 * 24 * 60 * 60);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.created",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { email, accessType: accessType || "TEAM" },
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "key.generated",
        targetType: "allotly_api_key",
        targetId: membership.id,
        metadata: { memberUserId: memberUser.id, keyPrefix },
      });

      if (isExistingUser) {
        res.json({ membership, user: { id: memberUser.id, email: memberUser.email, name: memberUser.name }, apiKey: rawKey, keyPrefix });
      } else {
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await storage.createPasswordResetToken({ userId: memberUser.id, tokenHash, expiresAt });

        const team = await storage.getTeam(targetTeamId);
        const setupUrl = `${baseUrl}/invite/${rawToken}`;
        const inviteEmail = emailTemplates.memberInvite(
          name || email.split("@")[0],
          team?.name || "your team",
          user.name || user.email,
          setupUrl
        );
        sendEmail(email, inviteEmail.subject, inviteEmail.html);

        res.json({ membership, user: { id: memberUser.id, email: memberUser.email, name: memberUser.name }, apiKey: rawKey, keyPrefix });
      }
    } catch (e: any) {
      if (e.code === "23505") {
        return res.status(400).json({ message: "Email already in use" });
      }
      console.error("Member create error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/members/:id/suspend", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

    const membership = await storage.getMembership(req.params.id);
    if (!membership) return res.status(404).json({ message: "Not found" });

    const team = await storage.getTeam(membership.teamId);
    if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
    if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

    await storage.updateMembership(membership.id, { status: "SUSPENDED" });

    await storage.createAuditLog({
      orgId: user.orgId,
      actorId: user.id,
      action: "member.suspended",
      targetType: "team_membership",
      targetId: membership.id,
    });

    res.json({ message: "Suspended" });
  });

  app.patch("/api/members/:id/reactivate", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

    const membership = await storage.getMembership(req.params.id);
    if (!membership) return res.status(404).json({ message: "Not found" });

    const team = await storage.getTeam(membership.teamId);
    if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
    if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

    await storage.updateMembership(membership.id, { status: "ACTIVE" });

    await storage.createAuditLog({
      orgId: user.orgId,
      actorId: user.id,
      action: "member.reactivated",
      targetType: "team_membership",
      targetId: membership.id,
    });

    res.json({ message: "Reactivated" });
  });

  app.patch("/api/members/:id/budget", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const schema = z.object({
        monthlyBudgetCents: z.number().int().min(100).optional(),
        allowedModels: z.array(z.string()).nullable().optional(),
        allowedProviders: z.array(z.string()).nullable().optional(),
        accessType: z.enum(["TEAM", "VOUCHER"]).optional(),
        userName: z.string().min(1).max(100).optional(),
        userEmail: z.string().email().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const memberUser = await storage.getUser(membership.userId);
      const beforeMembership = {
        monthlyBudgetCents: membership.monthlyBudgetCents,
        allowedModels: membership.allowedModels,
        allowedProviders: membership.allowedProviders,
        accessType: membership.accessType,
      };
      const beforeUser = { name: memberUser?.name, email: memberUser?.email };

      const { userName, userEmail, ...membershipData } = parsed.data;

      if (userEmail && memberUser && userEmail !== memberUser.email) {
        const existing = await storage.getUserByEmail(userEmail);
        if (existing && existing.id !== memberUser.id) {
          return res.status(409).json({ message: "A user with that email already exists" });
        }
      }

      if (userName || userEmail) {
        const userUpdate: Record<string, any> = {};
        if (userName) userUpdate.name = userName;
        if (userEmail) userUpdate.email = userEmail;
        await storage.updateUser(membership.userId, userUpdate);
      }

      const updated = await storage.updateMembership(membership.id, membershipData);

      if (membershipData.monthlyBudgetCents && membershipData.monthlyBudgetCents !== membership.monthlyBudgetCents) {
        const budgetKey = REDIS_KEYS.budget(membership.id);
        const newRemaining = membershipData.monthlyBudgetCents - membership.currentPeriodSpendCents;
        const oldRemaining = membership.monthlyBudgetCents - membership.currentPeriodSpendCents;
        await redisSet(budgetKey, String(newRemaining));

        if (newRemaining <= 0 && oldRemaining > 0) {
          await storage.updateMembership(membership.id, { status: "BUDGET_EXHAUSTED" });
          const keys = await storage.getApiKeysByMembership(membership.id);
          for (const key of keys) {
            if (key.status === "ACTIVE") {
              await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
              await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
            }
          }
        } else if (newRemaining > 0 && membership.status === "BUDGET_EXHAUSTED") {
          await storage.updateMembership(membership.id, { status: "ACTIVE" });
        }
      }

      if (membershipData.allowedModels !== undefined || membershipData.allowedProviders !== undefined) {
        const keys = await storage.getApiKeysByMembership(membership.id);
        for (const key of keys) {
          if (key.status === "ACTIVE") {
            await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
          }
        }
      }

      const changes: Record<string, { from: any; to: any }> = {};
      if (membershipData.monthlyBudgetCents !== undefined && membershipData.monthlyBudgetCents !== beforeMembership.monthlyBudgetCents) {
        changes.monthlyBudgetCents = { from: beforeMembership.monthlyBudgetCents, to: membershipData.monthlyBudgetCents };
      }
      if (membershipData.allowedModels !== undefined) {
        changes.allowedModels = { from: beforeMembership.allowedModels, to: membershipData.allowedModels };
      }
      if (membershipData.allowedProviders !== undefined) {
        changes.allowedProviders = { from: beforeMembership.allowedProviders, to: membershipData.allowedProviders };
      }
      if (userName && userName !== beforeUser.name) {
        changes.userName = { from: beforeUser.name, to: userName };
      }
      if (userEmail && userEmail !== beforeUser.email) {
        changes.userEmail = { from: beforeUser.email, to: userEmail };
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.updated",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { changes, userId: membership.userId },
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Member budget update error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/budget/reset", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      if (membership.accessType !== "TEAM") {
        return res.status(400).json({ message: "Budget reset only applies to TEAM members, not voucher members" });
      }

      const now = new Date();
      const newPeriodEnd = new Date(now);
      newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);
      const previousSpend = membership.currentPeriodSpendCents;

      const updateData: Record<string, any> = {
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd: newPeriodEnd,
      };

      if (membership.status === "BUDGET_EXHAUSTED") {
        updateData.status = "ACTIVE";
        const keys = await storage.getApiKeysByMembership(membership.id);
        for (const key of keys) {
          if (key.status === "REVOKED") {
            await storage.updateAllotlyApiKey(key.id, { status: "ACTIVE", updatedAt: new Date() });
          }
          await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
        }
      }

      await redisSet(REDIS_KEYS.budget(membership.id), String(membership.monthlyBudgetCents));
      await storage.deleteBudgetAlertsByMembership(membership.id);
      await storage.updateMembership(membership.id, updateData);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "budget.manual_reset",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: {
          previousSpend,
          budgetCents: membership.monthlyBudgetCents,
          newPeriodStart: now.toISOString(),
          newPeriodEnd: newPeriodEnd.toISOString(),
          wasExhausted: membership.status === "BUDGET_EXHAUSTED",
        },
      });

      res.json({
        message: "Budget reset successfully",
        newPeriodStart: now.toISOString(),
        newPeriodEnd: newPeriodEnd.toISOString(),
        budgetCents: membership.monthlyBudgetCents,
      });
    } catch (e: any) {
      console.error("Budget reset error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/budget/credit", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const schema = z.object({
        amountCents: z.number().int().min(1),
        reason: z.string().min(1).max(500),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { amountCents, reason } = parsed.data;
      const previousSpend = membership.currentPeriodSpendCents;
      const newSpend = Math.max(0, previousSpend - amountCents);
      const effectiveCreditCents = previousSpend - newSpend;

      await storage.updateMembership(membership.id, { currentPeriodSpendCents: newSpend });
      await redisIncrBy(REDIS_KEYS.budget(membership.id), effectiveCreditCents);

      if (membership.status === "BUDGET_EXHAUSTED" && (membership.monthlyBudgetCents - newSpend) > 0) {
        await storage.updateMembership(membership.id, { status: "ACTIVE" });
        const keys = await storage.getApiKeysByMembership(membership.id);
        for (const key of keys) {
          if (key.status === "REVOKED") {
            await storage.updateAllotlyApiKey(key.id, { status: "ACTIVE", updatedAt: new Date() });
          }
          await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "budget.credit",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: {
          requestedCreditCents: amountCents,
          effectiveCreditCents,
          reason,
          previousSpendCents: previousSpend,
          newSpendCents: newSpend,
          wasExhausted: membership.status === "BUDGET_EXHAUSTED",
        },
      });

      res.json({
        message: "Budget credit applied",
        amountCents: effectiveCreditCents,
        requestedCents: amountCents,
        previousSpendCents: previousSpend,
        newSpendCents: newSpend,
      });
    } catch (e: any) {
      console.error("Budget credit error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/members/:id/activity", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const [budgetAlerts, keys, proxyLogs, auditResult] = await Promise.all([
        storage.getBudgetAlertsByMembership(membership.id),
        storage.getApiKeysByMembership(membership.id),
        storage.getProxyRequestLogsByMembership(membership.id, 100),
        storage.getFilteredAuditLogs(user.orgId, {
          targetType: "team_membership",
          targetId: membership.id,
          page: 1,
          limit: 200,
        }),
      ]);

      const budgetActions = ["budget.period_reset", "budget.manual_reset", "budget.credit", "budget.exhausted", "budget.reset_reactivated"];
      const keyActions = ["key.provisioned", "key.revoked", "key.regenerated", "key.bulk_revoked"];

      const alertEvents = budgetAlerts.map(a => ({
        type: `alert_${a.thresholdPercent}`,
        timestamp: new Date(a.triggeredAt).toISOString(),
        actionTaken: a.actionTaken,
      }));

      const budgetAuditEvents = auditResult.logs
        .filter(l => budgetActions.includes(l.action))
        .map(l => ({
          type: l.action,
          timestamp: new Date(l.createdAt).toISOString(),
          actorId: l.actorId,
          metadata: l.metadata,
        }));

      const budgetEvents = [...alertEvents, ...budgetAuditEvents]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const keyCurrentState = keys.map(k => ({
        type: k.status === "REVOKED" ? "revoked" : "active",
        keyPrefix: k.keyPrefix,
        timestamp: new Date(k.createdAt).toISOString(),
        lastUsed: k.lastUsedAt ? new Date(k.lastUsedAt).toISOString() : null,
      }));

      const keyAuditEvents = auditResult.logs
        .filter(l => keyActions.includes(l.action))
        .map(l => ({
          type: l.action,
          keyPrefix: (l.metadata as any)?.keyPrefix || null,
          timestamp: new Date(l.createdAt).toISOString(),
          lastUsed: null,
        }));

      const keyEvents = [...keyCurrentState, ...keyAuditEvents]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const recentRequests = proxyLogs.map(l => ({
        timestamp: new Date(l.createdAt).toISOString(),
        model: l.model,
        provider: l.provider,
        inputTokens: l.inputTokens,
        outputTokens: l.outputTokens,
        costCents: l.costCents,
        statusCode: l.statusCode,
        durationMs: l.durationMs,
      }));

      const auditEntries = auditResult.logs
        .filter(l => !budgetActions.includes(l.action) && !keyActions.includes(l.action))
        .map(l => ({
          action: l.action,
          actorId: l.actorId,
          metadata: l.metadata,
          timestamp: new Date(l.createdAt).toISOString(),
        }));

      res.json({ budgetEvents, keyEvents, recentRequests, auditEntries });
    } catch (e: any) {
      console.error("Member activity error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/members/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const result = await cascadeDeleteMember(membership.id, user.id, user.orgId);
      if (!result.success) return res.status(400).json({ message: result.error });

      res.json({ message: "Member removed", deletedCounts: result.deletedCounts });
    } catch (e: any) {
      console.error("Member remove error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/transfer", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const sourceTeam = await storage.getTeam(membership.teamId);
      if (!sourceTeam || sourceTeam.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });

      const schema = z.object({
        targetTeamId: z.string().min(1),
        targetOrgId: z.string().min(1).optional(),
        newBudgetCents: z.number().int().min(100),
        newAllowedModels: z.array(z.string()).nullable().optional(),
        newAllowedProviders: z.array(z.string()).nullable().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { targetTeamId, targetOrgId, newBudgetCents, newAllowedModels, newAllowedProviders } = parsed.data;
      const isCrossOrg = targetOrgId && targetOrgId !== user.orgId;

      if (isCrossOrg) {
        const adminEmail = process.env.ADMIN_EMAIL;
        const isplatformAdmin = adminEmail && user.email === adminEmail;
        if (user.orgRole !== "ROOT_ADMIN" && !isplatformAdmin) return res.status(403).json({ message: "Cross-org transfers require Root Admin of source org" });
        const targetOrg = await storage.getOrganization(targetOrgId);
        if (!targetOrg) return res.status(404).json({ message: "Target organization not found" });
        const targetOrgRootAdmins = await db.select().from(usersTable)
          .where(and(eq(usersTable.orgId, targetOrgId), eq(usersTable.orgRole, "ROOT_ADMIN")));
        const isTargetOrgAdmin = targetOrgRootAdmins.some(a => a.id === user.id);
        if (!isTargetOrgAdmin && !isplatformAdmin) {
          return res.status(403).json({ message: "Cross-org transfers require Root Admin of both orgs or platform super-admin" });
        }
      }

      const targetTeam = await storage.getTeam(targetTeamId);
      if (!targetTeam) return res.status(404).json({ message: "Target team not found" });

      const expectedTargetOrgId = isCrossOrg ? targetOrgId : user.orgId;
      if (targetTeam.orgId !== expectedTargetOrgId) return res.status(400).json({ message: "Target team does not belong to the specified organization" });

      if (targetTeamId === membership.teamId) return res.status(400).json({ message: "Member is already in this team" });

      if (!isCrossOrg && user.orgRole === "TEAM_ADMIN") {
        if (sourceTeam.adminId !== user.id) return res.status(403).json({ message: "You must be admin of the source team" });
        if (targetTeam.adminId !== user.id) return res.status(403).json({ message: "You must be admin of the target team" });
      }

      const memberUser = await storage.getUser(membership.userId);
      if (!memberUser) return res.status(404).json({ message: "Member user not found" });

      const existingKeys = await storage.getApiKeysByMembership(membership.id);
      for (const key of existingKeys) {
        if (key.status === "ACTIVE") {
          await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
          await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
        }
      }

      await redisDel(REDIS_KEYS.budget(membership.id));
      await redisDel(REDIS_KEYS.concurrent(membership.id));
      await redisDel(REDIS_KEYS.ratelimit(membership.id));

      await storage.deleteMembership(membership.id);

      if (isCrossOrg) {
        await storage.updateUser(memberUser.id, { orgId: targetOrgId } as any);
      }

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const newMembership = await storage.createMembership({
        teamId: targetTeamId,
        userId: memberUser.id,
        accessType: "TEAM",
        monthlyBudgetCents: newBudgetCents,
        allowedModels: newAllowedModels || null,
        allowedProviders: newAllowedProviders || null,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd,
        status: "ACTIVE",
      });

      const { key: rawKey, hash, prefix } = generateAllotlyKey();
      await storage.createAllotlyApiKey({
        userId: memberUser.id,
        membershipId: newMembership.id,
        keyHash: hash,
        keyPrefix: prefix,
      });

      await redisSet(REDIS_KEYS.budget(newMembership.id), String(newBudgetCents));

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.transferred",
        targetType: "team_membership",
        targetId: newMembership.id,
        metadata: {
          userId: memberUser.id,
          fromTeamId: membership.teamId,
          fromTeamName: sourceTeam.name,
          toTeamId: targetTeamId,
          toTeamName: targetTeam.name,
          crossOrg: !!isCrossOrg,
          targetOrgId: isCrossOrg ? targetOrgId : undefined,
          newBudgetCents,
          newKeyPrefix: prefix,
        },
      });

      if (isCrossOrg) {
        await storage.createAuditLog({
          orgId: targetOrgId!,
          actorId: user.id,
          action: "member.transferred_in",
          targetType: "team_membership",
          targetId: newMembership.id,
          metadata: {
            userId: memberUser.id,
            fromOrgId: user.orgId,
            toTeamId: targetTeamId,
            toTeamName: targetTeam.name,
            newBudgetCents,
          },
        });
      }

      const targetOrg = isCrossOrg ? await storage.getOrganization(targetOrgId!) : null;
      const emailContent = emailTemplates.memberTransferred(
        memberUser.name || memberUser.email,
        targetTeam.name,
        targetOrg?.name || null,
        !!isCrossOrg
      );
      sendEmail(memberUser.email, emailContent.subject, emailContent.html);

      res.json({
        membership: newMembership,
        apiKey: rawKey,
        keyPrefix: prefix,
        message: `Member transferred to ${targetTeam.name}`,
      });
    } catch (e: any) {
      if (e.code === "23505") {
        return res.status(400).json({ message: "User already has a membership — cannot transfer" });
      }
      console.error("Member transfer error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/change-role", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Only Root Admin can change roles" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });

      const schema = z.object({
        newRole: z.enum(["TEAM_ADMIN", "MEMBER"]),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { newRole } = parsed.data;
      const memberUser = await storage.getUser(membership.userId);
      if (!memberUser) return res.status(404).json({ message: "User not found" });

      if (memberUser.orgRole === newRole) return res.status(400).json({ message: `User is already a ${newRole}` });
      if (memberUser.orgRole === "ROOT_ADMIN") return res.status(400).json({ message: "Cannot change Root Admin role" });

      const oldRole = memberUser.orgRole;
      await storage.updateUser(memberUser.id, { orgRole: newRole } as any);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.role_changed",
        targetType: "user",
        targetId: memberUser.id,
        metadata: { fromRole: oldRole, toRole: newRole, membershipId: membership.id },
      });

      res.json({ message: `Role changed from ${oldRole} to ${newRole}` });
    } catch (e: any) {
      console.error("Change role error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/bulk/suspend", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const schema = z.object({ membershipIds: z.array(z.string().min(1)).min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const results: { membershipId: string; status: string; error?: string }[] = [];

      for (const mid of parsed.data.membershipIds) {
        try {
          const membership = await storage.getMembership(mid);
          if (!membership) { results.push({ membershipId: mid, status: "error", error: "Not found" }); continue; }

          const team = await storage.getTeam(membership.teamId);
          if (!team || team.orgId !== user.orgId) { results.push({ membershipId: mid, status: "error", error: "Not found" }); continue; }
          if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) { results.push({ membershipId: mid, status: "error", error: "Forbidden" }); continue; }

          await storage.updateMembership(mid, { status: "SUSPENDED" });

          const keys = await storage.getApiKeysByMembership(mid);
          for (const key of keys) {
            if (key.status === "ACTIVE") {
              await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
              await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
            }
          }
          await redisDel(REDIS_KEYS.budget(mid));

          await storage.createAuditLog({
            orgId: user.orgId,
            actorId: user.id,
            action: "member.suspended",
            targetType: "team_membership",
            targetId: mid,
            metadata: { bulk: true },
          });

          results.push({ membershipId: mid, status: "suspended" });
        } catch (e: any) {
          results.push({ membershipId: mid, status: "error", error: e.message });
        }
      }

      res.json({ results });
    } catch (e: any) {
      console.error("Bulk suspend error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/bulk/reactivate", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const schema = z.object({ membershipIds: z.array(z.string().min(1)).min(1) });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const results: { membershipId: string; status: string; error?: string; apiKey?: string; keyPrefix?: string }[] = [];

      for (const mid of parsed.data.membershipIds) {
        try {
          const membership = await storage.getMembership(mid);
          if (!membership) { results.push({ membershipId: mid, status: "error", error: "Not found" }); continue; }

          const team = await storage.getTeam(membership.teamId);
          if (!team || team.orgId !== user.orgId) { results.push({ membershipId: mid, status: "error", error: "Not found" }); continue; }
          if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) { results.push({ membershipId: mid, status: "error", error: "Forbidden" }); continue; }

          await storage.updateMembership(mid, { status: "ACTIVE" });

          const { key: rawKey, hash, prefix } = generateAllotlyKey();
          await storage.createAllotlyApiKey({
            userId: membership.userId,
            membershipId: mid,
            keyHash: hash,
            keyPrefix: prefix,
          });

          await redisSet(REDIS_KEYS.budget(mid), String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents));

          await storage.createAuditLog({
            orgId: user.orgId,
            actorId: user.id,
            action: "member.reactivated",
            targetType: "team_membership",
            targetId: mid,
            metadata: { bulk: true, newKeyPrefix: prefix },
          });

          results.push({ membershipId: mid, status: "reactivated", apiKey: rawKey, keyPrefix: prefix });
        } catch (e: any) {
          results.push({ membershipId: mid, status: "error", error: e.message });
        }
      }

      res.json({ results });
    } catch (e: any) {
      console.error("Bulk reactivate error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/bulk/delete", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Only Root Admin can bulk delete" });

      const schema = z.object({
        membershipIds: z.array(z.string().min(1)).min(1),
        confirm: z.literal(true),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error — confirm: true is required", errors: parsed.error.errors });

      const results: { membershipId: string; status: string; error?: string }[] = [];

      for (const mid of parsed.data.membershipIds) {
        try {
          const membership = await storage.getMembership(mid);
          if (!membership) { results.push({ membershipId: mid, status: "error", error: "Not found" }); continue; }

          const team = await storage.getTeam(membership.teamId);
          if (!team || team.orgId !== user.orgId) { results.push({ membershipId: mid, status: "error", error: "Not found" }); continue; }

          const result = await cascadeDeleteMember(mid, user.id, user.orgId);
          if (!result.success) {
            results.push({ membershipId: mid, status: "error", error: result.error });
          } else {
            results.push({ membershipId: mid, status: "deleted" });
          }
        } catch (e: any) {
          results.push({ membershipId: mid, status: "error", error: e.message });
        }
      }

      res.json({ results });
    } catch (e: any) {
      console.error("Bulk delete error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/resend-invite", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const memberUser = await storage.getUser(membership.userId);
      if (!memberUser) return res.status(404).json({ message: "User not found" });
      if (memberUser.status !== "INVITED") return res.status(400).json({ message: "Member has already accepted their invite" });

      const crypto = await import("crypto");
      const rawToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await storage.createPasswordResetToken({ userId: memberUser.id, tokenHash, expiresAt });

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const setupUrl = `${baseUrl}/invite/${rawToken}`;
      const inviteEmail = emailTemplates.memberInvite(
        memberUser.name || memberUser.email,
        team.name,
        user.name || user.email,
        setupUrl
      );
      sendEmail(memberUser.email, inviteEmail.subject, inviteEmail.html);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.invite_resent",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { userId: memberUser.id, email: memberUser.email },
      });

      res.json({ message: "Invite re-sent" });
    } catch (e: any) {
      console.error("Resend invite error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/regenerate-key", requireAuth, regenerateKeyLimiter, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      if (membership.accessType !== "TEAM") {
        return res.status(400).json({ message: "Key regeneration is only available for TEAM members" });
      }

      const existingKeys = await storage.getApiKeysByMembership(membership.id);
      for (const key of existingKeys) {
        if (key.status === "ACTIVE") {
          await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
        }
      }

      const { key: rawKey, hash, prefix } = generateAllotlyKey();
      await storage.createAllotlyApiKey({
        userId: membership.userId,
        membershipId: membership.id,
        keyHash: hash,
        keyPrefix: prefix,
      });

      await redisSet(REDIS_KEYS.budget(membership.id), String(membership.monthlyBudgetCents - membership.currentPeriodSpendCents));

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "key.regenerated",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { memberUserId: membership.userId, keyPrefix: prefix },
      });

      res.json({ apiKey: rawKey, keyPrefix: prefix });
    } catch (e: any) {
      console.error("Key regenerate error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/members/:id/revoke-key", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const membership = await storage.getMembership(req.params.id);
      if (!membership) return res.status(404).json({ message: "Not found" });

      const team = await storage.getTeam(membership.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const existingKeys = await storage.getApiKeysByMembership(membership.id);
      for (const key of existingKeys) {
        if (key.status === "ACTIVE") {
          await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
        }
      }

      await redisDel(REDIS_KEYS.budget(membership.id));

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "key.revoked",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { memberUserId: membership.userId },
      });

      res.json({ message: "Key revoked" });
    } catch (e: any) {
      console.error("Key revoke error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/teams/:teamId/projects", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const team = await storage.getTeam(req.params.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Team not found" });

      const projects = await storage.getProjectsByTeam(team.id);
      res.json(projects);
    } catch (e: any) {
      console.error("List projects error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/teams/:teamId/projects", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const team = await storage.getTeam(req.params.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Team not found" });

      const createProjectSchema = z.object({
        name: z.string().min(1).max(100).trim(),
        description: z.string().max(500).optional(),
      });
      const parsed = createProjectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const existing = await storage.getProjectsByTeam(team.id);
      if (existing.some(p => p.name.toLowerCase() === parsed.data.name.toLowerCase())) {
        return res.status(409).json({ message: "A project with this name already exists in this team" });
      }

      if (existing.length >= 50) {
        return res.status(400).json({ message: "Maximum of 50 projects per team reached" });
      }

      const project = await storage.createProject({
        teamId: team.id,
        name: parsed.data.name,
        description: parsed.data.description || null,
        createdById: user.id,
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "project.created",
        targetType: "project",
        targetId: project.id,
        metadata: { name: project.name, teamId: team.id },
      });

      res.status(201).json(project);
    } catch (e: any) {
      console.error("Create project error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const team = await storage.getTeam(project.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Project not found" });

      const isAdmin = user.orgRole === "ROOT_ADMIN" || (user.orgRole === "TEAM_ADMIN" && team.adminId === user.id);
      if (!isAdmin) return res.status(403).json({ message: "Only team admins can edit projects" });

      const updateProjectSchema = z.object({
        name: z.string().min(1).max(100).trim().optional(),
        description: z.string().max(500).nullable().optional(),
      });
      const parsed = updateProjectSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      if (parsed.data.name) {
        const existing = await storage.getProjectsByTeam(team.id);
        if (existing.some(p => p.id !== project.id && p.name.toLowerCase() === parsed.data.name!.toLowerCase())) {
          return res.status(409).json({ message: "A project with this name already exists in this team" });
        }
      }

      const updated = await storage.updateProject(project.id, parsed.data);
      res.json(updated);
    } catch (e: any) {
      console.error("Update project error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/projects/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const project = await storage.getProject(req.params.id);
      if (!project) return res.status(404).json({ message: "Project not found" });

      const team = await storage.getTeam(project.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Project not found" });

      const isAdmin = user.orgRole === "ROOT_ADMIN" || (user.orgRole === "TEAM_ADMIN" && team.adminId === user.id);
      if (!isAdmin) return res.status(403).json({ message: "Only team admins can delete projects" });

      const activeKeys = await storage.getActiveKeyCountByProject(project.id);
      if (activeKeys > 0) {
        return res.status(400).json({ message: `Cannot delete project with ${activeKeys} active key(s). Revoke them first.` });
      }

      await storage.deleteProject(project.id);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "project.deleted",
        targetType: "project",
        targetId: project.id,
        metadata: { name: project.name, teamId: team.id },
      });

      res.json({ message: "Project deleted" });
    } catch (e: any) {
      console.error("Delete project error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/me/keys", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const membership = await storage.getMembershipByUser(user.id);
      if (!membership) return res.status(404).json({ message: "No active membership found" });
      if (membership.status !== "ACTIVE") return res.status(400).json({ message: "Membership is not active" });

      const activeCount = await storage.getActiveKeyCountByMembership(membership.id);
      if (activeCount >= 10) {
        return res.status(400).json({ message: "Maximum of 10 active API keys per membership. Revoke an existing key first." });
      }

      const createKeySchema = z.object({
        projectId: z.string().optional(),
        newProjectName: z.string().min(1).max(100).trim().optional(),
      }).refine(data => !(data.projectId && data.newProjectName), {
        message: "Provide either projectId or newProjectName, not both",
      });
      const parsed = createKeySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      let projectId: string | undefined;

      if (parsed.data.projectId) {
        const project = await storage.getProject(parsed.data.projectId);
        if (!project || project.teamId !== membership.teamId) {
          return res.status(400).json({ message: "Project not found in your team" });
        }
        projectId = project.id;
      } else if (parsed.data.newProjectName) {
        const existing = await storage.getProjectsByTeam(membership.teamId);
        const dup = existing.find(p => p.name.toLowerCase() === parsed.data.newProjectName!.toLowerCase());
        if (dup) {
          projectId = dup.id;
        } else {
          if (existing.length >= 50) {
            return res.status(400).json({ message: "Maximum of 50 projects per team reached" });
          }
          const newProject = await storage.createProject({
            teamId: membership.teamId,
            name: parsed.data.newProjectName,
            createdById: user.id,
          });
          projectId = newProject.id;
        }
      }

      const { key: rawKey, hash, prefix } = generateAllotlyKey();
      const apiKey = await storage.createAllotlyApiKey({
        userId: user.id,
        membershipId: membership.id,
        keyHash: hash,
        keyPrefix: prefix,
        projectId,
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "key.created_self_service",
        targetType: "allotly_api_key",
        targetId: apiKey.id,
        metadata: { keyPrefix: prefix, projectId: projectId || null },
      });

      const projectName = projectId ? (await storage.getProject(projectId))?.name : null;

      res.status(201).json({
        apiKey: rawKey,
        keyPrefix: prefix,
        keyId: apiKey.id,
        projectId: projectId || null,
        projectName: projectName || null,
      });
    } catch (e: any) {
      console.error("Create project key error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/me/keys", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const membership = await storage.getMembershipByUser(user.id);
      if (!membership) return res.status(404).json({ message: "No active membership found" });

      const keys = await storage.getApiKeysByMembership(membership.id);
      const activeKeys = keys.filter(k => k.status === "ACTIVE");

      const teamProjects = await storage.getProjectsByTeam(membership.teamId);
      const projectMap = new Map(teamProjects.map(p => [p.id, p.name]));

      const result = activeKeys.map(k => ({
        id: k.id,
        keyPrefix: k.keyPrefix,
        projectId: k.projectId,
        projectName: k.projectId ? (projectMap.get(k.projectId) || null) : null,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }));

      res.json(result);
    } catch (e: any) {
      console.error("List my keys error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/me/keys/:keyId", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });

      const membership = await storage.getMembershipByUser(user.id);
      if (!membership) return res.status(404).json({ message: "No active membership found" });

      const keys = await storage.getApiKeysByMembership(membership.id);
      const key = keys.find(k => k.id === req.params.keyId && k.status === "ACTIVE");
      if (!key) return res.status(404).json({ message: "Key not found or already revoked" });

      await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });

      const { redisDel: redisDelKey, REDIS_KEYS: redisKeys } = await import("./lib/redis");
      await redisDelKey(redisKeys.apiKeyCache(key.keyHash));

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "key.revoked_self_service",
        targetType: "allotly_api_key",
        targetId: key.id,
        metadata: { keyPrefix: key.keyPrefix, projectId: key.projectId || null },
      });

      res.json({ message: "Key revoked" });
    } catch (e: any) {
      console.error("Revoke my key error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/teams/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const team = await storage.getTeam(req.params.id);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const editSchema = z.object({
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
      });
      const parsed = editSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      if (parsed.data.name && parsed.data.name !== team.name) {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const duplicate = orgTeams.find(t => t.name.toLowerCase() === parsed.data.name!.toLowerCase() && t.id !== team.id);
        if (duplicate) return res.status(409).json({ message: "A team with that name already exists" });
      }

      const before = { name: team.name, description: team.description };
      const updated = await storage.updateTeam(team.id, parsed.data);
      const after = { name: updated?.name, description: updated?.description };

      const changes: Record<string, { from: any; to: any }> = {};
      for (const key of Object.keys(parsed.data) as Array<keyof typeof before>) {
        if (before[key] !== after[key]) {
          changes[key] = { from: before[key], to: after[key] };
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "team.updated",
        targetType: "team",
        targetId: team.id,
        metadata: { changes },
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Team update error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/teams/:id", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { confirmName } = req.body || {};
      if (!confirmName) return res.status(400).json({ message: "Confirmation name is required" });

      const team = await storage.getTeam(req.params.id);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });

      const result = await cascadeDeleteTeam(team.id, confirmName, user.id, user.orgId);
      if (!result.success) return res.status(400).json({ message: result.error });

      res.json({ message: "Team deleted", deletedCounts: result.deletedCounts });
    } catch (e: any) {
      console.error("Team delete error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/teams/:id/stats", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const team = await storage.getTeam(req.params.id);
    if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });
    if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });
    if (user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

    const memberships = await storage.getMembershipsByTeam(team.id);
    const admin = await storage.getUser(team.adminId);
    const totalSpend = memberships.reduce((sum, m) => sum + m.currentPeriodSpendCents, 0);
    const totalBudget = memberships.reduce((sum, m) => sum + m.monthlyBudgetCents, 0);

    res.json({
      memberCount: memberships.length,
      adminName: admin?.name || admin?.email,
      adminEmail: admin?.email,
      totalSpendCents: totalSpend,
      totalBudgetCents: totalBudget,
    });
  });

  const CRON_SECRET = process.env.NODE_ENV === "production"
    ? process.env.CRON_SECRET
    : (process.env.CRON_SECRET || "allotly-cron-dev-secret");

  function requireCronAuth(req: any, res: any, next: any) {
    if (!CRON_SECRET) {
      return res.status(503).json({ message: "CRON_SECRET not configured" });
    }
    const token = req.headers["x-cron-secret"] || req.query.secret;
    if (token !== CRON_SECRET) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  }

  app.post("/api/cron/budget-reset", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual budget reset triggered");
      const result = await runBudgetReset();
      res.json({ message: "Budget reset completed", ...result });
    } catch (e: any) {
      console.error("[cron] Budget reset error:", e);
      res.status(500).json({ message: "Budget reset failed", error: e.message });
    }
  });

  app.post("/api/cron/voucher-expiry", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual voucher expiry triggered");
      const result = await runVoucherExpiry();
      res.json({ message: "Voucher expiry completed", ...result });
    } catch (e: any) {
      console.error("[cron] Voucher expiry error:", e);
      res.status(500).json({ message: "Voucher expiry failed", error: e.message });
    }
  });

  app.post("/api/cron/bundle-expiry", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual bundle expiry triggered");
      const result = await runBundleExpiry();
      res.json({ message: "Bundle expiry completed", ...result });
    } catch (e: any) {
      console.error("[cron] Bundle expiry error:", e);
      res.status(500).json({ message: "Bundle expiry failed", error: e.message });
    }
  });

  app.post("/api/cron/redis-reconciliation", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual Redis reconciliation triggered");
      const result = await runRedisReconciliation();
      res.json({ message: "Redis reconciliation completed", ...result });
    } catch (e: any) {
      console.error("[cron] Redis reconciliation error:", e);
      res.status(500).json({ message: "Redis reconciliation failed", error: e.message });
    }
  });

  app.post("/api/cron/provider-validation", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual provider validation triggered");
      await runProviderValidation();
      res.json({ message: "Provider validation completed" });
    } catch (e: any) {
      console.error("[cron] Provider validation error:", e);
      res.status(500).json({ message: "Provider validation failed", error: e.message });
    }
  });

  app.post("/api/cron/snapshot-cleanup", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual snapshot cleanup triggered");
      await runSnapshotCleanup();
      res.json({ message: "Snapshot cleanup completed" });
    } catch (e: any) {
      console.error("[cron] Snapshot cleanup error:", e);
      res.status(500).json({ message: "Snapshot cleanup failed", error: e.message });
    }
  });

  app.post("/api/cron/spend-anomaly", requireCronAuth, async (_req, res) => {
    try {
      console.log("[cron] Manual spend anomaly check triggered");
      await runSpendAnomalyCheck();
      res.json({ message: "Spend anomaly check completed" });
    } catch (e: any) {
      console.error("[cron] Spend anomaly error:", e);
      res.status(500).json({ message: "Spend anomaly check failed", error: e.message });
    }
  });

  app.get("/api/cron/status", requireCronAuth, async (_req, res) => {
    res.json({
      jobs: [
        { name: "budget-reset", description: "Resets expired budget periods", intervalMinutes: 60 },
        { name: "voucher-expiry", description: "Expires vouchers and revokes keys", intervalMinutes: 60 },
        { name: "bundle-expiry", description: "Expires bundles and associated vouchers", intervalMinutes: 60 },
        { name: "redis-reconciliation", description: "Syncs Redis budget with Postgres", intervalSeconds: 60 },
        { name: "concurrency-self-heal", description: "Resets stale concurrency counters", intervalSeconds: 30 },
        { name: "provider-validation", description: "Re-validates all admin API keys", intervalHours: 24 },
        { name: "snapshot-cleanup", description: "Deletes old usage data per retention policy", intervalDays: 7 },
        { name: "spend-anomaly", description: "Detects unusual spending patterns", intervalMinutes: 60 },
      ],
      status: "running",
    });
  });

  app.get("/api/vouchers", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.orgRole === "ROOT_ADMIN") {
      const orgVouchers = await storage.getVouchersByOrg(user.orgId);
      res.json(orgVouchers);
    } else if (user.orgRole === "TEAM_ADMIN") {
      const team = await storage.getTeamByAdmin(user.id);
      if (!team) return res.json([]);
      const teamVouchers = await storage.getVouchersByTeam(team.id);
      res.json(teamVouchers);
    } else {
      res.json([]);
    }
  });

  app.get("/api/voucher-limits", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const org = await storage.getOrganization(user.orgId);
    if (!org) return res.status(404).json({ message: "Organization not found" });

    const plan = org.plan;
    const activeCount = user.orgRole === "ROOT_ADMIN"
      ? await storage.getActiveVoucherCountByOrg(user.orgId)
      : await storage.getActiveVoucherCountByCreator(user.id);

    if (plan === "FREE") {
      res.json({
        plan: "FREE",
        limits: VOUCHER_LIMITS.FREE,
        activeVouchers: activeCount,
        remainingCodes: Math.max(0, VOUCHER_LIMITS.FREE.maxActiveCodes - activeCount),
      });
    } else {
      res.json({
        plan: "TEAM",
        limits: VOUCHER_LIMITS.TEAM,
        activeVouchers: activeCount,
        remainingCodes: Math.max(0, VOUCHER_LIMITS.TEAM.maxActiveCodesPerAdmin - activeCount),
      });
    }
  });

  app.post("/api/vouchers", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const createVoucherSchema = z.object({
        label: z.string().optional(),
        budgetCents: z.number().int().min(100),
        allowedProviders: z.array(z.string()).min(1),
        allowedModels: z.array(z.string()).nullable().optional(),
        expiresAt: z.string(),
        maxRedemptions: z.number().int().min(1).optional(),
        teamId: z.string().optional(),
        bundleId: z.string().optional(),
      });
      const parsed = createVoucherSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const { label, budgetCents, allowedProviders, allowedModels, expiresAt, maxRedemptions, teamId, bundleId } = parsed.data;

      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      let targetTeamId = teamId;
      if (user.orgRole === "TEAM_ADMIN") {
        const team = await storage.getTeamByAdmin(user.id);
        if (!team) return res.status(400).json({ message: "No team found" });
        targetTeamId = team.id;
      } else if (user.orgRole === "ROOT_ADMIN" && targetTeamId) {
        const team = await storage.getTeam(targetTeamId);
        if (!team || team.orgId !== user.orgId) return res.status(400).json({ message: "Team not found in your organization" });
      }

      if (!targetTeamId) {
        return res.status(400).json({ message: "Team is required" });
      }

      if (bundleId) {
        const bundle = await storage.getVoucherBundle(bundleId);
        if (!bundle || bundle.orgId !== user.orgId) {
          return res.status(400).json({ message: "Bundle not found" });
        }
        if (bundle.status !== "ACTIVE") {
          return res.status(400).json({ message: "Bundle is no longer active" });
        }
        if (new Date(bundle.expiresAt) < new Date()) {
          return res.status(400).json({ message: "Bundle has expired" });
        }

        const bundleVouchers = await storage.getVouchersByBundle(bundleId);
        if (bundleVouchers.length >= VOUCHER_LIMITS.BUNDLE.maxCodesPerBundle) {
          return res.status(400).json({ message: `Maximum ${VOUCHER_LIMITS.BUNDLE.maxCodesPerBundle} codes per bundle reached` });
        }

        if (budgetCents > VOUCHER_LIMITS.BUNDLE.maxBudgetPerRecipientCents) {
          return res.status(400).json({ message: `Budget per recipient cannot exceed $${(VOUCHER_LIMITS.BUNDLE.maxBudgetPerRecipientCents / 100).toFixed(0)} for bundle vouchers` });
        }

        const totalUsedRedemptions = bundleVouchers.reduce((sum, v) => sum + (v.maxRedemptions || 0), 0);
        const requestedRedemptions = maxRedemptions || 1;
        if (totalUsedRedemptions + requestedRedemptions > bundle.totalRedemptions) {
          return res.status(400).json({ message: `Only ${bundle.totalRedemptions - totalUsedRedemptions} redemptions remaining in this bundle` });
        }

        const requestedExpiry = new Date(expiresAt);
        if (requestedExpiry > new Date(bundle.expiresAt)) {
          return res.status(400).json({ message: "Voucher cannot expire after the bundle expiry date" });
        }
      } else {
        const plan = org.plan;
        const limits = plan === "FREE" ? VOUCHER_LIMITS.FREE : VOUCHER_LIMITS.TEAM;

        const activeCount = user.orgRole === "ROOT_ADMIN"
          ? await storage.getActiveVoucherCountByOrg(user.orgId)
          : await storage.getActiveVoucherCountByCreator(user.id);

        const maxCodes = plan === "FREE" ? VOUCHER_LIMITS.FREE.maxActiveCodes : VOUCHER_LIMITS.TEAM.maxActiveCodesPerAdmin;
        if (activeCount >= maxCodes) {
          return res.status(400).json({ message: `Maximum ${maxCodes} active voucher code${maxCodes === 1 ? '' : 's'} for your plan` });
        }

        if (budgetCents > limits.maxBudgetPerRecipientCents) {
          return res.status(400).json({ message: `Budget per recipient cannot exceed $${(limits.maxBudgetPerRecipientCents / 100).toFixed(0)} on the ${plan} plan` });
        }

        const maxRedemptionLimit = plan === "FREE" ? VOUCHER_LIMITS.FREE.maxRedemptionsPerCode : VOUCHER_LIMITS.TEAM.maxRedemptionsPerCode;
        if ((maxRedemptions || 1) > maxRedemptionLimit) {
          return res.status(400).json({ message: `Maximum ${maxRedemptionLimit} redemptions per code on the ${plan} plan` });
        }

        const maxDays = plan === "FREE" ? VOUCHER_LIMITS.FREE.maxExpiryDays : VOUCHER_LIMITS.TEAM.maxExpiryDays;
        const requestedExpiry = new Date(expiresAt);
        const maxExpiry = new Date();
        maxExpiry.setDate(maxExpiry.getDate() + maxDays);
        if (requestedExpiry > maxExpiry) {
          return res.status(400).json({ message: `Maximum expiry is ${maxDays} day${maxDays === 1 ? '' : 's'} on the ${plan} plan` });
        }
      }

      let code = generateVoucherCode();
      let existingCode = await storage.getVoucherByCode(code);
      let attempts = 0;
      while (existingCode && attempts < 10) {
        code = generateVoucherCode();
        existingCode = await storage.getVoucherByCode(code);
        attempts++;
      }
      if (existingCode) {
        return res.status(500).json({ message: "Failed to generate unique voucher code. Please try again." });
      }

      const voucher = await storage.createVoucher({
        code,
        orgId: user.orgId,
        teamId: targetTeamId,
        createdById: user.id,
        bundleId: bundleId || null,
        label: label || null,
        budgetCents,
        allowedProviders,
        allowedModels: allowedModels || null,
        expiresAt: new Date(expiresAt),
        maxRedemptions: maxRedemptions || 1,
        currentRedemptions: 0,
        status: "ACTIVE",
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.created",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code, budgetCents, maxRedemptions: maxRedemptions || 1, bundleId: bundleId || null },
      });

      res.json(voucher);
    } catch (e: any) {
      console.error("Voucher create error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/vouchers/:id/revoke", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can revoke vouchers" });
      }

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (!adminTeam || voucher.teamId !== adminTeam.id) {
          return res.status(403).json({ message: "You can only revoke vouchers for your own team" });
        }
      }

      if (voucher.status === "REVOKED") {
        return res.status(400).json({ message: "Voucher is already revoked" });
      }

      if (voucher.status === "EXPIRED") {
        return res.status(400).json({ message: "Voucher is already expired" });
      }

      const updated = await storage.updateVoucher(voucher.id, { status: "REVOKED" });

      const memberships = await storage.getMembershipsByVoucherId(voucher.id);
      for (const membership of memberships) {
        await storage.updateMembership(membership.id, { status: "SUSPENDED" });
        const keys = await storage.getApiKeysByMembership(membership.id);
        for (const key of keys) {
          if (key.status === "ACTIVE") {
            await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
            await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
          }
        }
        await redisDel(REDIS_KEYS.budget(membership.id));
        await redisDel(REDIS_KEYS.concurrent(membership.id));
        await redisDel(REDIS_KEYS.ratelimit(membership.id));
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.revoked",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code: voucher.code, membershipsRevoked: memberships.length },
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Voucher revoke error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/vouchers/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can edit vouchers" });
      }

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (!adminTeam || voucher.teamId !== adminTeam.id) {
          return res.status(403).json({ message: "You can only edit vouchers for your own team" });
        }
      }

      if (voucher.status !== "ACTIVE") {
        return res.status(400).json({ message: `Cannot edit a ${voucher.status.toLowerCase()} voucher` });
      }

      if (voucher.currentRedemptions > 0) {
        return res.status(400).json({ message: "Cannot edit a voucher that has already been redeemed" });
      }

      const editSchema = z.object({
        label: z.string().max(200).nullable().optional(),
        budgetCents: z.number().int().min(100).optional(),
        expiresAt: z.string().datetime().optional(),
        allowedProviders: z.array(z.string()).optional(),
        allowedModels: z.array(z.string()).nullable().optional(),
        maxRedemptions: z.number().int().min(1).optional(),
      });
      const parsed = editSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const before = {
        label: voucher.label,
        budgetCents: voucher.budgetCents,
        expiresAt: voucher.expiresAt,
        allowedProviders: voucher.allowedProviders,
        allowedModels: voucher.allowedModels,
        maxRedemptions: voucher.maxRedemptions,
      };

      if (parsed.data.expiresAt) {
        const expiryDate = new Date(parsed.data.expiresAt);
        if (expiryDate <= new Date()) {
          return res.status(400).json({ message: "Expiry date must be in the future" });
        }
      }

      const updateData: Record<string, any> = {};
      if (parsed.data.label !== undefined) updateData.label = parsed.data.label;
      if (parsed.data.budgetCents !== undefined) updateData.budgetCents = parsed.data.budgetCents;
      if (parsed.data.expiresAt !== undefined) updateData.expiresAt = new Date(parsed.data.expiresAt);
      if (parsed.data.allowedProviders !== undefined) updateData.allowedProviders = parsed.data.allowedProviders;
      if (parsed.data.allowedModels !== undefined) updateData.allowedModels = parsed.data.allowedModels;
      if (parsed.data.maxRedemptions !== undefined) updateData.maxRedemptions = parsed.data.maxRedemptions;

      const updated = await storage.updateVoucher(voucher.id, updateData);

      const changes: Record<string, { from: any; to: any }> = {};
      for (const key of Object.keys(parsed.data)) {
        const bKey = key as keyof typeof before;
        const fromVal = before[bKey];
        const toVal = (updated as any)?.[bKey];
        if (JSON.stringify(fromVal) !== JSON.stringify(toVal)) {
          changes[key] = { from: fromVal, to: toVal };
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.updated",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { changes, code: voucher.code },
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Voucher update error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/vouchers/:id", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN")) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const voucher = await storage.getVoucher(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });

      if (user.orgRole === "TEAM_ADMIN") {
        const team = await storage.getTeam(voucher.teamId);
        if (!team || team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });
      }

      const result = await cascadeDeleteVoucher(voucher.id, user.id, user.orgId);
      if (!result.success) return res.status(400).json({ message: result.error });

      res.json({ message: "Voucher deleted", deletedCounts: result.deletedCounts });
    } catch (e: any) {
      console.error("Voucher delete error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/vouchers/send-email", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });

      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can send voucher emails" });
      }

      const sendSchema = z.object({
        email: z.string().email(),
        code: z.string().min(1),
      });
      const parsed = sendSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { email: recipientEmail, code } = parsed.data;

      const voucher = await storage.getVoucherByCode(code.toUpperCase());
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (voucher.status !== "ACTIVE") {
        return res.status(400).json({ message: "Voucher is not active" });
      }

      if (new Date(voucher.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Voucher has expired" });
      }

      const org = await storage.getOrganization(user.orgId);
      const redeemUrl = `${req.protocol}://${req.get("host")}/redeem?code=${encodeURIComponent(code)}`;

      const emailSubject = `You've received an AI API voucher from ${org?.name || "Allotly"}`;
      const emailHtml = `
        <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
          <h2>You've received an AI API voucher!</h2>
          <p>${user.name || "An admin"} from <strong>${org?.name || "an organization"}</strong> has sent you a voucher for AI API access.</p>
          <div style="background: #f3f4f6; border-radius: 8px; padding: 16px; text-align: center; margin: 16px 0;">
            <p style="font-family: monospace; font-size: 20px; letter-spacing: 2px; margin: 0;">${code}</p>
          </div>
          <p>Budget: <strong>$${(voucher.budgetCents / 100).toFixed(2)}</strong></p>
          <p>Expires: <strong>${new Date(voucher.expiresAt).toLocaleDateString()}</strong></p>
          <a href="${redeemUrl}" style="display: inline-block; background: #6366f1; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 8px;">Redeem Voucher</a>
        </div>
      `;

      await sendEmail(recipientEmail, emailSubject, emailHtml);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.emailed",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code, recipientEmail },
      });

      res.json({ success: true });
    } catch (e: any) {
      console.error("Voucher send email error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/vouchers/bulk-create", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can create vouchers" });
      }

      const bulkSchema = z.object({
        count: z.number().int().min(1).max(500),
        budgetCents: z.number().int().min(1),
        expiresAt: z.string(),
        allowedModels: z.array(z.string()).nullable().optional(),
        allowedProviders: z.array(z.string()).optional(),
        bundleId: z.string().optional(),
        teamId: z.string().optional(),
        label: z.string().max(200).optional(),
      });
      const parsed = bulkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { count, budgetCents, expiresAt, allowedModels, allowedProviders, bundleId, teamId, label } = parsed.data;

      const expiryDate = new Date(expiresAt);
      if (expiryDate <= new Date()) {
        return res.status(400).json({ message: "Expiry date must be in the future" });
      }

      const orgTeams = await storage.getTeamsByOrg(user.orgId);
      let targetTeamId = teamId;
      if (!targetTeamId) {
        if (user.orgRole === "TEAM_ADMIN") {
          const adminTeam = orgTeams.find(t => t.adminId === user.id);
          if (!adminTeam) return res.status(403).json({ message: "You don't administer any team" });
          targetTeamId = adminTeam.id;
        } else {
          if (orgTeams.length === 0) return res.status(400).json({ message: "No teams in this organization" });
          targetTeamId = orgTeams[0].id;
        }
      }

      if (user.orgRole === "TEAM_ADMIN") {
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (!adminTeam || targetTeamId !== adminTeam.id) {
          return res.status(403).json({ message: "You can only create vouchers for your own team" });
        }
      }

      const codes = new Set<string>();
      while (codes.size < count) {
        codes.add(generateVoucherCode());
      }

      const voucherData = Array.from(codes).map(code => ({
        code,
        orgId: user.orgId!,
        teamId: targetTeamId!,
        createdById: user.id,
        budgetCents,
        allowedProviders: allowedProviders || ["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"],
        allowedModels: allowedModels || null,
        expiresAt: expiryDate,
        maxRedemptions: 1,
        label: label || null,
        bundleId: bundleId || null,
      }));

      const created = await storage.bulkCreateVouchers(voucherData);

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.bulk_created",
        targetType: "voucher",
        targetId: created[0]?.id || "bulk",
        metadata: { count: created.length, budgetCents, expiresAt, label: label || null, bundleId: bundleId || null },
      });

      res.json({
        vouchers: created.map(v => ({ id: v.id, code: v.code, budgetCents: v.budgetCents, expiresAt: v.expiresAt })),
      });
    } catch (e: any) {
      console.error("Voucher bulk create error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/vouchers/:id/extend", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can extend vouchers" });
      }

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (!adminTeam || voucher.teamId !== adminTeam.id) {
          return res.status(403).json({ message: "You can only extend vouchers for your own team" });
        }
      }

      if (voucher.status === "EXPIRED") {
        return res.status(400).json({ message: "Cannot extend an expired voucher" });
      }
      if (voucher.status === "REVOKED") {
        return res.status(400).json({ message: "Cannot extend a revoked voucher" });
      }

      const extendSchema = z.object({
        newExpiresAt: z.string(),
      });
      const parsed = extendSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const newExpiry = new Date(parsed.data.newExpiresAt);
      if (newExpiry <= new Date()) {
        return res.status(400).json({ message: "New expiry date must be in the future" });
      }
      if (newExpiry <= new Date(voucher.expiresAt)) {
        return res.status(400).json({ message: "New expiry date must be after the current expiry date" });
      }

      const oldExpiresAt = voucher.expiresAt;
      const updated = await storage.updateVoucher(voucher.id, { expiresAt: newExpiry });

      const memberships = await storage.getMembershipsByVoucherId(voucher.id);
      for (const membership of memberships) {
        await storage.updateMembership(membership.id, {
          voucherExpiresAt: newExpiry,
          periodEnd: newExpiry,
        });
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.extended",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code: voucher.code, from: oldExpiresAt, to: newExpiry.toISOString() },
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Voucher extend error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/vouchers/:id/top-up", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can top up vouchers" });
      }

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (!adminTeam || voucher.teamId !== adminTeam.id) {
          return res.status(403).json({ message: "You can only top up vouchers for your own team" });
        }
      }

      if (voucher.status === "EXPIRED") {
        return res.status(400).json({ message: "Cannot top up an expired voucher" });
      }
      if (voucher.status === "REVOKED") {
        return res.status(400).json({ message: "Cannot top up a revoked voucher" });
      }

      const topUpSchema = z.object({
        additionalBudgetCents: z.number().int().min(1),
      });
      const parsed = topUpSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const { additionalBudgetCents } = parsed.data;
      const oldBudget = voucher.budgetCents;
      const newBudget = oldBudget + additionalBudgetCents;

      const updated = await storage.updateVoucher(voucher.id, { budgetCents: newBudget });

      const memberships = await storage.getMembershipsByVoucherId(voucher.id);
      for (const membership of memberships) {
        const newMemberBudget = (membership.monthlyBudgetCents || 0) + additionalBudgetCents;
        await storage.updateMembership(membership.id, {
          monthlyBudgetCents: newMemberBudget,
        });

        const budgetKey = REDIS_KEYS.budget(membership.id);
        const currentBudget = await redisGet(budgetKey);
        if (currentBudget !== null) {
          await redisSet(budgetKey, String(parseInt(currentBudget) + additionalBudgetCents));
        } else {
          const remaining = newMemberBudget - (membership.currentPeriodSpendCents || 0);
          await redisSet(budgetKey, String(remaining));
        }

        if (membership.status === "BUDGET_EXHAUSTED") {
          await storage.updateMembership(membership.id, { status: "ACTIVE" });
          const keys = await storage.getApiKeysByMembership(membership.id);
          for (const key of keys) {
            if (key.status === "REVOKED") {
              await storage.updateAllotlyApiKey(key.id, { status: "ACTIVE" });
              await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
            }
          }
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.topped_up",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code: voucher.code, from: oldBudget, to: newBudget, added: additionalBudgetCents },
      });

      res.json(updated);
    } catch (e: any) {
      console.error("Voucher top-up error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/vouchers/export", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can export vouchers" });
      }

      const { status, bundleId, createdAfter, createdBefore } = req.query as Record<string, string>;
      const validStatuses = ["all", "ACTIVE", "FULLY_REDEEMED", "EXPIRED", "REVOKED"];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid status filter" });
      }
      let voucherList = await storage.getVouchersFiltered(user.orgId, {
        status, bundleId, createdAfter, createdBefore,
      });

      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (adminTeam) {
          voucherList = voucherList.filter(v => v.teamId === adminTeam.id);
        } else {
          voucherList = [];
        }
      }

      const allRedemptions: Record<string, any[]> = {};
      const allMemberships: Record<string, any[]> = {};
      for (const v of voucherList) {
        const redemptions = await storage.getVoucherRedemptionsByVoucherId(v.id);
        allRedemptions[v.id] = redemptions;
        const memberships = await storage.getMembershipsByVoucherId(v.id);
        allMemberships[v.id] = memberships;
      }

      const csvHeader = "code,status,budgetCents,spentCents,remainingCents,expiresAt,redeemedBy,redeemedAt,createdAt,bundleId";
      const csvRows = voucherList.map(v => {
        const redemptions = allRedemptions[v.id] || [];
        const memberships = allMemberships[v.id] || [];
        const totalSpent = memberships.reduce((sum: number, m: any) => sum + (m.currentPeriodSpendCents || 0), 0);
        const remaining = Math.max(0, v.budgetCents - totalSpent);
        const redeemedBy = redemptions.map((r: any) => r.user?.email || "anonymous").join("; ") || "";
        const redeemedAt = redemptions.length > 0 ? new Date(redemptions[0].redeemedAt).toISOString() : "";
        const escapeCsv = (val: string) => val.includes(",") || val.includes('"') ? `"${val.replace(/"/g, '""')}"` : val;
        return [
          v.code,
          v.status,
          v.budgetCents,
          totalSpent,
          remaining,
          new Date(v.expiresAt).toISOString(),
          escapeCsv(redeemedBy),
          redeemedAt,
          new Date(v.createdAt).toISOString(),
          v.bundleId || "",
        ].join(",");
      });

      const csv = [csvHeader, ...csvRows].join("\n");
      const dateStr = new Date().toISOString().split("T")[0];
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="allotly-vouchers-${dateStr}.csv"`);
      res.send(csv);
    } catch (e: any) {
      console.error("Voucher export error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/vouchers/bulk/revoke", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can revoke vouchers" });
      }

      const bulkRevokeSchema = z.object({
        voucherIds: z.array(z.string()).min(1).max(500),
      });
      const parsed = bulkRevokeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      let adminTeamId: string | null = null;
      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        adminTeamId = adminTeam?.id || null;
      }

      const results: { id: string; success: boolean; error?: string }[] = [];

      for (const voucherId of parsed.data.voucherIds) {
        try {
          const voucher = await storage.getVoucherById(voucherId);
          if (!voucher || voucher.orgId !== user.orgId) {
            results.push({ id: voucherId, success: false, error: "Not found" });
            continue;
          }

          if (user.orgRole === "TEAM_ADMIN" && voucher.teamId !== adminTeamId) {
            results.push({ id: voucherId, success: false, error: "Not authorized" });
            continue;
          }

          if (voucher.status === "REVOKED") {
            results.push({ id: voucherId, success: false, error: "Already revoked" });
            continue;
          }

          if (voucher.status === "EXPIRED") {
            results.push({ id: voucherId, success: false, error: "Already expired" });
            continue;
          }

          await storage.updateVoucher(voucher.id, { status: "REVOKED" });

          const memberships = await storage.getMembershipsByVoucherId(voucher.id);
          for (const membership of memberships) {
            await storage.updateMembership(membership.id, { status: "SUSPENDED" });
            const keys = await storage.getApiKeysByMembership(membership.id);
            for (const key of keys) {
              if (key.status === "ACTIVE") {
                await storage.updateAllotlyApiKey(key.id, { status: "REVOKED" });
                await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
              }
            }
            await redisDel(REDIS_KEYS.budget(membership.id));
            await redisDel(REDIS_KEYS.concurrent(membership.id));
            await redisDel(REDIS_KEYS.ratelimit(membership.id));
          }

          results.push({ id: voucherId, success: true });
        } catch (err: any) {
          results.push({ id: voucherId, success: false, error: err.message });
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.bulk_revoked",
        targetType: "voucher",
        targetId: "bulk",
        metadata: {
          total: parsed.data.voucherIds.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length,
        },
      });

      res.json({ results });
    } catch (e: any) {
      console.error("Voucher bulk revoke error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/vouchers/:id/details", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || !user.orgId) return res.status(403).json({ message: "Not authorized" });
      if (user.orgRole !== "ROOT_ADMIN" && user.orgRole !== "TEAM_ADMIN") {
        return res.status(403).json({ message: "Only admins can view voucher details" });
      }

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (user.orgRole === "TEAM_ADMIN") {
        const orgTeams = await storage.getTeamsByOrg(user.orgId);
        const adminTeam = orgTeams.find(t => t.adminId === user.id);
        if (!adminTeam || voucher.teamId !== adminTeam.id) {
          return res.status(403).json({ message: "You can only view details for your own team's vouchers" });
        }
      }

      const redemptions = await storage.getVoucherRedemptionsByVoucherId(voucher.id);
      const memberships = await storage.getMembershipsByVoucherId(voucher.id);

      const details = [];
      for (const redemption of redemptions) {
        const membership = memberships.find(m => m.userId === redemption.userId);
        let keyPrefix = "";
        let requestsMade = 0;
        let lastRequestAt: string | null = null;
        let currentSpend = 0;

        if (membership) {
          const keys = await storage.getApiKeysByMembership(membership.id);
          const activeKey = keys.find(k => k.status === "ACTIVE") || keys[0];
          keyPrefix = activeKey?.keyPrefix || "";
          currentSpend = membership.currentPeriodSpendCents || 0;

          const allLogs = await storage.getProxyRequestLogsByMembership(membership.id, 10000);
          requestsMade = allLogs.length;
          if (allLogs.length > 0) {
            lastRequestAt = new Date(allLogs[0].createdAt).toISOString();
          }
        }

        details.push({
          redeemedBy: redemption.user?.email || "anonymous",
          redeemedAt: new Date(redemption.redeemedAt).toISOString(),
          keyPrefix,
          currentSpendCents: currentSpend,
          requestsMade,
          lastRequestAt,
          membershipStatus: membership?.status || "unknown",
        });
      }

      res.json({ voucher, details });
    } catch (e: any) {
      console.error("Voucher details error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/vouchers/validate/:code", async (req, res) => {
    const voucher = await storage.getVoucherByCode(req.params.code.toUpperCase());
    if (!voucher) {
      return res.status(404).json({ message: "Voucher not found" });
    }

    if (voucher.status !== "ACTIVE") {
      return res.status(400).json({ message: `Voucher is ${voucher.status.toLowerCase()}` });
    }

    if (new Date(voucher.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Voucher has expired" });
    }

    if (voucher.currentRedemptions >= voucher.maxRedemptions) {
      return res.status(400).json({ message: "Voucher is fully redeemed" });
    }

    if (voucher.bundleId) {
      const bundle = await storage.getVoucherBundle(voucher.bundleId);
      if (!bundle || bundle.status !== "ACTIVE") {
        return res.status(400).json({ message: "The bundle backing this voucher is no longer active" });
      }
      if (new Date(bundle.expiresAt) < new Date()) {
        return res.status(400).json({ message: "The bundle backing this voucher has expired" });
      }
      if (bundle.usedRedemptions >= bundle.totalRedemptions) {
        return res.status(400).json({ message: "The bundle's redemption pool is exhausted" });
      }
    }

    const models = await storage.getModelPricing();
    const allowedModels = models.filter(m => {
      const allowedProviders = voucher.allowedProviders as string[];
      return allowedProviders.includes(m.provider);
    });

    res.json({
      code: voucher.code,
      budgetCents: voucher.budgetCents,
      allowedProviders: voucher.allowedProviders,
      allowedModels: allowedModels.map(m => ({ modelId: m.modelId, displayName: m.displayName, provider: m.provider })),
      expiresAt: voucher.expiresAt,
      remainingRedemptions: voucher.maxRedemptions - voucher.currentRedemptions,
    });
  });

  app.post("/api/vouchers/redeem", redeemLimiter, async (req, res) => {
    try {
      const redeemSchema = z.object({
        code: z.string().min(1),
        email: z.string().email().optional(),
        name: z.string().optional(),
        password: z.string().min(6).optional(),
        instant: z.boolean().optional(),
      });
      const parsed = redeemSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const { code, email, name, password, instant } = parsed.data;

      const voucher = await storage.getVoucherByCode(code.toUpperCase());
      if (!voucher || voucher.status !== "ACTIVE") {
        return res.status(400).json({ message: "Invalid or inactive voucher" });
      }

      if (new Date(voucher.expiresAt) < new Date()) {
        return res.status(400).json({ message: "Voucher has expired" });
      }

      if (voucher.currentRedemptions >= voucher.maxRedemptions) {
        return res.status(400).json({ message: "Voucher is fully redeemed" });
      }

      const team = await storage.getTeam(voucher.teamId);
      if (!team) return res.status(500).json({ message: "Team not found" });

      const memberCheck = await checkPlanLimit(voucher.orgId, "member", voucher.teamId);
      if (!memberCheck.allowed) {
        return res.status(400).json({ message: "This team has reached its member limit" });
      }

      let userEmail = email;
      let userPassword = password;
      if (instant || !email) {
        const rand = Math.random().toString(36).slice(2, 8);
        userEmail = `voucher-${code.slice(0, 8)}-${rand}@allotly.local`;
        userPassword = Math.random().toString(36).slice(2, 14);
      }

      const passwordHash = await hashPassword(userPassword || "changeme123");
      const voucherUser = await storage.createUser({
        email: userEmail,
        name: name || "Voucher User",
        passwordHash,
        orgId: voucher.orgId,
        orgRole: "MEMBER",
        status: "ACTIVE",
        isVoucherUser: true,
      });

      const now = new Date();
      const membership = await storage.createMembership({
        teamId: voucher.teamId,
        userId: voucherUser.id,
        accessType: "VOUCHER",
        monthlyBudgetCents: voucher.budgetCents,
        allowedModels: voucher.allowedModels,
        allowedProviders: voucher.allowedProviders,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd: new Date(voucher.expiresAt),
        status: "ACTIVE",
        voucherRedemptionId: voucher.id,
      });

      await storage.createVoucherRedemption({ voucherId: voucher.id, userId: voucherUser.id });
      await storage.updateVoucher(voucher.id, { currentRedemptions: voucher.currentRedemptions + 1 });

      if (voucher.currentRedemptions + 1 >= voucher.maxRedemptions) {
        await storage.updateVoucher(voucher.id, { status: "FULLY_REDEEMED" });
      }

      if (voucher.bundleId) {
        const bundle = await storage.getVoucherBundle(voucher.bundleId);
        if (bundle) {
          const updated = await db.update(voucherBundles)
            .set({
              usedRedemptions: sql`${voucherBundles.usedRedemptions} + 1`,
              status: sql`CASE WHEN ${voucherBundles.usedRedemptions} + 1 >= ${voucherBundles.totalRedemptions} THEN 'EXHAUSTED' ELSE ${voucherBundles.status} END`,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(voucherBundles.id, bundle.id),
                sql`${voucherBundles.usedRedemptions} < ${voucherBundles.totalRedemptions}`,
                eq(voucherBundles.status, "ACTIVE")
              )
            )
            .returning();

          if (updated.length === 0) {
            return res.status(400).json({ message: "Bundle redemption pool is exhausted" });
          }

          const bundleReqKey = REDIS_KEYS.bundleRequests(bundle.id);
          const existingReqs = await redisGet(bundleReqKey);
          if (existingReqs === null) {
            await redisSet(bundleReqKey, String(bundle.usedProxyRequests));
          }

          await redisIncr(REDIS_KEYS.bundleRedemptions(bundle.id));
        }
      }

      await redisSet(REDIS_KEYS.budget(membership.id), String(voucher.budgetCents));

      const { key, hash, prefix } = generateAllotlyKey();
      await storage.createAllotlyApiKey({
        userId: voucherUser.id,
        membershipId: membership.id,
        keyHash: hash,
        keyPrefix: prefix,
      });

      await storage.createAuditLog({
        orgId: voucher.orgId,
        actorId: voucherUser.id,
        action: "voucher.redeemed",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code: voucher.code, email: userEmail },
      });

      const teamAdmin = await storage.getUser(team.adminId);
      if (teamAdmin?.email) {
        const tmpl = emailTemplates.voucherRedeemed(
          teamAdmin.name || "Admin",
          voucher.code,
          userEmail || "anonymous",
          team.name
        );
        try { await sendEmail(teamAdmin.email, tmpl.subject, tmpl.html); } catch {}
      }

      const models = await storage.getModelPricing();
      const allowedProviders = voucher.allowedProviders as string[];
      const availableModels = models.filter(m => allowedProviders.includes(m.provider));

      if (!instant && email) {
        req.session.userId = voucherUser.id;
        req.session.orgId = voucher.orgId;
        req.session.orgRole = "MEMBER";
      }

      res.json({
        apiKey: key,
        keyPrefix: prefix,
        budgetCents: voucher.budgetCents,
        expiresAt: voucher.expiresAt,
        models: availableModels.map(m => ({ modelId: m.modelId, displayName: m.displayName, provider: m.provider })),
        baseUrl: "/api/v1",
        hasAccount: !instant && !!email,
      });
    } catch (e: any) {
      console.error("Voucher redeem error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/bundles", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const bundles = await storage.getVoucherBundlesByOrg(user.orgId);
    const bundlesWithVouchers = await Promise.all(bundles.map(async (b) => {
      const bundleVouchers = await storage.getVouchersByBundle(b.id);
      return { ...b, voucherCount: bundleVouchers.length };
    }));
    res.json(bundlesWithVouchers);
  });

  app.get("/api/billing/subscription", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      if (!org.stripeSubId) {
        return res.json({
          plan: org.plan,
          maxTeamAdmins: org.maxTeamAdmins,
          graceEndsAt: org.graceEndsAt,
          subscription: null,
        });
      }

      try {
        const stripe = await getUncachableStripeClient();
        const sub = await stripe.subscriptions.retrieve(org.stripeSubId);
        const quantity = sub.items?.data?.[0]?.quantity || 1;

        res.json({
          plan: org.plan,
          maxTeamAdmins: org.maxTeamAdmins,
          graceEndsAt: org.graceEndsAt,
          subscription: {
            id: sub.id,
            status: sub.status,
            seats: quantity,
            currentPeriodEnd: new Date((sub as any).current_period_end * 1000).toISOString(),
            cancelAtPeriodEnd: (sub as any).cancel_at_period_end,
          },
        });
      } catch {
        res.json({
          plan: org.plan,
          maxTeamAdmins: org.maxTeamAdmins,
          graceEndsAt: org.graceEndsAt,
          subscription: { id: org.stripeSubId, status: "unknown" },
        });
      }
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (e) {
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  app.post("/api/stripe/create-checkout", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const checkoutSchema = z.object({
        type: z.enum(["team_upgrade", "voucher_bundle", "add_seats"]),
        quantity: z.number().int().min(1).max(10).optional(),
      });
      const checkoutParsed = checkoutSchema.safeParse(req.body);
      if (!checkoutParsed.success) return res.status(400).json({ message: "Validation error", errors: checkoutParsed.error.errors });
      const { type, quantity } = checkoutParsed.data;

      let customerId = org.stripeCustomerId;
      if (!customerId) {
        const customer = await stripeService.createCustomer(user.email, org.id, org.name);
        await storage.updateOrganization(org.id, { stripeCustomerId: customer.id });
        customerId = customer.id;
      }

      const stripe = await getUncachableStripeClient();
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      if (type === "team_upgrade") {
        const products = await stripe.products.search({ query: "metadata['plan']:'TEAM'" });
        if (!products.data.length) {
          return res.status(404).json({ message: "Team plan product not found in Stripe. Run seed-stripe-products first." });
        }
        const prices = await stripe.prices.list({ product: products.data[0].id, active: true });
        if (!prices.data.length) {
          return res.status(404).json({ message: "Team plan price not found" });
        }

        const seatCount = quantity || 1;
        const session = await stripeService.createCheckoutSession({
          customerId,
          priceId: prices.data[0].id,
          mode: 'subscription',
          successUrl: `${baseUrl}/dashboard/settings?upgrade=success`,
          cancelUrl: `${baseUrl}/dashboard/settings?upgrade=cancelled`,
          metadata: { orgId: org.id, type: 'team_upgrade', userId: user.id },
          quantity: seatCount,
          adjustableQuantity: true,
        });

        res.json({ url: session.url });
      } else if (type === "add_seats") {
        if (!org.stripeSubId) {
          const products = await stripe.products.search({ query: "metadata['plan']:'TEAM'" });
          if (!products.data.length) {
            return res.status(404).json({ message: "Team plan product not found in Stripe. Run seed-stripe-products first." });
          }
          const prices = await stripe.prices.list({ product: products.data[0].id, active: true });
          if (!prices.data.length) {
            return res.status(404).json({ message: "Team plan price not found" });
          }

          const seatCount = quantity || 1;
          const session = await stripeService.createCheckoutSession({
            customerId,
            priceId: prices.data[0].id,
            mode: 'subscription',
            successUrl: `${baseUrl}/dashboard/teams?upgrade=success`,
            cancelUrl: `${baseUrl}/dashboard/teams?upgrade=cancelled`,
            metadata: { orgId: org.id, type: 'team_upgrade', userId: user.id },
            quantity: seatCount,
            adjustableQuantity: true,
          });

          return res.json({ url: session.url, redirect: true });
        }

        const subscription = await stripe.subscriptions.retrieve(org.stripeSubId);
        const currentQuantity = subscription.items?.data?.[0]?.quantity || 1;
        const additionalSeats = quantity || 1;
        const newQuantity = Math.min(currentQuantity + additionalSeats, 10);

        if (newQuantity <= currentQuantity) {
          return res.status(400).json({ message: "Already at maximum seats (10)" });
        }

        const updatedSub = await stripe.subscriptions.update(org.stripeSubId, {
          items: [{
            id: subscription.items.data[0].id,
            quantity: newQuantity,
          }],
          proration_behavior: 'create_prorations',
          payment_behavior: 'error_if_incomplete',
        });

        if (updatedSub.status !== 'active') {
          return res.status(402).json({ message: "Payment failed. Please update your payment method via Manage Billing." });
        }

        await storage.updateOrganization(org.id, { maxTeamAdmins: newQuantity });

        await storage.createAuditLog({
          orgId: org.id,
          actorId: user.id,
          action: "plan.seats_updated",
          targetType: "organization",
          targetId: org.id,
          metadata: { previousSeats: currentQuantity, newSeats: newQuantity },
        });

        res.json({ success: true, previousSeats: currentQuantity, newSeats: newQuantity });
      } else if (type === "voucher_bundle") {
        const products = await stripe.products.search({ query: "metadata['type']:'bundle'" });
        if (!products.data.length) {
          return res.status(404).json({ message: "Voucher Bundle product not found in Stripe. Run seed-stripe-products first." });
        }
        const prices = await stripe.prices.list({ product: products.data[0].id, active: true });
        if (!prices.data.length) {
          return res.status(404).json({ message: "Voucher Bundle price not found" });
        }

        const session = await stripeService.createCheckoutSession({
          customerId,
          priceId: prices.data[0].id,
          mode: 'payment',
          successUrl: `${baseUrl}/dashboard/bundles?purchase=success`,
          cancelUrl: `${baseUrl}/dashboard/bundles?purchase=cancelled`,
          metadata: { orgId: org.id, userId: user.id, type: 'voucher_bundle' },
        });

        res.json({ url: session.url });
      } else {
        return res.status(400).json({ message: "Invalid checkout type" });
      }
    } catch (e: any) {
      console.error("Stripe checkout error:", e);
      res.status(500).json({ message: e.message || "Failed to create checkout session" });
    }
  });

  app.post("/api/stripe/portal", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const org = await storage.getOrganization(user.orgId);
      if (!org?.stripeCustomerId) {
        return res.status(400).json({ message: "No billing information found" });
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const session = await stripeService.createCustomerPortalSession(
        org.stripeCustomerId,
        `${baseUrl}/dashboard/settings`
      );

      res.json({ url: session.url });
    } catch (e: any) {
      console.error("Stripe portal error:", e);
      res.status(500).json({ message: "Failed to create portal session" });
    }
  });

  app.post("/api/stripe/handle-success", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const org = await storage.getOrganization(user.orgId);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const handleSuccessSchema = z.object({
        type: z.enum(["team_upgrade", "voucher_bundle"]),
        sessionId: z.string().optional(),
      });
      const handleSuccessParsed = handleSuccessSchema.safeParse(req.body);
      if (!handleSuccessParsed.success) return res.status(400).json({ message: "Validation error", errors: handleSuccessParsed.error.errors });
      const { type, sessionId } = handleSuccessParsed.data;

      if (!org.stripeCustomerId) {
        return res.json({ success: false, message: "No billing information" });
      }

      const stripe = await getUncachableStripeClient();

      if (sessionId) {
        const session = await stripe.checkout.sessions.retrieve(sessionId);
        if (session.customer !== org.stripeCustomerId) {
          return res.status(403).json({ message: "Session does not match your organization" });
        }
        if (session.payment_status !== 'paid') {
          return res.json({ success: false, message: "Payment not completed" });
        }
      }

      if (type === "team_upgrade") {
        const subscriptions = await stripe.subscriptions.list({
          customer: org.stripeCustomerId,
          status: 'active',
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const sub = subscriptions.data[0];
          const seats = sub.items?.data?.[0]?.quantity || 1;
          await storage.updateOrganization(org.id, {
            plan: "TEAM",
            stripeSubId: sub.id,
            maxTeamAdmins: Math.max(seats, 1),
          });
          return res.json({ success: true, plan: "TEAM", seats });
        }
      } else if (type === "voucher_bundle") {
        const sessions = await stripe.checkout.sessions.list({
          customer: org.stripeCustomerId,
          limit: 5,
        });

        const recentCompleted = sessions.data.find(
          s => s.payment_status === 'paid' && s.mode === 'payment' && s.metadata?.type === 'voucher_bundle'
        );

        if (recentCompleted && recentCompleted.payment_intent) {
          const piId = typeof recentCompleted.payment_intent === 'string'
            ? recentCompleted.payment_intent
            : recentCompleted.payment_intent.id;

          const existingBundles = await storage.getVoucherBundlesByOrg(org.id);
          const alreadyCreated = existingBundles.some(b => b.stripePaymentIntentId === piId);

          if (!alreadyCreated) {
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30);

            const bundle = await storage.createVoucherBundle({
              orgId: org.id,
              purchasedById: user.id,
              stripePaymentIntentId: piId,
              totalRedemptions: VOUCHER_LIMITS.BUNDLE.pooledRedemptions,
              usedRedemptions: 0,
              totalProxyRequests: VOUCHER_LIMITS.BUNDLE.totalProxyRequests,
              usedProxyRequests: 0,
              maxBudgetPerVoucherCents: VOUCHER_LIMITS.BUNDLE.maxBudgetPerVoucherCents,
              maxBudgetPerRecipientCents: VOUCHER_LIMITS.BUNDLE.maxBudgetPerRecipientCents,
              expiresAt,
              status: "ACTIVE",
            });

            await storage.createAuditLog({
              orgId: org.id,
              actorId: user.id,
              action: "bundle.purchased",
              targetType: "voucher_bundle",
              targetId: bundle.id,
            });

            return res.json({ success: true, bundle });
          }
        }
      }

      res.json({ success: true });
    } catch (e: any) {
      console.error("Handle success error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/dashboard/overview", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.orgRole === "ROOT_ADMIN") {
      const stats = await storage.getDashboardStats(user.orgId);
      res.json(stats);
    } else if (user.orgRole === "TEAM_ADMIN") {
      const team = await storage.getTeamByAdmin(user.id);
      if (!team) return res.json({ totalSpendCents: 0, directMemberCount: 0, proxyMemberCount: 0, totalMembers: 0 });
      const stats = await storage.getTeamDashboardStats(team.id);
      res.json(stats);
    } else {
      const membership = await storage.getMembershipByUser(user.id);
      res.json({
        membership: membership || null,
        budgetCents: membership?.monthlyBudgetCents || 0,
        spendCents: membership?.currentPeriodSpendCents || 0,
        accessType: membership?.accessType || "TEAM",
      });
    }
  });

  app.get("/api/dashboard/member-overview", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const data = await storage.getMemberDashboardData(user.id);
    if (!data) return res.json({ membership: null });
    res.json(data);
  });

  app.get("/api/dashboard/team-overview", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.orgRole !== "TEAM_ADMIN" && user.orgRole !== "ROOT_ADMIN") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const team = user.orgRole === "TEAM_ADMIN"
      ? await storage.getTeamByAdmin(user.id)
      : (await storage.getTeamsByOrg(user.orgId))[0];
    if (!team) return res.json({ members: [], stats: {} });

    const members = await storage.getMemberDetailsForTeam(team.id);
    const teamMembers = members.filter((m: any) => m.accessType === "TEAM");
    const voucherMembers = members.filter((m: any) => m.accessType === "VOUCHER");
    const stats = await storage.getTeamDashboardStats(team.id);

    const teamVouchers = await storage.getVouchersByTeam(team.id);
    let bundleCapacity = 0;
    for (const v of teamVouchers) {
      if (v.bundleId) {
        const bundle = await storage.getVoucherBundle(v.bundleId);
        if (bundle && bundle.status === "ACTIVE") {
          bundleCapacity += (bundle.totalRedemptions - bundle.usedRedemptions);
        }
      }
    }

    res.json({
      teamId: team.id,
      teamName: team.name,
      stats: { ...stats, bundleCapacityRemaining: bundleCapacity },
      teamMembers,
      voucherMembers,
    });
  });

  app.get("/api/dashboard/root-overview", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });

    const stats = await storage.getDashboardStats(user.orgId);
    const spendByTeam = await storage.getSpendByTeam(user.orgId);
    const spendByProvider = await storage.getSpendByProvider(user.orgId);
    const alerts = await storage.getRecentAlerts(user.orgId, 10);
    const providers = await storage.getProviderConnectionsByOrg(user.orgId);

    res.json({
      ...stats,
      spendByTeam,
      spendByProvider,
      recentAlerts: alerts,
      providerHealth: providers.map(p => ({
        provider: p.provider,
        status: p.status,
        lastValidatedAt: p.lastValidatedAt,
      })),
    });
  });

  app.get("/api/dashboard/spend-by-provider", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });
    const data = await storage.getSpendByProvider(user.orgId);
    res.json(data);
  });

  app.get("/api/dashboard/spend-by-team", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });
    const data = await storage.getSpendByTeam(user.orgId);
    res.json(data);
  });

  app.get("/api/dashboard/alerts", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });
    const alerts = await storage.getRecentAlerts(user.orgId, 20);
    res.json(alerts);
  });

  app.get("/api/dashboard/voucher-stats", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    let orgVouchers;
    if (user.orgRole === "ROOT_ADMIN") {
      orgVouchers = await storage.getVouchersByOrg(user.orgId);
    } else if (user.orgRole === "TEAM_ADMIN") {
      const team = await storage.getTeamByAdmin(user.id);
      orgVouchers = team ? await storage.getVouchersByTeam(team.id) : [];
    } else {
      return res.json({ total: 0, active: 0, redeemed: 0, expired: 0 });
    }

    res.json({
      total: orgVouchers.length,
      active: orgVouchers.filter(v => v.status === "ACTIVE").length,
      redeemed: orgVouchers.filter(v => v.status === "FULLY_REDEEMED").length,
      expired: orgVouchers.filter(v => v.status === "EXPIRED").length,
      totalRedemptions: orgVouchers.reduce((sum, v) => sum + v.currentRedemptions, 0),
    });
  });

  app.get("/api/my-keys", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const membership = await storage.getMembershipByUser(user.id);
    if (!membership) return res.json([]);
    const keys = await storage.getApiKeysByMembership(membership.id);
    res.json(keys.map(k => ({
      id: k.id,
      keyPrefix: k.keyPrefix,
      status: k.status,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    })));
  });

  app.get("/api/dashboard/usage/:membershipId", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const membership = await storage.getMembership(req.params.membershipId);
    if (!membership) return res.status(404).json({ message: "Not found" });

    const team = await storage.getTeam(membership.teamId);
    if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });

    if (user.orgRole === "MEMBER" && membership.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
    if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

    const snapshots = await storage.getUsageSnapshotsByMembership(req.params.membershipId, 100);
    res.json(snapshots);
  });

  app.get("/api/dashboard/proxy-logs/:membershipId", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const membership = await storage.getMembership(req.params.membershipId);
    if (!membership) return res.status(404).json({ message: "Not found" });

    const team = await storage.getTeam(membership.teamId);
    if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Not found" });

    if (user.orgRole === "MEMBER" && membership.userId !== user.id) return res.status(403).json({ message: "Forbidden" });
    if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

    const logs = await storage.getProxyRequestLogsByMembership(req.params.membershipId, 100);
    res.json(logs);
  });

  app.get("/api/models", async (_req, res) => {
    const pricing = await storage.getModelPricing();
    res.json(pricing);
  });

  app.get("/api/audit-log", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });

    const { action, targetType, actorId, startDate, endDate, page, limit } = req.query as any;
    const hasFilters = action || targetType || actorId || startDate || endDate || page;

    if (hasFilters) {
      const result = await storage.getFilteredAuditLogs(user.orgId, {
        action, targetType, actorId, startDate, endDate,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 50,
      });
      res.json(result);
    } else {
      const logs = await storage.getAuditLogsByOrg(user.orgId, 200);
      res.json({ logs, total: logs.length });
    }
  });

  const csvSafe = (val: string): string => {
    let s = String(val).replace(/"/g, '""');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s}"`;
  };

  app.get("/api/audit-log/export", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });

    const { action, targetType, actorId, startDate, endDate } = req.query as any;
    const result = await storage.getFilteredAuditLogs(user.orgId, {
      action, targetType, actorId, startDate, endDate,
      page: 1, limit: 10000,
    });

    const orgUsers = await storage.getUsersByOrg(user.orgId);
    const userMap = new Map(orgUsers.map(u => [u.id, u]));

    const csvLines = ["Timestamp,Actor,Role,Action,Target Type,Target ID,Metadata"];
    for (const log of result.logs) {
      const actor = userMap.get(log.actorId);
      const actorName = log.actorId === "system" ? "System" : (actor?.name || actor?.email || log.actorId);
      const actorRole = log.actorId === "system" ? "SYSTEM" : (actor?.orgRole || "");
      const metadata = log.metadata ? JSON.stringify(log.metadata).replace(/"/g, '""') : "";
      csvLines.push(`${csvSafe(new Date(log.createdAt).toISOString())},${csvSafe(actorName)},${csvSafe(actorRole)},${csvSafe(log.action)},${csvSafe(log.targetType || "")},${csvSafe(log.targetId || "")},${csvSafe(metadata)}`);
    }

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csvLines.join("\n"));
  });

  app.get("/api/audit-log/actors", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user || user.orgRole !== "ROOT_ADMIN") return res.status(403).json({ message: "Forbidden" });
    const orgUsers = await storage.getUsersByOrg(user.orgId);
    const actors = orgUsers.map(u => ({ id: u.id, name: u.name || u.email, role: u.orgRole }));
    actors.push({ id: "system", name: "System", role: "SYSTEM" as any });
    res.json(actors);
  });

  app.get("/api/org/settings", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const org = await storage.getOrganization(user.orgId);
    res.json(org);
  });

  app.patch("/api/org/settings", requireRole("ROOT_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    const notificationsSchema = z.object({
      budgetAlerts: z.boolean().optional(),
      voucherRedemptions: z.boolean().optional(),
      memberInvitesAccepted: z.boolean().optional(),
      spendAnomalies: z.boolean().optional(),
      providerKeyIssues: z.boolean().optional(),
    }).optional();
    const defaultsSchema = z.object({
      defaultBudgetCents: z.number().int().min(0).nullable().optional(),
      defaultAllowedModels: z.array(z.string()).nullable().optional(),
      defaultVoucherExpiryDays: z.number().int().min(1).nullable().optional(),
    }).optional();
    const settingsSchema = z.object({
      name: z.string().min(1).optional(),
      billingEmail: z.string().email().nullable().optional(),
      description: z.string().max(500).nullable().optional(),
      orgBudgetCeilingCents: z.number().int().min(0).nullable().optional(),
      defaultMemberBudgetCents: z.number().int().min(0).nullable().optional(),
      settings: z.object({
        notifications: notificationsSchema,
        defaults: defaultsSchema,
      }).optional(),
    });
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

    const before = await storage.getOrganization(user.orgId);
    const { name, billingEmail, description, orgBudgetCeilingCents, defaultMemberBudgetCents, settings } = parsed.data;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (billingEmail !== undefined) updateData.billingEmail = billingEmail;
    if (description !== undefined) updateData.description = description;
    if (orgBudgetCeilingCents !== undefined) updateData.orgBudgetCeilingCents = orgBudgetCeilingCents;
    if (defaultMemberBudgetCents !== undefined) updateData.defaultMemberBudgetCents = defaultMemberBudgetCents;
    if (settings !== undefined) {
      const existingSettings = (before?.settings as Record<string, any>) || {};
      const merged: Record<string, any> = { ...existingSettings };
      for (const [key, value] of Object.entries(settings)) {
        if (value && typeof value === "object" && !Array.isArray(value) && merged[key] && typeof merged[key] === "object") {
          merged[key] = { ...merged[key], ...value };
        } else {
          merged[key] = value;
        }
      }
      updateData.settings = merged;
    }

    const updated = await storage.updateOrganization(user.orgId, updateData);

    const changes: Record<string, { from: any; to: any }> = {};
    if (before) {
      for (const key of Object.keys(updateData)) {
        if ((before as any)[key] !== (updated as any)?.[key]) {
          changes[key] = { from: (before as any)[key], to: (updated as any)?.[key] };
        }
      }
    }

    await storage.createAuditLog({
      orgId: user.orgId,
      actorId: user.id,
      action: "settings.updated",
      targetType: "organization",
      targetId: user.orgId,
      metadata: { changes },
    });

    res.json(updated);
  });

  app.post("/api/org/revoke-all-keys", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { confirmText } = req.body || {};
      if (confirmText !== "REVOKE ALL") return res.status(400).json({ message: "Type REVOKE ALL to confirm" });

      const allKeys = await storage.getAllApiKeysWithOwnerInfo(user.orgId, { status: "ACTIVE" });
      let revokedCount = 0;

      for (const key of allKeys) {
        if (key.status === "ACTIVE") {
          await storage.updateAllotlyApiKey(key.id, { status: "REVOKED", updatedAt: new Date() });
          await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
          revokedCount++;
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "org.revoke_all_keys",
        targetType: "organization",
        targetId: user.orgId,
        metadata: { revokedCount, totalKeys: allKeys.length },
      });

      res.json({ message: `${revokedCount} API keys revoked`, revokedCount });
    } catch (e: any) {
      console.error("Revoke all keys error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/org/disconnect-all-providers", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { confirmName } = req.body || {};
      const org = await storage.getOrganization(user.orgId);
      if (!org || confirmName !== org.name) return res.status(400).json({ message: "Type your organization name to confirm" });

      const providers = await storage.getProviderConnectionsByOrg(user.orgId);
      let disconnectedCount = 0;

      for (const provider of providers) {
        if (provider.status !== "DISCONNECTED") {
          await storage.updateProviderConnection(provider.id, { status: "DISCONNECTED" });
          disconnectedCount++;
        }
      }

      const allKeys = await storage.getAllApiKeysWithOwnerInfo(user.orgId, { status: "ACTIVE" });
      let revokedCount = 0;
      for (const key of allKeys) {
        if (key.status === "ACTIVE") {
          await storage.updateAllotlyApiKey(key.id, { status: "REVOKED", updatedAt: new Date() });
          await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));
          revokedCount++;
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "org.disconnect_all_providers",
        targetType: "organization",
        targetId: user.orgId,
        metadata: { disconnectedCount, revokedKeysCount: revokedCount },
      });

      res.json({ message: `${disconnectedCount} providers disconnected, ${revokedCount} keys revoked`, disconnectedCount, revokedCount });
    } catch (e: any) {
      console.error("Disconnect all providers error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/export/usage", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const { startDate, endDate, teamId, memberId, provider, model } = req.query as any;

      const teams = await storage.getTeamsByOrg(user.orgId);
      const accessibleTeamIds = user.orgRole === "ROOT_ADMIN"
        ? teams.map(t => t.id)
        : teams.filter(t => t.adminId === user.id).map(t => t.id);

      if (teamId && !accessibleTeamIds.includes(teamId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const targetTeamIds = teamId ? [teamId] : accessibleTeamIds;
      let allLogs: any[] = [];

      for (const tId of targetTeamIds) {
        const members = await storage.getMembersByTeam(tId);
        const teamProjects = await storage.getProjectsByTeam(tId);
        const projectMap = new Map(teamProjects.map(p => [p.id, p.name]));

        for (const m of members) {
          if (memberId && m.id !== memberId) continue;
          const logs = await storage.getProxyRequestLogsByMembership(m.id, 10000);
          const memberUser = await storage.getUser(m.userId);
          const team = teams.find(t => t.id === tId);

          const memberKeys = await storage.getApiKeysByMembership(m.id);
          const keyProjectMap = new Map<string, string>();
          for (const k of memberKeys) {
            if (k.projectId) {
              keyProjectMap.set(k.id, projectMap.get(k.projectId) || "");
            }
          }

          for (const l of logs) {
            if (startDate && new Date(l.createdAt) < new Date(startDate)) continue;
            if (endDate && new Date(l.createdAt) > new Date(endDate)) continue;
            if (provider && l.provider !== provider) continue;
            if (model && l.model !== model) continue;
            allLogs.push({
              timestamp: new Date(l.createdAt).toISOString(),
              memberName: memberUser?.name || "",
              memberEmail: memberUser?.email || "",
              teamName: team?.name || "",
              accessType: m.accessType,
              project: l.apiKeyId ? (keyProjectMap.get(l.apiKeyId) || "") : "",
              model: l.model,
              provider: l.provider,
              inputTokens: l.inputTokens || 0,
              outputTokens: l.outputTokens || 0,
              totalTokens: (l.inputTokens || 0) + (l.outputTokens || 0),
              costCents: l.costCents || 0,
              responseStatus: l.statusCode || 200,
            });
          }
        }
      }

      allLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      const csvLines = ["timestamp,memberName,memberEmail,teamName,accessType,project,model,provider,inputTokens,outputTokens,totalTokens,costCents,responseStatus"];
      for (const row of allLogs) {
        csvLines.push(`${csvSafe(row.timestamp)},${csvSafe(row.memberName)},${csvSafe(row.memberEmail)},${csvSafe(row.teamName)},${csvSafe(row.accessType)},${csvSafe(row.project)},${csvSafe(row.model)},${csvSafe(row.provider)},${row.inputTokens},${row.outputTokens},${row.totalTokens},${row.costCents},${row.responseStatus}`);
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="usage-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csvLines.join("\n"));
    } catch (e: any) {
      console.error("Usage export error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/export/members", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const { teamId, status, accessType } = req.query as any;

      const teams = await storage.getTeamsByOrg(user.orgId);
      const accessibleTeamIds = user.orgRole === "ROOT_ADMIN"
        ? teams.map(t => t.id)
        : teams.filter(t => t.adminId === user.id).map(t => t.id);

      const targetTeamIds = teamId ? (accessibleTeamIds.includes(teamId) ? [teamId] : []) : accessibleTeamIds;
      const rows: any[] = [];

      for (const tId of targetTeamIds) {
        const members = await storage.getMembersByTeam(tId);
        const team = teams.find(t => t.id === tId);
        for (const m of members) {
          if (status && m.status !== status) continue;
          if (accessType && m.accessType !== accessType) continue;
          const memberUser = await storage.getUser(m.userId);
          const keys = await storage.getApiKeysByMembership(m.id);
          const activeKey = keys.find(k => k.status === "ACTIVE");
          rows.push({
            name: memberUser?.name || "",
            email: memberUser?.email || "",
            team: team?.name || "",
            role: memberUser?.orgRole || "",
            accessType: m.accessType,
            budgetCents: m.monthlyBudgetCents,
            spentCents: m.currentPeriodSpendCents,
            remainingCents: m.monthlyBudgetCents - m.currentPeriodSpendCents,
            status: m.status,
            keyStatus: activeKey ? "ACTIVE" : (keys.length > 0 ? "REVOKED" : "NONE"),
            createdAt: new Date(m.createdAt).toISOString(),
            lastActive: activeKey?.lastUsedAt ? new Date(activeKey.lastUsedAt).toISOString() : "",
          });
        }
      }

      const csvLines = ["name,email,team,role,accessType,budgetCents,spentCents,remainingCents,status,keyStatus,createdAt,lastActive"];
      for (const row of rows) {
        csvLines.push(`${csvSafe(row.name)},${csvSafe(row.email)},${csvSafe(row.team)},${csvSafe(row.role)},${csvSafe(row.accessType)},${row.budgetCents},${row.spentCents},${row.remainingCents},${csvSafe(row.status)},${csvSafe(row.keyStatus)},${csvSafe(row.createdAt)},${csvSafe(row.lastActive)}`);
      }

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="members-export-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csvLines.join("\n"));
    } catch (e: any) {
      console.error("Members export error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/teams/:teamId/bulk-add-members", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const team = await storage.getTeam(req.params.teamId);
      if (!team || team.orgId !== user.orgId) return res.status(404).json({ message: "Team not found" });
      if (user.orgRole === "TEAM_ADMIN" && team.adminId !== user.id) return res.status(403).json({ message: "Forbidden" });

      const schema = z.object({
        members: z.array(z.object({
          email: z.string().email(),
          name: z.string().min(1).max(100).optional(),
          budgetCents: z.number().int().min(100).optional(),
        })).min(1).max(200),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const org = await storage.getOrganization(user.orgId);
      const orgSettings = (org?.settings as Record<string, any>) || {};
      const defaultBudget = orgSettings.defaults?.defaultBudgetCents || org?.defaultMemberBudgetCents || 1000;
      const defaultModels = orgSettings.defaults?.defaultAllowedModels || null;

      const created: { email: string; keyPrefix: string }[] = [];
      const skipped: { email: string; reason: string }[] = [];
      const errors: { email: string; error: string }[] = [];

      for (const memberReq of parsed.data.members) {
        try {
          const existingUser = await storage.getUserByEmail(memberReq.email);
          if (existingUser && existingUser.orgId === user.orgId) {
            skipped.push({ email: memberReq.email, reason: "User already exists in this organization" });
            continue;
          }

          let memberUser;
          if (existingUser) {
            skipped.push({ email: memberReq.email, reason: "Email belongs to another organization" });
            continue;
          }

          const tempPassword = await hashPassword(generateAllotlyKey().key.slice(0, 32));
          memberUser = await storage.createUser({
            email: memberReq.email,
            name: memberReq.name || memberReq.email.split("@")[0],
            passwordHash: tempPassword,
            orgId: user.orgId,
            orgRole: "MEMBER",
            status: "INVITED",
            isVoucherUser: false,
          });

          const budgetCents = memberReq.budgetCents || defaultBudget;
          const now = new Date();
          const periodEnd = new Date(now);
          periodEnd.setMonth(periodEnd.getMonth() + 1);

          const membership = await storage.createMembership({
            userId: memberUser.id,
            teamId: team.id,
            accessType: "TEAM",
            monthlyBudgetCents: budgetCents,
            currentPeriodSpendCents: 0,
            periodStart: now,
            periodEnd: periodEnd,
            allowedModels: defaultModels,
            status: "ACTIVE",
          });

          const { key: rawKey, hash: keyHash, prefix: keyPrefix } = generateAllotlyKey();
          await storage.createAllotlyApiKey({
            userId: memberUser.id,
            membershipId: membership.id,
            keyHash,
            keyPrefix,
          });

          await redisSet(REDIS_KEYS.budget(membership.id), String(budgetCents));

          try {
            const tmpl = emailTemplates.memberInvite(
              memberReq.name || memberReq.email.split("@")[0],
              team.name,
              user.name || "an admin",
              "/dashboard"
            );
            await sendEmail(memberReq.email, tmpl.subject, tmpl.html);
          } catch {}

          created.push({ email: memberReq.email, keyPrefix });
        } catch (e: any) {
          errors.push({ email: memberReq.email, error: e.message });
        }
      }

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.bulk_created",
        targetType: "team",
        targetId: team.id,
        metadata: {
          createdCount: created.length,
          skippedCount: skipped.length,
          errorCount: errors.length,
        },
      });

      res.json({ created, skipped, errors });
    } catch (e: any) {
      console.error("Bulk add members error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/cleanup/:type", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { type } = req.params;
      const olderThanDays = parseInt((req.query as any).olderThanDays || "90");
      const fix = (req.query as any).fix === "true";

      if (type === "expired-vouchers") {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        const vouchers = await storage.getVouchersByOrg(user.orgId);
        const expiredOld = vouchers.filter(v => v.status === "EXPIRED" && new Date(v.expiresAt) < cutoffDate);
        let deletedCount = 0;
        for (const v of expiredOld) {
          await cascadeDeleteVoucher(v.id, user.id, user.orgId);
          deletedCount++;
        }
        await storage.createAuditLog({
          orgId: user.orgId, actorId: user.id,
          action: "cleanup.expired_vouchers",
          targetType: "organization", targetId: user.orgId,
          metadata: { deletedCount, olderThanDays },
        });
        return res.json({ message: `${deletedCount} expired vouchers deleted`, deletedCount });
      }

      if (type === "revoked-keys") {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
        const allKeys = await storage.getAllApiKeysWithOwnerInfo(user.orgId, { status: "REVOKED" });
        const oldRevoked = allKeys.filter(k => new Date(k.createdAt) < cutoffDate);
        let deletedCount = 0;
        for (const k of oldRevoked) {
          await db.update(proxyRequestLogs).set({ apiKeyId: null }).where(eq(proxyRequestLogs.apiKeyId, k.id));
          await db.delete(allotlyApiKeysTable).where(eq(allotlyApiKeysTable.id, k.id));
          deletedCount++;
        }
        await storage.createAuditLog({
          orgId: user.orgId, actorId: user.id,
          action: "cleanup.revoked_keys",
          targetType: "organization", targetId: user.orgId,
          metadata: { deletedCount, olderThanDays },
        });
        return res.json({ message: `${deletedCount} revoked keys deleted`, deletedCount });
      }

      if (type === "orphans") {
        const teams = await storage.getTeamsByOrg(user.orgId);
        const allTeamIds = teams.map(t => t.id);
        const orgUsers = await storage.getUsersByOrg(user.orgId);
        const orphanReport: { usersNoMembership: string[]; keysNoMembership: string[]; redisOrphans: string[] } = {
          usersNoMembership: [],
          keysNoMembership: [],
          redisOrphans: [],
        };

        for (const u of orgUsers) {
          let hasMembership = false;
          for (const tId of allTeamIds) {
            const members = await storage.getMembersByTeam(tId);
            if (members.some(m => m.userId === u.id)) { hasMembership = true; break; }
          }
          if (!hasMembership && u.orgRole === "MEMBER") orphanReport.usersNoMembership.push(u.email);
        }

        await storage.createAuditLog({
          orgId: user.orgId, actorId: user.id,
          action: "cleanup.orphans",
          targetType: "organization", targetId: user.orgId,
          metadata: {
            usersNoMembership: orphanReport.usersNoMembership.length,
            keysNoMembership: orphanReport.keysNoMembership.length,
            fixed: fix,
          },
        });
        return res.json({ report: orphanReport, fixed: fix });
      }

      if (type === "redis-reconcile") {
        const result = await runRedisReconciliation();
        await storage.createAuditLog({
          orgId: user.orgId, actorId: user.id,
          action: "cleanup.redis_reconcile",
          targetType: "organization", targetId: user.orgId,
          metadata: result,
        });
        return res.json(result);
      }

      return res.status(400).json({ message: `Unknown cleanup type: ${type}` });
    } catch (e: any) {
      console.error("Cleanup error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/organizations/:id", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      if (req.params.id !== user.orgId) return res.status(403).json({ message: "Forbidden" });

      const { confirmName } = req.body || {};
      if (!confirmName) return res.status(400).json({ message: "Confirmation name is required" });

      const result = await cascadeDeleteOrganization(user.orgId, confirmName, user.id);
      if (!result.success) return res.status(400).json({ message: result.error });

      req.session.destroy(() => {});
      res.json({ message: "Organization deleted", deletedCounts: result.deletedCounts });
    } catch (e: any) {
      console.error("Org delete error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Analytics API routes
  app.get("/api/analytics/cost-per-model", requireRole("ROOT_ADMIN", "TEAM_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    const days = parseInt(req.query.days as string) || 30;
    let teamId: string | undefined;
    if (user.orgRole === "TEAM_ADMIN") {
      const userTeams = await storage.getTeamsByOrg(user.orgId);
      const adminTeam = userTeams.find(t => t.adminId === user.id);
      if (!adminTeam) return res.json([]);
      teamId = adminTeam.id;
    }
    const data = await getCostPerModel(user.orgId, teamId, days);
    res.json(data);
  });

  app.get("/api/analytics/top-spenders", requireRole("ROOT_ADMIN", "TEAM_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    let teamId: string | undefined;
    if (user.orgRole === "TEAM_ADMIN") {
      const userTeams = await storage.getTeamsByOrg(user.orgId);
      const adminTeam = userTeams.find(t => t.adminId === user.id);
      if (!adminTeam) return res.json([]);
      teamId = adminTeam.id;
    }
    const data = await getTopSpenders(user.orgId, teamId);
    res.json(data);
  });

  app.get("/api/analytics/forecast", requireRole("ROOT_ADMIN", "TEAM_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    let teamId: string | undefined;
    if (user.orgRole === "TEAM_ADMIN") {
      const userTeams = await storage.getTeamsByOrg(user.orgId);
      const adminTeam = userTeams.find(t => t.adminId === user.id);
      if (!adminTeam) return res.json({ dailySpend: [], projectedMonthEnd: 0, daysRemaining: 0, dailyAvg: 0, totalBudget: 0, warningExceeds: false });
      teamId = adminTeam.id;
    }
    const data = await getSpendForecast(user.orgId, teamId);
    res.json(data);
  });

  app.get("/api/analytics/anomalies", requireRole("ROOT_ADMIN", "TEAM_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    let teamId: string | undefined;
    if (user.orgRole === "TEAM_ADMIN") {
      const userTeams = await storage.getTeamsByOrg(user.orgId);
      const adminTeam = userTeams.find(t => t.adminId === user.id);
      if (!adminTeam) return res.json([]);
      teamId = adminTeam.id;
    }
    const data = await getAnomalies(user.orgId, teamId);
    res.json(data);
  });

  app.get("/api/analytics/optimization", requireRole("ROOT_ADMIN", "TEAM_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    let teamId: string | undefined;
    if (user.orgRole === "TEAM_ADMIN") {
      const userTeams = await storage.getTeamsByOrg(user.orgId);
      const adminTeam = userTeams.find(t => t.adminId === user.id);
      if (!adminTeam) return res.json([]);
      teamId = adminTeam.id;
    }
    const data = await getOptimizationRecommendations(user.orgId, teamId);
    res.json(data);
  });

  // ── Admin Control Center Routes ──

  app.post("/api/admin/login", async (req, res) => {
    try {
      const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
      const { email, password } = schema.parse(req.body);

      const adminEmail = process.env.ADMIN_EMAIL;
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminEmail || !adminPassword) {
        return res.status(500).json({ message: "Admin credentials not configured" });
      }

      if (email !== adminEmail || password !== adminPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      req.session.isAdmin = true;
      res.json({ message: "Admin login successful" });
    } catch (e: any) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: "Validation error", errors: e.errors });
      }
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/logout", requireAdmin, (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/admin/session", requireAdmin, (_req, res) => {
    res.json({ isAdmin: true });
  });

  app.get("/api/admin/stats", requireAdmin, async (_req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const allUsers: any[] = [];
      for (const org of allOrgs) {
        const orgUsers = await storage.getUsersByOrg(org.id);
        allUsers.push(...orgUsers);
      }

      let totalVouchers = 0;
      let activeVouchers = 0;
      let totalSpendCents = 0;
      for (const org of allOrgs) {
        const orgVouchers = await storage.getVouchersByOrg(org.id);
        totalVouchers += orgVouchers.length;
        activeVouchers += orgVouchers.filter(v => v.status === "ACTIVE").length;

        const orgTeams = await storage.getTeamsByOrg(org.id);
        for (const team of orgTeams) {
          const memberships = await storage.getMembershipsByTeam(team.id);
          totalSpendCents += memberships.reduce((sum, m) => sum + m.currentPeriodSpendCents, 0);
        }
      }

      res.json({
        totalOrgs: allOrgs.length,
        totalUsers: allUsers.length,
        totalVouchers,
        activeVouchers,
        totalSpend: totalSpendCents,
      });
    } catch (e: any) {
      console.error("Admin stats error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/organizations", requireAdmin, async (_req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const orgsWithCounts = await Promise.all(
        allOrgs.map(async (org) => {
          const orgUsers = await storage.getUsersByOrg(org.id);
          return { ...org, memberCount: orgUsers.length };
        })
      );
      res.json(orgsWithCounts);
    } catch (e: any) {
      console.error("Admin orgs error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/organizations/:id", requireAdmin, async (req, res) => {
    try {
      const org = await storage.getOrganization(req.params.id);
      if (!org) return res.status(404).json({ message: "Organization not found" });
      const orgUsers = await storage.getUsersByOrg(org.id);
      const safeUsers = orgUsers.map(u => ({
        id: u.id, email: u.email, name: u.name, orgRole: u.orgRole,
        status: u.status, isVoucherUser: u.isVoucherUser, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
      }));
      res.json({ ...org, users: safeUsers });
    } catch (e: any) {
      console.error("Admin org detail error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/admin/organizations/:id", requireAdmin, async (req, res) => {
    try {
      const patchSchema = z.object({
        name: z.string().min(1).optional(),
        plan: z.enum(["FREE", "TEAM", "ENTERPRISE"]).optional(),
        maxTeamAdmins: z.number().int().min(0).optional(),
      });
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const org = await storage.getOrganization(req.params.id);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const updates: Record<string, any> = {};
      if (parsed.data.name !== undefined) updates.name = parsed.data.name;
      if (parsed.data.plan !== undefined) updates.plan = parsed.data.plan;
      if (parsed.data.maxTeamAdmins !== undefined) updates.maxTeamAdmins = parsed.data.maxTeamAdmins;

      const updated = await storage.updateOrganization(org.id, updates);
      res.json(updated);
    } catch (e: any) {
      console.error("Admin org update error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/admin/users", requireAdmin, async (_req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const allUsers: any[] = [];
      for (const org of allOrgs) {
        const orgUsers = await storage.getUsersByOrg(org.id);
        for (const u of orgUsers) {
          allUsers.push({
            id: u.id, email: u.email, name: u.name, orgRole: u.orgRole,
            status: u.status, isVoucherUser: u.isVoucherUser, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
            orgId: u.orgId, orgName: org.name, orgPlan: org.plan,
          });
        }
      }
      res.json(allUsers);
    } catch (e: any) {
      console.error("Admin users error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      await storage.updateUser(user.id, { status: "SUSPENDED" } as any);
      res.json({ message: "User deactivated" });
    } catch (e: any) {
      console.error("Admin user delete error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/seed-stripe-products", requireAdmin, async (_req, res) => {
    try {
      const stripe = await getUncachableStripeClient();

      const existingTeam = await stripe.products.search({ query: "metadata['plan']:'TEAM'" });
      const existingBundle = await stripe.products.search({ query: "metadata['type']:'bundle'" });

      const results: any = {};

      if (existingTeam.data.length > 0) {
        const prices = await stripe.prices.list({ product: existingTeam.data[0].id, active: true });
        results.teamPlan = { product: existingTeam.data[0].id, price: prices.data[0]?.id, status: "already_exists" };
      } else {
        const teamProduct = await stripe.products.create({
          name: 'Allotly Team Plan',
          description: 'Team plan for Allotly - AI Spend Control Plane. Includes up to 10 Team Admins, 20 members per team, 3 AI Provider connections, and more.',
          metadata: { type: 'subscription', plan: 'TEAM' },
        });
        const teamPrice = await stripe.prices.create({
          product: teamProduct.id,
          unit_amount: 2000,
          currency: 'usd',
          recurring: { interval: 'month' },
          metadata: { plan: 'TEAM' },
        });
        results.teamPlan = { product: teamProduct.id, price: teamPrice.id, status: "created" };
      }

      if (existingBundle.data.length > 0) {
        const prices = await stripe.prices.list({ product: existingBundle.data[0].id, active: true });
        results.voucherBundle = { product: existingBundle.data[0].id, price: prices.data[0]?.id, status: "already_exists" };
      } else {
        const bundleProduct = await stripe.products.create({
          name: 'Allotly Voucher Bundle',
          description: '$10 Voucher Bundle - 50 voucher redemptions pooled across up to 10 codes, 25,000 proxy requests, $50 max budget per recipient, 30-day validity.',
          metadata: { type: 'bundle', redemptions: '50', proxyRequests: '25000', maxBudgetPerRecipientCents: '5000', maxCodesPerBundle: '10', validityDays: '30' },
        });
        const bundlePrice = await stripe.prices.create({
          product: bundleProduct.id,
          unit_amount: 1000,
          currency: 'usd',
          metadata: { type: 'bundle' },
        });
        results.voucherBundle = { product: bundleProduct.id, price: bundlePrice.id, status: "created" };
      }

      res.json({ message: "Stripe products seeded", ...results });
    } catch (e: any) {
      console.error("Stripe product seed error:", e);
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/admin/model-sync", requireAdmin, async (_req, res) => {
    try {
      await runModelSync();
      const allPricing = await storage.getModelPricing();
      res.json({
        message: "Model sync complete",
        models: allPricing.map(p => ({
          id: p.modelId,
          provider: p.provider,
          displayName: p.displayName,
          inputPricePerMTok: p.inputPricePerMTok,
          outputPricePerMTok: p.outputPricePerMTok,
        })),
      });
    } catch (e: any) {
      console.error("Admin model sync error:", e);
      res.status(500).json({ message: "Model sync failed: " + e.message });
    }
  });

  // ── Admin: User Hard Delete ──
  app.delete("/api/admin/users/:id/hard", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const ownedTeams = await db.select().from(teams).where(eq(teams.adminId, user.id));
      if (ownedTeams.length > 0) {
        return res.status(400).json({
          message: `Cannot hard-delete: user is admin of ${ownedTeams.length} team(s). Reassign or delete those teams first.`,
          teamIds: ownedTeams.map(t => t.id),
        });
      }

      const counts: Record<string, number> = {};

      await db.transaction(async (tx) => {
        await tx.insert(platformAuditLogs).values({
          action: "HARD_DELETE_USER",
          entityType: "USER",
          entityId: user.id,
          metadata: { email: user.email, orgId: user.orgId },
          performedBy: "admin",
        });

        const membership = await tx.select().from(teamMemberships)
          .where(eq(teamMemberships.userId, user.id)).then(r => r[0]);

        if (membership) {
          const keys = await tx.select().from(allotlyApiKeysTable)
            .where(eq(allotlyApiKeysTable.membershipId, membership.id));

          for (const k of keys) {
            await redisDel(REDIS_KEYS.apiKeyCache(k.keyHash));
          }
          await redisDel(REDIS_KEYS.budget(membership.id));
          await redisDel(REDIS_KEYS.concurrent(membership.id));
          await redisDel(REDIS_KEYS.ratelimit(membership.id));

          const proxyResult = await tx.delete(proxyRequestLogs)
            .where(eq(proxyRequestLogs.membershipId, membership.id)).returning();
          counts.proxyLogs = proxyResult.length;

          const usageResult = await tx.delete(usageSnapshots)
            .where(eq(usageSnapshots.membershipId, membership.id)).returning();
          counts.usageSnapshots = usageResult.length;

          const alertResult = await tx.delete(budgetAlerts)
            .where(eq(budgetAlerts.membershipId, membership.id)).returning();
          counts.budgetAlerts = alertResult.length;

          const keyResult = await tx.delete(allotlyApiKeysTable)
            .where(eq(allotlyApiKeysTable.membershipId, membership.id)).returning();
          counts.apiKeys = keyResult.length;

          await tx.delete(teamMemberships).where(eq(teamMemberships.id, membership.id));
          counts.memberships = 1;
        }

        await tx.delete(voucherRedemptions).where(eq(voucherRedemptions.userId, user.id));
        await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

        const createdVouchers = await tx.select({ id: vouchers.id }).from(vouchers)
          .where(eq(vouchers.createdById, user.id));
        if (createdVouchers.length > 0) {
          await tx.update(vouchers)
            .set({ createdById: "deleted" } as any)
            .where(eq(vouchers.createdById, user.id));
        }

        await tx.delete(auditLogs).where(eq(auditLogs.actorId, user.id));

        const { projects: projectsTable } = await import("@shared/schema");
        await tx.update(projectsTable)
          .set({ createdById: null } as any)
          .where(eq(projectsTable.createdById, user.id));

        await tx.delete(usersTable).where(eq(usersTable.id, user.id));
        counts.users = 1;
      });

      res.json({ message: "User permanently deleted", email: user.email, deletedCounts: counts });
    } catch (e: any) {
      console.error("Admin hard delete user error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: User Soft Delete (suspend + free email) ──
  app.delete("/api/admin/users/:id/soft", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const freedEmail = user.email;
      const tombstoneEmail = `deleted_${Date.now()}_${user.email}`;

      await db.transaction(async (tx) => {
        await tx.insert(platformAuditLogs).values({
          action: "SOFT_DELETE_USER",
          entityType: "USER",
          entityId: user.id,
          metadata: { originalEmail: freedEmail, tombstoneEmail, orgId: user.orgId },
          performedBy: "admin",
        });

        const membership = await tx.select().from(teamMemberships)
          .where(eq(teamMemberships.userId, user.id)).then(r => r[0]);

        if (membership) {
          const keys = await tx.select().from(allotlyApiKeysTable)
            .where(and(
              eq(allotlyApiKeysTable.membershipId, membership.id),
              eq(allotlyApiKeysTable.status, "ACTIVE")
            ));
          for (const k of keys) {
            await tx.update(allotlyApiKeysTable)
              .set({ status: "REVOKED", updatedAt: new Date() })
              .where(eq(allotlyApiKeysTable.id, k.id));
            await redisDel(REDIS_KEYS.apiKeyCache(k.keyHash));
          }
          await redisDel(REDIS_KEYS.budget(membership.id));
          await redisDel(REDIS_KEYS.concurrent(membership.id));
          await redisDel(REDIS_KEYS.ratelimit(membership.id));

          await tx.update(teamMemberships)
            .set({ status: "SUSPENDED" })
            .where(eq(teamMemberships.id, membership.id));
        }

        await tx.update(usersTable)
          .set({ email: tombstoneEmail, status: "SUSPENDED" } as any)
          .where(eq(usersTable.id, user.id));
      });

      res.json({ message: "User soft-deleted", freedEmail, note: "Email is now available for reuse" });
    } catch (e: any) {
      console.error("Admin soft delete user error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Reactivate User ──
  app.post("/api/admin/users/:id/reactivate", requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.status === "ACTIVE") return res.status(400).json({ message: "User is already active" });

      await storage.updateUser(user.id, { status: "ACTIVE" } as any);

      const membership = await storage.getMembershipByUser(user.id);
      if (membership && membership.status === "SUSPENDED") {
        await storage.updateMembership(membership.id, { status: "ACTIVE" });
      }

      await db.insert(platformAuditLogs).values({
        action: "REACTIVATE_USER",
        entityType: "USER",
        entityId: user.id,
        metadata: { email: user.email },
        performedBy: "admin",
      });

      res.json({ message: "User reactivated", email: user.email });
    } catch (e: any) {
      console.error("Admin reactivate user error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Transfer User to another org ──
  app.post("/api/admin/users/:id/transfer", requireAdmin, async (req, res) => {
    try {
      const transferSchema = z.object({
        targetOrgId: z.string().min(1),
        targetTeamId: z.string().min(1),
        moveHistory: z.boolean().default(false),
        monthlyBudgetCents: z.number().int().min(0).default(500),
        targetOrgRole: z.enum(["ROOT_ADMIN", "TEAM_ADMIN", "MEMBER"]).optional(),
      });
      const parsed = transferSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

      const user = await storage.getUser(req.params.id);
      if (!user) return res.status(404).json({ message: "User not found" });

      const targetOrg = await storage.getOrganization(parsed.data.targetOrgId);
      if (!targetOrg) return res.status(404).json({ message: "Target organization not found" });

      const targetTeam = await storage.getTeam(parsed.data.targetTeamId);
      if (!targetTeam || targetTeam.orgId !== targetOrg.id)
        return res.status(400).json({ message: "Target team not found or doesn't belong to target org" });

      const sourceOrgId = user.orgId;

      await db.transaction(async (tx) => {
        const oldMembership = await tx.select().from(teamMemberships)
          .where(eq(teamMemberships.userId, user.id)).then(r => r[0]);

        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        let activeMembershipId: string;

        if (oldMembership) {
          const keys = await tx.select().from(allotlyApiKeysTable)
            .where(eq(allotlyApiKeysTable.membershipId, oldMembership.id));
          for (const k of keys) {
            await redisDel(REDIS_KEYS.apiKeyCache(k.keyHash));
          }
          await tx.delete(allotlyApiKeysTable)
            .where(eq(allotlyApiKeysTable.membershipId, oldMembership.id));

          await redisDel(REDIS_KEYS.budget(oldMembership.id));
          await redisDel(REDIS_KEYS.concurrent(oldMembership.id));
          await redisDel(REDIS_KEYS.ratelimit(oldMembership.id));

          if (parsed.data.moveHistory) {
            await tx.update(teamMemberships)
              .set({
                teamId: targetTeam.id,
                monthlyBudgetCents: parsed.data.monthlyBudgetCents,
                currentPeriodSpendCents: 0,
                periodStart: now,
                periodEnd,
                status: "ACTIVE",
              })
              .where(eq(teamMemberships.id, oldMembership.id));
            activeMembershipId = oldMembership.id;
          } else {
            await tx.delete(proxyRequestLogs)
              .where(eq(proxyRequestLogs.membershipId, oldMembership.id));
            await tx.delete(usageSnapshots)
              .where(eq(usageSnapshots.membershipId, oldMembership.id));
            await tx.delete(budgetAlerts)
              .where(eq(budgetAlerts.membershipId, oldMembership.id));
            await tx.delete(teamMemberships).where(eq(teamMemberships.id, oldMembership.id));

            activeMembershipId = crypto.randomUUID();
            await tx.insert(teamMemberships).values({
              id: activeMembershipId,
              teamId: targetTeam.id,
              userId: user.id,
              accessType: "TEAM",
              monthlyBudgetCents: parsed.data.monthlyBudgetCents,
              currentPeriodSpendCents: 0,
              periodStart: now,
              periodEnd,
              maxTokensPerRequest: 4096,
              rpmLimit: 30,
              concurrencyLimit: 3,
              status: "ACTIVE",
            });
          }
        } else {
          activeMembershipId = crypto.randomUUID();
          await tx.insert(teamMemberships).values({
            id: activeMembershipId,
            teamId: targetTeam.id,
            userId: user.id,
            accessType: "TEAM",
            monthlyBudgetCents: parsed.data.monthlyBudgetCents,
            currentPeriodSpendCents: 0,
            periodStart: now,
            periodEnd,
            maxTokensPerRequest: 4096,
            rpmLimit: 30,
            concurrencyLimit: 3,
            status: "ACTIVE",
          });
        }

        const finalRole = parsed.data.targetOrgRole || user.orgRole;
        await tx.update(usersTable)
          .set({ orgId: targetOrg.id, orgRole: finalRole } as any)
          .where(eq(usersTable.id, user.id));

        await redisSet(REDIS_KEYS.budget(activeMembershipId), String(parsed.data.monthlyBudgetCents));

        const { key: newRawKey, hash: newKeyHash, prefix: newKeyPrefix } = generateAllotlyKey();
        await tx.insert(allotlyApiKeysTable).values({
          id: crypto.randomUUID(),
          userId: user.id,
          membershipId: activeMembershipId,
          keyHash: newKeyHash,
          keyPrefix: newKeyPrefix,
          status: "ACTIVE",
        });

        await tx.insert(platformAuditLogs).values({
          action: "TRANSFER_USER",
          entityType: "USER",
          entityId: user.id,
          metadata: {
            email: user.email,
            sourceOrgId,
            targetOrgId: targetOrg.id,
            targetTeamId: targetTeam.id,
            moveHistory: parsed.data.moveHistory,
          },
          performedBy: "admin",
        });
      });

      res.json({
        message: "User transferred successfully",
        email: user.email,
        from: sourceOrgId,
        to: targetOrg.id,
        team: targetTeam.name,
        historyMoved: parsed.data.moveHistory,
      });
    } catch (e: any) {
      console.error("Admin transfer user error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Delete Organization ──
  app.delete("/api/admin/organizations/:id", requireAdmin, async (req, res) => {
    try {
      const org = await storage.getOrganization(req.params.id);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const result = await cascadeDeleteOrganization(org.id, org.name, "admin", false);
      if (!result.success) return res.status(400).json({ message: result.error });

      res.json({ message: "Organization deleted", orgName: org.name, deletedCounts: result.deletedCounts });
    } catch (e: any) {
      console.error("Admin delete org error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Organization Drill-Down Details ──
  app.get("/api/admin/organizations/:id/details", requireAdmin, async (req, res) => {
    try {
      const org = await storage.getOrganization(req.params.id);
      if (!org) return res.status(404).json({ message: "Organization not found" });

      const orgTeams = await storage.getTeamsByOrg(org.id);
      const orgUsers = await storage.getUsersByOrg(org.id);
      const connections = await storage.getProviderConnectionsByOrg(org.id);
      const spendByTeam = await storage.getSpendByTeam(org.id);
      const spendByProvider = await storage.getSpendByProvider(org.id);

      const teamsWithMembers = await Promise.all(
        orgTeams.map(async (team) => {
          const members = await storage.getMemberDetailsForTeam(team.id);
          const memberCount = await storage.getMemberCountByTeam(team.id);
          return {
            ...team,
            memberCount,
            members: members.map((m: any) => ({
              membershipId: m.id || m.membershipId,
              userId: m.userId,
              email: m.email,
              name: m.name,
              status: m.status,
              monthlyBudgetCents: m.monthlyBudgetCents,
              currentPeriodSpendCents: m.currentPeriodSpendCents,
              accessType: m.accessType,
            })),
          };
        })
      );

      const allKeys = await storage.getAllApiKeysWithOwnerInfo(org.id);

      const orgVouchers = await storage.getVouchersByOrg(org.id);
      const orgBundles = await storage.getVoucherBundlesByOrg(org.id);

      res.json({
        ...org,
        users: orgUsers.map(u => ({
          id: u.id, email: u.email, name: u.name, orgRole: u.orgRole,
          status: u.status, isVoucherUser: u.isVoucherUser, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
        })),
        teams: teamsWithMembers,
        providerConnections: connections.map(c => ({
          id: c.id, provider: c.provider, status: c.status, createdAt: c.createdAt,
        })),
        keys: allKeys,
        vouchers: orgVouchers.length,
        bundles: orgBundles.length,
        spendByTeam,
        spendByProvider,
      });
    } catch (e: any) {
      console.error("Admin org details error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Platform-wide API Keys ──
  app.get("/api/admin/keys", requireAdmin, async (_req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const allKeys: any[] = [];

      for (const org of allOrgs) {
        const orgKeys = await storage.getAllApiKeysWithOwnerInfo(org.id);
        for (const k of orgKeys) {
          allKeys.push({ ...k, orgId: org.id, orgName: org.name });
        }
      }

      res.json(allKeys);
    } catch (e: any) {
      console.error("Admin keys error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Revoke specific key ──
  app.delete("/api/admin/keys/:id", requireAdmin, async (req, res) => {
    try {
      const key = await db.select().from(allotlyApiKeysTable)
        .where(eq(allotlyApiKeysTable.id, req.params.id)).then(r => r[0]);
      if (!key) return res.status(404).json({ message: "Key not found" });

      await db.update(allotlyApiKeysTable)
        .set({ status: "REVOKED", updatedAt: new Date() })
        .where(eq(allotlyApiKeysTable.id, key.id));
      await redisDel(REDIS_KEYS.apiKeyCache(key.keyHash));

      await db.insert(platformAuditLogs).values({
        action: "REVOKE_KEY",
        entityType: "API_KEY",
        entityId: key.id,
        metadata: { keyPrefix: key.keyPrefix, userId: key.userId },
        performedBy: "admin",
      });

      res.json({ message: "Key revoked", keyPrefix: key.keyPrefix });
    } catch (e: any) {
      console.error("Admin revoke key error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Platform-wide Audit Logs ──
  app.get("/api/admin/audit-logs", requireAdmin, async (req, res) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const conditions: any[] = [];

      if (req.query.orgId) {
        conditions.push(eq(auditLogs.orgId, req.query.orgId as string));
      }
      if (req.query.action) {
        conditions.push(like(auditLogs.action, `%${req.query.action}%`));
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const logs = await db.select().from(auditLogs)
        .where(where)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const totalResult = await db.select({ total: count() }).from(auditLogs).where(where);

      const platformLogs = await db.select().from(platformAuditLogs)
        .orderBy(desc(platformAuditLogs.timestamp))
        .limit(limit);

      res.json({
        orgLogs: logs,
        platformLogs,
        total: totalResult[0]?.total ?? 0,
        limit,
        offset,
      });
    } catch (e: any) {
      console.error("Admin audit logs error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Proxy Stats ──
  app.get("/api/admin/proxy-stats", requireAdmin, async (_req, res) => {
    try {
      const totalRequests = await db.select({ count: count() }).from(proxyRequestLogs);

      const byProvider = await db.select({
        provider: proxyRequestLogs.provider,
        requests: count(),
        totalCostCents: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
        avgDurationMs: sql<number>`COALESCE(AVG(${proxyRequestLogs.durationMs}), 0)`,
      }).from(proxyRequestLogs)
        .groupBy(proxyRequestLogs.provider);

      const byModel = await db.select({
        model: proxyRequestLogs.model,
        provider: proxyRequestLogs.provider,
        requests: count(),
        totalCostCents: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
      }).from(proxyRequestLogs)
        .groupBy(proxyRequestLogs.model, proxyRequestLogs.provider)
        .orderBy(desc(sql`count(*)`))
        .limit(20);

      const errors = await db.select({ count: count() }).from(proxyRequestLogs)
        .where(sql`${proxyRequestLogs.statusCode} >= 400`);

      const last24h = await db.select({ count: count() }).from(proxyRequestLogs)
        .where(gte(proxyRequestLogs.createdAt, new Date(Date.now() - 86400000)));

      res.json({
        totalRequests: totalRequests[0]?.count ?? 0,
        totalErrors: errors[0]?.count ?? 0,
        last24hRequests: last24h[0]?.count ?? 0,
        byProvider,
        byModel,
      });
    } catch (e: any) {
      console.error("Admin proxy stats error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Platform-wide Provider Connections ──
  app.get("/api/admin/providers", requireAdmin, async (_req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const allProviders: any[] = [];

      for (const org of allOrgs) {
        const connections = await storage.getProviderConnectionsByOrg(org.id);
        for (const c of connections) {
          allProviders.push({
            id: c.id,
            provider: c.provider,
            status: c.status,
            orgId: org.id,
            orgName: org.name,
            createdAt: c.createdAt,
          });
        }
      }

      res.json(allProviders);
    } catch (e: any) {
      console.error("Admin providers error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Platform-wide Vouchers ──
  app.get("/api/admin/vouchers", requireAdmin, async (_req, res) => {
    try {
      const allOrgs = await storage.getAllOrganizations();
      const allVouchers: any[] = [];

      for (const org of allOrgs) {
        const orgVouchers = await storage.getVouchersByOrg(org.id);
        for (const v of orgVouchers) {
          allVouchers.push({
            id: v.id,
            code: v.code,
            status: v.status,
            maxRedemptions: v.maxRedemptions,
            currentRedemptions: v.currentRedemptions,
            budgetCents: v.budgetCents,
            expiresAt: v.expiresAt,
            orgId: org.id,
            orgName: org.name,
            teamId: v.teamId,
            createdAt: v.createdAt,
          });
        }
      }

      res.json(allVouchers);
    } catch (e: any) {
      console.error("Admin vouchers error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ── Admin: Void/Expire a Voucher ──
  app.patch("/api/admin/vouchers/:id", requireAdmin, async (req, res) => {
    try {
      const voucherPatchSchema = z.object({
        status: z.enum(["EXPIRED", "REVOKED"]),
      });
      const parsed = voucherPatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error" });

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher) return res.status(404).json({ message: "Voucher not found" });

      await storage.updateVoucher(voucher.id, { status: parsed.data.status });

      await db.insert(platformAuditLogs).values({
        action: "VOID_VOUCHER",
        entityType: "VOUCHER",
        entityId: voucher.id,
        metadata: { code: voucher.code, newStatus: parsed.data.status },
        performedBy: "admin",
      });

      res.json({ message: `Voucher ${parsed.data.status.toLowerCase()}`, code: voucher.code });
    } catch (e: any) {
      console.error("Admin void voucher error:", e);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.use("/api/v1", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Expose-Headers", "X-Allotly-Budget-Remaining, X-Allotly-Budget-Total, X-Allotly-Expires, X-Allotly-Requests-Remaining");
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });

  app.post("/api/v1/chat/completions", handleChatCompletion);
  app.get("/api/v1/models", handleListModels);
  app.get("/api/v1/health", (_req, res) => {
    res.json({ status: "ok", proxy: true, timestamp: new Date().toISOString() });
  });

  app.all("/api/v1/chat/completions", (req, res) => {
    res.status(405).json({
      error: {
        code: "method_not_allowed",
        message: `Method ${req.method} is not allowed on this endpoint. Use POST.`,
        type: "allotly_error",
      },
    });
  });

  app.all("/api/v1/models", (req, res) => {
    res.status(405).json({
      error: {
        code: "method_not_allowed",
        message: `Method ${req.method} is not allowed on this endpoint. Use GET.`,
        type: "allotly_error",
      },
    });
  });

  app.all("/api/v1/health", (req, res) => {
    res.status(405).json({
      error: {
        code: "method_not_allowed",
        message: `Method ${req.method} is not allowed on this endpoint. Use GET.`,
        type: "allotly_error",
      },
    });
  });

  app.all("/api/v1/{*path}", (_req, res) => {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "API endpoint not found.",
        type: "allotly_error",
      },
    });
  });

  app.all("/api/{*path}", (_req, res) => {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "API endpoint not found.",
        type: "allotly_error",
      },
    });
  });

  console.log("[routes] Proxy routes registered: POST /api/v1/chat/completions, GET /api/v1/models, GET /api/v1/health");

  return httpServer;
}
