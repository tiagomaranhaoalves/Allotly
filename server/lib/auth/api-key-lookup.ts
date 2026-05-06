import crypto from "crypto";
import { storage } from "../../storage";
import type { User, TeamMembership, AllotlyApiKey } from "@shared/schema";

export type ApiKeyLookupFailureCode =
  | "invalid_format"
  | "not_found"
  | "revoked"
  | "no_membership"
  | "membership_suspended"
  | "membership_expired"
  | "period_expired"
  | "user_not_found";

export interface ApiKeyLookupSuccess {
  ok: true;
  user: User;
  membership: TeamMembership;
  apiKey: AllotlyApiKey;
}

export interface ApiKeyLookupFailure {
  ok: false;
  code: ApiKeyLookupFailureCode;
}

export type ApiKeyLookupResult = ApiKeyLookupSuccess | ApiKeyLookupFailure;

/**
 * Validate-and-resolve an `allotly_sk_…` key for the OAuth credential POST.
 * Mirrors the validation order in `authenticateKey` (proxy/safeguards.ts) so
 * a key that works against the proxy also works against /oauth/authorize.
 *
 * No Redis caching: this is a cold path (only hit when an unauthenticated
 * user is starting an OAuth handshake), and skipping the cache keeps the
 * surface for stale-cache surprises smaller.
 */
export async function lookupApiKey(rawKey: string): Promise<ApiKeyLookupResult> {
  if (typeof rawKey !== "string" || !rawKey.startsWith("allotly_sk_")) {
    return { ok: false, code: "invalid_format" };
  }

  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
  const apiKey = await storage.getApiKeyByHash(keyHash);
  if (!apiKey) return { ok: false, code: "not_found" };

  if (apiKey.status !== "ACTIVE") return { ok: false, code: "revoked" };

  const membership = await storage.getMembership(apiKey.membershipId);
  if (!membership) return { ok: false, code: "no_membership" };

  if (membership.status === "SUSPENDED") return { ok: false, code: "membership_suspended" };
  if (membership.status === "EXPIRED") return { ok: false, code: "membership_expired" };
  if (new Date(membership.periodEnd) < new Date()) return { ok: false, code: "period_expired" };

  const user = await storage.getUser(apiKey.userId);
  if (!user) return { ok: false, code: "user_not_found" };

  return { ok: true, user, membership, apiKey };
}
