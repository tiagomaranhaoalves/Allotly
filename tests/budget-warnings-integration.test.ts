import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routesSrc = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");
const myStatusSrc = readFileSync(
  resolve(process.cwd(), "server/lib/mcp/tools/recipient/my-status.ts"),
  "utf-8",
);
const myBudgetSrc = readFileSync(
  resolve(process.cwd(), "server/lib/mcp/tools/recipient/my-budget.ts"),
  "utf-8",
);
const myRecentUsageSrc = readFileSync(
  resolve(process.cwd(), "server/lib/mcp/tools/recipient/my-recent-usage.ts"),
  "utf-8",
);
const metaBudgetSrc = readFileSync(
  resolve(process.cwd(), "server/lib/mcp/meta-budget.ts"),
  "utf-8",
);
const schemasSrc = readFileSync(
  resolve(process.cwd(), "server/lib/mcp/schemas.ts"),
  "utf-8",
);
const overviewPageSrc = readFileSync(
  resolve(process.cwd(), "client/src/pages/dashboard/overview.tsx"),
  "utf-8",
);
const usagePageSrc = readFileSync(
  resolve(process.cwd(), "client/src/pages/dashboard/usage.tsx"),
  "utf-8",
);
const bundlesPageSrc = readFileSync(
  resolve(process.cwd(), "client/src/pages/dashboard/bundles.tsx"),
  "utf-8",
);
const bannerSrc = readFileSync(
  resolve(process.cwd(), "client/src/components/dashboard/budget-warning-banner.tsx"),
  "utf-8",
);
const enLocale = JSON.parse(
  readFileSync(resolve(process.cwd(), "client/src/i18n/locales/en.json"), "utf-8"),
);
const esLocale = JSON.parse(
  readFileSync(resolve(process.cwd(), "client/src/i18n/locales/es.json"), "utf-8"),
);
const ptLocale = JSON.parse(
  readFileSync(resolve(process.cwd(), "client/src/i18n/locales/pt-BR.json"), "utf-8"),
);

describe("V1.5.1 Piece 4: budget warning wiring", () => {
  it("routes.ts /api/dashboard/member-overview imports and uses getBudgetWarning", () => {
    expect(routesSrc).toMatch(/import\s+\{\s*getBudgetWarning\s*\}\s+from\s+["']\.\/lib\/mcp\/budget-warnings["']/);
    const handler = routesSrc.split('app.get("/api/dashboard/member-overview"')[1]?.split("app.")[0] ?? "";
    expect(handler).toMatch(/getBudgetWarning\s*\(/);
    expect(handler).toMatch(/res\.json\(\s*\{[^}]*warning[^}]*\}\s*\)/s);
  });

  it("member-overview gates dashboard warning to TEAM access (no voucher banner)", () => {
    const handler = routesSrc.split('app.get("/api/dashboard/member-overview"')[1]?.split("app.")[0] ?? "";
    // Spec: dashboard banner is TEAM-only; voucher warnings flow through MCP
    // tools instead. The handler must short-circuit getBudgetWarning to null
    // when accessType !== "TEAM".
    expect(handler).toMatch(/accessType\s*===\s*["']TEAM["']\s*\?\s*await\s+getBudgetWarning/);
    expect(handler).toMatch(/:\s*null\s*;/);
  });

  it("schemas.ts BudgetSnapshotSchema includes optional warning field", () => {
    expect(schemasSrc).toMatch(/BudgetWarningSchema/);
    expect(schemasSrc).toMatch(/warning:\s*BudgetWarningSchema\.nullable\(\)\.optional\(\)/);
  });

  it("meta-budget.ts attaches warning via getBudgetWarning", () => {
    expect(metaBudgetSrc).toMatch(/getBudgetWarning/);
  });

  it("my_status, my_budget, my_recent_usage surface top-level warning", () => {
    for (const src of [myStatusSrc, myBudgetSrc, myRecentUsageSrc]) {
      expect(src).toMatch(/warning/);
    }
  });
});

describe("V1.5.1 Piece 4: dashboard banner wiring", () => {
  it("BudgetWarningBanner is imported and rendered in overview.tsx", () => {
    expect(overviewPageSrc).toMatch(/BudgetWarningBanner/);
    expect(overviewPageSrc).toMatch(/<BudgetWarningBanner\s*\/>/);
  });

  it("BudgetWarningBanner is imported and rendered in usage.tsx", () => {
    expect(usagePageSrc).toMatch(/import\s+\{\s*BudgetWarningBanner\s*\}\s+from/);
    expect(usagePageSrc).toMatch(/<BudgetWarningBanner\s*\/>/);
  });

  it("BudgetWarningBanner is imported and rendered in bundles.tsx", () => {
    expect(bundlesPageSrc).toMatch(/import\s+\{\s*BudgetWarningBanner\s*\}\s+from/);
    expect(bundlesPageSrc).toMatch(/<BudgetWarningBanner\s*\/>/);
  });

  it("banner queries /api/dashboard/member-overview and renders nothing when warning is null", () => {
    // Banner now builds a `?membershipId=` URL variant so the dashboard
    // membership switcher can scope the warning to the chosen team. The
    // endpoint string itself is still embedded literally.
    expect(bannerSrc).toMatch(/["'`]\/api\/dashboard\/member-overview/);
    expect(bannerSrc).toMatch(/if\s*\(!warning\)\s*return\s+null/);
  });

  it("banner refuses to render when accessType is not TEAM (defense in depth)", () => {
    expect(bannerSrc).toMatch(/data\?\.accessType\s*&&\s*data\.accessType\s*!==\s*["']TEAM["']/);
    expect(bannerSrc).toMatch(/return\s+null/);
  });

  it("banner branches admin/member/voucher off the warning shape", () => {
    expect(bannerSrc).toMatch(/topup_via_mcp_tool\s*===\s*["']request_topup["']/);
    expect(bannerSrc).toMatch(/topup_url/);
  });

  it("banner only renders Top up button when topup_url is non-null", () => {
    // CTA must be admin-only AND require topup_url. Members get plain text;
    // vouchers get inline `request_topup` code, never a link/button.
    expect(bannerSrc).toMatch(/branch\s*===\s*["']admin["']\s*&&\s*topupUrl/);
  });
});

describe("V1.5.1 Piece 4: i18n keys present in en/es/pt-BR", () => {
  const branches = ["admin", "member", "voucher"] as const;
  const levels = ["low", "critical", "exhausted"] as const;

  for (const locale of [
    { name: "en", data: enLocale },
    { name: "es", data: esLocale },
    { name: "pt-BR", data: ptLocale },
  ]) {
    it(`${locale.name} has dashboard.budgetWarning with all branch/level keys`, () => {
      const bw = locale.data.dashboard?.budgetWarning;
      expect(bw).toBeTruthy();
      expect(typeof bw.topUp).toBe("string");
      for (const br of branches) {
        for (const lvl of levels) {
          expect(bw[br]?.[lvl]?.message, `${locale.name}.${br}.${lvl}.message`).toBeTruthy();
          expect(bw[br]?.[lvl]?.suggestion, `${locale.name}.${br}.${lvl}.suggestion`).toBeTruthy();
        }
        expect(bw[br]?.low?.suggestion_no_model).toBeTruthy();
        expect(bw[br]?.critical?.suggestion_no_model).toBeTruthy();
      }
    });
  }
});
