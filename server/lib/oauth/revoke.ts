import type { Request, Response } from "express";
import { pool } from "../../db";
import { hashRefreshToken } from "./pkce";
import { verifyAccessToken } from "./jwt";
import { redisSet } from "../redis";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt";

/**
 * Revoke every non-revoked oauth_tokens row owned by (clientId, membershipId)
 * in a single UPDATE. Used by the dashboard "revoke connection" action so a
 * user can sever a third-party MCP host's access without touching the
 * oauth_clients row (other memberships may still rely on it).
 *
 * Idempotent: zero affected rows is a normal outcome (already revoked, or the
 * client was never connected to this membership). Returns the number of
 * tokens just transitioned from active → revoked. Each revoked access JTI is
 * mirrored into the Redis revocation set for the remainder of its TTL so
 * in-flight bearer checks reject it before the DB lookup ever runs.
 */
export async function revokeAllTokensForClientMembership(
  clientId: string,
  membershipId: string,
): Promise<number> {
  const result = await pool.query(
    `UPDATE oauth_tokens
        SET revoked_at = NOW()
      WHERE client_id = $1
        AND membership_id = $2
        AND revoked_at IS NULL
   RETURNING access_token_jti`,
    [clientId, membershipId],
  );
  const jtis = (result.rows || []).map((r: { access_token_jti: string }) => r.access_token_jti);
  for (const jti of jtis) {
    await redisSet(`allotly:oauth:revoked:${jti}`, "1", ACCESS_TOKEN_TTL_SECONDS);
  }
  return jtis.length;
}

export async function revokeHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");

  const body = req.body || {};
  const token = body.token;
  const tokenTypeHint = body.token_type_hint;

  if (!token) {
    res.status(400).json({ error: "invalid_request", error_description: "token is required" });
    return;
  }

  let revokedAccessJti: string | null = null;
  let revokedRefreshHash: string | null = null;

  if (tokenTypeHint === "refresh_token" || (!tokenTypeHint && !token.includes("."))) {
    revokedRefreshHash = hashRefreshToken(token);
  } else {
    const verify = verifyAccessToken(token);
    if (verify.ok && verify.claims?.jti) {
      revokedAccessJti = verify.claims.jti;
    } else {
      revokedRefreshHash = hashRefreshToken(token);
    }
  }

  if (revokedAccessJti) {
    const r = await pool.query(
      `UPDATE oauth_tokens SET revoked_at = NOW() WHERE access_token_jti = $1 AND revoked_at IS NULL RETURNING access_token_jti`,
      [revokedAccessJti],
    );
    if (r.rowCount && r.rowCount > 0) {
      await redisSet(`allotly:oauth:revoked:${revokedAccessJti}`, "1", ACCESS_TOKEN_TTL_SECONDS);
    } else {
      await redisSet(`allotly:oauth:revoked:${revokedAccessJti}`, "1", ACCESS_TOKEN_TTL_SECONDS);
    }
  }

  if (revokedRefreshHash) {
    const r = await pool.query(
      `UPDATE oauth_tokens SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND revoked_at IS NULL RETURNING access_token_jti`,
      [revokedRefreshHash],
    );
    if (r.rowCount && r.rowCount > 0) {
      const jti = r.rows[0].access_token_jti as string;
      await redisSet(`allotly:oauth:revoked:${jti}`, "1", ACCESS_TOKEN_TTL_SECONDS);
    }
  }

  res.status(200).json({ revoked: true });
}
