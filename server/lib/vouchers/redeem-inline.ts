import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../../db";
import { storage } from "../../storage";
import { vouchers, voucherBundles } from "@shared/schema";
import type {
  User,
  TeamMembership,
  Voucher,
  InsertUser,
  InsertTeamMembership,
  InsertAuditLog,
} from "@shared/schema";
import { hashPassword } from "../password";
import { generateAllotlyKey } from "../keys";
import { redisSet, redisGet, redisIncr, REDIS_KEYS } from "../redis";
import { sendEmail, emailTemplates } from "../email";
import { checkPlanLimit } from "../plan-limits";
import { microCentsToCents } from "../currency";

type VoucherBundle = typeof voucherBundles.$inferSelect;

/**
 * Atomically claim one redemption slot on a voucher.
 *
 * Uses a conditional UPDATE so concurrent redemptions of the same voucher
 * cannot both pass the limit check (which previously happened because the
 * read of `currentRedemptions` and the subsequent increment were two
 * separate, non-transactional steps). The same UPDATE flips status to
 * `FULLY_REDEEMED` when the increment fills the last slot, eliminating the
 * second non-atomic write that the original three-step pattern used.
 *
 * Returns the updated voucher row on success, or `null` if another concurrent
 * redemption beat us to the last slot (or the voucher transitioned out of
 * ACTIVE between the initial read and the claim).
 *
 * Exported so the race can be exercised directly from tests without spinning
 * up the full `redeemVoucherInline` side-effect chain.
 */
export async function claimVoucherSlot(
  executor: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  voucherId: string,
): Promise<Voucher | null> {
  const [updated] = await executor
    .update(vouchers)
    .set({
      currentRedemptions: sql`${vouchers.currentRedemptions} + 1`,
      status: sql`CASE WHEN ${vouchers.currentRedemptions} + 1 >= ${vouchers.maxRedemptions} THEN 'FULLY_REDEEMED' ELSE ${vouchers.status} END`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vouchers.id, voucherId),
        eq(vouchers.status, "ACTIVE"),
        sql`${vouchers.currentRedemptions} < ${vouchers.maxRedemptions}`,
      ),
    )
    .returning();
  return updated ?? null;
}

/**
 * Atomically claim one slot on a voucher and (if applicable) one slot in its
 * backing bundle, in a single transaction. Either both claims commit or
 * neither does, so a successful voucher claim cannot leak when the bundle
 * pool is exhausted (and vice-versa).
 */
type ClaimOutcome =
  | { ok: true; voucher: Voucher; bundle: VoucherBundle | null }
  | { ok: false; code: "voucher_fully_redeemed" | "bundle_exhausted" };

/**
 * Best-effort compensation: undo a successful `claimVoucherAndBundle` when a
 * downstream side effect (user/membership/redemption-row creation, Redis
 * write, etc.) fails. The voucher counter is decremented and `FULLY_REDEEMED`
 * is reverted to `ACTIVE` if-and-only-if the row is currently FULLY_REDEEMED
 * *and* the new counter would be below the limit. Same logic for the bundle.
 *
 * Performed in a transaction so the two decrements either both happen or
 * neither does. Errors during release are swallowed (logged) so they cannot
 * mask the original error the caller is propagating.
 */
async function releaseVoucherSlot(voucherId: string, bundleId: string | null): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(vouchers)
        .set({
          currentRedemptions: sql`GREATEST(${vouchers.currentRedemptions} - 1, 0)`,
          status: sql`CASE WHEN ${vouchers.status} = 'FULLY_REDEEMED' AND (${vouchers.currentRedemptions} - 1) < ${vouchers.maxRedemptions} THEN 'ACTIVE' ELSE ${vouchers.status} END`,
          updatedAt: new Date(),
        })
        .where(eq(vouchers.id, voucherId));
      if (bundleId) {
        await tx
          .update(voucherBundles)
          .set({
            usedRedemptions: sql`GREATEST(${voucherBundles.usedRedemptions} - 1, 0)`,
            status: sql`CASE WHEN ${voucherBundles.status} = 'EXHAUSTED' AND (${voucherBundles.usedRedemptions} - 1) < ${voucherBundles.totalRedemptions} THEN 'ACTIVE' ELSE ${voucherBundles.status} END`,
            updatedAt: new Date(),
          })
          .where(eq(voucherBundles.id, bundleId));
      }
    });
  } catch (releaseErr) {
    console.error("[redeem-inline] failed to release voucher slot after downstream error", { voucherId, bundleId, err: releaseErr });
  }
}

async function claimVoucherAndBundle(voucher: Voucher): Promise<ClaimOutcome> {
  const SENTINEL = Symbol("claim_failed");
  type Failure = { sentinel: typeof SENTINEL; code: "voucher_fully_redeemed" | "bundle_exhausted" };
  try {
    return await db.transaction(async (tx) => {
      const claimed = await claimVoucherSlot(tx, voucher.id);
      if (!claimed) {
        const fail: Failure = { sentinel: SENTINEL, code: "voucher_fully_redeemed" };
        throw fail;
      }
      let bundle: VoucherBundle | null = null;
      if (voucher.bundleId) {
        const [b] = await tx
          .update(voucherBundles)
          .set({
            usedRedemptions: sql`${voucherBundles.usedRedemptions} + 1`,
            status: sql`CASE WHEN ${voucherBundles.usedRedemptions} + 1 >= ${voucherBundles.totalRedemptions} THEN 'EXHAUSTED' ELSE ${voucherBundles.status} END`,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(voucherBundles.id, voucher.bundleId),
              sql`${voucherBundles.usedRedemptions} < ${voucherBundles.totalRedemptions}`,
              eq(voucherBundles.status, "ACTIVE"),
            ),
          )
          .returning();
        if (!b) {
          const fail: Failure = { sentinel: SENTINEL, code: "bundle_exhausted" };
          throw fail;
        }
        bundle = b;
      }
      return { ok: true as const, voucher: claimed, bundle };
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as Failure).sentinel === SENTINEL) {
      return { ok: false, code: (e as Failure).code };
    }
    throw e;
  }
}

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
  /**
   * Set when the failure is attributable to a specific voucher we located
   * (i.e. anything other than `voucher_invalid` for a non-existent code).
   * Callers (e.g. the OAuth credential POST) use this to write a structured
   * audit-log row for failed attempts without violating the audit_logs
   * NOT NULL FK on `org_id` / `actor_id`. `actorId` is the voucher creator
   * (team admin) — the closest "system actor" for an attributable failure.
   */
  orgId?: string;
  voucherId?: string;
  actorId?: string;
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
    // For an inactive (vs missing) voucher we *do* know the org — surface it
    // so the caller can attribute an audit log row.
    return {
      ok: false,
      code: "voucher_invalid",
      message: "Invalid or inactive voucher",
      orgId: voucher?.orgId,
      voucherId: voucher?.id,
      actorId: voucher?.createdById,
    };
  }

  if (new Date(voucher.expiresAt) < new Date()) {
    return { ok: false, code: "voucher_expired", message: "Voucher has expired", orgId: voucher.orgId, voucherId: voucher.id, actorId: voucher.createdById };
  }

  if (voucher.currentRedemptions >= voucher.maxRedemptions) {
    return { ok: false, code: "voucher_fully_redeemed", message: "Voucher is fully redeemed", orgId: voucher.orgId, voucherId: voucher.id, actorId: voucher.createdById };
  }

  const team = await storage.getTeam(voucher.teamId);
  if (!team) {
    return { ok: false, code: "team_not_found", message: "Team not found", orgId: voucher.orgId, voucherId: voucher.id, actorId: voucher.createdById };
  }

  const memberCheck = await checkPlanLimit(voucher.orgId, "member", voucher.teamId);
  if (!memberCheck.allowed) {
    return { ok: false, code: "member_limit", message: "This team has reached its member limit", orgId: voucher.orgId, voucherId: voucher.id, actorId: voucher.createdById };
  }

  // Atomically reserve the voucher (and bundle) slot up front, before we
  // create any user/membership/redemption rows. Two concurrent redemptions
  // racing on the same last slot will both pass the read-time check above —
  // only one will pass this conditional UPDATE. The other gets a clean
  // "fully redeemed" response with zero side effects.
  const claim = await claimVoucherAndBundle(voucher);
  if (!claim.ok) {
    const message =
      claim.code === "voucher_fully_redeemed"
        ? "Voucher is fully redeemed"
        : "Bundle redemption pool is exhausted";
    return {
      ok: false,
      code: claim.code,
      message,
      orgId: voucher.orgId,
      voucherId: voucher.id,
      actorId: voucher.createdById,
    };
  }
  const claimedBundle = claim.bundle;

  // Compensation barrier: anything that throws between the atomic claim and
  // the persistence of the durable redemption row must release the reserved
  // voucher (and bundle) slot — otherwise the voucher's capacity is
  // permanently consumed without a successful redemption. Once
  // `createVoucherRedemption` has committed, the redemption is "real" and
  // we MUST NOT release the slot, even if a later side effect (Redis,
  // Allotly key, audit row) fails — releasing would re-open capacity that
  // a persisted redemption row already occupies, allowing genuine
  // over-redemption on retry.
  //
  // Storage operations here do not share a single transaction (the
  // IStorage interface targets the global db pool), so transactional
  // all-or-nothing isn't currently feasible without a wider refactor.
  // The release-only-while-pre-persistence window is the pragmatic
  // alternative; #55 tracks the larger transactional refactor.
  let redemptionPersisted = false;
  try {
    const isSynthetic = Boolean(instant) || !email;

    let userEmail: string;
    let userPassword: string;
    if (isSynthetic) {
      // crypto.randomBytes (CSPRNG) — Math.random was the prior weakness; for
      // synthetic accounts the password is never shared but the email forms
      // part of audit logs, so we keep it unpredictable.
      const rand = crypto.randomBytes(4).toString("hex");
      userEmail = `voucher-${code.slice(0, 8)}-${rand}@allotly.local`;
      userPassword = crypto.randomBytes(16).toString("base64url");
    } else {
      userEmail = email!;
      userPassword = password || "changeme123";
    }

    const passwordHash = await hashPassword(userPassword);
    const newUser: InsertUser = {
      email: userEmail,
      name: name || "Voucher User",
      passwordHash,
      orgId: voucher.orgId,
      orgRole: "MEMBER",
      status: "ACTIVE",
      isVoucherUser: true,
    };
    const voucherUser = await storage.createUser(newUser);

    const now = new Date();
    const newMembership: InsertTeamMembership = {
      teamId: voucher.teamId,
      userId: voucherUser.id,
      accessType: "VOUCHER",
      monthlyBudgetCents: voucher.budgetCents,
      // JSON columns: voucher.allowedModels is `unknown`, membership column
      // accepts the same shape. Cast through unknown to satisfy drizzle-zod's
      // inferred Json type without `any`.
      allowedModels: voucher.allowedModels as InsertTeamMembership["allowedModels"],
      allowedProviders: voucher.allowedProviders as InsertTeamMembership["allowedProviders"],
      currentPeriodSpendCents: 0,
      periodStart: now,
      periodEnd: new Date(voucher.expiresAt),
      status: "ACTIVE",
      voucherRedemptionId: voucher.id,
    };
    const membership = await storage.createMembership(newMembership);

    await storage.createVoucherRedemption({ voucherId: voucher.id, userId: voucherUser.id });
    // Past this point the redemption is durably persisted: any later failure
    // is a degraded-but-real redemption, not a candidate for slot release.
    redemptionPersisted = true;

    // Voucher counter + bundle counter were already incremented atomically by
    // claimVoucherAndBundle above. All that remains is the (non-racy) Redis
    // bookkeeping for the bundle.
    if (claimedBundle) {
      const bundleReqKey = REDIS_KEYS.bundleRequests(claimedBundle.id);
      const existingReqs = await redisGet(bundleReqKey);
      if (existingReqs === null) {
        await redisSet(bundleReqKey, String(claimedBundle.usedProxyRequests));
      }
      await redisIncr(REDIS_KEYS.bundleRedemptions(claimedBundle.id));
    }

    await redisSet(REDIS_KEYS.budget(membership.id), String(voucher.budgetCents));

    const { key, hash, prefix } = generateAllotlyKey();
    await storage.createAllotlyApiKey({
      userId: voucherUser.id,
      membershipId: membership.id,
      keyHash: hash,
      keyPrefix: prefix,
    });

    const auditEntry: InsertAuditLog = {
      orgId: voucher.orgId,
      actorId: voucherUser.id,
      action: "voucher.redeemed",
      targetType: "voucher",
      targetId: voucher.id,
      metadata: { code: voucher.code, email: userEmail },
    };
    await storage.createAuditLog(auditEntry);

    const teamAdmin = await storage.getUser(team.adminId);
    if (teamAdmin?.email) {
      const tmpl = emailTemplates.voucherRedeemed(
        teamAdmin.name || "Admin",
        voucher.code,
        userEmail,
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
      voucher: claim.voucher,
      apiKey: key,
      keyPrefix: prefix,
      budgetCents: microCentsToCents(voucher.budgetCents),
      expiresAt: voucher.expiresAt,
      models: availableModels.map((m) => ({ modelId: m.modelId, displayName: m.displayName, provider: m.provider })),
      baseUrl: "/api/v1",
      hasAccount: !isSynthetic,
      isSynthetic,
    };
  } catch (err) {
    if (!redemptionPersisted) {
      await releaseVoucherSlot(voucher.id, claimedBundle?.id ?? null);
    } else {
      // Late failure after the redemption row was committed: the voucher
      // slot is genuinely consumed, so we leave the counters alone. Log so
      // the partial-redemption can be reconciled (missing API key / audit
      // log / Redis seed) rather than silently re-opening capacity.
      console.error(
        "[redeem-inline] post-persistence failure; voucher slot retained",
        { voucherId: voucher.id, bundleId: claimedBundle?.id ?? null, err },
      );
    }
    throw err;
  }
}
