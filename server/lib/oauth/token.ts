import type { Request, Response } from "express";
import { db, pool } from "../../db";
import { oauthClients, oauthAuthorizationCodes, oauthTokens } from "@shared/schema";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { hashAuthorizationCode, hashRefreshToken, newRefreshToken, verifyPkceS256 } from "./pkce";
import { issueAccessToken, ACCESS_TOKEN_TTL_SECONDS } from "./jwt";
import { compareClientSecret } from "./register";
import { redisSet, redisGet } from "../redis";

const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;

// Per-IP and per-clientId rate limit on /oauth/token. This is the only
// non-bot-readable surface that brute-forces refresh tokens / client_secrets,
// so we cap it tightly. Window = 1 minute.
const TOKEN_RATE_LIMIT_PER_MINUTE_PER_IP = 60;
const TOKEN_RATE_LIMIT_PER_MINUTE_PER_CLIENT = 30;

function clientIp(req: Request): string {
  const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xff || req.ip || req.socket.remoteAddress || "unknown";
}

async function bumpAndCheck(key: string, limit: number): Promise<boolean> {
  const cur = parseInt((await redisGet(key)) || "0", 10);
  if (cur >= limit) return false;
  await redisSet(key, String(cur + 1), 60);
  return true;
}

async function checkTokenRateLimit(req: Request, body: any): Promise<boolean> {
  const ip = clientIp(req);
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const ipKey = `allotly:oauth:token_rl:ip:${ip}:${minuteBucket}`;
  if (!(await bumpAndCheck(ipKey, TOKEN_RATE_LIMIT_PER_MINUTE_PER_IP))) return false;
  const candidateClientId =
    (typeof body?.client_id === "string" ? body.client_id : undefined) ||
    (typeof req.headers.authorization === "string" && req.headers.authorization.startsWith("Basic ")
      ? (() => {
          try {
            const dec = Buffer.from(req.headers.authorization!.slice(6), "base64").toString("utf8");
            return dec.split(":")[0];
          } catch {
            return undefined;
          }
        })()
      : undefined);
  if (candidateClientId) {
    const cidKey = `allotly:oauth:token_rl:cid:${candidateClientId}:${minuteBucket}`;
    if (!(await bumpAndCheck(cidKey, TOKEN_RATE_LIMIT_PER_MINUTE_PER_CLIENT))) return false;
  }
  return true;
}

interface ClientAuthResult {
  ok: boolean;
  clientId?: string;
  reason?: string;
}

async function authenticateClient(req: Request, bodyClientId: string | undefined): Promise<ClientAuthResult> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Basic ")) {
    let decoded: string;
    try {
      decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf8");
    } catch {
      return { ok: false, reason: "invalid_basic" };
    }
    const sep = decoded.indexOf(":");
    if (sep < 0) return { ok: false, reason: "invalid_basic" };
    const clientId = decoded.slice(0, sep);
    const clientSecret = decoded.slice(sep + 1);
    const rows = await db.select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
    if (rows.length === 0 || rows[0].revokedAt) return { ok: false, reason: "unknown_client" };
    if (!rows[0].clientSecretHash) return { ok: false, reason: "client_is_public" };
    const ok = await compareClientSecret(clientSecret, rows[0].clientSecretHash);
    if (!ok) return { ok: false, reason: "bad_secret" };
    return { ok: true, clientId };
  }
  if (!bodyClientId) return { ok: false, reason: "client_id_required" };
  const rows = await db.select().from(oauthClients).where(eq(oauthClients.id, bodyClientId)).limit(1);
  if (rows.length === 0 || rows[0].revokedAt) return { ok: false, reason: "unknown_client" };
  if (rows[0].clientSecretHash) return { ok: false, reason: "client_is_confidential" };
  return { ok: true, clientId: bodyClientId };
}

async function membershipUserId(membershipId: string): Promise<string | null> {
  const r = await pool.query("SELECT user_id FROM team_memberships WHERE id = $1", [membershipId]);
  if (r.rowCount === 0) return null;
  return r.rows[0].user_id as string;
}

export async function tokenHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Pragma", "no-cache");

  const body = req.body || {};

  // Rate-limit before doing any DB work or any client-secret comparison so that
  // an attacker can't trickle-attack /oauth/token with stolen refresh tokens
  // or guessed client_secrets. Returns RFC 6585 429.
  if (!(await checkTokenRateLimit(req, body))) {
    res.status(429).json({ error: "rate_limited", error_description: "Too many token requests. Try again shortly." });
    return;
  }

  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    return await handleAuthCodeGrant(req, res, body);
  }
  if (grantType === "refresh_token") {
    return await handleRefreshGrant(req, res, body);
  }
  res.status(400).json({ error: "unsupported_grant_type" });
}

async function handleAuthCodeGrant(req: Request, res: Response, body: any): Promise<void> {
  const code = body.code;
  const redirectUri = body.redirect_uri;
  const codeVerifier = body.code_verifier;
  if (!code || !redirectUri || !codeVerifier) {
    res.status(400).json({ error: "invalid_request", error_description: "code, redirect_uri, code_verifier required" });
    return;
  }

  const clientAuth = await authenticateClient(req, body.client_id);
  if (!clientAuth.ok || !clientAuth.clientId) {
    res.status(401).json({ error: "invalid_client", error_description: clientAuth.reason });
    return;
  }

  const codeHash = hashAuthorizationCode(code);
  const consumeQ = await pool.query(
    `UPDATE oauth_authorization_codes
       SET consumed_at = NOW()
     WHERE code_hash = $1
       AND consumed_at IS NULL
       AND expires_at > NOW()
     RETURNING client_id, membership_id, redirect_uri, code_challenge, scope, resource`,
    [codeHash],
  );
  if (consumeQ.rowCount === 0) {
    // RFC 6749 §4.1.2 — if a previously-consumed code is presented again, the
    // server MUST attempt to revoke all access tokens issued from it. We mark
    // every oauth_tokens row that points to this code_hash as revoked, and
    // also blacklist the JTIs in Redis so any in-flight access tokens stop
    // working at /mcp immediately. The duplicate-use response is still 400
    // invalid_grant per the spec.
    try {
      const reuseRows = await pool.query(
        `UPDATE oauth_tokens
            SET revoked_at = NOW()
          WHERE authorization_code_hash = $1
            AND revoked_at IS NULL
        RETURNING access_token_jti, access_expires_at`,
        [codeHash],
      );
      for (const r of reuseRows.rows) {
        const remainingMs = new Date(r.access_expires_at).getTime() - Date.now();
        const ttl = Math.max(60, Math.ceil(remainingMs / 1000));
        await redisSet(`allotly:oauth:revoked:${r.access_token_jti}`, "1", ttl);
      }
      if (reuseRows.rowCount && reuseRows.rowCount > 0) {
        console.warn(`[oauth/token] authorization code reuse detected; revoked ${reuseRows.rowCount} token(s) issued from code_hash=${codeHash.slice(0, 8)}…`);
      }
    } catch (e: any) {
      console.error("[oauth/token] failed to revoke tokens on code reuse:", e?.message);
    }
    res.status(400).json({ error: "invalid_grant", error_description: "code is invalid, expired, or already used" });
    return;
  }
  const row = consumeQ.rows[0];

  if (row.client_id !== clientAuth.clientId) {
    res.status(400).json({ error: "invalid_grant", error_description: "code does not belong to this client" });
    return;
  }
  if (row.redirect_uri !== redirectUri) {
    res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    return;
  }
  if (!verifyPkceS256(codeVerifier, row.code_challenge)) {
    res.status(400).json({ error: "invalid_grant", error_description: "PKCE verifier mismatch" });
    return;
  }

  const userId = await membershipUserId(row.membership_id);
  if (!userId) {
    res.status(400).json({ error: "invalid_grant", error_description: "membership not found" });
    return;
  }

  const access = issueAccessToken({
    userId,
    membershipId: row.membership_id,
    clientId: row.client_id,
    scope: row.scope,
    resource: row.resource,
  });
  const refresh = newRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

  await db.insert(oauthTokens).values({
    clientId: row.client_id,
    membershipId: row.membership_id,
    accessTokenJti: access.jti,
    refreshTokenHash: refresh.tokenHash,
    authorizationCodeHash: codeHash,
    scope: row.scope,
    resource: row.resource,
    accessExpiresAt: access.expiresAt,
    refreshExpiresAt,
  });

  await pool.query("UPDATE oauth_clients SET last_used_at = NOW() WHERE id = $1", [row.client_id]);

  res.json({
    access_token: access.token,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_SECONDS,
    refresh_token: refresh.token,
    scope: row.scope,
  });
}

async function handleRefreshGrant(req: Request, res: Response, body: any): Promise<void> {
  const refreshToken = body.refresh_token;
  if (!refreshToken) {
    res.status(400).json({ error: "invalid_request", error_description: "refresh_token required" });
    return;
  }
  const clientAuth = await authenticateClient(req, body.client_id);
  if (!clientAuth.ok || !clientAuth.clientId) {
    res.status(401).json({ error: "invalid_client", error_description: clientAuth.reason });
    return;
  }

  const refreshHash = hashRefreshToken(refreshToken);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lookupQ = await client.query(
      `SELECT id, client_id, membership_id, scope, resource, access_token_jti, revoked_at, refresh_expires_at, authorization_code_hash
         FROM oauth_tokens
        WHERE refresh_token_hash = $1
        FOR UPDATE`,
      [refreshHash],
    );
    if (lookupQ.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "unknown refresh token" });
      return;
    }
    const row = lookupQ.rows[0];
    if (row.revoked_at) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "refresh token revoked" });
      return;
    }
    if (row.refresh_expires_at && new Date(row.refresh_expires_at) < new Date()) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "refresh token expired" });
      return;
    }
    if (row.client_id !== clientAuth.clientId) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "refresh token does not belong to this client" });
      return;
    }

    const userIdQ = await client.query("SELECT user_id FROM team_memberships WHERE id = $1", [row.membership_id]);
    if (userIdQ.rowCount === 0) {
      await client.query("ROLLBACK");
      res.status(400).json({ error: "invalid_grant", error_description: "membership not found" });
      return;
    }
    const userId = userIdQ.rows[0].user_id as string;

    const access = issueAccessToken({
      userId,
      membershipId: row.membership_id,
      clientId: row.client_id,
      scope: row.scope,
      resource: row.resource,
    });
    const refresh = newRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);

    await client.query("UPDATE oauth_tokens SET revoked_at = NOW() WHERE id = $1", [row.id]);
    await client.query(
      `INSERT INTO oauth_tokens
         (client_id, membership_id, access_token_jti, refresh_token_hash, authorization_code_hash, scope, resource, access_expires_at, refresh_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        row.client_id,
        row.membership_id,
        access.jti,
        refresh.tokenHash,
        // Carry the original auth-code-hash forward so the whole rotation chain
        // is revoked together if the original code is ever replayed.
        row.authorization_code_hash,
        row.scope,
        row.resource,
        access.expiresAt,
        refreshExpiresAt,
      ],
    );
    await client.query("COMMIT");

    await redisSet(`allotly:oauth:revoked:${row.access_token_jti}`, "1", ACCESS_TOKEN_TTL_SECONDS);

    res.json({
      access_token: access.token,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.token,
      scope: row.scope,
    });
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}
    console.error("[oauth/token] refresh transaction failed:", e?.message);
    res.status(500).json({ error: "server_error" });
  } finally {
    client.release();
  }
}
