import { randomBytes, createHash } from "crypto";

export function generateAllotlyKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(36).toString("base64url");
  const key = `allotly_sk_${raw}`;
  const hash = createHash("sha256").update(key).digest("hex");
  const prefix = key.slice(0, 15) + "...";
  return { key, hash, prefix };
}

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}
