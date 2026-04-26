import {
  ALLOTLY_MCP_URL,
  ALLOTLY_MCP_PACKAGE,
  CONNECTOR_IDS,
  buildConnectorSnippet,
  buildAllConnectorSnippets,
  type ConnectorId,
  type SnippetParams,
} from "@shared/connector-snippets";

export {
  ALLOTLY_MCP_URL,
  ALLOTLY_MCP_PACKAGE,
  CONNECTOR_IDS,
  type ConnectorId,
  type SnippetParams,
};

export const CONNECTOR_DEEP_LINKS: Partial<Record<ConnectorId, string>> = {
  cursor: "cursor://anysphere.cursor-deeplink/mcp/install?name=allotly",
  vscode: "vscode:mcp/install?name=allotly",
};

export function maskKey(fullKey: string): string {
  if (!fullKey) return "allotly_sk_•••••";
  const last4 = fullKey.slice(-4);
  return `allotly_sk_•••••${last4}`;
}

export function cleanPrefix(prefix: string): string {
  return prefix.replace(/\.+$/, "");
}

export function isValidFullKey(fullKey: string, prefix: string): boolean {
  if (!fullKey || !prefix) return false;
  if (!fullKey.startsWith("allotly_sk_")) return false;
  return fullKey.startsWith(cleanPrefix(prefix));
}

export function buildSnippet(connector: ConnectorId, params: SnippetParams): string {
  return buildConnectorSnippet(connector, params);
}

export function buildAllSnippets(params: SnippetParams): Record<ConnectorId, string> {
  return buildAllConnectorSnippets(params);
}

export type TestState = "green" | "red" | "yellow";

export interface TestResult {
  state: TestState;
  toolCount?: number;
  raw?: unknown;
  httpStatus?: number;
  errorMessage?: string;
}

interface MinimalResponse {
  status: number;
  json: () => Promise<unknown>;
}

export async function classifyTestResponse(res: MinimalResponse): Promise<TestResult> {
  const httpStatus = res.status;

  if (httpStatus === 401 || httpStatus === 403) {
    let raw: unknown = undefined;
    try {
      raw = await res.json();
    } catch {}
    return { state: "red", httpStatus, raw, errorMessage: "unauthorized" };
  }

  if (httpStatus >= 500) {
    let raw: unknown = undefined;
    try {
      raw = await res.json();
    } catch {}
    return { state: "yellow", httpStatus, raw, errorMessage: "server_error" };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    return { state: "yellow", httpStatus, errorMessage: "invalid_json" };
  }

  if (body && typeof body === "object" && body.error) {
    const code = body.error?.code;
    const isKeyError = code === -32001 || code === -32002 || code === -32003;
    return {
      state: isKeyError ? "red" : "yellow",
      httpStatus,
      raw: body,
      errorMessage: isKeyError ? "rpc_key_error" : "rpc_server_error",
    };
  }

  const tools = body?.result?.tools;
  if (Array.isArray(tools)) {
    return { state: "green", httpStatus, toolCount: tools.length, raw: body };
  }

  return { state: "yellow", httpStatus, raw: body, errorMessage: "unexpected_shape" };
}

export async function runTestConnection(
  key: string,
  fetchImpl: typeof fetch = fetch,
  url: string = ALLOTLY_MCP_URL,
): Promise<TestResult> {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    return await classifyTestResponse(res);
  } catch (e: any) {
    return { state: "yellow", errorMessage: e?.message ?? String(e) };
  }
}
