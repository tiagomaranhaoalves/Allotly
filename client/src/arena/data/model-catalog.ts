import type { ModelId, Provider } from "../types";

export type Tier = "cheap" | "balanced" | "premium" | "topend";

export interface CatalogEntry {
  id: ModelId;
  displayName: string;
  provider: Provider;
  inputPerM: number;
  outputPerM: number;
  tier: Tier;
  rationale: string;
  hasCachedContent: boolean;
}

export const TIER_INTROS: Record<Tier, { label: string; subtitle: string }> = {
  cheap: { label: "Cheap & fast", subtitle: "The safe defaults — what most chat workloads should use." },
  balanced: { label: "Balanced", subtitle: "More capable than cheap-tier; still affordable enough to leave on." },
  premium: { label: "Premium reasoning", subtitle: "Better at long instructions and structured output. Pay the premium when quality matters." },
  topend: { label: "Top-end", subtitle: "Reserve for genuinely hard tasks. Otherwise it's money lit on fire." },
};

export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: "gpt-4o-mini",
    displayName: "GPT-4o Mini",
    provider: "OPENAI",
    inputPerM: 0.15,
    outputPerM: 0.6,
    tier: "cheap",
    rationale:
      "Cheap, fast, surprisingly capable for short-form text. Pick this as your default for drafts, summaries, and chat.",
    hasCachedContent: true,
  },
  {
    id: "gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    provider: "GOOGLE",
    inputPerM: 0.15,
    outputPerM: 0.6,
    tier: "cheap",
    rationale:
      "Same price as Mini, often faster, strong on multilingual and image-heavy prompts. Allow it alongside Mini.",
    hasCachedContent: true,
  },
  {
    id: "claude-haiku-4-5",
    displayName: "Claude Haiku 4.5",
    provider: "ANTHROPIC",
    inputPerM: 1.0,
    outputPerM: 5.0,
    tier: "balanced",
    rationale:
      "Fast Anthropic at ~$1/1M in. Better instruction-following than Mini for ~7× the cost. The 'good middle' choice.",
    hasCachedContent: true,
  },
  {
    id: "o4-mini",
    displayName: "o4 Mini",
    provider: "OPENAI",
    inputPerM: 1.1,
    outputPerM: 4.4,
    tier: "premium",
    rationale:
      "OpenAI's mid-tier reasoning model. Slower than Mini, much smarter on multi-step problems. Allow only if your team writes those prompts.",
    hasCachedContent: true,
  },
  {
    id: "gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    provider: "GOOGLE",
    inputPerM: 1.25,
    outputPerM: 10.0,
    tier: "premium",
    rationale:
      "Google's flagship reasoning model. Strong on long-context and structured tasks. Cheaper than GPT-4o, smarter than Flash.",
    hasCachedContent: true,
  },
  {
    id: "gpt-4o",
    displayName: "GPT-4o",
    provider: "OPENAI",
    inputPerM: 2.5,
    outputPerM: 10.0,
    tier: "premium",
    rationale:
      "Premium tier. Most teams don't need it for chat workloads — Mini handles 80% of the same prompts at 1/16th the cost.",
    hasCachedContent: true,
  },
  {
    id: "claude-sonnet-4-20250514",
    displayName: "Claude Sonnet 4",
    provider: "ANTHROPIC",
    inputPerM: 3.0,
    outputPerM: 15.0,
    tier: "premium",
    rationale:
      "20× the price of Mini but markedly better at reasoning, long instructions, structured output. Allow when quality matters more than cost.",
    hasCachedContent: true,
  },
  {
    id: "claude-opus-4-7",
    displayName: "Claude Opus 4.7",
    provider: "ANTHROPIC",
    inputPerM: 5.0,
    outputPerM: 25.0,
    tier: "topend",
    rationale:
      "Top-end reasoning. ~30× Mini. Reserve for genuinely hard tasks; otherwise it's money lit on fire.",
    hasCachedContent: true,
  },
];

export const CATALOG_BY_ID: Record<ModelId, CatalogEntry> = MODEL_CATALOG.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<ModelId, CatalogEntry>,
);

export function inferProvider(id: ModelId): Provider {
  const lower = id.toLowerCase();
  if (lower.startsWith("claude") || lower.startsWith("anthropic")) return "ANTHROPIC";
  if (lower.startsWith("gemini") || lower.startsWith("google") || lower.startsWith("vertex")) return "GOOGLE";
  return "OPENAI";
}

export function modelMeta(id: ModelId) {
  const c = CATALOG_BY_ID[id];
  if (c) return { id: c.id, provider: c.provider, displayName: c.displayName };
  return { id, provider: inferProvider(id), displayName: id };
}

export const DEFAULT_ALLOWED: ModelId[] = MODEL_CATALOG
  .filter((m) => m.hasCachedContent)
  .map((m) => m.id);

// Default lineup = one cheap-cached model per provider, so the first race
// always lands the multi-provider story.
export const DEFAULT_LINEUP: [ModelId, ModelId, ModelId] = [
  "gpt-4o-mini",
  "gemini-2.5-flash",
  "claude-sonnet-4-20250514",
];

export const TIER_ORDER: Tier[] = ["cheap", "balanced", "premium", "topend"];

export function groupByTier(entries: CatalogEntry[]) {
  const out = new Map<Tier, CatalogEntry[]>();
  for (const t of TIER_ORDER) out.set(t, []);
  for (const e of entries) out.get(e.tier)!.push(e);
  out.forEach((list: CatalogEntry[]) => {
    list.sort((a, b) => a.inputPerM - b.inputPerM);
  });
  return out;
}
