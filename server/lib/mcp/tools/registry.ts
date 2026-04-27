import { z } from "zod";
import type { McpPrincipal } from "../auth";

export interface ToolContext {
  principal: McpPrincipal | null;
  authHeader: string | undefined;
}

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny, TOut = any> {
  name: string;
  description: string;
  inputSchema: TSchema;
  requiresAuth: boolean;
  /** Required OAuth scope when called with an OAuth bearer. Defaults to "mcp" when unset. Ignored for key/voucher bearers. */
  requiredScope?: "mcp" | "mcp:read";
  /** When true, only voucher-bearer principals may invoke (rejects key + oauth). */
  voucherOnly?: boolean;
  /** MCP 2025-03-26 tool annotations — surfaced in tools/list to help clients render and reason about behaviour. */
  annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  handler: (input: z.infer<TSchema>, ctx: ToolContext) => Promise<TOut>;
}

const tools: Record<string, ToolDefinition> = {};

export function registerTool<TSchema extends z.ZodTypeAny, TOut>(def: ToolDefinition<TSchema, TOut>): void {
  if (tools[def.name]) {
    console.warn(`[mcp] tool ${def.name} already registered; overwriting`);
  }
  tools[def.name] = def as unknown as ToolDefinition;
}

export function listTools(): ToolDefinition[] {
  return Object.values(tools);
}

export function getTool(name: string): ToolDefinition | undefined {
  return tools[name];
}

export function clearTools(): void {
  for (const k of Object.keys(tools)) delete tools[k];
}
