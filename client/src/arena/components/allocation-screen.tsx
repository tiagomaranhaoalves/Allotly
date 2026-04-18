import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useArenaSession, formatUSD, hasPlayed } from "../session";
import { recommendedSpendUSD } from "../content";
import type { PersonaOrSecretKeeper } from "../types";

interface Props {
  onConfirm: (mode: PersonaOrSecretKeeper) => void;
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

export function AllocationScreen({ onConfirm }: Props) {
  const { state, allocate } = useArenaSession();
  const defaultUSD = 1.5;
  const maxUSD = Math.max(0.5, state.totalBudgetUSD);
  const minUSD = 0.25;

  const [amountUSD, setAmountUSD] = useState<number>(Math.min(defaultUSD, maxUSD));
  const [selectedMode, setSelectedMode] = useState<PersonaOrSecretKeeper>("marketing");
  const [auditLogVisible, setAuditLogVisible] = useState(false);

  useEffect(() => {
    if (state.allocationConfirmed) return;
    setAmountUSD((v) => Math.max(minUSD, Math.min(v, maxUSD)));
  }, [maxUSD, state.allocationConfirmed]);

  const remainderUSD = Math.max(0, state.totalBudgetUSD - amountUSD);
  const canConfirm = amountUSD >= minUSD && amountUSD <= maxUSD && !!selectedMode;

  function handleConfirm() {
    allocate(amountUSD);
    setAuditLogVisible(true);
    window.setTimeout(() => {
      onConfirm(selectedMode);
    }, 1600);
  }

  const nowLabel = useMemo(
    () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    [],
  );

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 flex items-center gap-3 text-sm text-white/60">
          <span className="rounded-full bg-indigo-500/15 text-indigo-300 px-2.5 py-1 text-xs font-medium">
            You are the admin
          </span>
          <span>Decide how much this demo gets. The ticker will enforce it.</span>
        </div>

        <div className="grid gap-8 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
            <div className="text-white/70 text-sm">Key balance</div>
            <div className="mt-1 text-3xl font-semibold text-white tabular-nums">
              ${formatUSD(state.totalBudgetUSD)}
            </div>
            <div className="mt-1 text-xs text-white/50">
              {state.mode === "live"
                ? state.keyType === "VOUCHER" ? "Voucher key" : "Teams key"
                : "Mock balance (Cached Mode)"}
            </div>

            <div className="mt-6">
              <div className="flex items-baseline justify-between">
                <div className="text-sm text-white/70">Allocate to this demo</div>
                <div className="text-2xl font-semibold text-white tabular-nums">
                  ${formatUSD(amountUSD)}
                </div>
              </div>
              <Slider
                min={minUSD}
                max={maxUSD}
                step={0.25}
                value={[amountUSD]}
                onValueChange={(v) => setAmountUSD(v[0] ?? amountUSD)}
                className="mt-4"
                data-testid="slider-allocation"
              />
              <div className="mt-2 flex justify-between text-xs text-white/50 tabular-nums">
                <span>${formatUSD(minUSD)}</span>
                <span>${formatUSD(maxUSD)}</span>
              </div>

              <div className="mt-5 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                <span className="text-white/60">Remainder after this session:</span>{" "}
                <span className="font-medium text-white tabular-nums">${formatUSD(remainderUSD)}</span>
              </div>
            </div>
          </div>

          <div>
            <div className="text-white/80 text-sm mb-3">Pick a mode to start with</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {MODE_CARDS.map((card) => {
                const isSelected = selectedMode === card.id;
                const tried = hasPlayed(state, card.id);
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setSelectedMode(card.id)}
                    className={`rounded-xl border p-4 text-left transition ${
                      isSelected
                        ? "border-indigo-400/60 bg-indigo-500/10"
                        : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/5"
                    }`}
                    data-testid={`mode-card-${card.id}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl" aria-hidden>
                          {card.icon}
                        </span>
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

            <div className="mt-6 flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                size="lg"
                className="bg-indigo-500 hover:bg-indigo-400 text-white"
                disabled={!canConfirm || auditLogVisible}
                onClick={handleConfirm}
                data-testid="button-confirm-allocation"
              >
                {auditLogVisible ? "Allocated…" : `Allocate $${formatUSD(amountUSD)} and start`}
              </Button>

              {auditLogVisible && (
                <div
                  className="text-xs font-mono text-emerald-300 animate-in fade-in slide-in-from-left-2"
                  aria-live="polite"
                  data-testid="audit-log-line"
                >
                  ✓ ${formatUSD(amountUSD)} allocated to demo session at {nowLabel}
                </div>
              )}
            </div>

            <p className="mt-4 text-xs text-white/50">
              You can switch modes later without re-allocating. The ticker up top enforces this budget.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
