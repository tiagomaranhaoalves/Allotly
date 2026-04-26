import type { Request, Response } from "express";
import crypto from "crypto";
import { db } from "../../db";
import { oauthClients, oauthAuthorizationCodes, teamMemberships } from "@shared/schema";
import { eq, and, gt } from "drizzle-orm";
import { storage } from "../../storage";
import { newAuthorizationCode } from "./pkce";
import { MCP_AUDIENCE, SUPPORTED_SCOPES, parseScopeString } from "./scopes";
import { renderConsent } from "./consent-template";

const PENDING_TTL_MS = 10 * 60 * 1000;
const CODE_TTL_MS = 60 * 1000;

interface PendingAuthRequest {
  clientId: string;
  redirectUri: string;
  scope: string;
  resource: string;
  state: string;
  codeChallenge: string;
  expiresAt: number;
  // The session-bound user that started this consent flow. consentHandler
  // refuses to mint a code if a different user is now logged in (RFC 6749 §10.12).
  userId: string;
}

const pending = new Map<string, PendingAuthRequest>();

function pruneExpired(): void {
  const now = Date.now();
  for (const [k, v] of Array.from(pending.entries())) {
    if (v.expiresAt < now) pending.delete(k);
  }
}

function newCsrfToken(req: Request): string {
  const sess = req.session as any;
  if (sess && sess._oauthCsrf) return sess._oauthCsrf as string;
  const tok = crypto.randomBytes(16).toString("hex");
  if (sess) sess._oauthCsrf = tok;
  return tok;
}

function escapeQuery(s: string): string {
  return encodeURIComponent(s);
}

function safeRedirect(redirectUri: string, params: Record<string, string>): string {
  const url = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function getActiveMembershipForUser(userId: string): Promise<{ id: string } | null> {
  const rows = await db
    .select({ id: teamMemberships.id, status: teamMemberships.status })
    .from(teamMemberships)
    .where(eq(teamMemberships.userId, userId))
    .limit(1);
  if (rows.length === 0) return null;
  if (rows[0].status === "EXPIRED" || rows[0].status === "SUSPENDED") return null;
  return { id: rows[0].id };
}

export async function authorizeHandler(req: Request, res: Response): Promise<void> {
  pruneExpired();

  const q = req.query;
  const clientId = typeof q.client_id === "string" ? q.client_id : "";
  const redirectUri = typeof q.redirect_uri === "string" ? q.redirect_uri : "";
  const responseType = typeof q.response_type === "string" ? q.response_type : "";
  const codeChallenge = typeof q.code_challenge === "string" ? q.code_challenge : "";
  const codeChallengeMethod = typeof q.code_challenge_method === "string" ? q.code_challenge_method : "";
  const scope = typeof q.scope === "string" ? q.scope : "mcp";
  const state = typeof q.state === "string" ? q.state : "";
  const resource = typeof q.resource === "string" ? q.resource : "";

  if (!clientId) {
    res.status(400).type("text/plain").send("invalid_request: client_id required");
    return;
  }
  const client = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  if (client.length === 0 || client[0].revokedAt) {
    res.status(400).type("text/plain").send("invalid_client: unknown or revoked client");
    return;
  }
  const c = client[0];

  const registeredUris = (c.redirectUris as unknown as string[]) || [];
  if (!redirectUri || !registeredUris.includes(redirectUri)) {
    res.status(400).type("text/plain").send("invalid_redirect_uri: must match a URI registered with this client");
    return;
  }

  if (responseType !== "code") {
    res.redirect(302, safeRedirect(redirectUri, { error: "unsupported_response_type", state }));
    return;
  }
  if (codeChallengeMethod !== "S256") {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_request", error_description: "code_challenge_method must be S256", state }));
    return;
  }
  if (!codeChallenge || codeChallenge.length < 43) {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_request", error_description: "code_challenge required", state }));
    return;
  }
  if (resource !== MCP_AUDIENCE) {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_target", error_description: `resource must equal ${MCP_AUDIENCE}`, state }));
    return;
  }

  const requestedScopes = parseScopeString(scope);
  const allowedScopes = (c.scopesAllowed as unknown as string[]) || [];
  for (const s of requestedScopes) {
    if (!(SUPPORTED_SCOPES as readonly string[]).includes(s) || !allowedScopes.includes(s)) {
      res.redirect(302, safeRedirect(redirectUri, { error: "invalid_scope", state }));
      return;
    }
  }
  if (requestedScopes.length === 0) {
    res.redirect(302, safeRedirect(redirectUri, { error: "invalid_scope", error_description: "scope is required", state }));
    return;
  }

  const sess = req.session as any;
  if (!sess?.userId) {
    const next = req.originalUrl;
    res.redirect(302, `/login?next=${escapeQuery(next)}`);
    return;
  }
  const user = await storage.getUser(sess.userId);
  if (!user) {
    res.redirect(302, `/login?next=${escapeQuery(req.originalUrl)}`);
    return;
  }
  if (user.isVoucherUser) {
    res.redirect(302, `/oauth/claim-account?next=${escapeQuery(req.originalUrl)}`);
    return;
  }

  const membership = await getActiveMembershipForUser(user.id);
  if (!membership) {
    res.redirect(302, safeRedirect(redirectUri, { error: "access_denied", error_description: "no active membership", state }));
    return;
  }

  const authRequestId = crypto.randomBytes(16).toString("hex");
  pending.set(authRequestId, {
    clientId,
    redirectUri,
    scope: requestedScopes.join(" "),
    resource,
    state,
    codeChallenge,
    expiresAt: Date.now() + PENDING_TTL_MS,
    userId: user.id,
  });

  const csrfToken = newCsrfToken(req);
  const html = renderConsent({
    authRequestId,
    csrfToken,
    clientName: c.clientName,
    scopes: requestedScopes,
    redirectUri,
    resource,
    approvePath: "/oauth/consent",
  });
  res.type("text/html").send(html);
}

export async function consentHandler(req: Request, res: Response): Promise<void> {
  pruneExpired();

  const sess = req.session as any;
  if (!sess?.userId) {
    res.status(401).type("text/plain").send("unauthorized");
    return;
  }
  const body = req.body || {};
  const authRequestId = body.auth_request_id;
  const csrf = body.csrf;
  const decision = body.decision;

  if (!authRequestId || !csrf || !decision) {
    res.status(400).type("text/plain").send("invalid_request");
    return;
  }
  if (!sess._oauthCsrf || csrf !== sess._oauthCsrf) {
    res.status(403).type("text/plain").send("csrf_mismatch");
    return;
  }
  const pendingReq = pending.get(authRequestId);
  if (!pendingReq) {
    res.status(400).type("text/plain").send("auth_request expired or unknown");
    return;
  }
  // Session-binding: a pending request only belongs to the user that initiated
  // /oauth/authorize. If the active session has changed (e.g. user logged out
  // and a different user logged back in, or an attacker phished an authRequestId),
  // refuse the consent. RFC 6749 §10.12.
  if (pendingReq.userId !== sess.userId) {
    pending.delete(authRequestId);
    res.status(403).type("text/plain").send("session_user_mismatch");
    return;
  }
  pending.delete(authRequestId);

  if (decision !== "approve") {
    res.redirect(302, safeRedirect(pendingReq.redirectUri, { error: "access_denied", state: pendingReq.state }));
    return;
  }

  const membership = await getActiveMembershipForUser(sess.userId);
  if (!membership) {
    res.redirect(302, safeRedirect(pendingReq.redirectUri, { error: "access_denied", error_description: "no active membership", state: pendingReq.state }));
    return;
  }

  const { code, codeHash } = newAuthorizationCode();
  await db.insert(oauthAuthorizationCodes).values({
    codeHash,
    clientId: pendingReq.clientId,
    membershipId: membership.id,
    redirectUri: pendingReq.redirectUri,
    codeChallenge: pendingReq.codeChallenge,
    resource: pendingReq.resource,
    scope: pendingReq.scope,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });

  res.redirect(302, safeRedirect(pendingReq.redirectUri, { code, state: pendingReq.state }));
}

export function _resetPendingForTest(): void {
  pending.clear();
}
