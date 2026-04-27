/**
 * Single source of truth for the connector setup snippets that ship in:
 *  - the dashboard /dashboard/connect page (client/src/pages/dashboard/connect-helpers.ts)
 *  - the post-redeem success view (client/src/pages/redeem.tsx via ConnectorGrid)
 *  - the voucher welcome email Quick Setup block (server/lib/email.ts)
 *
 * Keeping the JSON/TOML strings in one place guarantees the email snippet
 * is byte-identical to what the user later sees in the dashboard, so they
 * can paste either copy and hit a working MCP server. Existing tests in
 * tests/connect-helpers.test.ts and tests/email-voucher-notification.test.ts
 * lock that contract in.
 */

export const ALLOTLY_MCP_URL = "https://allotly.ai/mcp";
export const ALLOTLY_MCP_PACKAGE = "@allotly/mcp";

export type ConnectorId = "cursor" | "vscode" | "claudeCode" | "codex" | "claudeDesktop";

export const CONNECTOR_IDS: ConnectorId[] = [
  "cursor",
  "vscode",
  "claudeCode",
  "codex",
  "claudeDesktop",
];

export interface SnippetParams {
  /** Bearer token: a real allotly_sk_ key, an ALLOT- voucher code, or an OAuth access token. */
  key: string;
  /** Override the npm package for stdio connectors (Claude Desktop). Defaults to @allotly/mcp. */
  packageName?: string;
  /** Override the MCP HTTP URL. Defaults to https://allotly.ai/mcp. */
  url?: string;
}

export function buildConnectorSnippet(connector: ConnectorId, params: SnippetParams): string {
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
    case "codex":
      return [
        "# ~/.codex/config.toml",
        "[mcp_servers.allotly]",
        `url = "${url}"`,
        `http_headers = { "Authorization" = "Bearer ${key}" }`,
      ].join("\n");
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

export function buildAllConnectorSnippets(params: SnippetParams): Record<ConnectorId, string> {
  return {
    cursor: buildConnectorSnippet("cursor", params),
    vscode: buildConnectorSnippet("vscode", params),
    claudeCode: buildConnectorSnippet("claudeCode", params),
    codex: buildConnectorSnippet("codex", params),
    claudeDesktop: buildConnectorSnippet("claudeDesktop", params),
  };
}

/**
 * OAuth-connect cards on /dashboard/connect. These are informational cards —
 * the OAuth flow is always client-initiated by the third-party MCP host
 * (Claude.ai, ChatGPT, Gemini), so the card just tells the user where to
 * paste our MCP URL. Once they do, the host kicks off discovery → DCR →
 * authorize → callback into our /oauth/* endpoints. The MCP URL itself is
 * the same ALLOTLY_MCP_URL constant used for bearer connectors above, so a
 * URL change in production only needs touching here.
 */
export type OAuthConnectorId = "claudeAi" | "chatgpt" | "gemini";

export interface OAuthConnectorSpec {
  id: OAuthConnectorId;
  title: string;
  /** One-line description shown under the title. */
  blurb: string;
  /** Numbered setup steps. Render as <ol>. */
  steps: string[];
  /** External documentation link for the host's MCP setup. */
  learnMoreUrl: string;
  /** MCP URL the user pastes into the host. */
  mcpUrl: string;
}

export const OAUTH_CONNECTORS: OAuthConnectorSpec[] = [
  {
    id: "claudeAi",
    title: "Claude.ai",
    blurb: "Add Allotly as a custom connector inside Claude.ai (web).",
    steps: [
      "Open Claude.ai → Settings → Connectors.",
      'Click "Add custom connector".',
      "Paste the MCP URL above.",
      "Authorize Allotly when prompted.",
    ],
    learnMoreUrl: "/docs#oauth-claude-ai",
    mcpUrl: ALLOTLY_MCP_URL,
  },
  {
    id: "chatgpt",
    title: "ChatGPT",
    blurb: "Pro / Team / Enterprise required (MCP beta).",
    steps: [
      "ChatGPT Pro / Team / Enterprise required.",
      "Settings → Beta features → MCP.",
      "Add server with the URL above.",
      "Sign in via Allotly when prompted.",
    ],
    learnMoreUrl: "/docs#oauth-chatgpt",
    mcpUrl: ALLOTLY_MCP_URL,
  },
  {
    id: "gemini",
    title: "Gemini",
    blurb: "Workspace or Vertex AI tier (Agent Builder).",
    steps: [
      "Workspace or Vertex AI tier required.",
      "Open Agent Builder → Tools → Add MCP.",
      "Use the URL above.",
      "Authorize via Allotly.",
    ],
    learnMoreUrl: "/docs#oauth-gemini",
    mcpUrl: ALLOTLY_MCP_URL,
  },
];
