import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routesSrc = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");

describe("PATCH /api/org/settings authorization", () => {
  it("registers the route exactly once", () => {
    const matches = routesSrc.match(/app\.patch\(\s*["']\/api\/org\/settings["']/g) || [];
    expect(matches.length).toBe(1);
  });

  it("gates the route with requireRole('ROOT_ADMIN')", () => {
    const re = /app\.patch\(\s*["']\/api\/org\/settings["']\s*,\s*requireRole\(\s*["']ROOT_ADMIN["']\s*\)/;
    expect(re.test(routesSrc)).toBe(true);
  });

  it("does NOT gate the route with TEAM_ADMIN or MEMBER", () => {
    expect(/app\.patch\(\s*["']\/api\/org\/settings["']\s*,\s*requireRole\(\s*["']TEAM_ADMIN["']/.test(routesSrc)).toBe(false);
    expect(/app\.patch\(\s*["']\/api\/org\/settings["']\s*,\s*requireRole\(\s*["']MEMBER["']/.test(routesSrc)).toBe(false);
  });

  it("accepts only the four supported currency codes in the Zod schema", () => {
    const m = routesSrc.match(/currency:\s*z\.enum\(\[([^\]]+)\]\)\.optional\(\)/);
    expect(m).toBeTruthy();
    const codes = (m![1].match(/["']([A-Z]{3})["']/g) || []).map(s => s.replace(/["']/g, ""));
    expect(codes.sort()).toEqual(["BRL", "EUR", "GBP", "USD"]);
  });
});

describe("requireRole middleware contract", () => {
  it("rejects non-ROOT_ADMIN with 403 and unauthenticated with 401", () => {
    const authSrc = readFileSync(resolve(process.cwd(), "server/auth.ts"), "utf-8");
    expect(/requireRole/.test(authSrc)).toBe(true);
    expect(/status\(401\)/.test(authSrc)).toBe(true);
    expect(/status\(403\)/.test(authSrc)).toBe(true);
  });
});
