import type { ProviderAdapter, ValidationResult } from "./types";

export const googleAdapter: ProviderAdapter = {
  provider: "GOOGLE",
  automationLevel: "GUIDED",

  async validateAdminKey(_apiKey: string): Promise<ValidationResult> {
    return { valid: true, details: { note: "Guided setup — manual configuration required" } };
  },
};
