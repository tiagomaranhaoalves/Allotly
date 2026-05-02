import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

type Row = { currency: string; rateFromUsd: string; source: string; asOf: Date; updatedAt?: Date };

const store: { rows: Row[] } = { rows: [] };

vi.mock("../server/db", () => {
  const selectImpl = (_proj?: any) => ({
    from: (_t: any) => {
      const chain: any = {
        limit: (_n: number) => Promise.resolve(store.rows.slice(0, _n)),
        then: (resolve: any) => resolve(store.rows),
      };
      return chain;
    },
  });
  return {
    db: {
      select: selectImpl,
      insert: (_t: any) => ({
        values: (vals: Row) => ({
          onConflictDoUpdate: async ({ set }: { set: Partial<Row> }) => {
            const existing = store.rows.find(r => r.currency === vals.currency);
            if (existing) {
              Object.assign(existing, set);
            } else {
              store.rows.push({ ...vals });
            }
          },
          onConflictDoNothing: async () => {
            const existing = store.rows.find(r => r.currency === vals.currency);
            if (!existing) store.rows.push({ ...vals });
          },
        }),
      }),
    },
  };
});

vi.mock("@shared/schema", async () => {
  const actual: any = await vi.importActual("@shared/schema");
  return { ...actual, fxRates: { currency: "currency" } as any };
});

vi.mock("../server/lib/currency", () => ({
  clearRateCache: () => {},
  invalidateRatesCache: () => {},
  FALLBACK_RATES: { GBP: 0.79, EUR: 0.92, BRL: 5.20 },
  SUPPORTED_CURRENCIES: ["USD", "GBP", "EUR", "BRL"],
}));

beforeEach(() => {
  store.rows = [];
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runFxRefresh", () => {
  it("upserts GBP/EUR/BRL with source='live' when the upstream API succeeds", async () => {
    const mockResponse = {
      success: true,
      base: "USD",
      date: "2026-05-01",
      rates: { GBP: 0.81, EUR: 0.93, BRL: 5.15 },
    };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(mockResponse), { status: 200 }) as any,
    );

    const { runFxRefresh } = await import("../server/lib/jobs/fx-refresh");
    const result = await runFxRefresh();

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.source).toBe("live");
    expect(result.updated).toBe(3);
    expect(result.asOf).toBe("2026-05-01T00:00:00.000Z");
    expect(store.rows).toHaveLength(3);
    for (const row of store.rows) {
      expect(row.source).toBe("live");
      expect(["GBP", "EUR", "BRL"]).toContain(row.currency);
    }
    const gbp = store.rows.find(r => r.currency === "GBP")!;
    expect(parseFloat(gbp.rateFromUsd)).toBeCloseTo(0.81);
  });

  it("seeds fallback rows when API fails AND fx_rates is empty", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network down"));

    const { runFxRefresh } = await import("../server/lib/jobs/fx-refresh");
    const result = await runFxRefresh();

    expect(result.source).toBe("fallback");
    expect(result.updated).toBe(3);
    expect(store.rows).toHaveLength(3);
    for (const row of store.rows) {
      expect(row.source).toBe("fallback");
    }
    const gbp = store.rows.find(r => r.currency === "GBP")!;
    expect(parseFloat(gbp.rateFromUsd)).toBeCloseTo(0.79);
    const eur = store.rows.find(r => r.currency === "EUR")!;
    expect(parseFloat(eur.rateFromUsd)).toBeCloseTo(0.92);
    const brl = store.rows.find(r => r.currency === "BRL")!;
    expect(parseFloat(brl.rateFromUsd)).toBeCloseTo(5.20);
  });

  it("does NOT overwrite existing live rates when API fails", async () => {
    const liveAsOf = new Date("2026-04-30T00:00:00Z");
    store.rows = [
      { currency: "GBP", rateFromUsd: "0.80", source: "live", asOf: liveAsOf },
      { currency: "EUR", rateFromUsd: "0.91", source: "live", asOf: liveAsOf },
      { currency: "BRL", rateFromUsd: "5.10", source: "live", asOf: liveAsOf },
    ];
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("upstream 503"));

    const { runFxRefresh } = await import("../server/lib/jobs/fx-refresh");
    const result = await runFxRefresh();

    expect(result.source).toBe("no-update");
    expect(result.updated).toBe(0);
    expect(store.rows).toHaveLength(3);
    for (const row of store.rows) {
      expect(row.source).toBe("live");
    }
    expect(parseFloat(store.rows.find(r => r.currency === "GBP")!.rateFromUsd)).toBeCloseTo(0.80);
  });

  it("treats non-200 upstream as failure and falls back appropriately", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("rate limited", { status: 429 }) as any,
    );

    const { runFxRefresh } = await import("../server/lib/jobs/fx-refresh");
    const result = await runFxRefresh();

    expect(result.source).toBe("fallback");
    expect(store.rows).toHaveLength(3);
  });
});
