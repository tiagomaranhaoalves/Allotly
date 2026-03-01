import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, requireAuth, requireRole } from "./auth";
import { hashPassword, comparePasswords } from "./lib/password";
import { signupSchema, loginSchema } from "@shared/schema";
import { encryptProviderKey } from "./lib/encryption";
import { generateVoucherCode } from "./lib/voucher-codes";
import { generateAllotlyKey, hashKey } from "./lib/keys";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

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

  app.post("/api/auth/login", async (req, res) => {
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

  app.get("/api/providers", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const connections = await storage.getProviderConnectionsByOrg(user.orgId);
    const sanitized = connections.map(c => ({
      id: c.id,
      provider: c.provider,
      displayName: c.displayName,
      automationLevel: c.automationLevel,
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
      const { provider, apiKey, displayName } = req.body;

      if (!provider || !apiKey) {
        return res.status(400).json({ message: "Provider and API key are required" });
      }

      const automationLevel = provider === "OPENAI" ? "FULL_AUTO" : provider === "ANTHROPIC" ? "SEMI_AUTO" : "GUIDED";
      const { encrypted, iv, tag } = encryptProviderKey(apiKey);

      const connection = await storage.createProviderConnection({
        orgId: user.orgId,
        provider,
        displayName: displayName || provider,
        adminApiKeyEncrypted: encrypted,
        adminApiKeyIv: iv,
        adminApiKeyTag: tag,
        automationLevel: automationLevel as any,
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
        automationLevel: connection.automationLevel,
        status: connection.status,
      });
    } catch (e: any) {
      if (e.code === "23505") {
        return res.status(400).json({ message: "Provider already connected" });
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

  app.post("/api/teams", requireRole("ROOT_ADMIN"), async (req, res) => {
    try {
      const user = (req as any).user;
      const { adminEmail, adminName, teamName, adminPassword } = req.body;

      if (!adminEmail || !teamName) {
        return res.status(400).json({ message: "Admin email and team name required" });
      }

      const passwordHash = adminPassword ? await hashPassword(adminPassword) : await hashPassword("changeme123");
      const adminUser = await storage.createUser({
        email: adminEmail,
        name: adminName || adminEmail.split("@")[0],
        passwordHash,
        orgId: user.orgId,
        orgRole: "TEAM_ADMIN",
        status: "ACTIVE",
        isVoucherUser: false,
      });

      const team = await storage.createTeam({
        name: teamName,
        orgId: user.orgId,
        adminId: adminUser.id,
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "team.created",
        targetType: "team",
        targetId: team.id,
        metadata: { teamName, adminEmail },
      });

      res.json({ team, admin: { id: adminUser.id, email: adminUser.email, name: adminUser.name } });
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

      const { email, name, teamId, budgetCents, accessMode, allowedModels, allowedProviders, password } = req.body;

      let targetTeamId = teamId;
      if (user.orgRole === "TEAM_ADMIN") {
        const team = await storage.getTeamByAdmin(user.id);
        if (!team) return res.status(400).json({ message: "No team found" });
        targetTeamId = team.id;
      } else if (user.orgRole === "ROOT_ADMIN" && targetTeamId) {
        const team = await storage.getTeam(targetTeamId);
        if (!team || team.orgId !== user.orgId) return res.status(400).json({ message: "Team not found in your organization" });
      }

      if (!targetTeamId || !email || !budgetCents || typeof budgetCents !== "number" || budgetCents <= 0) {
        return res.status(400).json({ message: "Missing or invalid required fields" });
      }

      const passwordHash = password ? await hashPassword(password) : await hashPassword("changeme123");
      const memberUser = await storage.createUser({
        email,
        name: name || email.split("@")[0],
        passwordHash,
        orgId: user.orgId,
        orgRole: "MEMBER",
        status: "ACTIVE",
        isVoucherUser: false,
      });

      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      const membership = await storage.createMembership({
        teamId: targetTeamId,
        userId: memberUser.id,
        accessMode: accessMode || "DIRECT",
        monthlyBudgetCents: budgetCents,
        allowedModels: allowedModels || null,
        allowedProviders: allowedProviders || null,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd,
        status: "ACTIVE",
      });

      await storage.createAuditLog({
        orgId: user.orgId,
        actorId: user.id,
        action: "member.created",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { email, accessMode: accessMode || "DIRECT" },
      });

      res.json({ membership, user: { id: memberUser.id, email: memberUser.email, name: memberUser.name } });
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
    res.json({ message: "Reactivated" });
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

  app.post("/api/vouchers", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user || user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

      const { label, budgetCents, allowedProviders, allowedModels, expiresAt, maxRedemptions, teamId } = req.body;

      let targetTeamId = teamId;
      if (user.orgRole === "TEAM_ADMIN") {
        const team = await storage.getTeamByAdmin(user.id);
        if (!team) return res.status(400).json({ message: "No team found" });
        targetTeamId = team.id;
      } else if (user.orgRole === "ROOT_ADMIN" && targetTeamId) {
        const team = await storage.getTeam(targetTeamId);
        if (!team || team.orgId !== user.orgId) return res.status(400).json({ message: "Team not found in your organization" });
      }

      if (!targetTeamId || !budgetCents || typeof budgetCents !== "number" || budgetCents <= 0 || !allowedProviders || !Array.isArray(allowedProviders) || !expiresAt) {
        return res.status(400).json({ message: "Missing or invalid required fields" });
      }

      const code = generateVoucherCode();

      const voucher = await storage.createVoucher({
        code,
        orgId: user.orgId,
        teamId: targetTeamId,
        createdById: user.id,
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
        metadata: { code, budgetCents, maxRedemptions: maxRedemptions || 1 },
      });

      res.json(voucher);
    } catch (e: any) {
      console.error("Voucher create error:", e);
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

  app.post("/api/vouchers/redeem", async (req, res) => {
    try {
      const { code, email, name, password, instant } = req.body;

      if (!code) {
        return res.status(400).json({ message: "Voucher code required" });
      }

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
        accessMode: "PROXY",
        monthlyBudgetCents: voucher.budgetCents,
        allowedModels: voucher.allowedModels,
        allowedProviders: voucher.allowedProviders,
        currentPeriodSpendCents: 0,
        periodStart: now,
        periodEnd: new Date(voucher.expiresAt),
        status: "ACTIVE",
      });

      await storage.createVoucherRedemption({ voucherId: voucher.id, userId: voucherUser.id });
      await storage.updateVoucher(voucher.id, { currentRedemptions: voucher.currentRedemptions + 1 });

      if (voucher.currentRedemptions + 1 >= voucher.maxRedemptions) {
        await storage.updateVoucher(voucher.id, { status: "FULLY_REDEEMED" });
      }

      const { key, hash, prefix } = generateAllotlyKey();
      await storage.createAllotlyApiKey({
        userId: voucherUser.id,
        membershipId: membership.id,
        keyHash: hash,
        keyPrefix: prefix,
      });

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
        accessMode: membership?.accessMode || "DIRECT",
      });
    }
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
    const logs = await storage.getAuditLogsByOrg(user.orgId, 200);
    res.json(logs);
  });

  app.get("/api/org/settings", requireAuth, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    const org = await storage.getOrganization(user.orgId);
    res.json(org);
  });

  app.patch("/api/org/settings", requireRole("ROOT_ADMIN"), async (req, res) => {
    const user = (req as any).user;
    const { name, orgBudgetCeilingCents, defaultMemberBudgetCents } = req.body;
    const updated = await storage.updateOrganization(user.orgId, { name, orgBudgetCeilingCents, defaultMemberBudgetCents });
    res.json(updated);
  });

  return httpServer;
}
