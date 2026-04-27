import type { Request, Response } from "express";
import { pool } from "../../db";
import { hashRefreshToken } from "./pkce";
import { verifyAccessToken } from "./jwt";
import { redisSet } from "../redis";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt";

// Remaining lifetime for the access JTI in seconds, floored at 1.
function remainingTtlSeconds(expiresAt: Date | string | null | undefined): number {
  if (!expiresAt) return ACCESS_TOKEN_TTL_SECONDS;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return 1;
  return Math.max(1, Math.ceil(ms / 1000));
}

// Revoke every non-revoked oauth_tokens row for (clientId, membershipId).
// Idempotent. Each revoked JTI is mirrored into Redis for its remaining TTL.
export async function revokeAllTokensForClientMembership(
  clientId: string,
  membershipId: string,
): Promise<number> {
  const result = await pool.query<{ access_token_jti: string; access_expires_at: Date }>(
    `UPDATE oauth_tokens
        SET revoked_at = NOW()
      WHERE client_id = $1
        AND membership_id = $2
        AND revoked_at IS NULL
   RETURNING access_token_jti, access_expires_at`,
    [clientId, membershipId],
  );
  for (const row of result.rows) {
    await redisSet(`allotly:oauth:revoked:${row.access_token_jti}`, "1", remainingTtlSeconds(row.access_expires_at));
  }
  return result.rows.length;
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
    const r = await pool.query<{ access_token_jti: string; access_expires_at: Date }>(
      `UPDATE oauth_tokens
          SET revoked_at = NOW()
        WHERE access_token_jti = $1
          AND revoked_at IS NULL
    RETURNING access_token_jti, access_expires_at`,
      [revokedAccessJti],
    );
    const ttl = r.rowCount && r.rowCount > 0 ? remainingTtlSeconds(r.rows[0].access_expires_at) : ACCESS_TOKEN_TTL_SECONDS;
    await redisSet(`allotly:oauth:revoked:${revokedAccessJti}`, "1", ttl);
  }

  if (revokedRefreshHash) {
    const r = await pool.query<{ access_token_jti: string; access_expires_at: Date }>(
      `UPDATE oauth_tokens
          SET revoked_at = NOW()
        WHERE refresh_token_hash = $1
          AND revoked_at IS NULL
    RETURNING access_token_jti, access_expires_at`,
      [revokedRefreshHash],
    );
    if (r.rowCount && r.rowCount > 0) {
      const row = r.rows[0];
      await redisSet(`allotly:oauth:revoked:${row.access_token_jti}`, "1", remainingTtlSeconds(row.access_expires_at));
    }
  }

  res.status(200).json({ revoked: true });
}
