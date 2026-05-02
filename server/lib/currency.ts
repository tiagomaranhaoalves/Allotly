import { db } from "../db";
import { fxRates, type FxRate } from "@shared/schema";

export type SupportedCurrency = "USD" | "GBP" | "EUR" | "BRL";
export const SUPPORTED_CURRENCIES: SupportedCurrency[] = ["USD", "GBP", "EUR", "BRL"];

export const FALLBACK_RATES: Record<Exclude<SupportedCurrency, "USD">, number> = {
  GBP: 0.79,
  EUR: 0.92,
  BRL: 5.20,
};

export const CURRENCY_LOCALES: Record<SupportedCurrency, string> = {
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  BRL: "pt-BR",
};

export const CURRENCY_SYMBOLS: Record<SupportedCurrency, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
  BRL: "R$",
};

export interface RatesSnapshot {
  rates: Record<SupportedCurrency, number>;
  asOf: Date;
  source: string;
}

let cachedRates: RatesSnapshot | null = null;
let cachedAt = 0;
const RATE_CACHE_TTL_MS = 60 * 60 * 1000;

export function clearRateCache() {
  cachedRates = null;
  cachedAt = 0;
}

function fallbackSnapshot(): RatesSnapshot {
  return {
    rates: { USD: 1, GBP: FALLBACK_RATES.GBP, EUR: FALLBACK_RATES.EUR, BRL: FALLBACK_RATES.BRL },
    asOf: new Date(0),
    source: "fallback",
  };
}

export async function getActiveRates(force = false): Promise<RatesSnapshot> {
  if (!force && cachedRates && Date.now() - cachedAt < RATE_CACHE_TTL_MS) return cachedRates;
  try {
    const rows: FxRate[] = await db.select().from(fxRates);
    if (rows.length === 0) {
      cachedRates = fallbackSnapshot();
      cachedAt = Date.now();
      return cachedRates;
    }
    const rates: Record<SupportedCurrency, number> = { USD: 1, GBP: FALLBACK_RATES.GBP, EUR: FALLBACK_RATES.EUR, BRL: FALLBACK_RATES.BRL };
    let asOf = new Date(0);
    let source = "fallback";
    for (const r of rows) {
      const rate = parseFloat(r.rateFromUsd as unknown as string);
      if (Number.isFinite(rate) && rate > 0) {
        rates[r.currency as SupportedCurrency] = rate;
        if (r.asOf > asOf) {
          asOf = r.asOf;
          source = r.source;
        }
      }
    }
    cachedRates = { rates, asOf, source };
    cachedAt = Date.now();
    return cachedRates;
  } catch {
    return fallbackSnapshot();
  }
}

/**
 * Convert USD-cents (canonical internal unit) to the target currency's minor units (e.g. pennies).
 * Math is rounded half-away-from-zero to keep cents-clean output.
 */
export function convertFromUsdCents(usdCents: number, target: SupportedCurrency, rate?: number): number {
  if (target === "USD") return Math.round(usdCents);
  const r = rate ?? FALLBACK_RATES[target as Exclude<SupportedCurrency, "USD">];
  return Math.round(usdCents * r);
}

/**
 * Format minor units as a localized currency string ("$25.00", "£19.75", "R$ 130,00").
 */
export function formatMoney(minorUnits: number, currency: SupportedCurrency, locale?: string): string {
  const loc = locale || CURRENCY_LOCALES[currency];
  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(minorUnits / 100);
  } catch {
    return `${CURRENCY_SYMBOLS[currency]}${(minorUnits / 100).toFixed(2)}`;
  }
}

export interface DisplayBlock {
  currency: SupportedCurrency;
  locale: string;
  fx_rate: number;
  fx_as_of: string | null;
  fx_source: string;
  formatted: {
    remaining: string;
    total: string;
    spent: string;
  };
  minor_units: {
    remaining: number;
    total: number;
    spent: number;
  };
}

export function buildDisplayBlock(
  remainingUsdCents: number,
  totalUsdCents: number,
  currency: SupportedCurrency,
  snapshot: RatesSnapshot,
): DisplayBlock {
  const locale = CURRENCY_LOCALES[currency];
  const rate = snapshot.rates[currency] ?? 1;
  const remainingMinor = convertFromUsdCents(Math.max(0, remainingUsdCents), currency, rate);
  const totalMinor = convertFromUsdCents(Math.max(0, totalUsdCents), currency, rate);
  const spentMinor = Math.max(0, totalMinor - remainingMinor);
  return {
    currency,
    locale,
    fx_rate: rate,
    fx_as_of: snapshot.asOf.getTime() === 0 ? null : snapshot.asOf.toISOString(),
    fx_source: snapshot.source,
    formatted: {
      remaining: formatMoney(remainingMinor, currency, locale),
      total: formatMoney(totalMinor, currency, locale),
      spent: formatMoney(spentMinor, currency, locale),
    },
    minor_units: {
      remaining: remainingMinor,
      total: totalMinor,
      spent: spentMinor,
    },
  };
}

export function getOrgCurrency(org: { currency?: string | null } | null | undefined): SupportedCurrency {
  const c = (org?.currency || "USD").toUpperCase();
  return SUPPORTED_CURRENCIES.includes(c as SupportedCurrency) ? (c as SupportedCurrency) : "USD";
}
