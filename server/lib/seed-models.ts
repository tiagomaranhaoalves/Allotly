import { db } from "../db";
import { modelPricing } from "@shared/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_MODELS = [
  // OpenAI — GPT series
  { provider: "OPENAI" as const, modelId: "gpt-5.4", displayName: "GPT-5.4", inputPricePerMTok: 250, outputPricePerMTok: 1000 },
  { provider: "OPENAI" as const, modelId: "gpt-4.1", displayName: "GPT-4.1", inputPricePerMTok: 200, outputPricePerMTok: 800 },
  { provider: "OPENAI" as const, modelId: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", inputPricePerMTok: 40, outputPricePerMTok: 160 },
  { provider: "OPENAI" as const, modelId: "gpt-4.1-nano", displayName: "GPT-4.1 Nano", inputPricePerMTok: 10, outputPricePerMTok: 40 },
  { provider: "OPENAI" as const, modelId: "gpt-4o", displayName: "GPT-4o", inputPricePerMTok: 250, outputPricePerMTok: 1000 },
  { provider: "OPENAI" as const, modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  // OpenAI — o-series reasoning
  { provider: "OPENAI" as const, modelId: "o3", displayName: "o3", inputPricePerMTok: 200, outputPricePerMTok: 800 },
  { provider: "OPENAI" as const, modelId: "o3-mini", displayName: "o3 Mini", inputPricePerMTok: 110, outputPricePerMTok: 440 },
  { provider: "OPENAI" as const, modelId: "o4-mini", displayName: "o4 Mini", inputPricePerMTok: 110, outputPricePerMTok: 440 },

  // Anthropic — Claude 4.6 series (latest)
  { provider: "ANTHROPIC" as const, modelId: "claude-opus-4-6", displayName: "Claude Opus 4.6", inputPricePerMTok: 500, outputPricePerMTok: 2500 },
  { provider: "ANTHROPIC" as const, modelId: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", inputPricePerMTok: 300, outputPricePerMTok: 1500 },
  // Anthropic — Claude 4.5 series
  { provider: "ANTHROPIC" as const, modelId: "claude-opus-4-5", displayName: "Claude Opus 4.5", inputPricePerMTok: 500, outputPricePerMTok: 2500 },
  { provider: "ANTHROPIC" as const, modelId: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5", inputPricePerMTok: 300, outputPricePerMTok: 1500 },
  { provider: "ANTHROPIC" as const, modelId: "claude-haiku-4-5", displayName: "Claude Haiku 4.5", inputPricePerMTok: 100, outputPricePerMTok: 500 },
  // Anthropic — Claude 4.x legacy (still active)
  { provider: "ANTHROPIC" as const, modelId: "claude-opus-4-1", displayName: "Claude Opus 4.1", inputPricePerMTok: 1500, outputPricePerMTok: 7500 },
  { provider: "ANTHROPIC" as const, modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", inputPricePerMTok: 300, outputPricePerMTok: 1500 },

  // Google — Gemini 3 series (latest)
  { provider: "GOOGLE" as const, modelId: "gemini-3.1-pro-preview", displayName: "Gemini 3.1 Pro Preview", inputPricePerMTok: 125, outputPricePerMTok: 1000 },
  { provider: "GOOGLE" as const, modelId: "gemini-3.1-flash-lite", displayName: "Gemini 3.1 Flash Lite", inputPricePerMTok: 25, outputPricePerMTok: 150 },
  { provider: "GOOGLE" as const, modelId: "gemini-3-flash-preview", displayName: "Gemini 3 Flash Preview", inputPricePerMTok: 50, outputPricePerMTok: 400 },
  // Google — Gemini 2.5 series (stable)
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputPricePerMTok: 125, outputPricePerMTok: 1000 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash Lite", inputPricePerMTok: 10, outputPricePerMTok: 40 },
];

export const DEPRECATED_MODELS = [
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "o1",
  "o1-mini",
  "o1-pro",
  "o1-pro-2025-03-19",
  "o3-pro",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-3-opus-20240229",
  "claude-haiku-4-20250514",
  "claude-opus-4",
  "gemini-1.5-flash",
  "gemini-1.5-flash-001",
  "gemini-1.5-flash-002",
  "gemini-1.5-pro",
  "gemini-1.5-pro-001",
  "gemini-1.5-pro-002",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-pro-preview-06-05",
  "gemini-3-pro-preview",
];

const KNOWN_CORRECT_PRICES: Record<string, { input: number; output: number }> = {};
for (const m of DEFAULT_MODELS) {
  KNOWN_CORRECT_PRICES[m.modelId] = { input: m.inputPricePerMTok, output: m.outputPricePerMTok };
}

async function correctPrices(): Promise<void> {
  const allPricing = await db.select().from(modelPricing);
  let corrected = 0;

  for (const model of allPricing) {
    const known = KNOWN_CORRECT_PRICES[model.modelId];
    if (!known) continue;

    if (model.inputPricePerMTok !== known.input || model.outputPricePerMTok !== known.output) {
      await db.update(modelPricing)
        .set({
          inputPricePerMTok: known.input,
          outputPricePerMTok: known.output,
          updatedAt: new Date(),
        })
        .where(eq(modelPricing.id, model.id));
      corrected++;
    }
  }

  if (corrected > 0) {
    console.log(`[seed] Corrected pricing for ${corrected} models`);
  }
}

async function removeDeprecatedModels(): Promise<void> {
  if (DEPRECATED_MODELS.length === 0) return;
  let removed = 0;
  for (const modelId of DEPRECATED_MODELS) {
    const existing = await db.select({ id: modelPricing.id }).from(modelPricing)
      .where(eq(modelPricing.modelId, modelId)).limit(1);
    if (existing.length > 0) {
      await db.delete(modelPricing).where(eq(modelPricing.modelId, modelId));
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`[seed] Removed ${removed} deprecated model entries`);
  }
}

export async function seedModelPricing(): Promise<void> {
  try {
    const existing = await db.select({ id: modelPricing.id }).from(modelPricing).limit(1);
    if (existing.length > 0) {
      await correctPrices();
      await removeDeprecatedModels();
      let added = 0;
      for (const model of DEFAULT_MODELS) {
        const exists = await db.select({ id: modelPricing.id }).from(modelPricing)
          .where(eq(modelPricing.modelId, model.modelId)).limit(1);
        if (exists.length === 0) {
          await db.insert(modelPricing).values(model).onConflictDoNothing();
          added++;
        }
      }
      if (added > 0) {
        console.log(`[seed] Added ${added} new models`);
      }
      return;
    }

    await db.insert(modelPricing).values(DEFAULT_MODELS).onConflictDoNothing();
    console.log(`[seed] Inserted ${DEFAULT_MODELS.length} model pricing entries`);
  } catch (err) {
    console.error("[seed] Failed to seed model pricing:", err);
  }
}
