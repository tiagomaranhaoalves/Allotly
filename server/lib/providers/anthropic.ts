import type { ProviderAdapter, ValidationResult } from "./types";

export const anthropicAdapter: ProviderAdapter = {
  provider: "ANTHROPIC",

  async validateAdminKey(apiKey: string): Promise<ValidationResult> {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      });

      if (res.status === 401) {
        return { valid: false, error: "Invalid API key" };
      }

      if (res.status === 403) {
        return { valid: false, error: "API key lacks required permissions. Ensure the key has access to the Messages API." };
      }

      if (res.status === 200 || res.status === 400 || res.status === 404 || res.status === 429) {
        return { valid: true };
      }

      const body = await res.text();
      return { valid: false, error: `Anthropic API error: ${res.status} ${body.slice(0, 200)}` };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
