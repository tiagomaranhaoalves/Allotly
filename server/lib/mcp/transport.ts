import type { Request, Response, Express } from "express";
import { z } from "zod";
import { authenticate, type McpPrincipal } from "./auth";
import { McpToolError, toMcpRpcError } from "./errors";
import { listTools, getTool, pinDescriptionsAtStartup } from "./tools";
import { listPrompts, getPrompt } from "./prompts";
import { RESOURCES, readResource } from "./resources";
import { hashInput, recordAudit } from "./audit";
import { scopeIncludes } from "../oauth/scopes";
import { OAUTH_ISSUER } from "../oauth/jwt";

const PROTOCOL_VERSION = "2025-03-26";
const MCP_VERSION = "1.0.0";

const RESOURCE_METADATA_URL = `${OAUTH_ISSUER}/.well-known/oauth-protected-resource`;
const WWW_AUTH_INVALID_TOKEN = `Bearer realm="MCP", resource_metadata="${RESOURCE_METADATA_URL}", error="invalid_token"`;
function wwwAuthInsufficientScope(scope: string): string {
  return `Bearer realm="MCP", resource_metadata="${RESOURCE_METADATA_URL}", error="insufficient_scope", scope="${scope}"`;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number | string | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: any };
}

interface JsonRpcEnvelope {
  httpStatus: number;
  wwwAuthenticate?: string;
  body: JsonRpcResponse;
}

function ok(id: any, result: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: any, code: number, message: string, data?: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

function envelope(body: JsonRpcResponse, httpStatus = 200, wwwAuthenticate?: string): JsonRpcEnvelope {
  return wwwAuthenticate ? { httpStatus, wwwAuthenticate, body } : { httpStatus, body };
}

function setMcpHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Allotly-Mcp-Version", MCP_VERSION);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id, X-Allotly-Mcp-Version, WWW-Authenticate");
}

function jsonSchemaFor(zSchema: z.ZodTypeAny): Record<string, any> {
  return zodToJsonSchema(zSchema);
}

function zodToJsonSchema(s: z.ZodTypeAny): Record<string, any> {
  if (s instanceof z.ZodObject) {
    const shape = (s as any).shape;
    const properties: Record<string, any> = {};
    const required: string[] = [];
    for (const [k, v] of Object.entries(shape)) {
      const inner = v as z.ZodTypeAny;
      properties[k] = zodToJsonSchema(inner);
      if (!(inner instanceof z.ZodOptional || inner instanceof z.ZodDefault)) required.push(k);
    }
    return { type: "object", properties, ...(required.length ? { required } : {}), additionalProperties: false };
  }
  if (s instanceof z.ZodArray) return { type: "array", items: zodToJsonSchema((s as any)._def.type) };
  if (s instanceof z.ZodString) return { type: "string" };
  if (s instanceof z.ZodNumber) return { type: "number" };
  if (s instanceof z.ZodBoolean) return { type: "boolean" };
  if (s instanceof z.ZodEnum) return { type: "string", enum: (s as any)._def.values };
  if (s instanceof z.ZodLiteral) return { const: (s as any)._def.value };
  if (s instanceof z.ZodUnion) return { anyOf: ((s as any)._def.options as z.ZodTypeAny[]).map(zodToJsonSchema) };
  if (s instanceof z.ZodOptional) return zodToJsonSchema((s as any)._def.innerType);
  if (s instanceof z.ZodDefault) return zodToJsonSchema((s as any)._def.innerType);
  if (s instanceof z.ZodNullable) return { ...zodToJsonSchema((s as any)._def.innerType), nullable: true };
  if (s instanceof z.ZodRecord) return { type: "object", additionalProperties: true };
  return {};
}

function principalAuditCols(p: McpPrincipal | null): { clientId: string | null; audience: string | null } {
  if (!p || p.bearerKind !== "oauth") return { clientId: null, audience: null };
  return { clientId: p.clientId ?? null, audience: p.resource ?? null };
}

async function handleJsonRpc(req: JsonRpcRequest, authHeader: string | undefined): Promise<JsonRpcEnvelope> {
  const id = req.id ?? null;

  if (req.method === "initialize") {
    return envelope(ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
      },
      serverInfo: { name: "allotly-mcp", version: MCP_VERSION },
    }));
  }

  if (req.method === "notifications/initialized") return envelope(ok(id, {}));
  if (req.method === "ping") return envelope(ok(id, {}));

  if (req.method === "tools/list") {
    const tools = listTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: jsonSchemaFor(t.inputSchema),
    }));
    return envelope(ok(id, { tools }));
  }

  if (req.method === "tools/call") {
    const start = Date.now();
    const params = req.params || {};
    const toolName = params.name;
    const args = params.arguments || {};
    const tool = getTool(toolName);
    if (!tool) {
      recordAudit({ membershipId: null, toolName: toolName || "<unknown>", inputHash: hashInput(args), ok: false, errorCode: -32601, latencyMs: Date.now() - start });
      return envelope(err(id, -32601, `Unknown tool: ${toolName}`));
    }

    let principal: McpPrincipal | null = null;
    let principalMembershipId: string | null = null;
    try {
      principal = await authenticate(authHeader, { allowAnonymous: !tool.requiresAuth });
      principalMembershipId = principal?.membership.id ?? null;
    } catch (authErr: any) {
      const inputHash = hashInput(args);
      const errCode = authErr instanceof McpToolError ? authErr.code : -32001;
      recordAudit({ membershipId: null, toolName, inputHash, ok: false, errorCode: errCode, latencyMs: Date.now() - start });
      // Per RFC 9728 / MCP spec: any authenticate() failure on a protected
      // tool is a discovery handshake — return HTTP 401 + WWW-Authenticate so
      // OAuth-aware clients (Claude.ai, ChatGPT, Gemini) can find the
      // resource-metadata document and start their OAuth flow.
      const body = authErr instanceof McpToolError
        ? err(id, authErr.code, authErr.message, authErr.data)
        : err(id, -32001, authErr.message || "Authentication failed");
      return envelope(body, 401, WWW_AUTH_INVALID_TOKEN);
    }

    if (tool.requiresAuth && !principal) {
      const inputHash = hashInput(args);
      recordAudit({ membershipId: null, toolName, inputHash, ok: false, errorCode: -32001, latencyMs: Date.now() - start });
      return envelope(err(id, -32001, "Authentication required for this tool"), 401, WWW_AUTH_INVALID_TOKEN);
    }

    const auditCols = principalAuditCols(principal);

    // voucherOnly tools (e.g. redeem-and-chat) reject only OAuth-bearer callers,
    // not legacy raw-key callers. The intent is "do not let a third-party OAuth
    // client redeem on a user's behalf"; key-bearer humans/scripts may still
    // mint a voucher session for themselves.
    //
    // This is a POLICY rejection, not an OAuth discovery handshake — keep
    // HTTP 200 so OAuth clients don't try to re-auth (they're already
    // authenticated; they're just calling a tool they're never allowed to call).
    if (principal && tool.voucherOnly && principal.bearerKind === "oauth") {
      const inputHash = hashInput(args);
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: false, errorCode: -32002, latencyMs: Date.now() - start, ...auditCols });
      return envelope(err(id, -32002, `Tool ${toolName} cannot be invoked with an OAuth bearer; pass the voucher code (ALLOT-...) directly`, {
        hint: "Re-issue the call with the voucher code in the Authorization header.",
        bearer_kind_received: principal.bearerKind,
      }));
    }

    if (principal && principal.bearerKind === "oauth") {
      const requiredScope: "mcp" | "mcp:read" = tool.requiredScope ?? "mcp";
      const granted = principal.scopes || [];
      if (!scopeIncludes(granted, requiredScope)) {
        const inputHash = hashInput(args);
        recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: false, errorCode: -32002, latencyMs: Date.now() - start, ...auditCols });
        // RFC 6750 §3.1: bearer is valid but lacks the required scope.
        return envelope(err(id, -32002, `OAuth token is missing required scope: ${requiredScope}`, {
          required_scope: requiredScope,
          granted_scopes: granted,
          hint: "Request a new authorization with this scope.",
        }), 403, wwwAuthInsufficientScope(requiredScope));
      }
    }

    const inputHash = hashInput(args);
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: false, errorCode: -32100, latencyMs: Date.now() - start, ...auditCols });
      return envelope(err(id, -32100, "Invalid input", {
        message: "Input validation failed",
        hint: "Check the tool's input schema and retry.",
        issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message, code: i.code })),
      }));
    }

    try {
      const result = await tool.handler(parsed.data, { principal, authHeader });
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: true, errorCode: null, latencyMs: Date.now() - start, ...auditCols });
      return envelope(ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      }));
    } catch (toolErr: any) {
      const errCode = toolErr instanceof McpToolError ? toolErr.code : -32603;
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: false, errorCode: errCode, latencyMs: Date.now() - start, ...auditCols });
      if (toolErr instanceof McpToolError) {
        const rpc = toMcpRpcError(toolErr);
        return envelope(err(id, rpc.code, rpc.message, rpc.data));
      }
      console.error(`[mcp:tool:${toolName}] unexpected error:`, toolErr);
      return envelope(err(id, -32603, toolErr?.message || "Internal error"));
    }
  }

  if (req.method === "prompts/list") {
    const prompts = listPrompts().map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments || [],
    }));
    return envelope(ok(id, { prompts }));
  }

  if (req.method === "prompts/get") {
    const name = req.params?.name;
    const args = req.params?.arguments || {};
    const prompt = getPrompt(name);
    if (!prompt) return envelope(err(id, -32601, `Unknown prompt: ${name}`));
    return envelope(ok(id, prompt.render(args)));
  }

  if (req.method === "resources/list") {
    return envelope(ok(id, { resources: RESOURCES }));
  }

  if (req.method === "resources/read") {
    const uri = req.params?.uri;
    if (!uri) return envelope(err(id, -32602, "uri parameter required"));
    let principal = null;
    try {
      principal = await authenticate(authHeader, { allowAnonymous: true });
    } catch {}
    const content = await readResource(uri, principal);
    return envelope(ok(id, { contents: [content] }));
  }

  return envelope(err(id, -32601, `Method not found: ${req.method}`));
}

export function mountMcp(app: Express, path: string = "/mcp"): void {
  pinDescriptionsAtStartup();

  app.options(path, (_req, res) => {
    setMcpHeaders(res);
    res.status(204).end();
  });

  app.get(path, (_req, res) => {
    setMcpHeaders(res);
    res.json({
      name: "allotly-mcp",
      version: MCP_VERSION,
      transport: "streamable-http",
      protocol: PROTOCOL_VERSION,
      tools: listTools().length,
      prompts: listPrompts().length,
      resources: RESOURCES.length,
    });
  });

  app.post(path, async (req: Request, res: Response) => {
    setMcpHeaders(res);

    const authHeader = req.headers.authorization;
    const body = req.body;

    if (!body || typeof body !== "object") {
      res.status(400).json(err(null, -32700, "Parse error: body is not valid JSON"));
      return;
    }

    if (Array.isArray(body)) {
      const envelopes = await Promise.all(body.map(r => handleJsonRpc(r, authHeader)));
      // Highest-status-wins for batched requests (401 > 403 > 200). The MCP +
      // RFC 9728 spec is silent on mixed-status batch responses, so we surface
      // the strongest discovery signal so OAuth-aware clients enter the
      // handshake instead of silently swallowing per-item failures.
      const winner = envelopes.reduce((acc, e) => (e.httpStatus > acc.httpStatus ? e : acc), envelopes[0] || { httpStatus: 200 } as JsonRpcEnvelope);
      if (winner.wwwAuthenticate) res.setHeader("WWW-Authenticate", winner.wwwAuthenticate);
      res.status(winner.httpStatus).json(envelopes.map(e => e.body).filter(b => b.id !== null || b.error));
      return;
    }

    const env = await handleJsonRpc(body as JsonRpcRequest, authHeader);
    if (env.wwwAuthenticate) res.setHeader("WWW-Authenticate", env.wwwAuthenticate);
    res.status(env.httpStatus).json(env.body);
  });

  console.log(`[mcp] mounted at ${path} — ${listTools().length} tools, ${listPrompts().length} prompts, ${RESOURCES.length} resources`);
}
