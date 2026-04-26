import crypto from "crypto";

export function pkceS256Transform(verifier: string): string {
  return crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function verifyPkceS256(verifier: string, storedChallenge: string): boolean {
  if (!verifier || !storedChallenge) return false;
  const computed = pkceS256Transform(verifier);
  const a = Buffer.from(computed);
  const b = Buffer.from(storedChallenge);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function newAuthorizationCode(): { code: string; codeHash: string } {
  const code = crypto.randomBytes(32).toString("base64url");
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  return { code, codeHash };
}

export function hashAuthorizationCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function newRefreshToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function newRegistrationAccessToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}
