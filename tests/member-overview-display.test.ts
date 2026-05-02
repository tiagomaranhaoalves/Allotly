import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routesSrc = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");
const usagePageSrc = readFileSync(resolve(process.cwd(), "client/src/pages/dashboard/usage.tsx"), "utf-8");

describe("/api/dashboard/member-overview includes display block", () => {
  it("computes a display block via buildDisplayBlock and returns it on the response", () => {
    const handler = routesSrc.split('app.get("/api/dashboard/member-overview"')[1]?.split("app.")[0] ?? "";
    expect(handler).toBeTruthy();
    expect(handler).toMatch(/buildDisplayBlock\s*\(/);
    expect(handler).toMatch(/getActiveRates\s*\(/);
    expect(handler).toMatch(/getOrgCurrency\s*\(/);
    expect(handler).toMatch(/res\.json\(\s*\{[^}]*display[^}]*\}\s*\)/s);
  });

  it("usage.tsx consumes overview.display.formatted into BudgetBar.serverFormatted", () => {
    expect(usagePageSrc).toMatch(/queryKey:\s*\[\s*["']\/api\/dashboard\/member-overview["']\s*\]/);
    expect(usagePageSrc).toMatch(/serverFormatted=\{[^}]*overview\?\.display\?\.formatted/);
  });
});
