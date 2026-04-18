import type { CachedVariant, ModelId, SecretKeeperBattleExchange } from "../types";

export const CACHED_COST_MULTIPLIER = 40;

export interface StreamController {
  cancel: () => void;
}

export function scaledCostUSD(baseCostUSD: number): number {
  return baseCostUSD * CACHED_COST_MULTIPLIER;
}

export function streamCachedVariant(
  variant: CachedVariant,
  onDelta: (delta: string) => void,
  onDone: (args: { totalText: string; costUSD: number; tokens: number; durationMs: number }) => void,
  speed: number = 1.0,
): StreamController {
  let cancelled = false;
  let accumulated = "";
  const start = Date.now();
  const effectiveCost = scaledCostUSD(variant.costUSD);

  async function run() {
    for (const chunk of variant.chunks) {
      if (cancelled) return;
      await wait(Math.max(10, chunk.delayMs / speed));
      if (cancelled) return;
      accumulated += chunk.delta;
      onDelta(chunk.delta);
    }
    if (!cancelled) {
      onDone({
        totalText: accumulated,
        costUSD: effectiveCost,
        tokens: variant.totalTokens,
        durationMs: Date.now() - start,
      });
    }
  }
  void run();
  return { cancel: () => { cancelled = true; } };
}

export function streamCachedBattleExchange(
  exchange: SecretKeeperBattleExchange,
  onDelta: (delta: string) => void,
  onDone: (args: { totalText: string; costUSD: number; model: ModelId; role: "attacker" | "defender" }) => void,
  speed: number = 1.0,
): StreamController {
  let cancelled = false;
  let accumulated = "";
  const effectiveCost = scaledCostUSD(exchange.costUSD);

  async function run() {
    for (const chunk of exchange.chunks) {
      if (cancelled) return;
      await wait(Math.max(10, chunk.delayMs / speed));
      if (cancelled) return;
      accumulated += chunk.delta;
      onDelta(chunk.delta);
    }
    if (!cancelled) {
      onDone({
        totalText: accumulated,
        costUSD: effectiveCost,
        model: exchange.model,
        role: exchange.role,
      });
    }
  }
  void run();
  return { cancel: () => { cancelled = true; } };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
