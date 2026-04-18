import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import type { ModelMeta, ModelId } from "../types";

interface Props {
  models: ModelMeta[];
  costs: Record<ModelId, number>;
  tokens: Record<ModelId, number>;
  bestPick: ModelId;
  wouldPayMostPick: ModelId;
  teachingNote: string;
  onPlayAgain: () => void;
  onSwitchMode: () => void;
  onEndSession: () => void;
}

export function RoundResults({
  models,
  costs,
  tokens,
  bestPick,
  wouldPayMostPick,
  teachingNote,
  onPlayAgain,
  onSwitchMode,
  onEndSession,
}: Props) {
  const mostExpensive = models.reduce<ModelId>((acc, m) => {
    if (!acc) return m.id;
    return (costs[m.id] ?? 0) > (costs[acc] ?? 0) ? m.id : acc;
  }, models[0].id);
  const cheapest = models.reduce<ModelId>((acc, m) => {
    if (!acc) return m.id;
    return (costs[m.id] ?? Infinity) < (costs[acc] ?? Infinity) ? m.id : acc;
  }, models[0].id);

  const gapInsight = bestPick !== wouldPayMostPick;

  const ratio = costs[mostExpensive] && costs[cheapest]
    ? (costs[mostExpensive] / Math.max(0.00001, costs[cheapest])).toFixed(1)
    : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
      <h3 className="text-xl font-semibold text-white">Round results</h3>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {models.map((m) => (
          <div
            key={m.id}
            className={`rounded-xl border p-4 ${
              m.id === bestPick
                ? "border-emerald-500/40 bg-emerald-500/5"
                : m.id === wouldPayMostPick
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-white/10 bg-white/[0.03]"
            }`}
          >
            <ProviderBadge provider={m.provider} className="text-white" />
            <div className="text-xs text-white/50 mt-0.5">{m.displayName}</div>
            <div className="mt-3 text-2xl font-semibold text-white tabular-nums">
              ${costs[m.id]?.toFixed(5) ?? "—"}
            </div>
            <div className="text-[11px] text-white/50">{tokens[m.id] ?? 0} tokens</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {m.id === bestPick && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                  Your best
                </span>
              )}
              {m.id === wouldPayMostPick && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300">
                  Paid most
                </span>
              )}
              {m.id === mostExpensive && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-rose-500/10 text-rose-200">
                  Actually most expensive
                </span>
              )}
              {m.id === cheapest && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-indigo-500/10 text-indigo-200">
                  Actually cheapest
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {gapInsight && (
        <div className="mt-5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
          <strong>Interesting:</strong> You picked a different model as &ldquo;best&rdquo; than the one
          you&rsquo;d pay the most for. That gap — between perceived quality and perceived value —
          is the entire product case for multi-provider routing.
        </div>
      )}

      {ratio && Number(ratio) > 2 && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          The most expensive response cost <strong>{ratio}×</strong> the cheapest on this round.
        </div>
      )}

      <p className="mt-4 text-sm text-white/70">{teachingNote}</p>

      <div className="mt-6 flex flex-col sm:flex-row gap-2">
        <Button
          className="bg-indigo-500 hover:bg-indigo-400 text-white"
          onClick={onPlayAgain}
          data-testid="button-play-again"
        >
          Play again
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-white hover:bg-white/5"
          onClick={onSwitchMode}
          data-testid="button-switch-mode-results"
        >
          Switch mode
        </Button>
        <Button
          variant="ghost"
          className="text-white/70 hover:text-white"
          onClick={onEndSession}
          data-testid="button-end-session"
        >
          End session
        </Button>
      </div>
    </div>
  );
}
