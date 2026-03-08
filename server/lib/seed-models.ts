import { db } from "../db";
import { modelPricing } from "@shared/schema";
import { sql } from "drizzle-orm";

const DEFAULT_MODELS = [
  { provider: "OPENAI" as const, modelId: "gpt-4o", displayName: "GPT-4o", inputPricePerMTok: 2500, outputPricePerMTok: 10000 },
  { provider: "OPENAI" as const, modelId: "gpt-4o-mini", displayName: "GPT-4o Mini", inputPricePerMTok: 150, outputPricePerMTok: 600 },
  { provider: "OPENAI" as const, modelId: "gpt-4-turbo", displayName: "GPT-4 Turbo", inputPricePerMTok: 10000, outputPricePerMTok: 30000 },
  { provider: "OPENAI" as const, modelId: "gpt-3.5-turbo", displayName: "GPT-3.5 Turbo", inputPricePerMTok: 500, outputPricePerMTok: 1500 },
  { provider: "OPENAI" as const, modelId: "o1", displayName: "o1", inputPricePerMTok: 15000, outputPricePerMTok: 60000 },
  { provider: "OPENAI" as const, modelId: "o1-mini", displayName: "o1 Mini", inputPricePerMTok: 3000, outputPricePerMTok: 12000 },
  { provider: "OPENAI" as const, modelId: "o3-mini", displayName: "o3 Mini", inputPricePerMTok: 1100, outputPricePerMTok: 4400 },
  { provider: "ANTHROPIC" as const, modelId: "claude-3-5-sonnet-20241022", displayName: "Claude 3.5 Sonnet", inputPricePerMTok: 3000, outputPricePerMTok: 15000 },
  { provider: "ANTHROPIC" as const, modelId: "claude-3-5-haiku-20241022", displayName: "Claude 3.5 Haiku", inputPricePerMTok: 800, outputPricePerMTok: 4000 },
  { provider: "ANTHROPIC" as const, modelId: "claude-3-opus-20240229", displayName: "Claude 3 Opus", inputPricePerMTok: 15000, outputPricePerMTok: 75000 },
  { provider: "ANTHROPIC" as const, modelId: "claude-sonnet-4-20250514", displayName: "Claude Sonnet 4", inputPricePerMTok: 3000, outputPricePerMTok: 15000 },
  { provider: "GOOGLE" as const, modelId: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", inputPricePerMTok: 1250, outputPricePerMTok: 5000 },
  { provider: "GOOGLE" as const, modelId: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", inputPricePerMTok: 75, outputPricePerMTok: 300 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", inputPricePerMTok: 75, outputPricePerMTok: 300 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-pro-preview-06-05", displayName: "Gemini 2.5 Pro", inputPricePerMTok: 1250, outputPricePerMTok: 10000 },
  { provider: "GOOGLE" as const, modelId: "gemini-2.5-flash-preview-05-20", displayName: "Gemini 2.5 Flash", inputPricePerMTok: 150, outputPricePerMTok: 600 },
];

export async function seedModelPricing(): Promise<void> {
  try {
    const existing = await db.select({ id: modelPricing.id }).from(modelPricing).limit(1);
    if (existing.length > 0) return;

    await db.insert(modelPricing).values(DEFAULT_MODELS).onConflictDoNothing();
    console.log(`[seed] Inserted ${DEFAULT_MODELS.length} model pricing entries`);
  } catch (err) {
    console.error("[seed] Failed to seed model pricing:", err);
  }
}
