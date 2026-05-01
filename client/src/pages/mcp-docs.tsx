import { useState, useCallback, useMemo, useEffect } from "react";
import { Link } from "wouter";
import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Copy,
  Check,
  Plug,
  Wrench,
  AlertTriangle,
  LifeBuoy,
  ArrowRight,
  Zap,
  Mail,
  ExternalLink,
} from "lucide-react";
import {
  ALLOTLY_MCP_URL,
  ALLOTLY_MCP_PACKAGE,
  CONNECTOR_IDS,
  type ConnectorId,
  buildConnectorSnippet,
  OAUTH_CONNECTORS,
} from "@shared/connector-snippets";

const PLACEHOLDER_KEY = "allotly_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const SUPPORT_EMAIL = "support@allotly.ai";
const SECURITY_EMAIL = "security@allotly.ai";

type ConnectorMeta = {
  id: ConnectorId;
  title: string;
  blurb: string;
  language: string;
  filePath?: string;
};

const CONNECTOR_META: Record<ConnectorId, ConnectorMeta> = {
  cursor: {
    id: "cursor",
    title: "Cursor",
    blurb: "Add Allotly as an HTTP MCP server inside Cursor's settings.",
    language: "json",
    filePath: "~/.cursor/mcp.json",
  },
  vscode: {
    id: "vscode",
    title: "VS Code",
    blurb: "Configure Allotly as an HTTP MCP server in VS Code's MCP settings.",
    language: "json",
    filePath: ".vscode/mcp.json",
  },
  claudeCode: {
    id: "claudeCode",
    title: "Claude Code (CLI)",
    blurb: "Register Allotly with one shell command.",
    language: "bash",
  },
  codex: {
    id: "codex",
    title: "Codex CLI",
    blurb: "Add Allotly to your Codex CLI config.",
    language: "toml",
    filePath: "~/.codex/config.toml",
  },
  claudeDesktop: {
    id: "claudeDesktop",
    title: "Claude Desktop",
    blurb: "Use the @allotly/mcp bridge package over stdio.",
    language: "json",
    filePath: "claude_desktop_config.json",
  },
};

type Tool = {
  name: string;
  category: "consumption" | "recipient";
  description: string;
  authNote?: string;
};

const TOOLS: Tool[] = [
  {
    name: "chat",
    category: "consumption",
    description:
      "Send messages to any AI model your Allotly key allows. Returns the assistant's reply and your remaining budget. Supports system prompts, temperature, JSON mode, tool calling, vision input, and streaming. If you don't specify a model, Allotly picks a sensible default within your allowlist.",
  },
  {
    name: "list_available_models",
    category: "consumption",
    description:
      "List the AI models your Allotly key is allowed to use, with pricing and capabilities.",
  },
  {
    name: "compare_models",
    category: "consumption",
    description:
      "Send the same prompt to multiple models in parallel and get all answers side-by-side. Useful for getting a second opinion or comparing model behaviour on the same task. Per-model failures do not abort the call.",
  },
  {
    name: "recommend_model",
    category: "consumption",
    description:
      "Suggest the best model for a task given your remaining budget. Returns one recommended model with a short reason and 1–2 alternatives.",
  },
  {
    name: "quickstart",
    category: "recipient",
    description:
      "Get a friendly intro to your Allotly access — what models you can use, your remaining budget, when it expires, and three sample prompts to try.",
  },
  {
    name: "my_status",
    category: "recipient",
    description:
      "Show your budget, current concurrency state, and rate limit state in one view. Useful for diagnosing why a call just failed.",
  },
  {
    name: "my_budget",
    category: "recipient",
    description:
      "Show your current remaining budget, total budget, period end, and requests remaining.",
  },
  {
    name: "my_recent_usage",
    category: "recipient",
    description:
      "List your recent API calls with model, cost, and timestamp. Prompt content is never included.",
  },
  {
    name: "diagnose",
    category: "recipient",
    description:
      "Explain in plain English what went wrong with your most recent failed API call. Suggests a fix.",
  },
  {
    name: "voucher_info",
    category: "recipient",
    description:
      "Look up details about a voucher code without redeeming it. Useful for previewing what a voucher gives you before committing. Callable without authentication.",
    authNote: "No auth required",
  },
  {
    name: "redeem_voucher",
    category: "recipient",
    description:
      "Redeem a voucher code and bind it to your current MCP session. After redemption, your future chat calls automatically use the voucher's budget.",
  },
  {
    name: "redeem_and_chat",
    category: "recipient",
    description:
      'Redeem a voucher and run your first chat call in one go. The fastest path from "I have a code" to "I have an answer".',
  },
  {
    name: "request_topup",
    category: "recipient",
    description:
      "Ask the admin who issued your voucher to add more budget. Optionally include a reason.",
    authNote: "Voucher principals only",
  },
];

type TroubleshootingItem = {
  id: string;
  symptom: string;
  cause: string;
  fix: string;
};

const TROUBLESHOOTING: TroubleshootingItem[] = [
  {
    id: "401",
    symptom: "401 Unauthorized / authentication failed",
    cause:
      "The bearer token is missing, malformed, expired, or has been revoked. For OAuth hosts, the access token may have expired and the host did not refresh it.",
    fix: "Check your Allotly key starts with allotly_sk_ (or your voucher code starts with ALLOT-). Re-issue the key from /dashboard/keys, paste it back into your AI host's MCP settings, and restart the host.",
  },
  {
    id: "402-budget",
    symptom: "402 budget_exhausted / insufficient_budget",
    cause:
      "Your remaining budget for this period has reached zero. For team members, the budget resets at the start of the next billing cycle. For voucher holders, the voucher is fully spent.",
    fix: "Run the my_budget tool to confirm. If you're on a voucher, ask the issuer for a top-up using request_topup. Team admins can credit your account from /dashboard/members.",
  },
  {
    id: "403-model",
    symptom: "403 model_not_allowed / provider_not_allowed",
    cause:
      "The model or provider you requested is not on your allowlist. Each Allotly key has an explicit allowlist of providers and models it can call.",
    fix: "Run list_available_models to see what you can call. Ask your team admin to extend the allowlist from /dashboard/members if you need a model that isn't there.",
  },
  {
    id: "403-account",
    symptom: "403 account_suspended / account_expired / period_expired",
    cause:
      "Your membership has been suspended by an admin, your access window has ended, or your billing period has expired without renewal.",
    fix: "Contact your team admin. They can reactivate, extend, or renew your access from /dashboard/members.",
  },
  {
    id: "voucher-expired",
    symptom: "voucher_expired or voucher_already_redeemed",
    cause:
      "Vouchers have an expiration date and a maximum number of redemptions. Once either limit is exceeded, redemption fails.",
    fix: "Use voucher_info to inspect the code's status without redeeming. Ask the issuer for a fresh voucher.",
  },
  {
    id: "rate-limit",
    symptom: "429 rate_limit / concurrency_limit",
    cause:
      "You exceeded your tier's requests-per-minute or concurrent-request limits. Free: 20 rpm / 2 concurrent. Team (key): 60 rpm / 5 concurrent. Team (voucher): 30 rpm / 2 concurrent. Enterprise: 120 rpm / 10 concurrent.",
    fix: "Slow down or batch your requests. For sustained higher throughput, upgrade your plan from /dashboard/settings or ask your admin to issue a non-voucher key.",
  },
  {
    id: "upstream-down",
    symptom: "502/503 upstream errors",
    cause:
      "The underlying AI provider (OpenAI, Anthropic, Google, or Azure) returned an error or timed out. Allotly does not retry these automatically.",
    fix: "Retry the request after a short delay. If it persists for one provider but not others, switch models temporarily. Check provider status pages for ongoing incidents.",
  },
  {
    id: "discovery",
    symptom: "MCP host fails on discovery / OAuth setup loop",
    cause:
      "The host can't reach our /.well-known/oauth-authorization-server endpoint, or there's a clock skew between your machine and our servers.",
    fix: "Confirm https://allotly.ai/mcp is reachable from your network (no corporate proxy stripping headers). Sync your machine's clock. Try removing and re-adding the connector.",
  },
];

function classes(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function CodeBlock({
  children,
  language,
  filePath,
}: {
  children: string;
  language?: string;
  filePath?: string;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-4 rounded-lg border border-border bg-muted/40 dark:bg-muted/20 overflow-hidden">
      {(filePath || language) && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/60 dark:bg-muted/30">
          <div className="text-xs text-muted-foreground font-mono">
            {filePath || language}
          </div>
          {language && filePath && (
            <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wider">
              {language}
            </div>
          )}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-sm font-mono leading-relaxed text-foreground">
          <code>{children}</code>
        </pre>
        <Button
          size="sm"
          variant="ghost"
          onClick={handleCopy}
          aria-label={copied ? "Copied to clipboard" : "Copy code to clipboard"}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity h-7 px-2"
          data-testid={`button-copy-${filePath || language || "code"}`}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Button>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  eyebrow,
  title,
  children,
}: {
  id: string;
  icon: React.ElementType;
  eyebrow: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-10" id={id}>
      <div className="flex items-center gap-2 text-indigo-500 mb-3">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-widest font-semibold">
          {eyebrow}
        </span>
      </div>
      <h2
        className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground"
        data-testid={`heading-${id}`}
      >
        {title}
      </h2>
      {children && (
        <p className="mt-3 text-muted-foreground leading-relaxed max-w-2xl">
          {children}
        </p>
      )}
    </div>
  );
}

function ConnectorCard({ id }: { id: ConnectorId }) {
  const meta = CONNECTOR_META[id];
  const snippet = useMemo(
    () => buildConnectorSnippet(id, { key: PLACEHOLDER_KEY }),
    [id],
  );
  return (
    <Card
      className="overflow-hidden"
      data-testid={`card-connector-${id}`}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <h3
            className="text-lg font-semibold text-foreground"
            data-testid={`heading-connector-${id}`}
          >
            {meta.title}
          </h3>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-mono shrink-0 mt-1">
            {meta.language}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mb-3">{meta.blurb}</p>
        <CodeBlock language={meta.language} filePath={meta.filePath}>
          {snippet}
        </CodeBlock>
        <p className="text-xs text-muted-foreground/80 mt-2">
          Replace{" "}
          <code className="px-1 py-0.5 rounded bg-muted/60 dark:bg-muted/30 text-[11px]">
            {PLACEHOLDER_KEY}
          </code>{" "}
          with your real key from{" "}
          <Link
            href="/dashboard/keys"
            className="text-indigo-500 hover:underline"
            data-testid={`link-dashboard-keys-${id}`}
          >
            /dashboard/keys
          </Link>
          .
        </p>
      </CardContent>
    </Card>
  );
}

function OAuthCard({
  spec,
}: {
  spec: (typeof OAUTH_CONNECTORS)[number];
}) {
  const anchorId = `oauth-${spec.id}`;
  return (
    <Card
      className="overflow-hidden"
      id={anchorId}
      data-testid={`card-oauth-${spec.id}`}
    >
      <CardContent className="p-6">
        <h3
          className="text-lg font-semibold text-foreground mb-1"
          data-testid={`heading-oauth-${spec.id}`}
        >
          {spec.title}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">{spec.blurb}</p>
        <ol className="space-y-2 mb-4">
          {spec.steps.map((step, i) => (
            <li
              key={i}
              className="flex items-start gap-3 text-sm text-foreground/90"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/10 text-indigo-500 text-[11px] font-semibold shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span className="leading-relaxed">{step}</span>
            </li>
          ))}
        </ol>
        <div className="rounded-md bg-muted/50 dark:bg-muted/20 px-3 py-2 font-mono text-xs text-foreground border border-border">
          {spec.mcpUrl}
        </div>
      </CardContent>
    </Card>
  );
}

const PAGE_TITLE =
  "Allotly MCP Server — Connector Documentation | Allotly";
const PAGE_DESCRIPTION =
  "Connect Claude Desktop, Cursor, VS Code, Codex, Claude.ai, ChatGPT, or Gemini to Allotly's hosted MCP server. Setup snippets, OAuth flows, available tools, and troubleshooting for the AI Spend Control Plane.";

function useDocumentMeta(title: string, description: string) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;

    let metaDesc = document.querySelector<HTMLMetaElement>(
      'meta[name="description"]',
    );
    const previousDesc = metaDesc?.getAttribute("content") ?? null;
    const created = !metaDesc;
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description);

    return () => {
      document.title = previousTitle;
      if (created) {
        metaDesc?.remove();
      } else if (previousDesc !== null) {
        metaDesc?.setAttribute("content", previousDesc);
      }
    };
  }, [title, description]);
}

export default function McpDocs() {
  useDocumentMeta(PAGE_TITLE, PAGE_DESCRIPTION);

  const [activeConnector, setActiveConnector] = useState<ConnectorId>(
    CONNECTOR_IDS[0],
  );

  const consumptionTools = TOOLS.filter((t) => t.category === "consumption");
  const recipientTools = TOOLS.filter((t) => t.category === "recipient");

  return (
    <PublicLayout>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 dark:from-indigo-500/10 dark:to-cyan-500/10" />
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24">
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">
            Connector Documentation
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight max-w-3xl"
            data-testid="heading-mcp-docs"
          >
            Allotly MCP Server
          </h1>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed max-w-2xl">
            Give any MCP-compatible AI host secure, budget-controlled access to
            OpenAI, Anthropic, Gemini, and Azure through a single endpoint.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <code
              className="px-4 py-2.5 rounded-md bg-foreground/5 dark:bg-foreground/10 border border-border font-mono text-sm text-foreground select-all"
              data-testid="text-mcp-url"
            >
              {ALLOTLY_MCP_URL}
            </code>
            <span className="text-xs text-muted-foreground">
              Streamable-HTTP MCP endpoint · OAuth 2.1 · Bearer tokens
            </span>
          </div>
        </div>
      </section>

      {/* In-page TOC */}
      <nav
        className="sticky top-16 z-30 bg-background/80 backdrop-blur border-b border-border"
        aria-label="On this page"
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <ul className="flex gap-4 sm:gap-6 overflow-x-auto py-3 text-sm text-muted-foreground">
            {[
              { href: "#overview", label: "Overview" },
              { href: "#connect", label: "How to connect" },
              { href: "#tools", label: "Available tools" },
              { href: "#troubleshooting", label: "Troubleshooting" },
              { href: "#help", label: "Get help" },
            ].map((item) => (
              <li key={item.href} className="shrink-0">
                <a
                  href={item.href}
                  className="hover:text-foreground transition-colors whitespace-nowrap"
                  data-testid={`toc-link-${item.href.slice(1)}`}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <article className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-20">
        {/* Overview */}
        <section>
          <SectionHeading
            id="overview"
            icon={Zap}
            eyebrow="What it is"
            title="What the Allotly MCP server does"
          >
            One MCP endpoint, every major AI provider, one budget enforced on
            every call.
          </SectionHeading>
          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-4 text-foreground/90 leading-relaxed">
            <p>
              Allotly is a hosted MCP (Model Context Protocol) server that sits
              between your AI host (Claude Desktop, Cursor, Claude.ai, ChatGPT,
              Gemini, etc.) and the underlying provider APIs (OpenAI,
              Anthropic, Google, Azure OpenAI). Every chat call routes through
              a single, thin proxy at{" "}
              <code className="px-1.5 py-0.5 rounded bg-muted/60 dark:bg-muted/30 text-sm">
                {ALLOTLY_MCP_URL}
              </code>
              . That gives you three things you don't get when you paste raw
              provider keys into your AI host:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">
                  Real-time budget enforcement.
                </strong>{" "}
                Every request is metered per-token at the proxy and rejected
                cleanly the moment the budget hits zero — no overspend, no
                surprise invoices.
              </li>
              <li>
                <strong className="text-foreground">
                  One key for every model.
                </strong>{" "}
                A single Allotly key talks to OpenAI, Anthropic, Gemini, and
                Azure simultaneously. Your model allowlist controls what's
                callable.
              </li>
              <li>
                <strong className="text-foreground">
                  Provider-native, not lock-in.
                </strong>{" "}
                Allotly forwards requests to the underlying provider and
                returns their native response format. No proprietary wrapper,
                no behavior changes.
              </li>
            </ul>
            <p>
              Two access models are supported. <strong>Teams</strong> let
              organizations connect their own provider accounts and issue
              budgeted keys to members. <strong>Vouchers</strong> let you hand
              someone a pre-paid code that becomes an MCP-ready API key on
              redemption — perfect for workshops, contractors, and one-off
              access.
            </p>
          </div>

          <div className="mt-8 grid sm:grid-cols-3 gap-3 text-sm">
            <div
              className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-4"
              data-testid="text-spec-transport"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">
                Transport
              </p>
              <p className="text-foreground font-medium">
                Streamable HTTP (MCP)
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Single endpoint, no SSE pre-warm required. Claude Desktop uses
                the @allotly/mcp stdio bridge.
              </p>
            </div>
            <div
              className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-4"
              data-testid="text-spec-auth"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">
                Authentication
              </p>
              <p className="text-foreground font-medium">
                Bearer token or OAuth 2.1
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                OAuth supports Dynamic Client Registration (RFC 7591) and PKCE.
                Token refresh handled automatically.
              </p>
            </div>
            <div
              className="rounded-lg border border-border bg-muted/30 dark:bg-muted/10 p-4"
              data-testid="text-spec-scopes"
            >
              <p className="text-xs uppercase tracking-wider text-muted-foreground/70 font-semibold mb-1">
                OAuth scopes
              </p>
              <p className="text-foreground font-mono text-sm">
                mcp · mcp:read
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                <code className="text-[11px]">mcp:read</code> for read-only
                tools (status, budget, usage); <code className="text-[11px]">mcp</code>{" "}
                grants full access including chat calls.
              </p>
            </div>
          </div>
        </section>

        {/* Connect */}
        <section>
          <SectionHeading
            id="connect"
            icon={Plug}
            eyebrow="Setup"
            title="Connect from your AI host"
          >
            Two paths depending on the host: paste a bearer token (CLI/IDE
            tools) or run OAuth (hosted AI products).
          </SectionHeading>

          <h3 className="text-lg font-semibold text-foreground mb-4 mt-2">
            Bearer-token connectors (CLI / IDE)
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            For tools where you can paste a long-lived API key. Use your
            Allotly key (
            <code className="text-xs bg-muted/60 dark:bg-muted/30 px-1 py-0.5 rounded">
              allotly_sk_…
            </code>
            ) or a voucher code (
            <code className="text-xs bg-muted/60 dark:bg-muted/30 px-1 py-0.5 rounded">
              ALLOT-…
            </code>
            ) as the bearer token.
          </p>
          <div className="flex flex-wrap gap-2 mb-6">
            {CONNECTOR_IDS.map((id) => {
              const isActive = activeConnector === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveConnector(id)}
                  className={classes(
                    "px-3 py-1.5 rounded-md text-sm font-medium border transition-colors",
                    isActive
                      ? "bg-indigo-500 text-white border-indigo-500"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/20",
                  )}
                  data-testid={`tab-connector-${id}`}
                >
                  {CONNECTOR_META[id].title}
                </button>
              );
            })}
          </div>
          <ConnectorCard id={activeConnector} />

          <p className="text-sm text-muted-foreground mt-3">
            Claude Desktop uses the{" "}
            <code className="text-xs bg-muted/60 dark:bg-muted/30 px-1 py-0.5 rounded">
              {ALLOTLY_MCP_PACKAGE}
            </code>{" "}
            bridge package because Claude Desktop only supports stdio
            transport. The package proxies stdio ↔ HTTP transparently.
          </p>

          <h3 className="text-lg font-semibold text-foreground mb-4 mt-12">
            OAuth connectors (hosted AI products)
          </h3>
          <p className="text-sm text-muted-foreground mb-6 max-w-2xl">
            Hosted products (Claude.ai web, ChatGPT, Gemini) cannot accept a
            pasted bearer token, so the flow is "paste our MCP URL and let the
            host run OAuth against us." We handle discovery, dynamic client
            registration, authorization, and token refresh automatically.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {OAUTH_CONNECTORS.map((spec) => (
              <OAuthCard key={spec.id} spec={spec} />
            ))}
          </div>
        </section>

        {/* Tools */}
        <section>
          <SectionHeading
            id="tools"
            icon={Wrench}
            eyebrow="Capabilities"
            title="Available tools"
          >
            The server exposes {TOOLS.length} tools split between actually
            using AI models and managing your access.
          </SectionHeading>

          <h3 className="text-lg font-semibold text-foreground mb-4">
            Consumption tools
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
            Call AI models, list what you can use, compare results, and get
            recommendations.
          </p>
          <div className="space-y-3 mb-12">
            {consumptionTools.map((tool) => (
              <Card
                key={tool.name}
                className="overflow-hidden"
                data-testid={`card-tool-${tool.name}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-baseline gap-3 mb-2">
                    <code className="text-sm font-mono font-semibold text-indigo-500">
                      {tool.name}
                    </code>
                    {tool.authNote && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/60 dark:bg-muted/30">
                        {tool.authNote}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {tool.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          <h3 className="text-lg font-semibold text-foreground mb-4">
            Recipient tools
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-2xl">
            Self-serve account management — check your budget, redeem
            vouchers, troubleshoot failed calls.
          </p>
          <div className="space-y-3">
            {recipientTools.map((tool) => (
              <Card
                key={tool.name}
                className="overflow-hidden"
                data-testid={`card-tool-${tool.name}`}
              >
                <CardContent className="p-5">
                  <div className="flex items-baseline gap-3 mb-2">
                    <code className="text-sm font-mono font-semibold text-indigo-500">
                      {tool.name}
                    </code>
                    {tool.authNote && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 px-1.5 py-0.5 rounded bg-muted/60 dark:bg-muted/30">
                        {tool.authNote}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-foreground/80 leading-relaxed">
                    {tool.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Troubleshooting */}
        <section>
          <SectionHeading
            id="troubleshooting"
            icon={AlertTriangle}
            eyebrow="Debug"
            title="Troubleshooting common errors"
          >
            The most frequent failure modes and their one-line fix.
          </SectionHeading>
          <div className="space-y-4">
            {TROUBLESHOOTING.map((item) => (
              <Card
                key={item.id}
                className="overflow-hidden"
                id={`error-${item.id}`}
                data-testid={`card-error-${item.id}`}
              >
                <CardContent className="p-6">
                  <h3
                    className="text-base font-semibold text-foreground mb-3"
                    data-testid={`heading-error-${item.id}`}
                  >
                    {item.symptom}
                  </h3>
                  <div className="space-y-2 text-sm">
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Cause: </strong>
                      {item.cause}
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Fix: </strong>
                      {item.fix}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-sm text-muted-foreground mt-6">
            Still stuck? Run the{" "}
            <code className="text-xs bg-muted/60 dark:bg-muted/30 px-1 py-0.5 rounded">
              diagnose
            </code>{" "}
            tool — it inspects your most recent failed call and explains
            exactly what went wrong in plain English.
          </p>
        </section>

        {/* Help */}
        <section>
          <SectionHeading
            id="help"
            icon={LifeBuoy}
            eyebrow="Support"
            title="Get help"
          >
            We answer connector and integration questions personally.
          </SectionHeading>
          <div className="grid sm:grid-cols-2 gap-4">
            <Card data-testid="card-help-support">
              <CardContent className="p-6">
                <Mail className="h-5 w-5 text-indigo-500 mb-3" />
                <h3 className="text-base font-semibold text-foreground mb-1">
                  General support
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Setup help, integration questions, billing, account changes.
                </p>
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  className="text-sm text-indigo-500 hover:underline font-medium"
                  data-testid="link-support-email"
                >
                  {SUPPORT_EMAIL}
                </a>
              </CardContent>
            </Card>
            <Card data-testid="card-help-security">
              <CardContent className="p-6">
                <AlertTriangle className="h-5 w-5 text-indigo-500 mb-3" />
                <h3 className="text-base font-semibold text-foreground mb-1">
                  Security disclosures
                </h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Vulnerability reports and responsible disclosure. See our{" "}
                  <Link
                    href="/security"
                    className="text-indigo-500 hover:underline"
                    data-testid="link-security-policy"
                  >
                    security policy
                  </Link>
                  .
                </p>
                <a
                  href={`mailto:${SECURITY_EMAIL}`}
                  className="text-sm text-indigo-500 hover:underline font-medium"
                  data-testid="link-security-email"
                >
                  {SECURITY_EMAIL}
                </a>
              </CardContent>
            </Card>
          </div>
          <div className="mt-6 grid sm:grid-cols-3 gap-3">
            <Link
              href="/docs"
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-indigo-500/40 hover:bg-muted/30 transition-colors"
              data-testid="link-related-docs"
            >
              <span className="text-sm font-medium text-foreground">
                Full Allotly docs
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <Link
              href="/dashboard/connect"
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-indigo-500/40 hover:bg-muted/30 transition-colors"
              data-testid="link-related-connect"
            >
              <span className="text-sm font-medium text-foreground">
                Connect dashboard (signed in)
              </span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </Link>
            <a
              href="https://www.npmjs.com/package/@allotly/mcp"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 rounded-lg border border-border hover:border-indigo-500/40 hover:bg-muted/30 transition-colors"
              data-testid="link-related-npm"
            >
              <span className="text-sm font-medium text-foreground">
                @allotly/mcp on npm
              </span>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </a>
          </div>
        </section>
      </article>
    </PublicLayout>
  );
}
