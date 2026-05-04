import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const routesSrc = readFileSync(resolve(process.cwd(), "server/routes.ts"), "utf-8");

function extractValidateRouteSource(): string {
  const start = routesSrc.indexOf('app.get("/api/vouchers/validate/:code"');
  expect(start).toBeGreaterThan(-1);

  let depth = 0;
  let i = start;
  let arrowFound = false;
  for (; i < routesSrc.length; i++) {
    const ch = routesSrc[i];
    if (ch === "{") {
      depth++;
      arrowFound = true;
    } else if (ch === "}") {
      depth--;
      if (arrowFound && depth === 0) {
        i++;
        break;
      }
    }
  }
  return routesSrc.slice(start, i + 1);
}

describe("/api/vouchers/validate/:code response uniformity", () => {
  const routeSrc = extractValidateRouteSource();

  it("uses voucherValidateLimiter middleware", () => {
    expect(routeSrc).toContain("voucherValidateLimiter");
  });

  it("declares a single shared NOT_USABLE envelope", () => {
    expect(routeSrc).toMatch(/const NOT_USABLE = \{ message: "Voucher not found or no longer usable" \}/);
  });

  it("returns 404 (not 400) for every non-success branch", () => {
    const status400Calls = routeSrc.match(/res\.status\(400\)/g) || [];
    expect(status400Calls.length).toBe(0);

    const status404WithUniform = routeSrc.match(/res\.status\(404\)\.json\(NOT_USABLE\)/g) || [];
    expect(status404WithUniform.length).toBeGreaterThanOrEqual(7);
  });

  it("does not leak voucher status, expiry, or bundle reasons in failure responses", () => {
    const failureMessageRegexes = [
      /Voucher is .*\$\{voucher\.status/,
      /Voucher has expired/,
      /Voucher is fully redeemed/,
      /bundle backing this voucher is no longer active/,
      /bundle backing this voucher has expired/,
      /bundle's redemption pool is exhausted/,
    ];
    for (const re of failureMessageRegexes) {
      expect(routeSrc).not.toMatch(re);
    }
  });

  it("preserves the success envelope (full metadata for usable vouchers)", () => {
    expect(routeSrc).toContain("budgetCents:");
    expect(routeSrc).toContain("allowedProviders:");
    expect(routeSrc).toContain("allowedModels:");
    expect(routeSrc).toContain("remainingRedemptions:");
  });
});

describe("Public endpoint abuse-protection wiring", () => {
  it("/api/contact has contactLimiter and requireTurnstile in front of the handler", () => {
    expect(routesSrc).toMatch(/app\.post\(\s*"\/api\/contact",\s*contactLimiter,\s*requireTurnstile/);
  });

  it("/api/auth/signup has signupLimiter and requireTurnstile in front of the handler", () => {
    expect(routesSrc).toMatch(/app\.post\(\s*"\/api\/auth\/signup",\s*signupLimiter,\s*requireTurnstile/);
  });
});
