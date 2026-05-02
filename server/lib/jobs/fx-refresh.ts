import { db } from "../../db";
import { fxRates } from "@shared/schema";
import { sql } from "drizzle-orm";
import { FALLBACK_RATES, SUPPORTED_CURRENCIES, clearRateCache } from "../currency";

const FX_API = "https://api.exchangerate.host/latest?base=USD&symbols=GBP,EUR,BRL";
const FX_TIMEOUT_MS = 10_000;

interface ExchangerateApiResponse {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
  success?: boolean;
}

/**
 * Fetch live USD-base rates and upsert them into fx_rates.
 *
 * Behavior:
 *   - On success: upsert GBP/EUR/BRL with source="live" and as_of=API date.
 *   - On API failure (network/parse error or missing rates):
 *       - If fx_rates is EMPTY: write fallback rows (so the app can format prices).
 *       - If fx_rates already has rows: leave them in place (do NOT overwrite live rates with fallback).
 *   - USD itself is implicit (rate=1) and is not stored.
 */
export async function runFxRefresh(): Promise<{ updated: number; source: "live" | "fallback" | "no-update"; asOf: string | null }> {
  let result: { updated: number; source: "live" | "fallback" | "no-update"; asOf: string | null } = { updated: 0, source: "live", asOf: null };

  let apiSucceeded = false;
  let apiPayload: ExchangerateApiResponse | null = null;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FX_TIMEOUT_MS);
    const res = await fetch(FX_API, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      apiPayload = await res.json() as ExchangerateApiResponse;
      const rates = apiPayload?.rates;
      if (rates && typeof rates.GBP === "number" && typeof rates.EUR === "number" && typeof rates.BRL === "number") {
        const asOf = apiPayload.date ? new Date(apiPayload.date) : new Date();
        if (!isNaN(asOf.getTime())) {
          for (const code of ["GBP", "EUR", "BRL"] as const) {
            const rate = rates[code];
            if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
              await db.insert(fxRates).values({
                currency: code,
                rateFromUsd: String(rate),
                source: "live",
                asOf,
              }).onConflictDoUpdate({
                target: fxRates.currency,
                set: { rateFromUsd: String(rate), source: "live", asOf, updatedAt: new Date() },
              });
              result.updated++;
            }
          }
          result.asOf = asOf.toISOString();
          apiSucceeded = true;
          console.log(`[fx-refresh] Updated ${result.updated} rates from upstream (as_of=${result.asOf})`);
        }
      }
    } else {
      console.warn(`[fx-refresh] API returned status ${res.status}`);
    }
  } catch (e: any) {
    console.warn(`[fx-refresh] API fetch failed: ${e.message}`);
  }

  if (!apiSucceeded) {
    // Only seed fallback rows if the table is empty so we never clobber live rates.
    const existing = await db.select({ c: fxRates.currency }).from(fxRates);
    if (existing.length === 0) {
      const asOf = new Date(0);
      for (const [code, rate] of Object.entries(FALLBACK_RATES)) {
        await db.insert(fxRates).values({
          currency: code as keyof typeof FALLBACK_RATES,
          rateFromUsd: String(rate),
          source: "fallback",
          asOf,
        }).onConflictDoNothing();
        result.updated++;
      }
      result.source = "fallback";
      console.log(`[fx-refresh] Seeded ${result.updated} fallback rates (table was empty)`);
    } else {
      result.source = "no-update";
      console.log(`[fx-refresh] Live rates left intact (${existing.length} existing rows)`);
    }
  }

  clearRateCache();
  return result;
}

/** Ensure fx_rates is populated at startup. Safe to call repeatedly. */
export async function ensureFxRatesSeeded(): Promise<void> {
  const rows = await db.select({ c: fxRates.currency }).from(fxRates).limit(1);
  if (rows.length > 0) return;
  await runFxRefresh();
}
