import { test, expect } from "@playwright/test";

test.describe("arena setup → round → vote → results", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("walks the full flow with a duplicated model lineup", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.clear();
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });

    await page.goto("/arena");

    // Splash → start cached.
    await expect(page.getByTestId("button-start-cached")).toBeVisible();
    await page.getByTestId("button-start-cached").click();

    // Allocation → pick marketing → confirm.
    await expect(page.getByTestId("slider-allocation")).toBeVisible();
    await page.getByTestId("mode-card-marketing").click();
    await page.getByTestId("button-confirm-allocation").click();

    // Setup screen — admin role first.
    await expect(page.getByTestId("dual-role-step")).toBeVisible();
    await expect(page.getByTestId("admin-panel")).toBeVisible();
    await page.getByTestId("button-continue-to-lineup").click();

    // Developer role — duplicate slot 0's model into slot 1.
    await expect(page.getByTestId("developer-panel")).toBeVisible();
    await expect(page.getByTestId("slot-0")).toBeVisible();
    await expect(page.getByTestId("slot-1")).toBeVisible();
    await expect(page.getByTestId("slot-2")).toBeVisible();

    await page.getByTestId("slot-select-1").click();
    await page.getByTestId("slot-1-option-gpt-4o-mini").click();

    // Lock and run.
    await page.getByTestId("button-lock-lineup").click();

    // Streaming — two independent panels for the duplicated model.
    await expect(page.getByTestId("stream-panel-gpt-4o-mini-0")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("stream-panel-gpt-4o-mini-1")).toBeVisible();
    await expect(page.getByTestId("stream-panel-claude-sonnet-4-20250514-2")).toBeVisible();

    // Sanity: panels really are distinct DOM nodes.
    const panel0 = page.getByTestId("stream-panel-gpt-4o-mini-0");
    const panel1 = page.getByTestId("stream-panel-gpt-4o-mini-1");
    expect(await panel0.count()).toBe(1);
    expect(await panel1.count()).toBe(1);

    // Voting panel renders once streams complete.
    await expect(page.getByTestId("button-submit-votes")).toBeVisible({ timeout: 45_000 });
    await expect(page.getByTestId("vote-best-gpt-4o-mini-0")).toBeVisible();
    await expect(page.getByTestId("vote-best-gpt-4o-mini-1")).toBeVisible();
    await expect(page.getByTestId("vote-paymost-gpt-4o-mini-0")).toBeVisible();
    await expect(page.getByTestId("vote-paymost-gpt-4o-mini-1")).toBeVisible();

    // Pick the two duplicated slots independently.
    await page.getByTestId("vote-best-gpt-4o-mini-0").click();
    await page.getByTestId("vote-paymost-gpt-4o-mini-1").click();
    await page.getByTestId("button-submit-votes").click();

    // Results — voting panel disappears, the round-runner moves on.
    await expect(page.getByTestId("button-submit-votes")).toHaveCount(0);
    // Stream panels stay around in the results phase, so the page is still showing arena content.
    await expect(page.getByTestId("stream-panel-gpt-4o-mini-0")).toBeVisible();
    await expect(page.getByTestId("stream-panel-gpt-4o-mini-1")).toBeVisible();
  });
});
