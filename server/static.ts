import express, { type Express, type Request, type Response } from "express";
import fs from "fs";
import path from "path";
import { injectLocaleMetadata, getBaseUrl } from "./lib/locale-html";

// SPA routes that should be served with HTTP 200.
// Dynamic segments use a simple :param notation; prefix entries ending in /*
// match any sub-path.
const SPA_ROUTES: Array<string | RegExp> = [
  "/",
  "/login",
  "/signup",
  "/redeem",
  "/forgot-password",
  "/reset-password",
  "/docs",
  "/mcp/docs",
  "/about",
  "/careers",
  "/contact",
  "/privacy",
  "/terms",
  "/security",
  "/dpa",
  "/subprocessors",
  "/arena",
  "/components",
  /^\/invite\/[^/]+$/,
  /^\/oauth\//,
  /^\/dashboard(\/.*)?$/,
  /^\/admin(\/.*)?$/,
  /^\/es(\/.*)?$/,
  /^\/pt-br(\/.*)?$/,
];

function matchesSpaRoute(urlPath: string): boolean {
  for (const pattern of SPA_ROUTES) {
    if (typeof pattern === "string") {
      if (urlPath === pattern) return true;
    } else {
      if (pattern.test(urlPath)) return true;
    }
  }
  return false;
}

interface RouteMeta {
  title: string;
  description: string;
}

const BASE_URL = "https://allotly.ai";

const ROUTE_META: Record<string, RouteMeta> = {
  "/": {
    title: "Allotly — One key. Every model. One budget.",
    description:
      "One API key for OpenAI, Anthropic, Gemini, and Azure — with real-time budget enforcement per person, per model, per project.",
  },
  "/docs": {
    title: "Documentation | Allotly",
    description:
      "Complete API documentation for Allotly — authentication, team management, budget controls, and AI model access for OpenAI, Anthropic, Gemini, and Azure.",
  },
  "/mcp/docs": {
    title: "MCP Server Documentation | Allotly",
    description:
      "Connect Claude Desktop, Cursor, VS Code, ChatGPT, or Gemini to Allotly's hosted MCP server. Setup snippets, OAuth flows, available tools, and troubleshooting.",
  },
  "/about": {
    title: "About | Allotly",
    description:
      "Learn about Allotly — the AI Spend Control Plane that gives your organization real-time budget enforcement and visibility across OpenAI, Anthropic, Gemini, and Azure.",
  },
  "/careers": {
    title: "Careers | Allotly",
    description:
      "Join the Allotly team and help build the AI access governance platform of the future.",
  },
  "/contact": {
    title: "Contact | Allotly",
    description:
      "Get in touch with the Allotly team for sales, support, or general inquiries.",
  },
  "/privacy": {
    title: "Privacy Policy | Allotly",
    description:
      "Allotly's privacy policy — how we collect, use, and protect your personal data.",
  },
  "/terms": {
    title: "Terms of Service | Allotly",
    description:
      "Allotly's terms of service — the agreement governing your use of the Allotly platform.",
  },
  "/security": {
    title: "Security | Allotly",
    description:
      "Allotly's security practices — encryption, access controls, and responsible disclosure for the AI access governance platform.",
  },
  "/dpa": {
    title: "Data Processing Agreement | Allotly",
    description:
      "Allotly's Data Processing Agreement (DPA). Article 28 GDPR compliant terms for customers processing personal data through the Allotly AI access governance platform.",
  },
  "/subprocessors": {
    title: "Sub-processors | Allotly",
    description:
      "List of third-party sub-processors engaged by Allotly to provide the AI access governance platform, including hosting, database, payment, and email infrastructure.",
  },
  "/login": {
    title: "Sign In | Allotly",
    description:
      "Sign in to Allotly to manage your AI API access, budgets, and team members.",
  },
  "/signup": {
    title: "Sign Up | Allotly",
    description:
      "Create an Allotly account to start managing AI API access with real-time budget controls for your team.",
  },
  "/redeem": {
    title: "Redeem Voucher | Allotly",
    description:
      "Redeem your Allotly voucher to get access to AI APIs with pre-set budgets.",
  },
  "/forgot-password": {
    title: "Reset Password | Allotly",
    description: "Reset your Allotly account password.",
  },
  "/reset-password": {
    title: "Set New Password | Allotly",
    description: "Set a new password for your Allotly account.",
  },
};

const LOCALE_URL_PREFIXES: Record<string, string> = {
  es: "es",
  "pt-br": "pt-br",
};

function stripLocalePrefix(pathname: string): { urlLocale: string | null; basePath: string } {
  const segments = pathname.split("/").filter(Boolean);
  const first = segments[0]?.toLowerCase();
  if (first && LOCALE_URL_PREFIXES[first]) {
    const rest = segments.slice(1).join("/");
    return { urlLocale: first, basePath: rest ? `/${rest}` : "/" };
  }
  return { urlLocale: null, basePath: pathname || "/" };
}

function escAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function injectRouteMeta(html: string, meta: RouteMeta, canonicalUrl: string): string {
  let out = html;

  out = out.replace(/<title>[^<]*<\/title>/, `<title>${escAttr(meta.title)}</title>`);

  out = out.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${escAttr(meta.description)}$2`,
  );

  out = out.replace(
    /(<meta\s+property="og:title"\s+content=")[^"]*(")/,
    `$1${escAttr(meta.title)}$2`,
  );
  out = out.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
    `$1${escAttr(meta.description)}$2`,
  );
  out = out.replace(
    /(<meta\s+property="og:url"\s+content=")[^"]*(")/,
    `$1${escAttr(canonicalUrl)}$2`,
  );

  out = out.replace(
    /(<meta\s+name="twitter:title"\s+content=")[^"]*(")/,
    `$1${escAttr(meta.title)}$2`,
  );
  out = out.replace(
    /(<meta\s+name="twitter:description"\s+content=")[^"]*(")/,
    `$1${escAttr(meta.description)}$2`,
  );

  // Replace canonical injected by injectLocaleMetadata (or any existing one)
  out = out.replace(
    /(<link\s+rel="canonical"\s+href=")[^"]*(")/,
    `$1${escAttr(canonicalUrl)}$2`,
  );

  return out;
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  const indexPath = path.resolve(distPath, "index.html");
  const baseHtml = fs.readFileSync(indexPath, "utf-8");

  // Redirect the old /docs/mcp alias to the canonical /mcp/docs URL.
  app.get("/docs/mcp", (_req, res) => {
    res.redirect(301, "/mcp/docs");
  });

  // Serve index.html for known SPA routes with HTTP 200, injecting per-route
  // metadata and locale hreflang/lang so crawlers see the correct metadata.
  // All other paths get HTTP 404 so crawlers see the correct status code.
  app.use("/{*path}", (req: Request, res: Response) => {
    const pathname = req.originalUrl.split("?")[0];
    const normalised = pathname.replace(/\/$/, "") || "/";

    // Strip locale prefix to find the canonical base path for ROUTE_META lookup
    const { urlLocale, basePath } = stripLocalePrefix(normalised);

    // Apply locale metadata first (lang attr, hreflang alternates, og:locale)
    const requestBaseUrl = getBaseUrl(req);
    let html = injectLocaleMetadata(baseHtml, req.originalUrl, requestBaseUrl);

    // Look up route meta by the base (locale-stripped) path
    const meta = ROUTE_META[basePath];
    if (meta) {
      // Build a locale-aware canonical using the production BASE_URL
      const localeSuffix = urlLocale ? `/${urlLocale}` : "";
      const canonicalPath = basePath === "/" ? "/" : basePath;
      const canonicalUrl = `${BASE_URL}${localeSuffix}${canonicalPath === "/" ? "" : canonicalPath}`;
      html = injectRouteMeta(html, meta, canonicalUrl);
    }

    const status = matchesSpaRoute(normalised) ? 200 : 404;
    res.status(status).set({ "Content-Type": "text/html; charset=utf-8" }).end(html);
  });
}
