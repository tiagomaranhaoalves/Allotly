import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import {
  createVoucherValidateHandler,
  VOUCHER_NOT_USABLE,
  type VoucherValidateStorage,
} from "../server/lib/voucher-validate";

type Voucher = {
  code: string;
  status: string;
  expiresAt: Date;
  currentRedemptions: number;
  maxRedemptions: number;
  bundleId: string | null;
  allowedProviders: string[];
  budgetCents: number;
};

type Bundle = {
  id: string;
  status: string;
  expiresAt: Date;
  usedRedemptions: number;
  totalRedemptions: number;
};

const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

let vouchers: Map<string, Voucher>;
let bundles: Map<string, Bundle>;

const fakeStorage: VoucherValidateStorage = {
  async getVoucherByCode(code: string) {
    return vouchers.get(code) as any;
  },
  async getVoucherBundle(id: string) {
    return bundles.get(id) as any;
  },
  async getModelPricing() {
    return [
      { modelId: "gpt-4o", displayName: "GPT-4o", provider: "OPENAI" },
      { modelId: "claude-3-5-sonnet", displayName: "Claude 3.5 Sonnet", provider: "ANTHROPIC" },
    ] as any;
  },
};

let server: ReturnType<ReturnType<typeof express>["listen"]>;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.set("trust proxy", 1);
  app.get("/api/vouchers/validate/:code", createVoucherValidateHandler(fakeStorage));
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

function newVoucher(overrides: Partial<Voucher> = {}): Voucher {
  return {
    code: "ALLOT-AAAA-BBBB-CCCC",
    status: "ACTIVE",
    expiresAt: futureDate,
    currentRedemptions: 0,
    maxRedemptions: 5,
    bundleId: null,
    allowedProviders: ["OPENAI"],
    budgetCents: 10_00,
    ...overrides,
  };
}

function newBundle(overrides: Partial<Bundle> = {}): Bundle {
  return {
    id: "bundle-1",
    status: "ACTIVE",
    expiresAt: futureDate,
    usedRedemptions: 0,
    totalRedemptions: 100,
    ...overrides,
  };
}

async function getValidate(code: string): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}/api/vouchers/validate/${encodeURIComponent(code)}`);
  let body: any = null;
  try { body = await res.json(); } catch { /* ignore */ }
  return { status: res.status, body };
}

describe("/api/vouchers/validate/:code uniform 404 envelope", () => {
  beforeAll(() => {
    vouchers = new Map();
    bundles = new Map();
  });

  it("returns the uniform envelope when the voucher does not exist", async () => {
    vouchers = new Map();
    const r = await getValidate("ALLOT-DOES-NOT-EXST");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when status is not ACTIVE", async () => {
    vouchers = new Map([["ALLOT-1", newVoucher({ code: "ALLOT-1", status: "EXHAUSTED" })]]);
    const r = await getValidate("allot-1");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when expired", async () => {
    vouchers = new Map([["ALLOT-2", newVoucher({ code: "ALLOT-2", expiresAt: pastDate })]]);
    const r = await getValidate("ALLOT-2");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when fully redeemed", async () => {
    vouchers = new Map([["ALLOT-3", newVoucher({ code: "ALLOT-3", currentRedemptions: 5, maxRedemptions: 5 })]]);
    const r = await getValidate("ALLOT-3");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when the backing bundle is missing", async () => {
    vouchers = new Map([["ALLOT-4", newVoucher({ code: "ALLOT-4", bundleId: "missing-bundle" })]]);
    bundles = new Map();
    const r = await getValidate("ALLOT-4");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when the backing bundle is not ACTIVE", async () => {
    vouchers = new Map([["ALLOT-5", newVoucher({ code: "ALLOT-5", bundleId: "b1" })]]);
    bundles = new Map([["b1", newBundle({ id: "b1", status: "REVOKED" })]]);
    const r = await getValidate("ALLOT-5");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when the backing bundle is expired", async () => {
    vouchers = new Map([["ALLOT-6", newVoucher({ code: "ALLOT-6", bundleId: "b2" })]]);
    bundles = new Map([["b2", newBundle({ id: "b2", expiresAt: pastDate })]]);
    const r = await getValidate("ALLOT-6");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns the uniform envelope when the bundle pool is exhausted", async () => {
    vouchers = new Map([["ALLOT-7", newVoucher({ code: "ALLOT-7", bundleId: "b3" })]]);
    bundles = new Map([["b3", newBundle({ id: "b3", usedRedemptions: 100, totalRedemptions: 100 })]]);
    const r = await getValidate("ALLOT-7");
    expect(r.status).toBe(404);
    expect(r.body).toEqual(VOUCHER_NOT_USABLE);
  });

  it("returns full success envelope when the voucher is usable", async () => {
    vouchers = new Map([["ALLOT-OK", newVoucher({ code: "ALLOT-OK", allowedProviders: ["OPENAI", "ANTHROPIC"] })]]);
    const r = await getValidate("ALLOT-OK");
    expect(r.status).toBe(200);
    expect(r.body.code).toBe("ALLOT-OK");
    expect(r.body.budgetCents).toBe(10_00);
    expect(r.body.allowedProviders).toEqual(["OPENAI", "ANTHROPIC"]);
    expect(r.body.allowedModels).toHaveLength(2);
    expect(r.body.remainingRedemptions).toBe(5);
  });

  it("never leaks reason hints (status, expiry, redemption-count) in any failure body", async () => {
    vouchers = new Map([
      ["ALLOT-X1", newVoucher({ code: "ALLOT-X1", status: "EXHAUSTED" })],
      ["ALLOT-X2", newVoucher({ code: "ALLOT-X2", expiresAt: pastDate })],
      ["ALLOT-X3", newVoucher({ code: "ALLOT-X3", currentRedemptions: 5, maxRedemptions: 5 })],
    ]);
    for (const code of ["ALLOT-X1", "ALLOT-X2", "ALLOT-X3", "ALLOT-NOT-FOUND"]) {
      const r = await getValidate(code);
      const text = JSON.stringify(r.body);
      expect(text).not.toMatch(/expired|exhausted|fully redeemed|status|bundle/i);
    }
  });
});
