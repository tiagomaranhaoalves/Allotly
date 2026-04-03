import type { ProviderAdapter, ValidationResult } from "./types";

export const azureOpenaiAdapter: ProviderAdapter = {
  provider: "AZURE_OPENAI",

  async validateAdminKey(apiKey: string, options?: { baseUrl?: string; deploymentName?: string; apiVersion?: string; endpointMode?: string }): Promise<ValidationResult> {
    try {
      const baseUrl = options?.baseUrl;
      if (!baseUrl) {
        return { valid: false, error: "Azure base URL is required for validation" };
      }

      const apiVersion = options?.apiVersion || "2024-10-21";
      const cleanBase = baseUrl.replace(/\/+$/, "");
      const isApim = cleanBase.includes("azure-api.net");
      const endpointMode = options?.endpointMode || "legacy";
      const deploymentName = options?.deploymentName || "gpt-4o";

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "api-key": apiKey,
      };
      if (isApim) {
        headers["Ocp-Apim-Subscription-Key"] = apiKey;
      }

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

      if (chatRes.ok) {
        return { valid: true };
      }

      if (chatRes.status === 401 || chatRes.status === 403) {
        const body = await chatRes.text();
        console.log(`[azure-validate] Auth failure body: ${body.slice(0, 500)}`);
        return { valid: false, error: "Invalid API key or insufficient permissions" };
      }

      if (chatRes.status === 404) {
        if (isApim) {
          return { valid: false, error: `Deployment '${deploymentName}' not found on your APIM gateway. Ensure the deployment exists and is exposed through the gateway.` };
        }
        return { valid: false, error: `Deployment '${deploymentName}' not found. Verify your endpoint URL and that the deployment exists.` };
      }

      if (chatRes.status === 429) {
        return { valid: true };
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
      return { valid: false, error: errorMsg };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
