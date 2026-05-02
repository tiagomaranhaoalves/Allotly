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

/** Convert USD-cents (canonical wire unit) to target-currency minor units. */
export function convertFromUsdCents(usdCents: number, target: SupportedCurrency, rate?: number): number {
  if (target === "USD") return Math.round(usdCents);
  const r = rate ?? FALLBACK_RATES[target as Exclude<SupportedCurrency, "USD">];
  return Math.round(usdCents * r);
}

/**
 * Browser locale, sniffed once. Falls back to the currency's canonical locale
 * if `navigator` isn't available (SSR / tests). Callers can still override
 * with `locale` to force a specific format (e.g. for parity with a server
 * pre-formatted string).
 */
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
  // Locale precedence: explicit override → server-provided format hint →
  // browser locale → currency-canonical locale. Browser locale lets a UK user
  // see "£19.75" with British grouping even when our org chose GBP, while a
  // German user viewing the same EUR org sees "23,00 €" automatically.
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
      // try next locale
    }
  }
  return `${CURRENCY_SYMBOLS[currency]}${(minorUnits / 100).toFixed(2)}`;
}

/**
 * Format USD-cents (canonical) directly in the target currency. If the caller
 * already has a server-formatted string (e.g. from a MCP `display.formatted.*`
 * field), pass it via `serverFallback` so we use it as the last-resort label
 * when both Intl and fallback symbols fail.
 */
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
