/**
 * tests/oauth/connections.test.ts
 *
 * Covers /api/oauth/connections (list + revoke) — the M2 dashboard surface
 * that lets a membership see and revoke OAuth apps holding access tokens
 * against it.
 *
 * Uses the same real-DB fixture pattern as e2e.test.ts: a tagged seed row
 * for org/user/team/membership, a 2nd parallel "other" membership for
 * cross-membership isolation tests, and afterAll cleanup keyed on `seedTag`
 * so a failed test never leaves rows behind.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import crypto from "crypto";
import { eq, like } from "drizzle-orm";

import { db, pool } from "../../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  oauthClients,
  oauthTokens,
  mcpAuditLog,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { listConnectionsHandler, deleteConnectionHandler } from "../../server/lib/oauth/connections";


interface MockRes {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  status(code: number): MockRes;
  setHeader(k: string, v: string): MockRes;
  json(b: any): MockRes;
}
function mockRes(): MockRes {
  const r: any = {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(c: number) { this.statusCode = c; return this; },
    setHeader(k: string, v: string) { this.headers[k.toLowerCase()] = v; return this; },
    json(b: any) { this.body = b; return this; },
  };
  return r as MockRes;
}

interface MockReq {
  params: Record<string, string>;
  session: any;
}
function mockReq(opts: Partial<MockReq> = {}): MockReq {
  return {
    params: opts.params || {},
    session: opts.session || {},
  };
}


const seedTag = `conn-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let testOrgId = "";
let testUserId = "";
let testTeamId = "";
let testMembershipId = "";
let otherUserId = "";
let otherTeamId = "";
let otherMembershipId = "";
let clientAId = "";
let clientBId = "";

async function seedClient(name: string): Promise<string> {
  const [row] = await db.insert(oauthClients).values({
    clientName: `${name}-${seedTag}`,
    redirectUris: ["http://localhost/cb"],
    clientSecretHash: "x",
    registrationAccessTokenHash: "x",
    scopesAllowed: ["mcp", "mcp:read"],
  }).returning({ id: oauthClients.id });
  return row.id;
}

async function insertToken(opts: {
  clientId: string;
  membershipId: string;
  scope: string;
  issuedAt: Date;
  revoked?: boolean;
}): Promise<void> {
  await db.insert(oauthTokens).values({
    clientId: opts.clientId,
    membershipId: opts.membershipId,
    accessTokenJti: crypto.randomBytes(16).toString("hex"),
    refreshTokenHash: crypto.randomBytes(16).toString("hex"),
    scope: opts.scope,
    issuedAt: opts.issuedAt,
    accessExpiresAt: new Date(opts.issuedAt.getTime() + 3600_000),
    refreshExpiresAt: new Date(opts.issuedAt.getTime() + 30 * 86400_000),
    revokedAt: opts.revoked ? new Date() : null,
  });
}

async function makeMembership(orgId: string, suffix: string) {
  const passwordHash = await hashPassword("test-password-123");
  const user = await storage.createUser({
    email: `oauth-conn-${suffix}-${seedTag}@allotly.local`,
    name: `OAuth Conn ${suffix}`,
    passwordHash,
    orgId,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  });
  const team = await storage.createTeam({
    name: `oauth-conn-team-${suffix}-${seedTag}`,
    orgId,
    adminId: user.id,
    monthlyBudgetCeilingCents: 100_000,
  });
  const now = new Date();
  const membership = await storage.createMembership({
    teamId: team.id,
    userId: user.id,
    accessType: "TEAM",
    monthlyBudgetCents: 50_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd: new Date(now.getTime() + 30 * 86400_000),
    status: "ACTIVE",
  } as any);
  return { userId: user.id, teamId: team.id, membershipId: membership.id };
}

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `oauth-conn-${seedTag}`,
    plan: "FREE",
    maxTeamAdmins: 2,
  } as any);
  testOrgId = org.id;

  const main = await makeMembership(org.id, "main");
  testUserId = main.userId;
  testTeamId = main.teamId;
  testMembershipId = main.membershipId;

  const other = await makeMembership(org.id, "other");
  otherUserId = other.userId;
  otherTeamId = other.teamId;
  otherMembershipId = other.membershipId;

  clientAId = await seedClient("clientA");
  clientBId = await seedClient("clientB");
});

beforeEach(async () => {
  await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, testMembershipId));
  await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, otherMembershipId));
  await db.delete(mcpAuditLog).where(eq(mcpAuditLog.membershipId, testMembershipId));
});

afterAll(async () => {
  await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, testMembershipId));
  await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, otherMembershipId));
  await db.delete(mcpAuditLog).where(eq(mcpAuditLog.membershipId, testMembershipId));
  await db.delete(mcpAuditLog).where(eq(mcpAuditLog.membershipId, otherMembershipId));
  await pool.query("DELETE FROM oauth_clients WHERE client_name LIKE $1", [`%${seedTag}%`]);
  await db.delete(teamMemberships).where(eq(teamMemberships.id, testMembershipId));
  await db.delete(teamMemberships).where(eq(teamMemberships.id, otherMembershipId));
  await db.delete(teams).where(eq(teams.id, testTeamId));
  await db.delete(teams).where(eq(teams.id, otherTeamId));
  await db.delete(users).where(eq(users.id, testUserId));
  await db.delete(users).where(eq(users.id, otherUserId));
  await db.delete(organizations).where(eq(organizations.id, testOrgId));
});

// recordAudit writes via setImmediate; poll up to ~1s.
async function waitForRevokeAudit(membershipId: string): Promise<typeof mcpAuditLog.$inferSelect | null> {
  for (let i = 0; i < 40; i++) {
    const rows = await db.select().from(mcpAuditLog).where(eq(mcpAuditLog.membershipId, membershipId));
    const hit = rows.find((r) => r.toolName === "oauth.revoke");
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

describe("oauth connections: list", () => {
  it("[1] returns 401 when no session userId is present", async () => {
    const req = mockReq({ session: {} });
    const res = mockRes();
    await listConnectionsHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
    expect(res.body?.error).toBe("unauthorized");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("[2] returns empty array when membership holds no active tokens", async () => {
    await insertToken({
      clientId: clientAId,
      membershipId: testMembershipId,
      scope: "mcp",
      issuedAt: new Date(),
      revoked: true,
    });
    const req = mockReq({ session: { userId: testUserId } });
    const res = mockRes();
    await listConnectionsHandler(req as any, res as any);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ connections: [] });
  });

  it("[3] groups tokens by client with aggregated scopes, dates, and active count", async () => {
    const t0 = new Date("2026-01-01T10:00:00Z");
    const t1 = new Date("2026-01-15T10:00:00Z");
    const t2 = new Date("2026-02-01T10:00:00Z");

    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp", issuedAt: t0 });
    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp:read", issuedAt: t1 });
    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp", issuedAt: new Date("2025-12-01"), revoked: true });
    await insertToken({ clientId: clientBId, membershipId: testMembershipId, scope: "mcp", issuedAt: t2 });
    await insertToken({ clientId: clientAId, membershipId: otherMembershipId, scope: "mcp", issuedAt: new Date() });

    const req = mockReq({ session: { userId: testUserId } });
    const res = mockRes();
    await listConnectionsHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.connections).toHaveLength(2);
    expect(res.body.connections[0].clientId).toBe(clientBId);
    expect(res.body.connections[1].clientId).toBe(clientAId);

    const a = res.body.connections[1];
    expect(a.clientName).toMatch(/^clientA-/);
    expect(a.activeTokenCount).toBe(2);
    expect(new Set(a.scopes)).toEqual(new Set(["mcp", "mcp:read"]));
    expect(a.firstAuthorizedAt).toBe(t0.toISOString());
    expect(a.lastUsedAt).toBe(t1.toISOString());
  });
});

describe("oauth connections: delete", () => {
  it("[4] returns 401 when no session userId is present", async () => {
    const req = mockReq({ session: {}, params: { clientId: clientAId } });
    const res = mockRes();
    await deleteConnectionHandler(req as any, res as any);
    expect(res.statusCode).toBe(401);
  });

  it("[5] revokes every active token for that client+membership and returns the count", async () => {
    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp", issuedAt: new Date() });
    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp:read", issuedAt: new Date() });
    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp", issuedAt: new Date(), revoked: true });
    await insertToken({ clientId: clientBId, membershipId: testMembershipId, scope: "mcp", issuedAt: new Date() });

    const req = mockReq({ session: { userId: testUserId }, params: { clientId: clientAId } });
    const res = mockRes();
    await deleteConnectionHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ revokedCount: 2 });

    const aRows = await db.select().from(oauthTokens).where(eq(oauthTokens.clientId, clientAId));
    const aActive = aRows.filter((r) => r.revokedAt === null && r.membershipId === testMembershipId);
    expect(aActive).toHaveLength(0);
    const bRows = await db.select().from(oauthTokens).where(eq(oauthTokens.clientId, clientBId));
    expect(bRows.filter((r) => r.revokedAt === null && r.membershipId === testMembershipId)).toHaveLength(1);

    const auditRow = await waitForRevokeAudit(testMembershipId);
    expect(auditRow).not.toBeNull();
    expect(auditRow!.clientId).toBe(clientAId);
    expect(auditRow!.ok).toBe(true);
  });

  it("[6] is idempotent — second call returns revokedCount=0 and 200", async () => {
    await insertToken({ clientId: clientAId, membershipId: testMembershipId, scope: "mcp", issuedAt: new Date() });

    const req1 = mockReq({ session: { userId: testUserId }, params: { clientId: clientAId } });
    const res1 = mockRes();
    await deleteConnectionHandler(req1 as any, res1 as any);
    expect(res1.body.revokedCount).toBe(1);

    const req2 = mockReq({ session: { userId: testUserId }, params: { clientId: clientAId } });
    const res2 = mockRes();
    await deleteConnectionHandler(req2 as any, res2 as any);
    expect(res2.statusCode).toBe(200);
    expect(res2.body).toEqual({ revokedCount: 0 });
  });

  it("[7] cannot revoke another membership's tokens (cross-membership isolation)", async () => {
    await insertToken({ clientId: clientAId, membershipId: otherMembershipId, scope: "mcp", issuedAt: new Date() });

    const req = mockReq({ session: { userId: testUserId }, params: { clientId: clientAId } });
    const res = mockRes();
    await deleteConnectionHandler(req as any, res as any);

    expect(res.statusCode).toBe(200);
    expect(res.body.revokedCount).toBe(0);

    const otherRows = await db
      .select()
      .from(oauthTokens)
      .where(eq(oauthTokens.membershipId, otherMembershipId));
    expect(otherRows).toHaveLength(1);
    expect(otherRows[0].revokedAt).toBeNull();
  });
});

void like;
