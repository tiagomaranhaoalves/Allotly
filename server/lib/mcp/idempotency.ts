import { db } from "../../db";
import { mcpIdempotency } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import crypto from "crypto";

export function hashPrincipal(principal: string): string {
  return crypto.createHash("sha256").update(principal).digest("hex");
}

export async function getIdempotentResponse(
  scope: string,
  key: string,
  principalId: string
): Promise<unknown | null> {
  const [row] = await db
    .select()
    .from(mcpIdempotency)
    .where(and(
      eq(mcpIdempotency.scope, scope),
      eq(mcpIdempotency.key, key),
      eq(mcpIdempotency.principalId, principalId),
    ));
  return row?.responseJson ?? null;
}

export async function storeIdempotentResponse(
  scope: string,
  key: string,
  principalId: string,
  response: unknown
): Promise<void> {
  try {
    await db.insert(mcpIdempotency).values({ scope, key, principalId, responseJson: response as any });
  } catch (err: any) {
    if (err?.code === "23505") return;
    throw err;
  }
}
