import type { ProviderAdapter } from "./types";
import { openaiAdapter } from "./openai";
import { anthropicAdapter } from "./anthropic";
import { googleAdapter } from "./google";

const adapters: Record<string, ProviderAdapter> = {
  OPENAI: openaiAdapter,
  ANTHROPIC: anthropicAdapter,
  GOOGLE: googleAdapter,
};

export function getProviderAdapter(provider: string): ProviderAdapter | undefined {
  return adapters[provider];
}

export type { ProviderAdapter, ValidationResult } from "./types";
