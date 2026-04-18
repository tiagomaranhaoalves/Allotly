import { useArenaSession, formatUSD, hasPlayed } from "../session";
import { recommendedSpendUSD } from "../content";
import type { PersonaOrSecretKeeper } from "../types";

interface Props {
  onPick: (mode: PersonaOrSecretKeeper) => void;
}

const MODE_CARDS: Array<{
  id: PersonaOrSecretKeeper;
  title: string;
  oneLiner: string;
  icon: string;
}> = [
  { id: "marketing", title: "Marketing", oneLiner: "Race three models on a marketing brief.", icon: "✉️" },
  { id: "research", title: "Research", oneLiner: "Summarise and critique with rigour.", icon: "📚" },
  { id: "creative", title: "Creative", oneLiner: "Short, shareable, sometimes funny.", icon: "✨" },
  { id: "secret-keeper", title: "Secret Keeper", oneLiner: "Attacker vs. Defender. One password.", icon: "🕵️" },
];

export function ModePicker({ onPick }: Props) {
  const { state } = useArenaSession();

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">Pick a mode</h2>
            <p className="mt-1 text-sm text-white/60">Your budget carries over. No re-allocation.</p>
          </div>
          <div className="text-sm text-white/70 tabular-nums">
            <span className="text-white/50">Remaining </span>
            <span className="font-semibold text-white">${formatUSD(state.remainingUSD, 3)}</span>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {MODE_CARDS.map((card) => {
            const tried = hasPlayed(state, card.id);
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => onPick(card.id)}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-indigo-400/40 hover:bg-indigo-500/10 transition"
                data-testid={`mode-picker-${card.id}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl" aria-hidden>{card.icon}</span>
                    <span className="font-semibold text-white">{card.title}</span>
                  </div>
                  {tried && (
                    <span className="text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 rounded px-1.5 py-0.5">
                      ✓ tried
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-white/70">{card.oneLiner}</p>
                <p className="mt-3 text-xs text-white/50">
                  Recommended spend: ~${recommendedSpendUSD(card.id).toFixed(2)}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
