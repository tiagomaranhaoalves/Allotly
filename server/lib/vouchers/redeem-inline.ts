import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { voucherBundles } from "@shared/schema";
import type { User, TeamMembership, Voucher } from "@shared/schema";
import { hashPassword } from "../password";
import { generateAllotlyKey } from "../keys";
import { redisSet, redisGet, redisIncr, REDIS_KEYS } from "../redis";
import { sendEmail, emailTemplates } from "../email";
import { checkPlanLimit } from "../plan-limits";

export type RedeemInlineFailureCode =
  | "voucher_invalid"
  | "voucher_expired"
  | "voucher_fully_redeemed"
  | "team_not_found"
  | "member_limit"
  | "bundle_exhausted";

export interface RedeemInlineSuccess {
  ok: true;
  user: User;
  membership: TeamMembership;
  voucher: Voucher;
  apiKey: string;
  keyPrefix: string;
  budgetCents: number;
  expiresAt: Date;
  models: Array<{ modelId: string; displayName: string; provider: string }>;
  baseUrl: string;
  hasAccount: boolean;
  isSynthetic: boolean;
}

export interface RedeemInlineFailure {
  ok: false;
  code: RedeemInlineFailureCode;
  message: string;
}

export type RedeemInlineResult = RedeemInlineSuccess | RedeemInlineFailure;

export interface RedeemInlineInput {
  code: string;
  email?: string;
  name?: string;
  password?: string;
  instant?: boolean;
}

/**
 * Pure side-effect helper extracted from POST /api/vouchers/redeem so the same
 * logic can be reused by the OAuth credential form (where the user submits a
 * voucher inline during /oauth/authorize and we mint a synthetic account on
 * the spot — no email/password collected).
 *
 * Side effects on success: user creation, membership, redemption row, voucher
 * counter increment, optional bundle counter increment, Redis budget seed,
 * Allotly API key creation, audit log row, best-effort admin notification email.
 *
 * Does NOT touch req/res/session — callers are responsible for HTTP shaping
 * and session login. This keeps the helper trivially testable and reusable
 * from the OAuth POST handler.
 *
 * RNG hardening: synthetic email + password use crypto.randomBytes (vs. the
 * Math.random() in the original route), so OAuth-path synthetic credentials
 * are not predictable from a same-process attacker.
 */
export async function redeemVoucherInline(input: RedeemInlineInput): Promise<RedeemInlineResult> {
  const { code, email, name, password, instant } = input;

  const voucher = await storage.getVoucherByCode(code.toUpperCase());
  if (!voucher || voucher.status !== "ACTIVE") {
    return { ok: false, code: "voucher_invalid", message: "Invalid or inactive voucher" };
  }

  if (new Date(voucher.expiresAt) < new Date()) {
    return { ok: false, code: "voucher_expired", message: "Voucher has expired" };
  }

  if (voucher.currentRedemptions >= voucher.maxRedemptions) {
    return { ok: false, code: "voucher_fully_redeemed", message: "Voucher is fully redeemed" };
  }

  const team = await storage.getTeam(voucher.teamId);
  if (!team) {
    return { ok: false, code: "team_not_found", message: "Team not found" };
  }

  const memberCheck = await checkPlanLimit(voucher.orgId, "member", voucher.teamId);
  if (!memberCheck.allowed) {
    return { ok: false, code: "member_limit", message: "This team has reached its member limit" };
  }

  const isSynthetic = Boolean(instant) || !email;

  let userEmail = email;
  let userPassword = password;
  if (isSynthetic) {
    // crypto.randomBytes (CSPRNG) — Math.random was the prior weakness; for
    // synthetic accounts the password is never shared but the email forms
    // part of audit logs, so we keep it unpredictable.
    const rand = crypto.randomBytes(4).toString("hex");
    userEmail = `voucher-${code.slice(0, 8)}-${rand}@allotly.local`;
    userPassword = crypto.randomBytes(16).toString("base64url");
  }

  const passwordHash = await hashPassword(userPassword || "changeme123");
  const voucherUser = await storage.createUser({
    email: userEmail!,
    name: name || "Voucher User",
    passwordHash,
    orgId: voucher.orgId,
    orgRole: "MEMBER",
    status: "ACTIVE",
    isVoucherUser: true,
  } as any);

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
  } as any);

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
        return { ok: false, code: "bundle_exhausted", message: "Bundle redemption pool is exhausted" };
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
  } as any);

  const teamAdmin = await storage.getUser(team.adminId);
  if (teamAdmin?.email) {
    const tmpl = emailTemplates.voucherRedeemed(
      teamAdmin.name || "Admin",
      voucher.code,
      userEmail || "anonymous",
      team.name,
    );
    try { await sendEmail(teamAdmin.email, tmpl.subject, tmpl.html); } catch {}
  }

  const models = await storage.getModelPricing();
  const allowedProviders = voucher.allowedProviders as string[];
  const availableModels = models.filter((m) => allowedProviders.includes(m.provider));

  return {
    ok: true,
    user: voucherUser,
    membership,
    voucher,
    apiKey: key,
    keyPrefix: prefix,
    budgetCents: voucher.budgetCents,
    expiresAt: voucher.expiresAt,
    models: availableModels.map((m) => ({ modelId: m.modelId, displayName: m.displayName, provider: m.provider })),
    baseUrl: "/api/v1",
    hasAccount: !isSynthetic,
    isSynthetic,
  };
}
