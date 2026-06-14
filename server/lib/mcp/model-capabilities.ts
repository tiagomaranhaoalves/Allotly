import type { ModelPricing } from "@shared/schema";

/**
 * Centralized, data-driven model capability classification for the MCP cost
 * tools. Selection/ranking code never hard-codes name regexes inline — it
 * calls the helpers here, so capability rules live in ONE extensible place.
 *
 * A model absent from {@link CAPABILITY_MAP} still gets a sensible
 * price-derived score (see {@link classifyCapability}), so a brand-new model
 * classifies reasonably without a code edit.
 */

export type CapabilityLabel = "frontier" | "advanced" | "balanced" | "fast";

interface CapabilityRule {
  family: string;
  match: RegExp;
  score: number; // 0-100, higher = more capable
  label: CapabilityLabel;
}

/**
 * Ordered most-capable / most-specific first; the FIRST matching row wins.
 * Extend by adding a row — no ranking code changes. Scores are deliberately
 * spread so the deterministic tiers stay distinct.
 */
const CAPABILITY_MAP: CapabilityRule[] = [
  { family: "claude-opus", match: /opus/i, score: 96, label: "frontier" },
  { family: "openai-o-series", match: /\bo[1-9]\b|^o[1-9][-_]|gpt-5/i, score: 93, label: "frontier" },
  { family: "claude-sonnet", match: /sonnet/i, score: 82, label: "advanced" },
  { family: "gpt-4.1", match: /gpt-4\.1(?!-(?:mini|nano))/i, score: 82, label: "advanced" },
  { family: "gemini-pro", match: /gemini[-\w.]*pro/i, score: 80, label: "advanced" },
  { family: "gpt-4o", match: /gpt-4o(?!-mini)/i, score: 76, label: "advanced" },
  { family: "claude-haiku", match: /haiku/i, score: 64, label: "balanced" },
  { family: "gemini-flash", match: /gemini[-\w.]*flash/i, score: 60, label: "balanced" },
  { family: "small", match: /mini|nano|lite|small|flash|tiny/i, score: 56, label: "fast" },
];

/**
 * Vision support. Kept byte-identical to estimate_cost's historical
 * VISION_CAPABLE regex so existing behavior/tests are unchanged when both
 * tools share this single source of truth.
 */
const VISION_CAPABLE_RE = /gpt-4o|claude-(sonnet|haiku|opus)|gemini/i;
export function supportsVision(modelId: string): boolean {
  return VISION_CAPABLE_RE.test(modelId);
}

/**
 * Tool/function-calling support. Covers the modern chat families; equivalent
 * to recommend_model's prior TOOL_CAPABLE regex.
 */
const TOOL_CAPABLE_RE = /gpt|o[1-9]|claude|gemini/i;
export function supportsTools(modelId: string): boolean {
  return TOOL_CAPABLE_RE.test(modelId);
}

/**
 * Blended per-MTok price used as the price signal for cheap/premium ordering
 * and the price-derived capability fallback. Input + output (both integer
 * USD-cents per million tokens); output dominates real spend but input still
 * differentiates near-identical-output models.
 */
export function blendedPricePerMTok(
  pricing: Pick<ModelPricing, "inputPricePerMTok" | "outputPricePerMTok">,
): number {
  return pricing.inputPricePerMTok + pricing.outputPricePerMTok;
}

export interface PriceContext {
  minBlended: number;
  maxBlended: number;
}

export interface Capability {
  score: number;
  label: CapabilityLabel;
  source: "map" | "price";
}

function priceDerivedScore(blended: number, ctx: PriceContext): number {
  const lo = Math.log10(Math.max(1, ctx.minBlended));
  const hi = Math.log10(Math.max(1, ctx.maxBlended));
  const v = Math.log10(Math.max(1, blended));
  if (hi <= lo) return 70; // single-priced candidate set: neutral mid score
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return Math.round(40 + t * 55); // spread across 40..95
}

function labelForScore(score: number): CapabilityLabel {
  if (score >= 88) return "frontier";
  if (score >= 72) return "advanced";
  if (score >= 60) return "balanced";
  return "fast";
}

/**
 * Classify a model's capability. Known families come from {@link
 * CAPABILITY_MAP}; unknown models fall back to a log-normalized price score
 * within the candidate set so they still order sensibly.
 */
export function classifyCapability(modelId: string, blended: number, ctx: PriceContext): Capability {
  for (const rule of CAPABILITY_MAP) {
    if (rule.match.test(modelId)) {
      return { score: rule.score, label: rule.label, source: "map" };
    }
  }
  const score = priceDerivedScore(blended, ctx);
  return { score, label: labelForScore(score), source: "price" };
}

/**
 * Deterministic latency tier (0 fastest .. 3 slowest) used when a model has no
 * observed latency history. Smaller/cheaper models tend to respond fastest;
 * frontier/reasoning models slowest.
 */
export function deterministicLatencyTier(label: CapabilityLabel): number {
  switch (label) {
    case "fast":
      return 0;
    case "balanced":
      return 1;
    case "advanced":
      return 2;
    case "frontier":
      return 3;
  }
}
