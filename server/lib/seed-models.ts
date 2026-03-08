import { db } from "../db";
import { modelPricing } from "@shared/schema";
import { eq, notInArray } from "drizzle-orm";

const DEFAULT_MODELS = [
  { provider: "OPENAI" as const, modelId: "gpt-4o", displayName: "GPT-4o", inputPricePerMTok: 250, outputPricePerMTok: 1000 },
  { provider: "OPENAI" as const, modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: "OPENAI" as const, modelId: "gpt-4.1-nano", displayName: "GPT-4.1 Nano", inputPricePerMTok: 10, outputPricePerMTok: 40 },
  { provider: "OPENAI" as const, modelId: "gpt-4.1-mini", displayName: "GPT-4.1 Mini", inputPricePerMTok: 40, outputPricePerMTok: 160 },
  { provider: "OPENAI" as const, modelId: "o3-mini", displayName: "o3 Mini", inputPricePerMTok: 110, outputPricePerMTok: 440 },
  { provider: "ANTHROPIC" as const, modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", inputPricePerMTok: 300, outputPricePerMTok: 1500 },
  { provider: "ANTHROPIC" as const, modelId: "claude-3-7-sonnet-20250219", displayName: "Claude 3.7 Sonnet", inputPricePerMTok: 300, outputPricePerMTok: 1500 },
  { provider: "ANTHROPIC" as const, modelId: "claude-haiku-4-20250514", displayName: "Claude Haiku 4", inputPricePerMTok: 80, outputPricePerMTok: 400 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", inputPricePerMTok: 125, outputPricePerMTok: 1000 },
];

const DEPRECATED_MODELS = [
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "o1",
  "o1-mini",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-opus-20240229",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
  "gemini-2.0-flash",
  "gemini-2.5-flash-preview-05-20",
  "gemini-2.5-pro-preview-06-05",
];

const KNOWN_CORRECT_PRICES: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 250, output: 1000 },
  "gpt-4o-mini": { input: 15, output: 60 },
  "gpt-4.1-nano": { input: 10, output: 40 },
  "gpt-4.1-mini": { input: 40, output: 160 },
  "o3-mini": { input: 110, output: 440 },
  "claude-sonnet-4-20250514": { input: 300, output: 1500 },
  "claude-3-7-sonnet-20250219": { input: 300, output: 1500 },
  "claude-haiku-4-20250514": { input: 80, output: 400 },
  "gemini-2.5-pro": { input: 125, output: 1000 },
  "gemini-2.5-flash": { input: 15, output: 60 },
};

async function correctInflatedPrices(): Promise<void> {
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
  const result = await db.delete(modelPricing)
    .where(notInArray(modelPricing.modelId, DEFAULT_MODELS.map(m => m.modelId)));
  console.log(`[seed] Cleaned up deprecated model entries`);
}

export async function seedModelPricing(): Promise<void> {
  try {
    const existing = await db.select({ id: modelPricing.id }).from(modelPricing).limit(1);
    if (existing.length > 0) {
      await correctInflatedPrices();
      await removeDeprecatedModels();
      for (const model of DEFAULT_MODELS) {
        const exists = await db.select({ id: modelPricing.id }).from(modelPricing)
          .where(eq(modelPricing.modelId, model.modelId)).limit(1);
        if (exists.length === 0) {
          await db.insert(modelPricing).values(model).onConflictDoNothing();
          console.log(`[seed] Added model: ${model.modelId}`);
        }
      }
      return;
    }

    await db.insert(modelPricing).values(DEFAULT_MODELS).onConflictDoNothing();
    console.log(`[seed] Inserted ${DEFAULT_MODELS.length} model pricing entries`);
  } catch (err) {
    console.error("[seed] Failed to seed model pricing:", err);
  }
}
