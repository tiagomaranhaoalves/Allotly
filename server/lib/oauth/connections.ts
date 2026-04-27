import type { Request, Response } from "express";
import { pool } from "../../db";
import { storage } from "../../storage";
import { parseScopeString } from "./scopes";
import { revokeAllTokensForClientMembership } from "./revoke";
import { recordAudit, hashInput } from "../mcp/audit";

export interface ConnectionRow {
  clientId: string;
  clientName: string;
  scopes: string[];
  firstAuthorizedAt: string;
  lastUsedAt: string | null;
  activeTokenCount: number;
}

interface ListRow {
  client_id: string;
  client_name: string;
  scope: string;
  first_authorized_at: Date;
  last_used_at: Date | null;
  active_token_count: string;
}

/**
 * Resolve the active membership for the session-authenticated request.
 *
 * Returns:
 *   - membership.id  when caller is authenticated and a member of a team
 *   - null + 401     when caller is not authenticated (response written here)
 *   - null + no body when caller is authenticated but has no active membership
 *                    (e.g. removed teammate); the calling handler treats this
 *                    as "empty list / nothing to revoke".
 *
 * Callers MUST inspect res.statusCode to distinguish the two null branches:
 *   null AND res.statusCode === 200 → no membership, write empty response.
 *   null AND res.statusCode === 401 → already responded, do not write again.
 */
async function resolveMembershipId(req: Request, res: Response): Promise<string | null> {
  const userId = (req.session as any)?.userId;
  if (!userId) {
    res.status(401).json({ error: "unauthorized", message: "Sign in to manage OAuth connections." });
    return null;
  }
  const user = await storage.getUser(userId);
  if (!user) {
    res.status(401).json({ error: "unauthorized", message: "Sign in to manage OAuth connections." });
    return null;
  }
  const membership = await storage.getMembershipByUser(user.id);
  if (!membership) return null;
  return membership.id;
}

/**
 * GET /api/oauth/connections — list every OAuth client that currently holds a
 * non-revoked token for the caller's active membership. One row per client,
 * with the union of scopes seen across active tokens, the earliest issued_at
 * (firstAuthorizedAt), the most recent issued_at (lastUsedAt), and the count
 * of active tokens. Returns { connections: [] } when nothing is connected.
 */
export async function listConnectionsHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const membershipId = await resolveMembershipId(req, res);
  if (membershipId === null) {
    // 401 branch already wrote its body; 200 branch (signed-in but no
    // membership) needs an empty list response.
    if (res.statusCode === 200) res.json({ connections: [] });
    return;
  }

  const result = await pool.query<ListRow>(
    `SELECT t.client_id            AS client_id,
            c.client_name          AS client_name,
            STRING_AGG(DISTINCT t.scope, ' ') AS scope,
            MIN(t.issued_at)       AS first_authorized_at,
            MAX(t.issued_at)       AS last_used_at,
            COUNT(*)::text         AS active_token_count
       FROM oauth_tokens t
       JOIN oauth_clients c ON c.id = t.client_id
      WHERE t.membership_id = $1
        AND t.revoked_at IS NULL
   GROUP BY t.client_id, c.client_name
   ORDER BY MAX(t.issued_at) DESC`,
    [membershipId],
  );

  const connections: ConnectionRow[] = result.rows.map((r) => {
    const scopes = Array.from(
      new Set(
        (r.scope || "")
          .split(" ")
          .flatMap((chunk) => parseScopeString(chunk))
          .filter(Boolean),
      ),
    );
    return {
      clientId: r.client_id,
      clientName: r.client_name,
      scopes,
      firstAuthorizedAt: r.first_authorized_at.toISOString(),
      lastUsedAt: r.last_used_at ? r.last_used_at.toISOString() : null,
      activeTokenCount: Number(r.active_token_count),
    };
  });

  res.json({ connections });
}

/**
 * DELETE /api/oauth/connections/:clientId — revoke every non-revoked token
 * the caller's membership holds for this client. Idempotent (zero affected
 * rows still returns 200 with revokedCount=0). Same response shape regardless
 * of whether the client_id belongs to another membership, by design — we do
 * not want this endpoint to be a probe for "does client X exist?".
 */
export async function deleteConnectionHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const membershipId = await resolveMembershipId(req, res);
  if (membershipId === null) {
    // Same dual-meaning as listConnectionsHandler: a 401 was already written,
    // or the user has no membership (treat as zero revocations).
    if (res.statusCode === 200) res.json({ revokedCount: 0 });
    return;
  }

  const clientId = req.params.clientId;
  if (!clientId || typeof clientId !== "string") {
    res.status(400).json({ error: "invalid_request", message: "clientId is required" });
    return;
  }

  const revokedCount = await revokeAllTokensForClientMembership(clientId, membershipId);

  // Audit at the membership scope; tool_name = "oauth.revoke" is the canonical
  // marker the audit log surface filters on. recordAudit() schedules the write
  // via setImmediate so a failed insert never blocks the user-visible action.
  recordAudit({
    membershipId,
    toolName: "oauth.revoke",
    inputHash: hashInput({ clientId, revokedCount }),
    ok: true,
    errorCode: null,
    latencyMs: 0,
    clientId,
    audience: null,
  });

  res.json({ revokedCount });
}
