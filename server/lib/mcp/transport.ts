import type { Request, Response, Express } from "express";
import { z } from "zod";
import { authenticate } from "./auth";
import { McpToolError, toMcpRpcError } from "./errors";
import { listTools, getTool, pinDescriptionsAtStartup } from "./tools";
import { listPrompts, getPrompt } from "./prompts";
import { RESOURCES, readResource } from "./resources";
import { hashInput, recordAudit } from "./audit";

const PROTOCOL_VERSION = "2025-03-26";
const MCP_VERSION = "1.0.0";

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

function ok(id: any, result: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function err(id: any, code: number, message: string, data?: any): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message, ...(data ? { data } : {}) } };
}

function setMcpHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Allotly-Mcp-Version", MCP_VERSION);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, MCP-Session-Id");
  res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id, X-Allotly-Mcp-Version");
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

async function handleJsonRpc(req: JsonRpcRequest, authHeader: string | undefined): Promise<JsonRpcResponse> {
  const id = req.id ?? null;

  if (req.method === "initialize") {
    return ok(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
        prompts: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
      },
      serverInfo: { name: "allotly-mcp", version: MCP_VERSION },
    });
  }

  if (req.method === "notifications/initialized") return ok(id, {});
  if (req.method === "ping") return ok(id, {});

  if (req.method === "tools/list") {
    const tools = listTools().map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: jsonSchemaFor(t.inputSchema),
    }));
    return ok(id, { tools });
  }

  if (req.method === "tools/call") {
    const start = Date.now();
    const params = req.params || {};
    const toolName = params.name;
    const args = params.arguments || {};
    const tool = getTool(toolName);
    if (!tool) {
      recordAudit({ membershipId: null, toolName: toolName || "<unknown>", inputHash: hashInput(args), ok: false, errorCode: -32601, latencyMs: Date.now() - start });
      return err(id, -32601, `Unknown tool: ${toolName}`);
    }

    let principal = null;
    let principalMembershipId: string | null = null;
    try {
      principal = await authenticate(authHeader, { allowAnonymous: !tool.requiresAuth });
      principalMembershipId = principal?.membership.id ?? null;
    } catch (authErr: any) {
      const inputHash = hashInput(args);
      const errCode = authErr instanceof McpToolError ? authErr.code : -32001;
      recordAudit({ membershipId: null, toolName, inputHash, ok: false, errorCode: errCode, latencyMs: Date.now() - start });
      if (authErr instanceof McpToolError) return err(id, authErr.code, authErr.message, authErr.data);
      return err(id, -32001, authErr.message || "Authentication failed");
    }

    if (tool.requiresAuth && !principal) {
      const inputHash = hashInput(args);
      recordAudit({ membershipId: null, toolName, inputHash, ok: false, errorCode: -32001, latencyMs: Date.now() - start });
      return err(id, -32001, "Authentication required for this tool");
    }

    const inputHash = hashInput(args);
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: false, errorCode: -32100, latencyMs: Date.now() - start });
      return err(id, -32100, "Invalid input", {
        message: "Input validation failed",
        hint: "Check the tool's input schema and retry.",
        issues: parsed.error.issues.map(i => ({ path: i.path, message: i.message, code: i.code })),
      });
    }

    try {
      const result = await tool.handler(parsed.data, { principal, authHeader });
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: true, errorCode: null, latencyMs: Date.now() - start });
      return ok(id, {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
      });
    } catch (toolErr: any) {
      const errCode = toolErr instanceof McpToolError ? toolErr.code : -32603;
      recordAudit({ membershipId: principalMembershipId, toolName, inputHash, ok: false, errorCode: errCode, latencyMs: Date.now() - start });
      if (toolErr instanceof McpToolError) {
        const rpc = toMcpRpcError(toolErr);
        return err(id, rpc.code, rpc.message, rpc.data);
      }
      console.error(`[mcp:tool:${toolName}] unexpected error:`, toolErr);
      return err(id, -32603, toolErr?.message || "Internal error");
    }
  }

  if (req.method === "prompts/list") {
    const prompts = listPrompts().map(p => ({
      name: p.name,
      description: p.description,
      arguments: p.arguments || [],
    }));
    return ok(id, { prompts });
  }

  if (req.method === "prompts/get") {
    const name = req.params?.name;
    const args = req.params?.arguments || {};
    const prompt = getPrompt(name);
    if (!prompt) return err(id, -32601, `Unknown prompt: ${name}`);
    return ok(id, prompt.render(args));
  }

  if (req.method === "resources/list") {
    return ok(id, { resources: RESOURCES });
  }

  if (req.method === "resources/read") {
    const uri = req.params?.uri;
    if (!uri) return err(id, -32602, "uri parameter required");
    let principal = null;
    try {
      principal = await authenticate(authHeader, { allowAnonymous: true });
    } catch {}
    const content = await readResource(uri, principal);
    return ok(id, { contents: [content] });
  }

  return err(id, -32601, `Method not found: ${req.method}`);
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
      const responses = await Promise.all(body.map(r => handleJsonRpc(r, authHeader)));
      res.json(responses.filter(r => r.id !== null || r.error));
      return;
    }

    const response = await handleJsonRpc(body as JsonRpcRequest, authHeader);
    res.json(response);
  });

  console.log(`[mcp] mounted at ${path} — ${listTools().length} tools, ${listPrompts().length} prompts, ${RESOURCES.length} resources`);
}
