import { test, expect, type Page, type Route } from "@playwright/test";

type Level = "low" | "critical" | "exhausted";
type Locale = "en" | "es" | "pt-BR";

const ORG = { id: "org_test", name: "Allotly E2E", plan: "TEAM" };
const ADMIN_USER = {
  id: "user_admin_test",
  email: "admin@example.com",
  name: "Test Admin",
  orgRole: "TEAM_ADMIN",
  orgId: ORG.id,
  isVoucherUser: false,
};

const TOPUP_URL = "/dashboard/billing";
const CHEAPEST = "gpt-4o-mini";

// Per-level visual contract pinned by the banner component:
//   client/src/components/dashboard/budget-warning-banner.tsx :: LEVEL_STYLES
// If any of these change, the banner regressed (or the regression is intentional
// and this contract needs to move with it). Asserting both icon identity and
// the colour-token classes guards both axes that the task highlights.
const LEVEL_VISUALS: Record<Level, { iconClass: string; colourTokens: RegExp }> = {
  low: {
    iconClass: "lucide-triangle-alert",
    colourTokens: /\bborder-amber-300\/60\b.*\bbg-amber-50\b.*\btext-amber-900\b/,
  },
  critical: {
    iconClass: "lucide-circle-alert",
    colourTokens: /\bborder-orange-400\/60\b.*\bbg-orange-50\b.*\btext-orange-900\b/,
  },
  exhausted: {
    iconClass: "lucide-circle-x",
    colourTokens: /\bborder-red-400\/60\b.*\bbg-red-50\b.*\btext-red-900\b/,
  },
};

function makeOverview(level: Level) {
  const remainingPct = level === "exhausted" ? 0 : level === "critical" ? 5 : 15;
  const spendCents = level === "exhausted" ? 1000 : level === "critical" ? 950 : 850;
  return {
    accessType: "TEAM",
    membership: {
      id: "m1",
      currentPeriodSpendCents: spendCents,
      monthlyBudgetCents: 1000,
      status: "ACTIVE",
      periodEnd: "2026-12-31T00:00:00.000Z",
    },
    spendCents,
    budgetCents: 1000,
    proxyRequestCount: 0,
    display: {
      formatted: { spent: "$8.50", total: "$10.00", remaining: "$1.50" },
    },
    warning: {
      level,
      message: "server-fallback-message",
      remaining_pct: remainingPct,
      suggestion: {
        text: "server-fallback-suggestion",
        cheapest_model_in_allowlist: CHEAPEST,
        topup_url: TOPUP_URL,
        topup_via_mcp_tool: null,
      },
    },
  };
}

function fulfillJson(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function setupRoutes(page: Page, level: Level, user = ADMIN_USER) {
  await page.route("**/api/auth/session", (route) =>
    fulfillJson(route, { user, organization: ORG }),
  );
  await page.route("**/api/dashboard/member-overview", (route) =>
    fulfillJson(route, makeOverview(level)),
  );
  await page.route("**/api/org/settings", (route) =>
    fulfillJson(route, { id: ORG.id, currency: "USD" }),
  );
  await page.route("**/api/fx-rates", (route) =>
    fulfillJson(route, { rates: { USD: 1, EUR: 0.92, BRL: 5.0 } }),
  );
  await page.route("**/api/bundles", (route) => fulfillJson(route, []));
  await page.route("**/api/vouchers", (route) => fulfillJson(route, []));
}

async function gotoUsageWithLocale(page: Page, locale: Locale, level: Level) {
  await setupRoutes(page, level);
  await page.addInitScript((lng) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem("allotly-lang", lng);
    } catch {
      /* ignore */
    }
  }, locale);
  await page.goto("/dashboard/usage");
}

test.describe("BudgetWarningBanner — content, link, accessibility, mobile", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  for (const level of ["low", "critical", "exhausted"] as Level[]) {
    test(`renders ${level} banner with correct copy, icon, colour tokens, and admin Top up link (en)`, async ({
      page,
    }) => {
      await gotoUsageWithLocale(page, "en", level);

      const banner = page.getByTestId(`alert-budget-warning-${level}`);
      await expect(banner).toBeVisible({ timeout: 15_000 });

      // Accessibility: rendered as <Alert role="alert"> for screen readers.
      await expect(banner).toHaveAttribute("role", "alert");

      // Visual contract: each level pins a specific lucide icon and a
      // specific colour-token palette. Regressing either silently was the
      // exact failure mode the task warned about.
      const visuals = LEVEL_VISUALS[level];
      const icon = banner.locator(`svg.${visuals.iconClass}`);
      await expect(icon, `expected ${visuals.iconClass} icon for ${level}`).toHaveCount(1);
      const className = (await banner.getAttribute("class")) ?? "";
      expect(className, `colour tokens for ${level}`).toMatch(visuals.colourTokens);

      // Message copy is the localized variant (not the server fallback).
      const message = banner.getByTestId("text-budget-warning-message");
      await expect(message).toBeVisible();
      const messageText = (await message.textContent())?.trim() ?? "";
      expect(messageText).not.toContain("server-fallback");
      if (level === "exhausted") {
        expect(messageText).toMatch(/Budget fully spent\./i);
      } else {
        // Both low and critical English templates surface the percentage and
        // the formatted remaining/total amounts.
        const pct = level === "critical" ? "5" : "15";
        expect(messageText).toContain(`${pct}%`);
        expect(messageText).toContain("$1.50");
        if (level === "low") {
          expect(messageText).toContain("$10.00");
        }
      }

      // Suggestion copy interpolates the cheapest model unless exhausted.
      const suggestion = banner.getByTestId("text-budget-warning-suggestion");
      await expect(suggestion).toBeVisible();
      const suggestionText = (await suggestion.textContent())?.trim() ?? "";
      expect(suggestionText).not.toContain("server-fallback");
      if (level !== "exhausted") {
        expect(suggestionText).toContain(CHEAPEST);
      }

      // Admin Top up CTA: button + inline link both point at topup_url.
      const topUpBtn = banner.getByTestId("button-budget-warning-topup");
      await expect(topUpBtn).toBeVisible();
      await expect(topUpBtn).toHaveAttribute("href", TOPUP_URL);
      const inlineLink = banner.getByTestId("link-budget-warning-topup");
      await expect(inlineLink).toHaveAttribute("href", TOPUP_URL);

      // Clicking the Top up button navigates to /dashboard/billing.
      await topUpBtn.click();
      await expect(page).toHaveURL(/\/dashboard\/billing$/);
    });
  }

  // The banner is mounted on /dashboard/{overview,usage,bundles}. Most of
  // this spec exercises /dashboard/usage (smallest fixture surface). These
  // smoke checks guard against page-level integration regressions on the
  // other two mount points.
  // /dashboard for orgRole=TEAM_ADMIN renders TeamAdminOverview, which does
  // NOT mount the banner — the banner sits on the member-flavoured overviews
  // (DirectMemberOverview / ProxyMemberOverview). For the overview smoke
  // check we therefore log in as a MEMBER (DirectMemberOverview path), which
  // is the actual code path that mounts the banner on /dashboard.
  const overviewMember = { ...ADMIN_USER, orgRole: "MEMBER" };
  const SMOKE_ROUTES: Array<{ path: string; user: typeof ADMIN_USER }> = [
    { path: "/dashboard", user: overviewMember },
    { path: "/dashboard/bundles", user: ADMIN_USER },
  ];
  for (const { path: routePath, user } of SMOKE_ROUTES) {
    test(`banner is visible on ${routePath} in critical state`, async ({ page }) => {
      await setupRoutes(page, "critical", user);
      // Extra fixtures that the overview / bundles pages query alongside
      // member-overview. Empty/safe defaults are enough for the banner to
      // render without the rest of the page erroring.
      await page.route("**/api/dashboard/team-overview", (r) =>
        fulfillJson(r, { stats: {}, directMembers: [], proxyMembers: [], teamName: "Test" }),
      );
      await page.route("**/api/dashboard/voucher-stats", (r) => fulfillJson(r, {}));
      await page.route("**/api/dashboard/root-overview", (r) =>
        fulfillJson(r, {
          totalSpendCents: 0,
          activeTeamAdmins: 0,
          maxTeamAdmins: 0,
          totalMembers: 0,
          activeVouchers: 0,
          spendByTeam: [],
          spendByProvider: [],
          recentAlerts: [],
          providerHealth: [],
        }),
      );

      await page.goto(routePath);
      const banner = page.getByTestId("alert-budget-warning-critical");
      await expect(banner).toBeVisible({ timeout: 15_000 });
      await expect(banner.getByTestId("button-budget-warning-topup")).toHaveAttribute(
        "href",
        TOPUP_URL,
      );
    });
  }

  test("focus order: inline suggestion link is reached before the Top up button", async ({
    page,
  }) => {
    await gotoUsageWithLocale(page, "en", "low");
    const banner = page.getByTestId("alert-budget-warning-low");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    const inlineLink = banner.getByTestId("link-budget-warning-topup");
    const topUpBtn = banner.getByTestId("button-budget-warning-topup");

    // Drive focus from the inline suggestion link forward; the next tabbable
    // inside the banner must be the Top up CTA, matching DOM order.
    // (We drive focus deterministically rather than tabbing from page top to
    //  avoid coupling to the dashboard shell's chrome focus order, which is
    //  not what this banner spec is about.)
    await inlineLink.focus();
    await expect(inlineLink).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(topUpBtn).toBeFocused();

    // Reverse direction: Shift+Tab returns focus to the inline link.
    await page.keyboard.press("Shift+Tab");
    await expect(inlineLink).toBeFocused();
  });

  test("interpolates Spanish (es) translations on the low banner", async ({ page }) => {
    await gotoUsageWithLocale(page, "es", "low");
    const banner = page.getByTestId("alert-budget-warning-low");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    const message = banner.getByTestId("text-budget-warning-message");
    const text = (await message.textContent())?.trim() ?? "";
    // ES admin/low: "Presupuesto al 15% — bajando. Quedan $1.50 de $10.00."
    expect(text).toContain("Presupuesto al 15%");
    expect(text).toContain("Quedan $1.50 de $10.00");

    const suggestion = banner.getByTestId("text-budget-warning-suggestion");
    const sText = (await suggestion.textContent())?.trim() ?? "";
    expect(sText).toContain("Prueba modelos más baratos");
    expect(sText).toContain(CHEAPEST);
    expect(sText).toContain("Recarga");

    await expect(banner.getByTestId("button-budget-warning-topup")).toHaveText(/Recargar/);
  });

  test("interpolates Portuguese (pt-BR) translations on the critical banner", async ({
    page,
  }) => {
    await gotoUsageWithLocale(page, "pt-BR", "critical");
    const banner = page.getByTestId("alert-budget-warning-critical");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    const message = banner.getByTestId("text-budget-warning-message");
    const text = (await message.textContent())?.trim() ?? "";
    // PT-BR admin/critical: "Orçamento criticamente baixo — restam apenas 5%. $1.50 restantes."
    expect(text).toContain("Orçamento criticamente baixo");
    expect(text).toContain("5%");
    expect(text).toContain("$1.50");

    const suggestion = banner.getByTestId("text-budget-warning-suggestion");
    const sText = (await suggestion.textContent())?.trim() ?? "";
    expect(sText).toContain("Experimente modelos mais baratos");
    expect(sText).toContain(CHEAPEST);
    expect(sText).toContain("Recarregue");

    await expect(banner.getByTestId("button-budget-warning-topup")).toHaveText(/Recarregar/);
  });

  test("does not overflow on a 640px mobile viewport (snapshot + measurements)", async ({
    page,
  }) => {
    // Per the task: "Mobile viewport (<= 640px) snapshot confirms the banner
    // doesn't overflow." We assert both — a stored screenshot of the banner
    // at sm-breakpoint width and box/scroll measurements as belt-and-braces.
    await page.setViewportSize({ width: 640, height: 720 });
    await gotoUsageWithLocale(page, "en", "critical");

    const banner = page.getByTestId("alert-budget-warning-critical");
    await expect(banner).toBeVisible({ timeout: 15_000 });

    // Stable snapshot conditions: kill animations/transitions and the
    // blinking caret so the rasterised pixels don't drift run-to-run.
    await page.addStyleTag({
      content: `*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }`,
    });

    // Stored visual baseline of the banner at <=640px. A small allowance is
    // configured because i18n lengths and font subpixel rendering can shift
    // a handful of pixels across runs.
    await expect(banner).toHaveScreenshot("budget-warning-critical-mobile-640.png", {
      maxDiffPixelRatio: 0.02,
      animations: "disabled",
    });

    // The banner's rendered box must fit inside the viewport.
    const box = await banner.boundingBox();
    expect(box, "banner has a bounding box").not.toBeNull();
    expect(box!.width).toBeLessThanOrEqual(640);

    // No internal horizontal overflow inside the banner itself.
    const overflow = await banner.evaluate(
      (el) => (el as HTMLElement).scrollWidth - (el as HTMLElement).clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // The <main> ancestor must not horizontally scroll because of the banner.
    const mainOverflow = await page.evaluate(() => {
      const main = document.querySelector("main");
      if (!main) return 0;
      return main.scrollWidth - main.clientWidth;
    });
    expect(mainOverflow).toBeLessThanOrEqual(1);
  });
});
