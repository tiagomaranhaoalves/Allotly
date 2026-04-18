import { db } from "../../db";
import { modelPricing } from "@shared/schema";
import { storage } from "../../storage";
import { decryptProviderKey } from "../encryption";
import { eq, and } from "drizzle-orm";
import { DEPRECATED_MODELS } from "../seed-models";

interface DiscoveredModel {
  id: string;
  displayName: string;
}

const CHAT_MODEL_PATTERNS: Record<string, RegExp[]> = {
  OPENAI: [/^gpt-/, /^o[0-9]/, /^chatgpt-/],
  ANTHROPIC: [/^claude-/],
  GOOGLE: [/^gemini-/],
};

const EXCLUDE_PATTERNS = [
  /realtime/i,
  /audio/i,
  /whisper/i,
  /tts/i,
  /dall-e/i,
  /embedding/i,
  /moderation/i,
  /babbage/i,
  /davinci/i,
  /-search-/,
  /-instruct$/,
  /-vision$/,
];

function isChatModel(modelId: string, provider: string): boolean {
  const patterns = CHAT_MODEL_PATTERNS[provider];
  if (!patterns) return false;

  if (!patterns.some(p => p.test(modelId))) return false;
  if (EXCLUDE_PATTERNS.some(p => p.test(modelId))) return false;
  if (DEPRECATED_MODELS.includes(modelId)) return false;

  return true;
}

function estimatePricing(modelId: string, provider: string): { input: number; output: number } {
  if (provider === "OPENAI") {
    if (/nano/.test(modelId)) return { input: 10, output: 40 };
    if (/o[0-9]+-pro/.test(modelId)) return { input: 2000, output: 8000 };
    if (/o[0-9]+-mini/.test(modelId)) return { input: 110, output: 440 };
    if (/o[0-9]+/.test(modelId)) return { input: 200, output: 800 };
    if (/4o-mini/.test(modelId)) return { input: 15, output: 60 };
    if (/mini/.test(modelId)) return { input: 40, output: 160 };
    return { input: 250, output: 1000 };
  }

  if (provider === "ANTHROPIC") {
    if (/haiku/i.test(modelId)) return { input: 100, output: 500 };
    if (/opus/i.test(modelId)) return { input: 500, output: 2500 };
    return { input: 300, output: 1500 };
  }

  if (provider === "GOOGLE") {
    if (/lite/.test(modelId)) return { input: 10, output: 40 };
    if (/pro/.test(modelId)) return { input: 125, output: 1000 };
    return { input: 15, output: 60 };
  }

  return { input: 100, output: 400 };
}

function formatDisplayName(modelId: string, provider: string): string {
  if (provider === "OPENAI") {
    return modelId
      .replace(/^gpt-/, "GPT-")
      .replace(/^o(\d)/, "o$1")
      .replace(/-mini$/, " Mini")
      .replace(/-nano$/, " Nano");
  }
  if (provider === "ANTHROPIC") {
    const parts = modelId.split("-");
    const datePart = parts.find(p => /^\d{8}$/.test(p));
    const nameWithoutDate = parts.filter(p => !/^\d{8}$/.test(p)).join(" ");
    return nameWithoutDate
      .replace(/^claude /i, "Claude ")
      .split(" ")
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  if (provider === "GOOGLE") {
    return modelId
      .replace(/^gemini-/, "Gemini ")
      .replace(/-/g, " ")
      .split(" ")
      .map(w => /^\d/.test(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return modelId;
}

async function fetchOpenAIModels(apiKey: string, label?: string): Promise<DiscoveredModel[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const hint = res.status === 401 ? " (invalid or revoked OpenAI API key — update via Providers page)" : "";
      console.error(`[model-sync] OpenAI models API returned ${res.status}${label ? ` for ${label}` : ""}${hint}`);
      return [];
    }
    const data = await res.json() as { data: Array<{ id: string }> };
    const chatModels = data.data.filter(m => isChatModel(m.id, "OPENAI"));
    return chatModels
      .map(m => ({ id: m.id, displayName: formatDisplayName(m.id, "OPENAI") }));
  } catch (e: any) {
    console.error("[model-sync] Failed to fetch OpenAI models:", e.message);
    return [];
  }
}

async function fetchAnthropicModels(apiKey: string): Promise<DiscoveredModel[]> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) return [];
    const data = await res.json() as { data: Array<{ id: string; display_name?: string }> };
    return data.data
      .filter(m => isChatModel(m.id, "ANTHROPIC"))
      .map(m => ({
        id: m.id,
        displayName: m.display_name || formatDisplayName(m.id, "ANTHROPIC"),
      }));
  } catch (e: any) {
    console.error("[model-sync] Failed to fetch Anthropic models:", e.message);
    return [];
  }
}

async function fetchGoogleModels(apiKey: string): Promise<DiscoveredModel[]> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`
    );
    if (!res.ok) return [];
    const data = await res.json() as { models: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
    return data.models
      .filter(m => m.supportedGenerationMethods?.includes("generateContent"))
      .map(m => {
        const id = m.name.replace("models/", "");
        return { id, displayName: m.displayName || formatDisplayName(id, "GOOGLE") };
      })
      .filter(m => isChatModel(m.id, "GOOGLE"));
  } catch (e: any) {
    console.error("[model-sync] Failed to fetch Google models:", e.message);
    return [];
  }
}

export async function runModelSync(): Promise<void> {
  const orgs = await storage.getAllOrganizations();
  const discoveredByProvider: Record<string, DiscoveredModel[]> = {};
  const triedProviders = new Set<string>();
  const availableKeys: string[] = [];

  for (const org of orgs) {
    const connections = await storage.getProviderConnectionsByOrg(org.id);
    for (const conn of connections) {
      if (conn.status !== "ACTIVE") continue;

      try {
        const apiKey = decryptProviderKey(
          conn.adminApiKeyEncrypted,
          conn.adminApiKeyIv,
          conn.adminApiKeyTag
        );

        if (!triedProviders.has(conn.provider)) {
          triedProviders.add(conn.provider);
          let models: DiscoveredModel[] = [];
          if (conn.provider === "OPENAI") models = await fetchOpenAIModels(apiKey, conn.displayName);
          else if (conn.provider === "ANTHROPIC") models = await fetchAnthropicModels(apiKey);
          else if (conn.provider === "GOOGLE") models = await fetchGoogleModels(apiKey);

          console.log(`[model-sync] ${conn.provider}: discovered ${models.length} chat models`);
          if (models.length > 0) {
            discoveredByProvider[conn.provider] = models;
          }
        }

        if (!availableKeys.includes(apiKey)) {
          availableKeys.push(apiKey);
        }
      } catch (e: any) {
        console.error(`[model-sync] Error with ${conn.provider} connection:`, e.message);
      }
    }
  }

  const allProviders: Array<{ name: "OPENAI" | "ANTHROPIC" | "GOOGLE"; fetch: (k: string) => Promise<DiscoveredModel[]> }> = [
    { name: "OPENAI", fetch: fetchOpenAIModels },
    { name: "ANTHROPIC", fetch: fetchAnthropicModels },
    { name: "GOOGLE", fetch: fetchGoogleModels },
  ];

  for (const { name, fetch } of allProviders) {
    if (discoveredByProvider[name]) continue;
    for (const key of availableKeys) {
      const models = await fetch(key);
      if (models.length > 0) {
        console.log(`[model-sync] ${name}: discovered ${models.length} chat models (cross-key)`);
        discoveredByProvider[name] = models;
        break;
      }
    }
  }

  if (Object.keys(discoveredByProvider).length === 0) {
    console.log("[model-sync] No models discovered from any provider");
    return;
  }

  const existingPricing = await db.select().from(modelPricing);
  const existingModelIds = new Set(existingPricing.map(p => p.modelId));
  let added = 0;
  let removed = 0;

  for (const [provider, models] of Object.entries(discoveredByProvider)) {
    const discoveredIds = new Set(models.map(m => m.id));

    for (const model of models) {
      if (!existingModelIds.has(model.id)) {
        const pricing = estimatePricing(model.id, provider);
        try {
          await db.insert(modelPricing).values({
            provider: provider as "OPENAI" | "ANTHROPIC" | "GOOGLE" | "AZURE_OPENAI",
            modelId: model.id,
            displayName: model.displayName,
            inputPricePerMTok: pricing.input,
            outputPricePerMTok: pricing.output,
          }).onConflictDoNothing();
          console.log(`[model-sync] Added ${provider} model: ${model.id} (est. pricing: ${pricing.input}/${pricing.output})`);
          added++;
        } catch (e: any) {
          console.error(`[model-sync] Failed to add model ${model.id}:`, e.message);
        }
      }
    }

    const providerExisting = existingPricing.filter(p => p.provider === provider);
    if (models.length >= 3) {
      for (const existing of providerExisting) {
        if (!discoveredIds.has(existing.modelId)) {
          try {
            await db.delete(modelPricing)
              .where(and(eq(modelPricing.id, existing.id)));
            console.log(`[model-sync] Removed deprecated ${provider} model: ${existing.modelId}`);
            removed++;
          } catch (e: any) {
            console.error(`[model-sync] Failed to remove model ${existing.modelId}:`, e.message);
          }
        }
      }
    } else {
      console.log(`[model-sync] ${provider}: skipping removal (only ${models.length} models discovered, may be incomplete)`);
    }
  }

  if (added > 0 || removed > 0) {
    console.log(`[model-sync] Sync complete: ${added} added, ${removed} removed`);
  } else {
    console.log(`[model-sync] Sync complete: no changes`);
  }
}
