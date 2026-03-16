import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole, requireAdmin } from "./auth";
import { hashPassword, comparePasswords } from "./lib/password";
import { signupSchema, loginSchema, voucherBundles, users as usersTable } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
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
import { redisSet, redisGet, redisDel, redisIncr, REDIS_KEYS } from "./lib/redis";
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
      const existing = await storage.getUserByEmail(data.email);
      if (existing) {
        return res.status(400).json({ message: "Email already in use" });
      }

      const org = await storage.createOrganization({ name: data.orgName, plan: "FREE", maxTeamAdmins: 0 });
      const passwordHash = await hashPassword(data.password);
      const user = await storage.createUser({
        email: data.email,
        name: data.name,
        passwordHash,
        orgId: org.id,
        orgRole: "ROOT_ADMIN",
        status: "ACTIVE",
        isVoucherUser: false,
      });

      await storage.createTeam({
        name: "Default",
        orgId: org.id,
        adminId: user.id,
      });

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
    }));
    res.json(sanitized);
  });

  app.post("/api/providers", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const providerSchema = z.object({
        provider: z.enum(["OPENAI", "ANTHROPIC", "GOOGLE"]),
        apiKey: z.string().min(1),
        displayName: z.string().max(100).optional(),
      });
      const parsed = providerSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      const { provider, apiKey, displayName } = parsed.data;

      const providerCheck = await checkPlanLimit(user.orgId, "provider");
      if (!providerCheck.allowed) {
        return res.status(400).json({ message: providerCheck.message });
      }

      const adapter = getProviderAdapter(provider);
      if (!adapter) {
        return res.status(400).json({ message: "Unsupported AI Provider" });
      }

      const validation = await adapter.validateAdminKey(apiKey);
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
      });

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
      });
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });
      }

      const { displayName, orgAllowedModels } = parsed.data;
      const updates: Record<string, any> = { updatedAt: new Date() };
      if (displayName !== undefined) updates.displayName = displayName;
      if (orgAllowedModels !== undefined) updates.orgAllowedModels = orgAllowedModels;

      const updated = await storage.updateProviderConnection(conn.id, updates);

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

      const newStatus = result.valid ? "ACTIVE" : "INVALID_KEY";
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
      const { adminEmail, adminName, teamName, adminPassword } = parsed.data;

      const teamCheck = await checkPlanLimit(user.orgId, "team");
      if (!teamCheck.allowed) {
        return res.status(400).json({ message: teamCheck.message });
      }
      const adminCheck = await checkPlanLimit(user.orgId, "team_admin");
      if (!adminCheck.allowed) {
        return res.status(400).json({ message: adminCheck.message });
      }

      const crypto = await import("crypto");
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await hashPassword(randomPassword);
      const adminUser = await storage.createUser({
        email: adminEmail,
        name: adminName || adminEmail.split("@")[0],
        passwordHash,
        orgId: user.orgId,
        orgRole: "TEAM_ADMIN",
        status: "INVITED",
        isVoucherUser: false,
      });

      const team = await storage.createTeam({
        name: teamName,
        orgId: user.orgId,
        adminId: adminUser.id,
      });

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
        return res.status(400).json({ message: "Email already in use" });
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
      const { email, name, teamId, budgetCents, accessType, allowedModels, allowedProviders } = parsed.data;

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
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const passwordHash = await hashPassword(randomPassword);
      const memberUser = await storage.createUser({
        email,
        name: name || email.split("@")[0],
        passwordHash,
        orgId: user.orgId,
        orgRole: "MEMBER",
        status: "INVITED",
        isVoucherUser: false,
      });

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

      const voucher = await storage.getVoucherById(req.params.id);
      if (!voucher || voucher.orgId !== user.orgId) {
        return res.status(404).json({ message: "Voucher not found" });
      }

      if (voucher.status !== "ACTIVE") {
        return res.status(400).json({ message: `Voucher is already ${voucher.status.toLowerCase()}` });
      }

      const updated = await storage.updateVoucher(voucher.id, { status: "REVOKED" });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "voucher.revoked",
        targetType: "voucher",
        targetId: voucher.id,
        metadata: { code: voucher.code },
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
      csvLines.push(`"${new Date(log.createdAt).toISOString()}","${actorName}","${actorRole}","${log.action}","${log.targetType || ""}","${log.targetId || ""}","${metadata}"`);
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
    const settingsSchema = z.object({
      name: z.string().min(1).optional(),
      billingEmail: z.string().email().nullable().optional(),
      description: z.string().max(500).nullable().optional(),
      orgBudgetCeilingCents: z.number().int().min(0).nullable().optional(),
      defaultMemberBudgetCents: z.number().int().min(0).nullable().optional(),
    });
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Validation error", errors: parsed.error.errors });

    const before = await storage.getOrganization(user.orgId);
    const { name, billingEmail, description, orgBudgetCeilingCents, defaultMemberBudgetCents } = parsed.data;
    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name;
    if (billingEmail !== undefined) updateData.billingEmail = billingEmail;
    if (description !== undefined) updateData.description = description;
    if (orgBudgetCeilingCents !== undefined) updateData.orgBudgetCeilingCents = orgBudgetCeilingCents;
    if (defaultMemberBudgetCents !== undefined) updateData.defaultMemberBudgetCents = defaultMemberBudgetCents;

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

  console.log("[routes] Proxy routes registered: POST /api/v1/chat/completions, GET /api/v1/models, GET /api/v1/health");

  return httpServer;
}
