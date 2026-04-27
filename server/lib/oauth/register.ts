import type { Request, Response } from "express";
import crypto from "crypto";
import { promisify } from "util";
import { db } from "../../db";
import { oauthClients } from "@shared/schema";
import { newRegistrationAccessToken } from "./pkce";
import { SUPPORTED_SCOPES, normaliseScopes } from "./scopes";
import { OAUTH_ISSUER } from "./jwt";
import { redisGet, redisSet } from "../redis";

// promisify's typings only cover the 3-arg overload of crypto.scrypt; we use
// the 4-arg form (with options) so we cast to a compatible signature.
const scryptAsync = promisify(crypto.scrypt) as unknown as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

/**
 * Why scrypt and not bcrypt: scrypt is a Node built-in (no native binary,
 * no supply-chain footprint), memory-hard, and modern. We DELIBERATELY do
 * not depend on `bcrypt` so the platform doesn't drag a node-gyp build into
 * production. Parameter floor (per locked decision):
 *   N = 2^15 (32768)  — CPU/memory cost; ~32 MB peak per hash
 *   r = 8            — block size
 *   p = 1            — parallelisation
 *   salt = 16 bytes  — random per secret
 *   dkLen = 64 bytes — derived key length
 * If you ever need to bump these, increment N and re-issue all DCR client
 * secrets (existing rows can't be re-derived without the original secret).
 */
const SCRYPT_PARAMS = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
const SCRYPT_DKLEN = 64;

const REGISTER_RATE_LIMIT_PER_HOUR = 10;
const URI_REGEX = /^(https?:)\/\/[^\s]+$/;

function clientIp(req: Request): string {
  const xff = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xff || req.ip || req.socket.remoteAddress || "unknown";
}

async function checkRateLimit(ip: string): Promise<boolean> {
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  const key = `allotly:oauth:register_ratelimit:${ip}:${hourBucket}`;
  const cur = parseInt((await redisGet(key)) || "0", 10);
  if (cur >= REGISTER_RATE_LIMIT_PER_HOUR) return false;
  await redisSet(key, String(cur + 1), 3600);
  return true;
}

function isValidRedirectUri(uri: string, allowLocalhost: boolean): boolean {
  if (typeof uri !== "string") return false;
  if (!URI_REGEX.test(uri)) return false;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
    const isLocalhostHost = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol === "http:") {
      if (!allowLocalhost || !isLocalhostHost) return false;
    }
    // Block https://localhost (and 127.0.0.1) in production: only dev may use
    // any localhost callback, regardless of scheme.
    if (isLocalhostHost && !allowLocalhost) return false;
    if (parsed.hash) return false;
    return true;
  } catch {
    return false;
  }
}

export async function hashClientSecret(secret: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const buf = (await scryptAsync(secret, salt, SCRYPT_DKLEN, SCRYPT_PARAMS)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

export async function compareClientSecret(supplied: string, stored: string): Promise<boolean> {
  const [hashedHex, salt] = stored.split(".");
  if (!hashedHex || !salt) return false;
  const buf = (await scryptAsync(supplied, salt, SCRYPT_DKLEN, SCRYPT_PARAMS)) as Buffer;
  const stored_buf = Buffer.from(hashedHex, "hex");
  if (stored_buf.length !== buf.length) return false;
  return crypto.timingSafeEqual(buf, stored_buf);
}

export async function registerHandler(req: Request, res: Response): Promise<void> {
  const ip = clientIp(req);
  const allowed = await checkRateLimit(ip);
  if (!allowed) {
    res.status(429).json({ error: "rate_limited", error_description: "Too many registrations from this IP. Try again later." });
    return;
  }

  const body = req.body || {};
  const clientName = typeof body.client_name === "string" ? body.client_name.trim() : "";
  const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const tokenAuthMethod = typeof body.token_endpoint_auth_method === "string" ? body.token_endpoint_auth_method : "none";
  const requestedScopeRaw = typeof body.scope === "string" ? body.scope : undefined;

  if (!clientName) {
    res.status(400).json({ error: "invalid_client_metadata", error_description: "client_name is required" });
    return;
  }
  if (redirectUris.length === 0) {
    res.status(400).json({ error: "invalid_redirect_uri", error_description: "At least one redirect_uri required" });
    return;
  }

  const allowLocalhost = process.env.REPLIT_DEPLOYMENT !== "1";
  for (const uri of redirectUris) {
    if (!isValidRedirectUri(uri, allowLocalhost)) {
      res.status(400).json({
        error: "invalid_redirect_uri",
        error_description: `redirect_uri must be a fully qualified https URL${allowLocalhost ? " (or http://localhost in dev)" : ""}`,
      });
      return;
    }
  }

  if (!["none", "client_secret_basic"].includes(tokenAuthMethod)) {
    res.status(400).json({ error: "invalid_client_metadata", error_description: "token_endpoint_auth_method must be 'none' or 'client_secret_basic'" });
    return;
  }

  const scopesAllowed = normaliseScopes(requestedScopeRaw).filter((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s));
  if (scopesAllowed.length === 0) {
    res.status(400).json({ error: "invalid_scope", error_description: "scope must include at least one of: mcp, mcp:read" });
    return;
  }

  let clientSecret: string | null = null;
  let clientSecretHash: string | null = null;
  if (tokenAuthMethod === "client_secret_basic") {
    clientSecret = crypto.randomBytes(32).toString("base64url");
    clientSecretHash = await hashClientSecret(clientSecret);
  }

  const { token: regAccessToken, tokenHash: regAccessTokenHash } = newRegistrationAccessToken();

  const inserted = await db
    .insert(oauthClients)
    .values({
      clientName,
      redirectUris: redirectUris as any,
      clientSecretHash,
      registrationAccessTokenHash: regAccessTokenHash,
      scopesAllowed: scopesAllowed as any,
    })
    .returning();
  const client = inserted[0];

  res.status(201).json({
    client_id: client.id,
    client_secret: clientSecret,
    client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    client_secret_expires_at: 0,
    client_name: client.clientName,
    redirect_uris: client.redirectUris,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: scopesAllowed.join(" "),
    token_endpoint_auth_method: tokenAuthMethod,
    registration_access_token: regAccessToken,
    registration_client_uri: `${OAUTH_ISSUER}/oauth/register/${client.id}`,
  });
}
