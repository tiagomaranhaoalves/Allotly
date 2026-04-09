import type { ProviderAdapter, ValidationResult } from "./types";

export const DEFAULT_AZURE_API_VERSION = "2024-12-01-preview";

const REASONING_MODEL_PATTERN = /^(o1|o3|o4|gpt-5)/i;
const REASONING_MIN_API_VERSION = "2024-12-01-preview";

export function effectiveAzureApiVersion(modelId: string, userValue?: string | null): string {
  const candidates = [userValue, DEFAULT_AZURE_API_VERSION].filter(Boolean) as string[];
  if (REASONING_MODEL_PATTERN.test(modelId)) {
    candidates.push(REASONING_MIN_API_VERSION);
  }
  return candidates.sort().reverse()[0];
}

export const azureOpenaiAdapter: ProviderAdapter = {
  provider: "AZURE_OPENAI",

  async validateAdminKey(apiKey: string, options?: { baseUrl?: string; deploymentName?: string; apiVersion?: string; endpointMode?: string }): Promise<ValidationResult> {
    try {
      const baseUrl = options?.baseUrl;
      if (!baseUrl) {
        return { valid: false, error: "Azure base URL is required for validation" };
      }

      const apiVersion = options?.apiVersion || DEFAULT_AZURE_API_VERSION;
      const cleanBase = baseUrl.replace(/\/+$/, "").replace(/\/openai\/?$/, "");
      const isApim = cleanBase.includes("azure-api.net");
      const endpointMode = options?.endpointMode || "legacy";
      const deploymentName = options?.deploymentName || "gpt-4o";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "api-key": apiKey,
      };

      if (!isApim) {
        const modelsUrl = `${cleanBase}/openai/models?api-version=${apiVersion}`;
        console.log(`[azure-validate] Trying models endpoint: ${modelsUrl}`);
        try {
          const modelsRes = await fetch(modelsUrl, { method: "GET", headers });
          console.log(`[azure-validate] Models response: ${modelsRes.status}`);
          if (modelsRes.ok) return { valid: true };
          if (modelsRes.status === 401 || modelsRes.status === 403) {
            return { valid: false, error: "Invalid API key or insufficient permissions" };
          }
        } catch (e: any) {
          console.log(`[azure-validate] Models endpoint error: ${e.message}`);
        }
      }

      let chatUrl: string;
      if (endpointMode === "v1") {
        chatUrl = `${cleanBase}/openai/v1/chat/completions`;
      } else {
        chatUrl = `${cleanBase}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions?api-version=${apiVersion}`;
      }

      console.log(`[azure-validate] Testing chat completions: ${chatUrl}`);
      const chatRes = await fetch(chatUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: "Hello" }],
          max_tokens: 1,
          ...(endpointMode === "v1" ? { model: deploymentName } : {}),
        }),
      });

      console.log(`[azure-validate] Chat response: ${chatRes.status}`);

      if (chatRes.ok || chatRes.status === 429 || chatRes.status === 404) {
        return { valid: true };
      }

      if (chatRes.status === 401 || chatRes.status === 403) {
        const body = await chatRes.text();
        console.log(`[azure-validate] Auth failure body: ${body.slice(0, 500)}`);

        if (isApim) {
          console.log(`[azure-validate] APIM gateway — allowing connection despite auth failure (gateway config may differ from validation probe)`);
          return { valid: true };
        }

        return { valid: false, error: "Invalid API key or insufficient permissions" };
      }

      const errorBody = await chatRes.text();
      let errorMsg = `Azure API returned ${chatRes.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed?.error?.message) errorMsg += `: ${parsed.error.message}`;
        if (parsed?.error?.code === "model_not_found" || parsed?.error?.code === "DeploymentNotFound") {
          return { valid: true };
        }
      } catch {
        errorMsg += `: ${errorBody.slice(0, 200)}`;
      }

      if (isApim) {
        console.log(`[azure-validate] APIM gateway — allowing connection despite error: ${errorMsg}`);
        return { valid: true };
      }

      return { valid: false, error: errorMsg };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
