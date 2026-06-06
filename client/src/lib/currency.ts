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

export const CURRENCY_LABELS: Record<SupportedCurrency, string> = {
  USD: "US Dollar (USD)",
  GBP: "British Pound (GBP)",
  EUR: "Euro (EUR)",
  BRL: "Brazilian Real (BRL)",
};

export function normalizeCurrency(c: string | null | undefined): SupportedCurrency {
  const up = (c || "USD").toUpperCase();
  return (SUPPORTED_CURRENCIES as string[]).includes(up) ? (up as SupportedCurrency) : "USD";
}

/**
 * Parse a user-entered USD dollar string into whole integer USD-cents for the
 * wire. Returns `null` for a blank field (meaning "unlimited" ceiling), an
 * integer cents value for a valid amount, or `undefined` when the input is a
 * non-empty but invalid/non-finite number (e.g. "-", ".", "1e"). Callers MUST
 * treat `undefined` as a validation error and NOT send it — JSON-encoding a
 * `NaN` becomes `null`, which would silently clear the ceiling to unlimited.
 */
export function parseDollarsToCents(input: string): number | null | undefined {
  if (input.trim() === "") return null;
  const dollars = parseFloat(input);
  if (!Number.isFinite(dollars) || dollars < 0) return undefined;
  return Math.round(dollars * 100);
}

/** Convert USD-cents (canonical wire unit) to target-currency minor units. */
export function convertFromUsdCents(usdCents: number, target: SupportedCurrency, rate?: number): number {
  if (target === "USD") return Math.round(usdCents);
  const r = rate ?? FALLBACK_RATES[target as Exclude<SupportedCurrency, "USD">];
  return Math.round(usdCents * r);
}

function getBrowserLocale(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  const n: any = navigator;
  return n.languages?.[0] || n.language || undefined;
}

export function formatMoney(
  minorUnits: number,
  currency: SupportedCurrency,
  locale?: string,
): string {
  // Locale order: explicit → browser → currency-canonical → symbol fallback.
  const candidates = [locale, getBrowserLocale(), CURRENCY_LOCALES[currency]].filter(Boolean) as string[];
  for (const loc of candidates) {
    try {
      return new Intl.NumberFormat(loc, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(minorUnits / 100);
    } catch {
      // try next
    }
  }
  return `${CURRENCY_SYMBOLS[currency]}${(minorUnits / 100).toFixed(2)}`;
}

/** Format USD-cents in the target currency; uses `serverFallback` if Intl throws. */
export function formatUsdCents(
  usdCents: number,
  currency: SupportedCurrency,
  rate?: number,
  locale?: string,
  serverFallback?: string,
): string {
  const minor = convertFromUsdCents(usdCents, currency, rate);
  try {
    return formatMoney(minor, currency, locale);
  } catch {
    return serverFallback ?? `${CURRENCY_SYMBOLS[currency]}${(minor / 100).toFixed(2)}`;
  }
}
