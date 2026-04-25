import crypto from "crypto";
import { storage } from "../../storage";
import { authenticateKey } from "../proxy/safeguards";
import { redisGet, redisSet, REDIS_KEYS } from "../redis";
import { generateAllotlyKey } from "../keys";
import { McpToolError } from "./errors";
import { hashPassword } from "../password";
import type { TeamMembership } from "@shared/schema";

export interface McpPrincipal {
  membership: TeamMembership;
  userId: string;
  apiKeyId: string;
  bearerKind: "key" | "voucher";
  voucherCode?: string;
  principalHash: string;
}

const VOUCHER_BINDING_TTL_SECONDS = 24 * 60 * 60;

function voucherBindingKey(voucherCode: string): string {
  const hash = crypto.createHash("sha256").update(voucherCode).digest("hex");
  return `allotly:mcp:voucher_binding:${hash}`;
}

function principalHash(bearer: string): string {
  return crypto.createHash("sha256").update(bearer).digest("hex");
}

export async function authenticate(authHeader: string | undefined, options: { allowAnonymous?: boolean } = {}): Promise<McpPrincipal | null> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    if (options.allowAnonymous) return null;
    throw new McpToolError("Unauthorised", "Missing or invalid Authorization header");
  }
  const bearer = authHeader.slice(7).trim();

  if (bearer.startsWith("allotly_sk_")) {
    const result = await authenticateKey(authHeader);
    if ("status" in result) {
      if (options.allowAnonymous) return null;
      throw new McpToolError("Unauthorised", result.message, { hint: result.suggestion });
    }
    return {
      membership: result.membership,
      userId: result.userId,
      apiKeyId: result.apiKeyId,
      bearerKind: "key",
      principalHash: principalHash(bearer),
    };
  }

  if (bearer.startsWith("ALLOT-")) {
    return await resolveVoucherBearer(bearer, options.allowAnonymous);
  }

  if (options.allowAnonymous) return null;
  throw new McpToolError("Unauthorised", "Bearer must be allotly_sk_... or ALLOT-XXXX-XXXX-XXXX");
}

async function resolveVoucherBearer(voucherCode: string, allowAnonymous?: boolean): Promise<McpPrincipal | null> {
  const upper = voucherCode.toUpperCase();
  const bindingKey = voucherBindingKey(upper);

  const bound = await redisGet(bindingKey);
  if (bound) {
    try {
      const data = JSON.parse(bound);
      const membership = await storage.getMembership(data.membershipId);
      if (membership && membership.status !== "EXPIRED" && membership.status !== "SUSPENDED") {
        await redisSet(bindingKey, bound, VOUCHER_BINDING_TTL_SECONDS);
        return {
          membership,
          userId: data.userId,
          apiKeyId: data.apiKeyId,
          bearerKind: "voucher",
          voucherCode: upper,
          principalHash: principalHash(upper),
        };
      }
    } catch {}
  }

  const voucher = await storage.getVoucherByCode(upper);
  if (!voucher) {
    if (allowAnonymous) return null;
    throw new McpToolError("NotFound", `Voucher code ${upper} not found`);
  }
  if (voucher.status === "REVOKED") {
    throw new McpToolError("VoucherAlreadyRedeemed", "This voucher has been revoked");
  }
  if (voucher.status === "EXPIRED" || new Date(voucher.expiresAt) < new Date()) {
    throw new McpToolError("VoucherExpired", "This voucher has expired");
  }

  if (voucher.status === "FULLY_REDEEMED" || voucher.currentRedemptions >= voucher.maxRedemptions) {
    throw new McpToolError("VoucherAlreadyRedeemed", "This voucher has been fully redeemed");
  }

  const minted = await mintVoucherPrincipal(voucher);
  await redisSet(bindingKey, JSON.stringify({
    membershipId: minted.membership.id,
    userId: minted.userId,
    apiKeyId: minted.apiKeyId,
  }), VOUCHER_BINDING_TTL_SECONDS);

  return {
    membership: minted.membership,
    userId: minted.userId,
    apiKeyId: minted.apiKeyId,
    bearerKind: "voucher",
    voucherCode: upper,
    principalHash: principalHash(upper),
  };
}

async function mintVoucherPrincipal(voucher: any): Promise<{ membership: TeamMembership; userId: string; apiKeyId: string }> {
  const team = await storage.getTeam(voucher.teamId);
  if (!team) throw new McpToolError("NotFound", "Voucher's team is no longer available");

  const rand = crypto.randomBytes(4).toString("hex");
  const email = `mcp-voucher-${voucher.code.slice(0, 8)}-${rand}@allotly.local`;
  const passwordHash = await hashPassword(crypto.randomBytes(16).toString("hex"));

  const user = await storage.createUser({
    email,
    name: "MCP Voucher User",
    passwordHash,
    orgId: voucher.orgId,
    orgRole: "MEMBER",
    status: "ACTIVE",
    isVoucherUser: true,
  });

  const now = new Date();
  const membership = await storage.createMembership({
    teamId: voucher.teamId,
    userId: user.id,
    accessType: "VOUCHER",
    monthlyBudgetCents: voucher.budgetCents,
    allowedModels: voucher.allowedModels,
    allowedProviders: voucher.allowedProviders,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd: new Date(voucher.expiresAt),
    status: "ACTIVE",
    voucherRedemptionId: voucher.id,
    voucherExpiresAt: new Date(voucher.expiresAt),
  });

  await storage.createVoucherRedemption({ voucherId: voucher.id, userId: user.id });
  const newCount = voucher.currentRedemptions + 1;
  await storage.updateVoucher(voucher.id, {
    currentRedemptions: newCount,
    status: newCount >= voucher.maxRedemptions ? "FULLY_REDEEMED" : voucher.status,
  });

  await redisSet(REDIS_KEYS.budget(membership.id), String(voucher.budgetCents));

  const { hash, prefix } = generateAllotlyKey();
  const apiKey = await storage.createAllotlyApiKey({
    userId: user.id,
    membershipId: membership.id,
    keyHash: hash,
    keyPrefix: prefix,
  });

  await storage.createAuditLog({
    orgId: voucher.orgId,
    actorId: user.id,
    action: "voucher.redeemed.mcp",
    targetType: "voucher",
    targetId: voucher.id,
    metadata: { code: voucher.code, via: "mcp" },
  });

  return { membership, userId: user.id, apiKeyId: apiKey.id };
}

export async function checkMcpRateLimit(
  principalHash: string,
  toolName: string,
  limitPerHour: number
): Promise<void> {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const hourBucket = Math.floor(minuteBucket / 60);
  const key = `allotly:mcp:ratelimit:${principalHash}:${toolName}:${hourBucket}`;
  const cur = parseInt(await redisGet(key) || "0");
  if (cur >= limitPerHour) {
    throw new McpToolError("RateLimited", `MCP rate limit exceeded for ${toolName} (${limitPerHour}/hour)`, {
      retry_after_seconds: 3600 - (Math.floor(Date.now() / 1000) % 3600),
    });
  }
  await redisSet(key, String(cur + 1), 3600);
}
