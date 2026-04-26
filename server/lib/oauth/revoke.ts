import type { Request, Response } from "express";
import { pool } from "../../db";
import { hashRefreshToken } from "./pkce";
import { verifyAccessToken } from "./jwt";
import { redisSet } from "../redis";
import { ACCESS_TOKEN_TTL_SECONDS } from "./jwt";

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
