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

      const modelsUrl = `${cleanBase}/openai/models?api-version=${apiVersion}`;
      console.log(`[azure-validate] Testing key against ${modelsUrl}`);

      const res = await fetch(modelsUrl, {
        method: "GET",
        headers: {
          "api-key": apiKey,
          "Ocp-Apim-Subscription-Key": apiKey,
        },
      });

      console.log(`[azure-validate] Response status: ${res.status}`);

      if (res.status === 401 || res.status === 403) {
        return { valid: false, error: "Invalid API key or insufficient permissions" };
      }

      if (res.ok || res.status === 200) {
        return { valid: true };
      }

      if (res.status === 404) {
        const deploymentsUrl = `${cleanBase}/openai/deployments?api-version=${apiVersion}`;
        console.log(`[azure-validate] Models endpoint not available, trying deployments: ${deploymentsUrl}`);
        const depRes = await fetch(deploymentsUrl, {
          method: "GET",
          headers: {
            "api-key": apiKey,
            "Ocp-Apim-Subscription-Key": apiKey,
          },
        });

        console.log(`[azure-validate] Deployments response status: ${depRes.status}`);

        if (depRes.status === 401 || depRes.status === 403) {
          return { valid: false, error: "Invalid API key or insufficient permissions" };
        }

        if (depRes.ok) {
          return { valid: true };
        }

        const deploymentName = options?.deploymentName || "gpt-4o";
        const endpointMode = options?.endpointMode || "legacy";
        let chatUrl: string;
        if (endpointMode === "v1") {
          chatUrl = `${cleanBase}/openai/v1/chat/completions`;
        } else {
          chatUrl = `${cleanBase}/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions?api-version=${apiVersion}`;
        }

        console.log(`[azure-validate] Falling back to chat completions: ${chatUrl}`);
        const chatRes = await fetch(chatUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "api-key": apiKey,
            "Ocp-Apim-Subscription-Key": apiKey,
          },
          body: JSON.stringify({
            messages: [{ role: "user", content: "Hello" }],
            max_tokens: 1,
            ...(endpointMode === "v1" ? { model: deploymentName } : {}),
          }),
        });

        console.log(`[azure-validate] Chat response status: ${chatRes.status}`);

        if (chatRes.status === 401 || chatRes.status === 403) {
          return { valid: false, error: "Invalid API key or insufficient permissions" };
        }

        if (chatRes.ok || chatRes.status === 200) {
          return { valid: true };
        }

        if (chatRes.status === 404) {
          return { valid: false, error: `Could not validate: deployment '${deploymentName}' not found. Verify your endpoint URL is correct.` };
        }

        const chatBody = await chatRes.text();
        let chatMsg = `Azure API error: ${chatRes.status}`;
        try {
          const parsed = JSON.parse(chatBody);
          if (parsed?.error?.message) chatMsg += `: ${parsed.error.message}`;
        } catch {
          chatMsg += `: ${chatBody.slice(0, 200)}`;
        }
        return { valid: false, error: chatMsg };
      }

      const errorBody = await res.text();
      let errorMsg = `Azure API error: ${res.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        if (parsed?.error?.message) errorMsg += `: ${parsed.error.message}`;
      } catch {
        errorMsg += `: ${errorBody.slice(0, 200)}`;
      }
      return { valid: false, error: errorMsg };
    } catch (e: any) {
      return { valid: false, error: `Connection error: ${e.message}` };
    }
  },
};
