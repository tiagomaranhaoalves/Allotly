import type { ProviderAdapter, ValidationResult } from "./types";

export const googleAdapter: ProviderAdapter = {
  provider: "GOOGLE",

  async validateAdminKey(apiKey: string): Promise<ValidationResult> {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
      );

      if (res.status === 400 || res.status === 403) {
        return { valid: false, error: "Invalid API key or the key does not have access to the Gemini API." };
      }

      if (res.status === 401) {
        return { valid: false, error: "Invalid API key" };
      }

      if (!res.ok) {
        const body = await res.text();
        return { valid: false, error: `Google AI API error: ${res.status} ${body.slice(0, 200)}` };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
