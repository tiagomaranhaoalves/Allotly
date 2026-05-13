import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  CONNECTOR_IDS,
  OAUTH_CONNECTORS,
  ALLOTLY_MCP_URL,
} from "../shared/connector-snippets";

const REPO_ROOT = join(__dirname, "..");

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8"));
}

function readText(rel: string): string {
  return readFileSync(join(REPO_ROOT, rel), "utf8");
}

function get(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, k) =>
        acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined,
      obj,
    );
}

describe("V1.5.1 Piece 2 — connector subsets shared between /redeem and /dashboard/connect", () => {
  it("CONNECTOR_IDS exposes exactly the 5 stdio bridges", () => {
    // Section B on /redeem must show 5 cards. Lock the subset against
    // accidental additions/removals (the same source feeds the email
    // snippet, dashboard/connect, and redeem).
    expect(CONNECTOR_IDS).toHaveLength(5);
    expect([...CONNECTOR_IDS].sort()).toEqual(
      ["claudeCode", "claudeDesktop", "codex", "cursor", "vscode"].sort(),
    );
  });

  it("OAUTH_CONNECTORS exposes exactly the 3 hosted-AI cards", () => {
    // Section A on /redeem must show 3 cards.
    expect(OAUTH_CONNECTORS).toHaveLength(3);
    expect(OAUTH_CONNECTORS.map((c) => c.id).sort()).toEqual(
      ["chatgpt", "claudeAi", "gemini"].sort(),
    );
  });

  it("every OAuth card uses the shared ALLOTLY_MCP_URL constant (single source of truth)", () => {
    // Per the task: "no duplication" of the MCP URL between /redeem and
    // /dashboard/connect. Both pages render OAuthConnectorCard which reads
    // spec.mcpUrl, and every spec must point at the shared constant so a
    // future URL change only requires touching shared/connector-snippets.ts.
    for (const card of OAUTH_CONNECTORS) {
      expect(card.mcpUrl).toBe(ALLOTLY_MCP_URL);
    }
  });
});

describe("V1.5.1 Piece 2 — i18n keys for /redeem section headings", () => {
  const LOCALES = ["en.json", "es.json", "pt-BR.json"] as const;

  for (const locale of LOCALES) {
    it(`${locale}: redeem.connectors.quickConnect resolves to a non-empty string`, () => {
      const json = readJson(`client/src/i18n/locales/${locale}`);
      const v = get(json, "redeem.connectors.quickConnect");
      expect(typeof v).toBe("string");
      expect((v as string).trim().length).toBeGreaterThan(0);
    });

    it(`${locale}: redeem.connectors.cliIde resolves to a non-empty string`, () => {
      const json = readJson(`client/src/i18n/locales/${locale}`);
      const v = get(json, "redeem.connectors.cliIde");
      expect(typeof v).toBe("string");
      expect((v as string).trim().length).toBeGreaterThan(0);
    });
  }

  it("does not translate connector / product / URL identifiers in any locale", () => {
    // Per the V1.5.1 i18n notes — code identifiers (connector names, MCP URL)
    // must remain literal in every locale.
    const FORBIDDEN_IDENTIFIERS = ["Cursor", "VS Code", "Claude", "Codex", "ChatGPT", "Gemini"];
    for (const locale of LOCALES) {
      const json = readJson(`client/src/i18n/locales/${locale}`);
      const quick = get(json, "redeem.connectors.quickConnect") as string;
      const cli = get(json, "redeem.connectors.cliIde") as string;
      // Headings should be generic "Quick connect" / "Connect to your CLI / IDE" —
      // they should not bake in product names. This guards against translators
      // accidentally Spanish-izing "Cursor" or "Claude".
      for (const id of FORBIDDEN_IDENTIFIERS) {
        expect(quick).not.toContain(id);
        expect(cli).not.toContain(id);
      }
    }
  });
});

describe("V1.5.1 Piece 2 — page composition (source-level guards)", () => {
  it("/redeem renders both OAuth and stdio sections via ConnectorGrid variants", () => {
    const src = readText("client/src/pages/redeem.tsx");
    // Section A heading + 3 OAuth cards via the shared component.
    expect(src).toMatch(/variant="oauth-only"/);
    expect(src).toContain("redeem.connectors.quickConnect");
    // Section B heading + 5 stdio cards via the shared component.
    expect(src).toMatch(/variant="stdio-only"/);
    expect(src).toContain("redeem.connectors.cliIde");
    // OAuth section is rendered first (recommended).
    const oauthIdx = src.indexOf("redeem.connectors.quickConnect");
    const stdioIdx = src.indexOf("redeem.connectors.cliIde");
    expect(oauthIdx).toBeGreaterThan(-1);
    expect(stdioIdx).toBeGreaterThan(-1);
    expect(oauthIdx).toBeLessThan(stdioIdx);
  });

  it("/dashboard/connect still composes all 8 connectors (regression guard)", () => {
    const src = readText("client/src/pages/dashboard/connect.tsx");
    // Both subsets ship via the shared ConnectorGrid using the new variant
    // prop — no hand-rolled OAUTH_CONNECTORS.map / OAuthConnectorCard inside
    // the page anymore. The OAuth section heading + "manage approved apps"
    // link wrapper still live here, sourced from the same i18n keys.
    expect(src).toContain("ConnectorGrid");
    expect(src).toMatch(/variant="stdio-only"/);
    expect(src).toMatch(/variant="oauth-only"/);
    expect(src).toContain("connect.aiToolSection.heading");
    expect(src).toContain("connect.devToolSection.heading");
    expect(src).toContain("link-to-connections");
    // AI-tool (OAuth) section is rendered first now — it's the simpler path.
    const aiIdx = src.indexOf("connect.aiToolSection.heading");
    const devIdx = src.indexOf("connect.devToolSection.heading");
    expect(aiIdx).toBeGreaterThan(-1);
    expect(devIdx).toBeGreaterThan(-1);
    expect(aiIdx).toBeLessThan(devIdx);
    // Inlined OAuth rendering must not return.
    expect(src).not.toContain("OAUTH_CONNECTORS");
    expect(src).not.toContain("OAuthConnectorCard");
  });

  it("ConnectorGrid exposes the new variant prop with all three values", () => {
    const src = readText("client/src/components/connectors/connector-grid.tsx");
    expect(src).toContain('"oauth-only"');
    expect(src).toContain('"stdio-only"');
    expect(src).toContain('"all"');
    // OAuth-only short-circuit renders OAuthConnectorCard for every spec.
    expect(src).toContain("OAUTH_CONNECTORS.map");
    expect(src).toContain("OAuthConnectorCard");
  });
});
