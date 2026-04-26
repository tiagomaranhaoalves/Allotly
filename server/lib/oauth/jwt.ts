import crypto from "crypto";

const ISS = "https://allotly.ai";
const ALG = "HS256";

let cachedSecret: string | null = null;
let cachedSecretIsEphemeral = false;

function loadSecret(): string {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.OAUTH_JWT_SECRET;
  const isProd = process.env.REPLIT_DEPLOYMENT === "1";

  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (isProd) {
    throw new Error(
      "OAUTH_JWT_SECRET is missing or shorter than 32 chars. Generate one with `openssl rand -base64 32` and set it in production secrets.",
    );
  }

  cachedSecret = crypto.randomBytes(32).toString("base64");
  cachedSecretIsEphemeral = true;
  console.warn(
    "[oauth/jwt] OAUTH_JWT_SECRET not set; generated an ephemeral secret. OAuth tokens will not survive a process restart. " +
      "Set OAUTH_JWT_SECRET (>=32 bytes) for stable dev tokens.",
  );
  return cachedSecret;
}

export function isEphemeralSecret(): boolean {
  loadSecret();
  return cachedSecretIsEphemeral;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input;
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(input: string): Buffer {
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function sign(secret: string, message: string): string {
  return b64url(crypto.createHmac("sha256", secret).update(message).digest());
}

export interface AccessTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  membership_id: string;
  client_id: string;
  scope: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssueAccessTokenInput {
  userId: string;
  membershipId: string;
  clientId: string;
  scope: string;
  resource: string;
  jti?: string;
  ttlSeconds?: number;
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

export function issueAccessToken(input: IssueAccessTokenInput): { token: string; jti: string; expiresAt: Date; claims: AccessTokenClaims } {
  const secret = loadSecret();
  const now = Math.floor(Date.now() / 1000);
  const ttl = input.ttlSeconds ?? ACCESS_TOKEN_TTL_SECONDS;
  const jti = input.jti ?? crypto.randomBytes(16).toString("hex");

  const header = { alg: ALG, typ: "JWT" };
  const payload: AccessTokenClaims = {
    iss: ISS,
    sub: input.userId,
    aud: input.resource,
    membership_id: input.membershipId,
    client_id: input.clientId,
    scope: input.scope,
    jti,
    iat: now,
    exp: now + ttl,
  };

  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signature = sign(secret, signingInput);
  const token = `${signingInput}.${signature}`;
  return { token, jti, expiresAt: new Date(payload.exp * 1000), claims: payload };
}

export interface VerifyOptions {
  expectedAud?: string;
}

export interface VerifyResult {
  ok: boolean;
  claims?: AccessTokenClaims;
  reason?: string;
}

export function verifyAccessToken(token: string, opts: VerifyOptions = {}): VerifyResult {
  if (!token || typeof token !== "string") return { ok: false, reason: "missing_token" };
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  const [headerB64, payloadB64, sigB64] = parts;

  let header: any;
  try {
    header = JSON.parse(b64urlDecode(headerB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_header" };
  }
  if (header.alg !== ALG) return { ok: false, reason: "alg_mismatch" };

  const secret = loadSecret();
  const expected = sign(secret, `${headerB64}.${payloadB64}`);
  const a = Buffer.from(expected);
  const b = Buffer.from(sigB64);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: any;
  try {
    payload = JSON.parse(b64urlDecode(payloadB64).toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) {
    return { ok: false, reason: "expired" };
  }
  if (payload.iss !== ISS) return { ok: false, reason: "iss_mismatch" };
  if (opts.expectedAud && payload.aud !== opts.expectedAud) {
    return { ok: false, reason: "aud_mismatch" };
  }
  if (!payload.jti || !payload.sub || !payload.membership_id || !payload.client_id) {
    return { ok: false, reason: "missing_claim" };
  }

  return { ok: true, claims: payload as AccessTokenClaims };
}

export const OAUTH_ISSUER = ISS;
