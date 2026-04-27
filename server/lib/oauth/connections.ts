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

// Returns membershipId, or null. When null, callers must check res.statusCode:
//   401 → response already written; 200 → no membership, write empty result.
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

export async function listConnectionsHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const membershipId = await resolveMembershipId(req, res);
  if (membershipId === null) {
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

export async function deleteConnectionHandler(req: Request, res: Response): Promise<void> {
  res.setHeader("Cache-Control", "no-store");
  const membershipId = await resolveMembershipId(req, res);
  if (membershipId === null) {
    if (res.statusCode === 200) res.json({ revokedCount: 0 });
    return;
  }

  const clientId = req.params.clientId;
  if (!clientId || typeof clientId !== "string") {
    res.status(400).json({ error: "invalid_request", message: "clientId is required" });
    return;
  }

  const revokedCount = await revokeAllTokensForClientMembership(clientId, membershipId);

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
