import type { ProviderAdapter, ValidationResult } from "./types";

export const openaiAdapter: ProviderAdapter = {
  provider: "OPENAI",
  automationLevel: "FULL_AUTO",

  async validateAdminKey(apiKey: string): Promise<ValidationResult> {
    try {
      const res = await fetch("https://api.openai.com/v1/models?limit=1", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });

      if (res.status === 401) {
        return { valid: false, error: "Invalid API key" };
      }

      if (res.status === 403) {
        return { valid: false, error: "API key lacks required permissions. Ensure the key has access to the Models API." };
      }

      if (!res.ok) {
        const body = await res.text();
        return { valid: false, error: `OpenAI API error: ${res.status} ${body.slice(0, 200)}` };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
