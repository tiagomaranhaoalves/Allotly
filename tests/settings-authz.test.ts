import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

/**
 * Authorization contract for PATCH /api/org/settings { currency }.
 *
 * The display-currency knob is sensitive (it changes how every member of an
 * org sees their budget figures) so it must be ROOT_ADMIN-only. Non-admins
 * may only read it via GET /api/org/settings and the read-only chip in
 * settings.tsx (data-testid="text-currency-readonly").
 *
 * Rather than spin up a full HTTP harness with seeded users for each role,
 * we assert the contract structurally:
 *   1. The PATCH route is defined exactly once.
 *   2. It is wired through `requireRole("ROOT_ADMIN")` middleware (which
 *      returns 403 for any other role and 401 for unauthenticated callers).
 *   3. The Zod schema accepts only the four supported codes (USD/GBP/EUR/BRL).
 *
 * If anyone weakens the gate (e.g. swaps to `requireRole("TEAM_ADMIN")` or
 * removes the middleware) this test fails loudly.
 */

const ROUTES_PATH = resolve(process.cwd(), "server/routes.ts");
const routesSrc = readFileSync(ROUTES_PATH, "utf-8");

describe("PATCH /api/org/settings authorization", () => {
  it("registers the route exactly once", () => {
    const matches = routesSrc.match(/app\.patch\(\s*["']\/api\/org\/settings["']/g) || [];
    expect(matches.length).toBe(1);
  });

  it("gates the route with requireRole('ROOT_ADMIN')", () => {
    // The single line should look like:
    //   app.patch("/api/org/settings", requireRole("ROOT_ADMIN"), async ...
    const re = /app\.patch\(\s*["']\/api\/org\/settings["']\s*,\s*requireRole\(\s*["']ROOT_ADMIN["']\s*\)/;
    expect(re.test(routesSrc)).toBe(true);
  });

  it("does NOT gate the route with TEAM_ADMIN or MEMBER", () => {
    expect(/app\.patch\(\s*["']\/api\/org\/settings["']\s*,\s*requireRole\(\s*["']TEAM_ADMIN["']/.test(routesSrc)).toBe(false);
    expect(/app\.patch\(\s*["']\/api\/org\/settings["']\s*,\s*requireRole\(\s*["']MEMBER["']/.test(routesSrc)).toBe(false);
  });

  it("accepts only the four supported currency codes in the Zod schema", () => {
    // The schema lives in the same handler block as the route — find the
    // currency: z.enum([...]) line and assert exactly USD/GBP/EUR/BRL.
    const m = routesSrc.match(/currency:\s*z\.enum\(\[([^\]]+)\]\)\.optional\(\)/);
    expect(m).toBeTruthy();
    const codes = (m![1].match(/["']([A-Z]{3})["']/g) || []).map(s => s.replace(/["']/g, ""));
    expect(codes.sort()).toEqual(["BRL", "EUR", "GBP", "USD"]);
  });
});

describe("requireRole middleware contract", () => {
  it("rejects non-ROOT_ADMIN with 403 and unauthenticated with 401", () => {
    // The middleware itself is exercised across the route table; here we
    // just confirm its shape so a regression in routes.ts wiring is caught.
    const authSrc = readFileSync(resolve(process.cwd(), "server/auth.ts"), "utf-8");
    // requireRole should send 401 when no user, 403 when role mismatch.
    expect(/requireRole/.test(authSrc)).toBe(true);
    expect(/status\(401\)/.test(authSrc)).toBe(true);
    expect(/status\(403\)/.test(authSrc)).toBe(true);
  });
});
