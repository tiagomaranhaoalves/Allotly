import crypto from "crypto";
import { z } from "zod";
import { storage } from "../../storage";
import { hashPassword } from "../password";
import { generateAllotlyKey } from "../keys";
import { redisSet, REDIS_KEYS } from "../redis";
import { checkPlanLimit } from "../plan-limits";
import { sendEmail, emailTemplates } from "../email";
import { centsToMicroCents } from "../currency";

export const addMemberSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  teamId: z.string().optional(),
  budgetCents: z.number().int().min(100),
  accessType: z.enum(["TEAM", "VOUCHER"]).optional(),
  allowedModels: z.array(z.string()).nullable().optional(),
  allowedProviders: z.array(z.string()).nullable().optional(),
});

export async function createMemberHandler(req: any, res: any) {
  try {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.orgRole === "MEMBER") return res.status(403).json({ message: "Forbidden" });

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

    const existingUser = await storage.getUserByEmail(email);
    let memberUser;
    let isExistingUser = false;

    if (existingUser) {
      if (existingUser.orgId !== user.orgId) {
        return res.status(400).json({ message: "This email belongs to a user in another organization" });
      }
      // Multi-team users are allowed: only block when this user is already
      // on the *target* team. A user can legitimately be on several teams
      // within the same org (e.g. they were invited to a second team).
      const existingMembership = await storage.getMembershipByUserAndTeam(existingUser.id, targetTeamId);
      if (existingMembership) {
        return res.status(400).json({ message: "This user is already a member of this team" });
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
      monthlyBudgetCents: centsToMicroCents(budgetCents),
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

    await redisSet(REDIS_KEYS.budget(membership.id), String(centsToMicroCents(budgetCents)));

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
      const baseUrl = `${req.protocol}://${req.get("host")}`;

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
        setupUrl,
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
}
