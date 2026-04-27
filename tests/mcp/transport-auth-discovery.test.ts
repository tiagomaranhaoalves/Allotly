import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "crypto";
import express from "express";
import http from "http";
import { eq } from "drizzle-orm";

process.env.OAUTH_JWT_SECRET = process.env.OAUTH_JWT_SECRET || crypto.randomBytes(32).toString("base64");

import { mountMcp } from "../../server/lib/mcp/server";
import { db } from "../../server/db";
import {
  organizations,
  users,
  teams,
  teamMemberships,
  oauthTokens,
  oauthAuthorizationCodes,
} from "@shared/schema";
import { storage } from "../../server/storage";
import { hashPassword } from "../../server/lib/password";
import { issueAccessToken } from "../../server/lib/oauth/jwt";
import { MCP_AUDIENCE } from "../../server/lib/oauth/scopes";
import { redisSet } from "../../server/lib/redis";

const RESOURCE_METADATA_URL = "https://allotly.ai/.well-known/oauth-protected-resource";
const WWW_AUTH_INVALID = `Bearer realm="MCP", resource_metadata="${RESOURCE_METADATA_URL}", error="invalid_token"`;
function wwwAuthInsufficientScope(scope: string): string {
  return `Bearer realm="MCP", resource_metadata="${RESOURCE_METADATA_URL}", error="insufficient_scope", scope="${scope}"`;
}

function makeApp() {
  const app = express();
  app.use(express.json());
  mountMcp(app, "/mcp");
  return app;
}

async function rpc(server: http.Server, body: any, headers: Record<string, string> = {}): Promise<any> {
  const addr = server.address() as any;
  const port = addr.port;
  return new Promise((resolve, reject) => {
    const req = http.request({
      method: "POST",
      host: "127.0.0.1",
      port,
      path: "/mcp",
      headers: { "Content-Type": "application/json", ...headers },
    }, (res) => {
      let data = "";
      res.on("data", (c) => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, headers: res.headers, body: JSON.parse(data) }); }
        catch (e) { reject(new Error(`Bad JSON: ${data}`)); }
      });
    });
    req.on("error", reject);
    req.write(JSON.stringify(body));
    req.end();
  });
}

const seedTag = `discovery-${Date.now()}-${crypto.randomBytes(2).toString("hex")}`;
let testOrgId = "";
let testUserId = "";
let testTeamId = "";
let testMembershipId = "";

beforeAll(async () => {
  const org = await storage.createOrganization({
    name: `discovery-${seedTag}`,
    plan: "FREE",
    maxTeamAdmins: 1,
  } as any);
  testOrgId = org.id;

  const passwordHash = await hashPassword("test-password-123");
  const user = await storage.createUser({
    email: `discovery-${seedTag}@allotly.local`,
    name: "Discovery Test User",
    passwordHash,
    orgId: org.id,
    orgRole: "ROOT_ADMIN",
    status: "ACTIVE",
    isVoucherUser: false,
  });
  testUserId = user.id;

  const team = await storage.createTeam({
    name: `discovery-team-${seedTag}`,
    orgId: org.id,
    adminId: user.id,
    monthlyBudgetCeilingCents: 100_000,
  });
  testTeamId = team.id;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const membership = await storage.createMembership({
    teamId: team.id,
    userId: user.id,
    accessType: "TEAM",
    monthlyBudgetCents: 50_000,
    allowedModels: null,
    allowedProviders: null,
    currentPeriodSpendCents: 0,
    periodStart: now,
    periodEnd,
    status: "ACTIVE",
  } as any);
  testMembershipId = membership.id;
});

afterAll(async () => {
  await db.delete(oauthTokens).where(eq(oauthTokens.membershipId, testMembershipId));
  await db.delete(oauthAuthorizationCodes).where(eq(oauthAuthorizationCodes.membershipId, testMembershipId));
  await db.delete(teamMemberships).where(eq(teamMemberships.id, testMembershipId));
  await db.delete(teams).where(eq(teams.id, testTeamId));
  await db.delete(users).where(eq(users.id, testUserId));
  await db.delete(organizations).where(eq(organizations.id, testOrgId));
});

function mintOauthToken(scope: string, jti?: string): { token: string; jti: string } {
  const minted = issueAccessToken({
    userId: testUserId,
    membershipId: testMembershipId,
    clientId: `test-client-${seedTag}`,
    scope,
    resource: MCP_AUDIENCE,
    jti,
  });
  return { token: minted.token, jti: minted.jti };
}

describe("mcp transport: OAuth discovery handshake (RFC 9728)", () => {
  it("returns HTTP 401 + WWW-Authenticate when tools/call is sent with no Authorization header", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "my_status", arguments: {} } });
      expect(r.status).toBe(401);
      expect(r.headers["www-authenticate"]).toBe(WWW_AUTH_INVALID);
      expect(r.body.error).toBeDefined();
      expect(r.body.error.code).toBe(-32001);
    } finally {
      server.close();
    }
  });

  it("returns HTTP 401 + WWW-Authenticate for a malformed bearer token", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(
        server,
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "my_status", arguments: {} } },
        { Authorization: "Bearer invalid-junk" },
      );
      expect(r.status).toBe(401);
      expect(r.headers["www-authenticate"]).toBe(WWW_AUTH_INVALID);
      expect(r.body.error.code).toBe(-32001);
    } finally {
      server.close();
    }
  });

  it("returns HTTP 401 + WWW-Authenticate for a revoked OAuth bearer", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const { token, jti } = mintOauthToken("mcp");
      await redisSet(`allotly:oauth:revoked:${jti}`, "1", 3600);
      const r = await rpc(
        server,
        { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "my_status", arguments: {} } },
        { Authorization: `Bearer ${token}` },
      );
      expect(r.status).toBe(401);
      expect(r.headers["www-authenticate"]).toBe(WWW_AUTH_INVALID);
      expect(r.body.error.code).toBe(-32001);
    } finally {
      server.close();
    }
  });

  it("returns HTTP 403 + insufficient_scope WWW-Authenticate when OAuth bearer lacks the required scope", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const { token } = mintOauthToken("mcp:read");
      const r = await rpc(
        server,
        { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "chat", arguments: { messages: [{ role: "user", content: "hi" }], model: "gpt-4o-mini" } } },
        { Authorization: `Bearer ${token}` },
      );
      expect(r.status).toBe(403);
      expect(r.headers["www-authenticate"]).toBe(wwwAuthInsufficientScope("mcp"));
      expect(r.body.error).toBeDefined();
      expect(r.body.error.code).toBe(-32002);
    } finally {
      server.close();
    }
  });

  it("returns HTTP 200 (policy rejection, NOT discovery) when an OAuth bearer hits a voucher-only tool", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const { token } = mintOauthToken("mcp");
      const r = await rpc(
        server,
        { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "redeem_voucher", arguments: { code: "ALLOT-XXXX-XXXX-XXXX" } } },
        { Authorization: `Bearer ${token}` },
      );
      expect(r.status).toBe(200);
      expect(r.headers["www-authenticate"]).toBeUndefined();
      expect(r.body.error.code).toBe(-32002);
    } finally {
      server.close();
    }
  });

  it("keeps tools/list public — HTTP 200 with no auth header (no handshake)", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, { jsonrpc: "2.0", id: 6, method: "tools/list" });
      expect(r.status).toBe(200);
      expect(r.headers["www-authenticate"]).toBeUndefined();
      expect(r.body.result.tools).toBeInstanceOf(Array);
    } finally {
      server.close();
    }
  });

  it("batched request mixing public tools/list + unauth tools/call returns HTTP 401 (highest-status-wins)", async () => {
    const app = makeApp();
    const server = app.listen(0);
    try {
      const r = await rpc(server, [
        { jsonrpc: "2.0", id: 7, method: "tools/list" },
        { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "my_status", arguments: {} } },
      ]);
      expect(r.status).toBe(401);
      expect(r.headers["www-authenticate"]).toBe(WWW_AUTH_INVALID);
      expect(Array.isArray(r.body)).toBe(true);
    } finally {
      server.close();
    }
  });
});
