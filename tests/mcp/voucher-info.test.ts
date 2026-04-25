import { describe, it, expect, beforeEach, vi } from "vitest";
import { getTool } from "../../server/lib/mcp/tools";

vi.mock("../../server/storage", () => ({
  storage: {
    getVoucherByCode: vi.fn(),
    getUser: vi.fn(),
  },
}));

import { storage } from "../../server/storage";

describe("voucher_info tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns redeemable=true for unredeemed active voucher", async () => {
    (storage.getVoucherByCode as any).mockResolvedValue({
      code: "ALLOT-AAAA-BBBB-CCCC",
      status: "ACTIVE",
      budgetCents: 1000,
      allowedModels: ["gpt-4o-mini"],
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
      maxRedemptions: 1,
      currentRedemptions: 0,
      label: "Cambridge DS",
      createdById: "user-1",
    });
    (storage.getUser as any).mockResolvedValue({ name: "Workshop Lead" });

    const tool = getTool("voucher_info")!;
    const out = await tool.handler({ code: "ALLOT-AAAA-BBBB-CCCC" }, { principal: null, authHeader: undefined });
    expect(out.status).toBe("unredeemed");
    expect(out.redeemable).toBe(true);
    expect(out.budget_cents).toBe(1000);
  });

  it("returns expired when expiry is in the past", async () => {
    (storage.getVoucherByCode as any).mockResolvedValue({
      code: "ALLOT-EXP-XXXX",
      status: "ACTIVE",
      budgetCents: 500,
      allowedModels: [],
      expiresAt: new Date(Date.now() - 86_400_000),
      maxRedemptions: 1,
      currentRedemptions: 0,
      createdById: "u",
    });
    (storage.getUser as any).mockResolvedValue(undefined);
    const tool = getTool("voucher_info")!;
    const out = await tool.handler({ code: "ALLOT-EXP-XXXX" }, { principal: null, authHeader: undefined });
    expect(out.status).toBe("expired");
    expect(out.redeemable).toBe(false);
  });

  it("throws NotFound when voucher missing", async () => {
    (storage.getVoucherByCode as any).mockResolvedValue(undefined);
    const tool = getTool("voucher_info")!;
    await expect(
      tool.handler({ code: "ALLOT-NOPE" }, { principal: null, authHeader: undefined })
    ).rejects.toThrow();
  });
});
