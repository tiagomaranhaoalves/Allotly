import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { useArenaSession, formatUSD } from "../session";
import { DEFAULT_MODELS, type ModelId, type PersonaOrSecretKeeper } from "../types";

interface Props {
  onStartFresh: () => void;
  onSwitchToLive: () => void;
  onShare: () => void;
}

export function ExhaustionScreen({ onStartFresh, onSwitchToLive, onShare }: Props) {
  const { state, favouriteModel } = useArenaSession();

  const favModel = favouriteModel();
  const favModelMeta = useMemo(
    () => (favModel ? DEFAULT_MODELS.find((m) => m.id === favModel) ?? null : null),
    [favModel],
  );

  const totalRoundsPlayed = Object.values(state.roundsPlayed).reduce((a, b) => a + b, 0);
  const modesPlayed = state.modesPlayed.length;
  const avgCostPerRound = totalRoundsPlayed > 0 ? state.allocatedUSD / totalRoundsPlayed : 0;

  const headline = state.mode === "live"
    ? state.keyType === "TEAM"
      ? "You've hit your budget limit."
      : "Your voucher is spent."
    : "You've just experienced the full voucher lifecycle.";

  const body = state.mode === "live"
    ? state.keyType === "TEAM"
      ? "In a real Allotly Teams setup, your admin would see this instantly in the dashboard and could raise the cap — or the monthly budget would refresh at the next cycle. No overshoot. No surprise bills. Your admin knows."
      : "That's exactly what happens in production — a fixed budget, a hard stop, no surprises. Want to give 50 people this same experience?"
    : "Allocation, consumption, enforcement, exhaustion. All with cached responses. Want to try it for real?";

  return (
    <div className="px-4 py-10 max-w-4xl mx-auto">
      <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-900 to-neutral-950 p-8">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-indigo-300">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          Session report
        </div>
        <h2 className="mt-2 text-3xl font-semibold text-white">{headline}</h2>
        <p className="mt-3 text-white/70 leading-relaxed">{body}</p>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <Stat label="Allocated" value={`$${formatUSD(state.allocatedUSD)}`} />
          <Stat label="Rounds played" value={String(totalRoundsPlayed)} />
          <Stat label="Modes tried" value={String(modesPlayed)} />
          <Stat
            label="Avg. per round"
            value={totalRoundsPlayed ? `$${avgCostPerRound.toFixed(3)}` : "—"}
          />
        </div>

        {favModelMeta && (
          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-wide text-white/50">Your favourite model</div>
              <div className="mt-0.5 flex items-center gap-2">
                <ProviderBadge provider={favModelMeta.provider} className="text-white" />
                <span className="text-sm text-white/80">{favModelMeta.displayName}</span>
              </div>
            </div>
            <div className="text-xs text-white/50">
              Won {voteWinsFor(state.voteHistory.map((v) => v.bestPick), favModel!)} of{" "}
              {state.voteHistory.length} votes
            </div>
          </div>
        )}

        <PerModeBreakdown roundsPlayed={state.roundsPlayed} />

        <div className="mt-7 flex flex-col sm:flex-row gap-2">
          {state.mode === "cached" ? (
            <>
              <Button
                className="bg-indigo-500 hover:bg-indigo-400 text-white"
                onClick={onSwitchToLive}
                data-testid="button-exhaust-switch-live"
              >
                Switch to Live
              </Button>
              <Button
                variant="outline"
                className="border-white/15 text-white hover:bg-white/5"
                onClick={onStartFresh}
                data-testid="button-exhaust-fresh"
              >
                Start a fresh demo
              </Button>
            </>
          ) : state.keyType === "TEAM" ? (
            <>
              <Button
                className="bg-indigo-500 hover:bg-indigo-400 text-white"
                asChild
              >
                <a href="/contact" data-testid="button-exhaust-talk">Talk to us</a>
              </Button>
              <Button
                variant="outline"
                className="border-white/15 text-white hover:bg-white/5"
                asChild
              >
                <a href="/dashboard/teams" data-testid="button-exhaust-teams">Explore Allotly Teams</a>
              </Button>
              <Button
                variant="ghost"
                className="text-white/70 hover:text-white"
                onClick={onStartFresh}
                data-testid="button-exhaust-fresh-teams"
              >
                Start a fresh demo
              </Button>
            </>
          ) : (
            <>
              <Button
                className="bg-indigo-500 hover:bg-indigo-400 text-white"
                asChild
              >
                <a href="/signup" data-testid="button-exhaust-get-vouchers">Get vouchers for my team</a>
              </Button>
              <Button
                variant="outline"
                className="border-white/15 text-white hover:bg-white/5"
                onClick={onShare}
                data-testid="button-exhaust-share"
              >
                Forward this demo
              </Button>
              <Button
                variant="ghost"
                className="text-white/70 hover:text-white"
                asChild
              >
                <a href="/contact" data-testid="button-exhaust-talk-voucher">Talk to us</a>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-0.5 text-xl font-semibold text-white tabular-nums">{value}</div>
    </div>
  );
}

function PerModeBreakdown({ roundsPlayed }: { roundsPlayed: Record<PersonaOrSecretKeeper, number> }) {
  const entries = Object.entries(roundsPlayed).filter(([, v]) => v > 0) as [PersonaOrSecretKeeper, number][];
  if (entries.length === 0) return null;
  return (
    <div className="mt-4">
      <div className="text-[11px] uppercase tracking-wide text-white/50 mb-2">Modes played</div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([mode, count]) => (
          <span key={mode} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="capitalize">{mode.replace("-", " ")}</span>
            <span className="text-white/50 tabular-nums">{count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function voteWinsFor(picks: ModelId[], model: ModelId): number {
  return picks.filter((p) => p === model).length;
}
