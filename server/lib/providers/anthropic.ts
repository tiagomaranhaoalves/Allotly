import type { ProviderAdapter, ValidationResult } from "./types";

export const anthropicAdapter: ProviderAdapter = {
  provider: "ANTHROPIC",
  automationLevel: "SEMI_AUTO",

  async validateAdminKey(apiKey: string): Promise<ValidationResult> {
    try {
      const res = await fetch("https://api.anthropic.com/v1/models", {
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "models-2025-01-01",
        },
      });

      if (res.status === 401) {
        return { valid: false, error: "Invalid API key" };
      }

      if (res.status === 403) {
        return { valid: false, error: "API key lacks required permissions" };
      }

      if (!res.ok) {
        const body = await res.text();
        return { valid: false, error: `Anthropic API error: ${res.status} ${body.slice(0, 200)}` };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
