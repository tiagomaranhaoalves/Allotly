import { describe, it, expect } from "vitest";
import {
  SUPPORTED_CURRENCIES,
  FALLBACK_RATES,
  CURRENCY_LOCALES,
  convertFromUsdCents,
  formatMoney,
  buildDisplayBlock,
  getOrgCurrency,
  type SupportedCurrency,
  type RatesSnapshot,
} from "../server/lib/currency";

const FALLBACK_SNAPSHOT: RatesSnapshot = {
  rates: { USD: 1, GBP: FALLBACK_RATES.GBP, EUR: FALLBACK_RATES.EUR, BRL: FALLBACK_RATES.BRL },
  asOf: new Date(0),
  source: "fallback",
};

describe("convertFromUsdCents", () => {
  it("returns USD-cents unchanged for USD", () => {
    expect(convertFromUsdCents(2500, "USD")).toBe(2500);
    expect(convertFromUsdCents(0, "USD")).toBe(0);
  });

  it("applies the FX rate and rounds to whole minor units", () => {
    // 2500 USD-cents @ 0.79 -> 1975 pennies
    expect(convertFromUsdCents(2500, "GBP", 0.79)).toBe(1975);
    // 2500 USD-cents @ 0.92 -> 2300 cents
    expect(convertFromUsdCents(2500, "EUR", 0.92)).toBe(2300);
    // 2500 USD-cents @ 5.20 -> 13000 centavos
    expect(convertFromUsdCents(2500, "BRL", 5.20)).toBe(13000);
  });

  it("falls back to the FALLBACK_RATES table when no rate is provided", () => {
    expect(convertFromUsdCents(10000, "GBP")).toBe(Math.round(10000 * FALLBACK_RATES.GBP));
    expect(convertFromUsdCents(10000, "EUR")).toBe(Math.round(10000 * FALLBACK_RATES.EUR));
    expect(convertFromUsdCents(10000, "BRL")).toBe(Math.round(10000 * FALLBACK_RATES.BRL));
  });

  it("rounds half away from zero rather than truncating", () => {
    // 333 USD-cents @ 0.79 = 263.07 -> 263
    expect(convertFromUsdCents(333, "GBP", 0.79)).toBe(263);
    // Rate that produces an exact .5 should round up.
    expect(convertFromUsdCents(1, "GBP", 0.5)).toBe(1);
  });
});

describe("formatMoney", () => {
  it("renders the correct currency symbol per locale", () => {
    expect(formatMoney(2500, "USD")).toMatch(/\$25\.00/);
    expect(formatMoney(1975, "GBP")).toMatch(/£19\.75/);
  });

  it("renders EUR and BRL in their localized formats", () => {
    const eur = formatMoney(2300, "EUR");
    // de-DE uses "23,00 €" (comma decimal, trailing symbol with NBSP).
    expect(eur).toContain("€");
    expect(eur).toContain("23");
    const brl = formatMoney(13000, "BRL");
    expect(brl).toContain("R$");
    expect(brl).toContain("130");
  });

  it("treats the input as minor units (cents/pence/centavos)", () => {
    expect(formatMoney(100, "USD")).toMatch(/\$1\.00/);
    expect(formatMoney(0, "USD")).toMatch(/\$0\.00/);
  });
});

describe("buildDisplayBlock", () => {
  it("includes converted minor units, formatted strings, and rate metadata", () => {
    const block = buildDisplayBlock(7500, 10000, "GBP", FALLBACK_SNAPSHOT);
    expect(block.currency).toBe("GBP");
    expect(block.locale).toBe(CURRENCY_LOCALES.GBP);
    expect(block.fx_rate).toBe(FALLBACK_RATES.GBP);
    expect(block.fx_source).toBe("fallback");
    expect(block.fx_as_of).toBeNull(); // epoch -> null
    expect(block.minor_units.remaining).toBe(Math.round(7500 * FALLBACK_RATES.GBP));
    expect(block.minor_units.total).toBe(Math.round(10000 * FALLBACK_RATES.GBP));
    expect(block.minor_units.spent).toBe(block.minor_units.total - block.minor_units.remaining);
    expect(block.formatted.remaining).toContain("£");
    expect(block.formatted.total).toContain("£");
    expect(block.formatted.spent).toContain("£");
  });

  it("preserves the USD passthrough when currency is USD", () => {
    const block = buildDisplayBlock(2500, 10000, "USD", FALLBACK_SNAPSHOT);
    expect(block.fx_rate).toBe(1);
    expect(block.minor_units.remaining).toBe(2500);
    expect(block.minor_units.total).toBe(10000);
    expect(block.minor_units.spent).toBe(7500);
  });

  it("clamps negative remaining to zero", () => {
    const block = buildDisplayBlock(-500, 1000, "USD", FALLBACK_SNAPSHOT);
    expect(block.minor_units.remaining).toBe(0);
    expect(block.minor_units.spent).toBe(1000);
  });

  it("emits ISO timestamps for non-epoch as_of", () => {
    const live: RatesSnapshot = {
      rates: { USD: 1, GBP: 0.8, EUR: 0.9, BRL: 5.0 },
      asOf: new Date("2026-01-15T03:00:00Z"),
      source: "exchangerate.host",
    };
    const block = buildDisplayBlock(1000, 1000, "EUR", live);
    expect(block.fx_as_of).toBe("2026-01-15T03:00:00.000Z");
    expect(block.fx_source).toBe("exchangerate.host");
    expect(block.fx_rate).toBe(0.9);
  });
});

describe("getOrgCurrency", () => {
  it("normalizes lowercase / unknown values to USD", () => {
    expect(getOrgCurrency(null)).toBe("USD");
    expect(getOrgCurrency(undefined)).toBe("USD");
    expect(getOrgCurrency({})).toBe("USD");
    expect(getOrgCurrency({ currency: "JPY" })).toBe("USD");
    expect(getOrgCurrency({ currency: "gbp" })).toBe("GBP");
  });

  it("accepts every supported currency", () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(getOrgCurrency({ currency: c })).toBe(c);
    }
  });
});

describe("invariants", () => {
  it("USD-cents passthrough is the identity for any total", () => {
    for (const v of [0, 1, 99, 100, 1234, 999999]) {
      expect(convertFromUsdCents(v, "USD")).toBe(v);
    }
  });

  it("display block is internally consistent: spent = total - remaining", () => {
    for (const ccy of SUPPORTED_CURRENCIES as SupportedCurrency[]) {
      const block = buildDisplayBlock(2500, 10000, ccy, FALLBACK_SNAPSHOT);
      expect(block.minor_units.spent).toBe(block.minor_units.total - block.minor_units.remaining);
    }
  });
});
