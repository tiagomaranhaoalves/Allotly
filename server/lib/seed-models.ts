import { db } from "../db";
import { modelPricing } from "@shared/schema";
import { eq, and } from "drizzle-orm";

const DEFAULT_MODELS = [
  { provider: "OPENAI" as const, modelId: "gpt-4o", displayName: "GPT-4o", inputPricePerMTok: 250, outputPricePerMTok: 1000 },
  { provider: "OPENAI" as const, modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: "OPENAI" as const, modelId: "o3-mini", displayName: "o3 Mini", inputPricePerMTok: 110, outputPricePerMTok: 440 },
  { provider: "ANTHROPIC" as const, modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", inputPricePerMTok: 300, outputPricePerMTok: 1500 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", inputPricePerMTok: 10, outputPricePerMTok: 40 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-flash-preview-05-20", displayName: "Gemini 2.5 Flash", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-pro-preview-06-05", displayName: "Gemini 2.5 Pro", inputPricePerMTok: 125, outputPricePerMTok: 1000 },
];

const KNOWN_CORRECT_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4-turbo": { input: 1000, output: 3000 },
  "gpt-3.5-turbo": { input: 50, output: 150 },
  "o1": { input: 1500, output: 6000 },
  "o1-mini": { input: 300, output: 1200 },
  "o3-mini": { input: 110, output: 440 },
  "claude-sonnet-4-20250514": { input: 300, output: 1500 },
  "claude-3-5-sonnet-20241022": { input: 300, output: 1500 },
  "claude-3-5-haiku-20241022": { input: 80, output: 400 },
  "claude-3-opus-20240229": { input: 1500, output: 7500 },
  "gemini-1.5-pro": { input: 125, output: 500 },
  "gemini-1.5-flash": { input: 8, output: 30 },
  "gemini-2.0-flash": { input: 10, output: 40 },
  "gemini-2.5-pro-preview-06-05": { input: 125, output: 1000 },
  "gemini-2.5-flash-preview-05-20": { input: 15, output: 60 },
};

async function correctInflatedPrices(): Promise<void> {
  const allPricing = await db.select().from(modelPricing);
  let corrected = 0;

  for (const model of allPricing) {
    const known = KNOWN_CORRECT_PRICES[model.modelId];
    if (!known) continue;

    if (model.inputPricePerMTok > known.input * 5 || model.outputPricePerMTok > known.output * 5) {
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
    console.log(`[seed] Corrected pricing for ${corrected} models (were 10x inflated)`);
  }
}

export async function seedModelPricing(): Promise<void> {
  try {
    const existing = await db.select({ id: modelPricing.id }).from(modelPricing).limit(1);
    if (existing.length > 0) {
      await correctInflatedPrices();
      return;
    }

    await db.insert(modelPricing).values(DEFAULT_MODELS).onConflictDoNothing();
    console.log(`[seed] Inserted ${DEFAULT_MODELS.length} model pricing entries`);
  } catch (err) {
    console.error("[seed] Failed to seed model pricing:", err);
  }
}
