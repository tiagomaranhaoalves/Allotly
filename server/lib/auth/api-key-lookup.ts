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
  /**
   * Set when the failure is attributable to a specific known key/membership/user
   * (i.e. anything past `not_found` / `invalid_format`). Callers use this to
   * write a structured audit-log row for failed attempts without violating the
   * audit_logs NOT NULL FK on `org_id`.
   */
  orgId?: string;
  userId?: string;
  apiKeyId?: string;
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

  // From here on the failure is attributable: we always know apiKey.userId
  // (and via the user lookup, the org). We resolve the user upfront so every
  // attributable failure can carry orgId for downstream audit logging.
  const userForAttribution = await storage.getUser(apiKey.userId);

  if (apiKey.status !== "ACTIVE") {
    return { ok: false, code: "revoked", orgId: userForAttribution?.orgId, userId: apiKey.userId, apiKeyId: apiKey.id };
  }

  const membership = await storage.getMembership(apiKey.membershipId);
  if (!membership) {
    return { ok: false, code: "no_membership", orgId: userForAttribution?.orgId, userId: apiKey.userId, apiKeyId: apiKey.id };
  }

  if (membership.status === "SUSPENDED") {
    return { ok: false, code: "membership_suspended", orgId: userForAttribution?.orgId, userId: apiKey.userId, apiKeyId: apiKey.id };
  }
  if (membership.status === "EXPIRED") {
    return { ok: false, code: "membership_expired", orgId: userForAttribution?.orgId, userId: apiKey.userId, apiKeyId: apiKey.id };
  }
  if (new Date(membership.periodEnd) < new Date()) {
    return { ok: false, code: "period_expired", orgId: userForAttribution?.orgId, userId: apiKey.userId, apiKeyId: apiKey.id };
  }

  if (!userForAttribution) {
    return { ok: false, code: "user_not_found", userId: apiKey.userId, apiKeyId: apiKey.id };
  }

  return { ok: true, user: userForAttribution, membership, apiKey };
}
