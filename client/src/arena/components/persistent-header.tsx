import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { useArenaSession, formatUSD } from "../session";

interface Props {
  onOpenLiveToggle: () => void;
  onOpenHowItWorks: () => void;
  onSwitchMode?: () => void;
  showModeSwitch?: boolean;
}

export function PersistentHeader({ onOpenLiveToggle, onOpenHowItWorks, onSwitchMode, showModeSwitch }: Props) {
  const { state } = useArenaSession();
  const keyTypeLabel = state.mode === "live"
    ? state.keyType === "VOUCHER" ? "Voucher" : state.keyType === "TEAM" ? "Teams" : "Live"
    : "Cached";

  const showTicker = state.allocationConfirmed;

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-neutral-950/80 backdrop-blur">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-4 py-3">
        <Link href="/arena" className="flex items-center gap-2 text-white hover:opacity-90" data-testid="arena-home-link">
          <span className="inline-block h-6 w-6 rounded bg-gradient-to-br from-indigo-500 to-cyan-400" />
          <span className="font-semibold tracking-tight">Allotly Arena</span>
        </Link>

        <div className="flex items-center gap-3">
          {showTicker && (
            <div
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/90 tabular-nums"
              data-testid="budget-ticker"
              aria-live="polite"
            >
              <span className="text-white/60 mr-2">Budget</span>
              <span className="font-semibold">${formatUSD(state.remainingUSD, state.remainingUSD < 1 ? 3 : 2)}</span>
              <span className="text-white/40"> / ${formatUSD(state.allocatedUSD)}</span>
            </div>
          )}

          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
              state.mode === "live"
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-white/5 text-white/70"
            }`}
            data-testid="key-type-badge"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${state.mode === "live" ? "bg-emerald-400" : "bg-white/40"}`} />
            {keyTypeLabel}
          </span>

          {showModeSwitch && (
            <Button
              variant="ghost"
              size="sm"
              className="text-white/80 hover:text-white"
              onClick={onSwitchMode}
              data-testid="button-switch-mode"
            >
              Switch mode
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white"
            onClick={onOpenHowItWorks}
            data-testid="button-how-it-works"
          >
            How this works
          </Button>

          {state.mode === "cached" && (
            <Button
              size="sm"
              className="bg-indigo-500 hover:bg-indigo-400 text-white"
              onClick={onOpenLiveToggle}
              data-testid="button-switch-to-live"
            >
              Switch to Live
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
