import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 5000);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Cross-browser projects exist specifically to catch the class of
    // regression Task #61 introduced: the consent form's `decision` field
    // disappeared in Firefox/Safari but worked in headless Chrome. Any spec
    // tagged with `@cross-browser` runs in all three engines so we never
    // ship that bug again. Other specs are filtered out at the project
    // level via `grep` to keep the default suite fast.
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      grep: /@cross-browser/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      grep: /@cross-browser/,
    },
  ],
  webServer: process.env.PLAYWRIGHT_NO_WEB_SERVER
    ? undefined
    : {
        command: "npm run dev",
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
