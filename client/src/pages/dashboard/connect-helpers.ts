export const ALLOTLY_MCP_URL = "https://allotly.ai/mcp";
export const ALLOTLY_MCP_PACKAGE = "@allotly/mcp";

export type ConnectorId = "cursor" | "vscode" | "claudeCode" | "claudeDesktop";

export const CONNECTOR_IDS: ConnectorId[] = ["cursor", "vscode", "claudeCode", "claudeDesktop"];

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

export interface SnippetParams {
  key: string;
  packageName?: string;
  url?: string;
}

export function buildSnippet(connector: ConnectorId, params: SnippetParams): string {
  const key = params.key;
  const url = params.url ?? ALLOTLY_MCP_URL;
  const pkg = params.packageName ?? ALLOTLY_MCP_PACKAGE;

  switch (connector) {
    case "cursor":
      return JSON.stringify(
        {
          mcpServers: {
            allotly: {
              url,
              headers: { Authorization: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      );
    case "vscode":
      return JSON.stringify(
        {
          servers: {
            allotly: {
              url,
              type: "http",
              headers: { Authorization: `Bearer ${key}` },
            },
          },
        },
        null,
        2,
      );
    case "claudeCode":
      return `claude mcp add --transport http allotly ${url} \\\n  --header "Authorization: Bearer ${key}"`;
    case "claudeDesktop":
      return JSON.stringify(
        {
          mcpServers: {
            allotly: {
              command: "npx",
              args: ["-y", `${pkg}@latest`],
              env: { ALLOTLY_KEY: key },
            },
          },
        },
        null,
        2,
      );
  }
}

export function buildAllSnippets(params: SnippetParams): Record<ConnectorId, string> {
  return {
    cursor: buildSnippet("cursor", params),
    vscode: buildSnippet("vscode", params),
    claudeCode: buildSnippet("claudeCode", params),
    claudeDesktop: buildSnippet("claudeDesktop", params),
  };
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

  // Auth failures => RED (key is invalid or revoked).
  if (httpStatus === 401 || httpStatus === 403) {
    let raw: unknown = undefined;
    try {
      raw = await res.json();
    } catch {
      // ignore parse errors on auth failure
    }
    return { state: "red", httpStatus, raw, errorMessage: "unauthorized" };
  }

  // Server errors => YELLOW (reachability/server-side problem, not the key).
  if (httpStatus >= 500) {
    let raw: unknown = undefined;
    try {
      raw = await res.json();
    } catch {
      // ignore
    }
    return { state: "yellow", httpStatus, raw, errorMessage: "server_error" };
  }

  let body: any;
  try {
    body = await res.json();
  } catch {
    // Couldn't parse => treat as transport/server problem, not key invalidity.
    return { state: "yellow", httpStatus, errorMessage: "invalid_json" };
  }

  if (body && typeof body === "object" && body.error) {
    // JSON-RPC error envelope. -32001 (or similar -320xx auth codes) => RED (key issue).
    // Anything else (e.g. -32603 internal error) => YELLOW (server issue).
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

  // Successful HTTP but unexpected payload shape => YELLOW (not a key problem).
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
