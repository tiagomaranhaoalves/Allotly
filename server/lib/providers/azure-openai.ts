import type { ProviderAdapter, ValidationResult } from "./types";

export const azureOpenaiAdapter: ProviderAdapter = {
  provider: "AZURE_OPENAI",

  async validateAdminKey(apiKey: string, options?: { baseUrl?: string; deploymentName?: string; apiVersion?: string; endpointMode?: string }): Promise<ValidationResult> {
    try {
      const baseUrl = options?.baseUrl;
      if (!baseUrl) {
        return { valid: false, error: "Azure base URL is required for validation" };
      }

      const deploymentName = options?.deploymentName;
      const endpointMode = options?.endpointMode || "v1";
      const apiVersion = options?.apiVersion || "2024-10-21";

      let url: string;
      if (endpointMode === "v1") {
        url = `${baseUrl.replace(/\/$/, "")}/openai/v1/chat/completions`;
      } else {
        if (!deploymentName) {
          return { valid: false, error: "Deployment name is required for legacy endpoint mode validation" };
        }
        url = `${baseUrl.replace(/\/$/, "")}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions?api-version=${apiVersion}`;
      }

      const body = {
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 1,
        ...(endpointMode === "v1" && deploymentName ? { model: deploymentName } : {}),
      };

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
          "Ocp-Apim-Subscription-Key": apiKey,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: "Invalid API key or insufficient permissions" };
      }

      if (res.status === 404) {
        return { valid: false, error: "Deployment not found. Check the base URL and deployment name." };
      }

      if (!res.ok) {
        const errorBody = await res.text();
        let errorMsg = `Azure OpenAI API error: ${res.status}`;
        try {
          const parsed = JSON.parse(errorBody);
          if (parsed?.error?.message) errorMsg += `: ${parsed.error.message}`;
        } catch {
          errorMsg += `: ${errorBody.slice(0, 200)}`;
        }
        return { valid: false, error: errorMsg };
      }

      return { valid: true };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
