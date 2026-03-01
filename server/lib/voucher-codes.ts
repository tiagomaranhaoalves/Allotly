import { randomBytes } from "crypto";

const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function generateSegment(length: number): string {
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}

export function generateVoucherCode(): string {
  return `ALLOT-${generateSegment(4)}-${generateSegment(4)}-${generateSegment(4)}`;
}
