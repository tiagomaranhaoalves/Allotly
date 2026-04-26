import crypto from "crypto";
import { db } from "../../db";
import { mcpAuditLog } from "@shared/schema";

export function hashInput(input: unknown): string {
  const canonical = canonicalise(input);
  return crypto.createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function canonicalise(value: any): any {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(canonicalise);
  const sorted: Record<string, any> = {};
  for (const k of Object.keys(value).sort()) sorted[k] = canonicalise(value[k]);
  return sorted;
}

export interface AuditEntry {
  membershipId: string | null;
  toolName: string;
  inputHash: string;
  ok: boolean;
  errorCode: number | null;
  latencyMs: number;
  /** OAuth client_id when bearer is OAuth, otherwise null. */
  clientId?: string | null;
  /** RFC 8707 audience (resource indicator) when bearer is OAuth, otherwise null. */
  audience?: string | null;
}

export function recordAudit(entry: AuditEntry): void {
  setImmediate(async () => {
    try {
      await db.insert(mcpAuditLog).values({
        membershipId: entry.membershipId,
        toolName: entry.toolName,
        inputHash: entry.inputHash,
        ok: entry.ok,
        errorCode: entry.errorCode,
        latencyMs: entry.latencyMs,
        clientId: entry.clientId ?? null,
        audience: entry.audience ?? null,
        principalHash: entry.principalHash ?? null,
      });
    } catch (err: any) {
      console.error(`[mcp:audit] write failed for ${entry.toolName}: ${err?.message}`);
    }
  });
}
