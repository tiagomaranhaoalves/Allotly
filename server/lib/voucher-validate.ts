import type { Request, Response } from "express";
import type { IStorage } from "../storage";

export const VOUCHER_NOT_USABLE = { message: "Voucher not found or no longer usable" };

export type VoucherValidateStorage = Pick<
  IStorage,
  "getVoucherByCode" | "getVoucherBundle" | "getModelPricing"
>;

export function createVoucherValidateHandler(storage: VoucherValidateStorage) {
  return async function validateVoucher(req: Request, res: Response): Promise<void> {
    const codeRaw = req.params.code;
    const code = typeof codeRaw === "string" ? codeRaw.toUpperCase() : "";
    const voucher = await storage.getVoucherByCode(code);
    if (!voucher) {
      res.status(404).json(VOUCHER_NOT_USABLE);
      return;
    }
    if (voucher.status !== "ACTIVE") {
      res.status(404).json(VOUCHER_NOT_USABLE);
      return;
    }
    if (new Date(voucher.expiresAt) < new Date()) {
      res.status(404).json(VOUCHER_NOT_USABLE);
      return;
    }
    if (voucher.currentRedemptions >= voucher.maxRedemptions) {
      res.status(404).json(VOUCHER_NOT_USABLE);
      return;
    }

    if (voucher.bundleId) {
      const bundle = await storage.getVoucherBundle(voucher.bundleId);
      if (!bundle || bundle.status !== "ACTIVE") {
        res.status(404).json(VOUCHER_NOT_USABLE);
        return;
      }
      if (new Date(bundle.expiresAt) < new Date()) {
        res.status(404).json(VOUCHER_NOT_USABLE);
        return;
      }
      if (bundle.usedRedemptions >= bundle.totalRedemptions) {
        res.status(404).json(VOUCHER_NOT_USABLE);
        return;
      }
    }

    const models = await storage.getModelPricing();
    const allowedProviders = voucher.allowedProviders as string[];
    const allowedModels = models.filter(m => allowedProviders.includes(m.provider));

    res.json({
      code: voucher.code,
      budgetCents: voucher.budgetCents,
      allowedProviders: voucher.allowedProviders,
      allowedModels: allowedModels.map(m => ({
        modelId: m.modelId,
        displayName: m.displayName,
        provider: m.provider,
      })),
      expiresAt: voucher.expiresAt,
      remainingRedemptions: voucher.maxRedemptions - voucher.currentRedemptions,
    });
  };
}
