import { Trans, useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import type { ModelMeta } from "../types";

export interface ResultSlot {
  slotKey: string;
  index: number;
  model: ModelMeta;
  costUSD: number;
  tokens: number;
}

interface Props {
  slots: ResultSlot[];
  bestSlotKey: string;
  payMostSlotKey: string;
  teachingNote: string;
  onPlayAgain: () => void;
  onSwitchMode: () => void;
  onEndSession: () => void;
}

export function RoundResults({
  slots,
  bestSlotKey,
  payMostSlotKey,
  teachingNote,
  onPlayAgain,
  onSwitchMode,
  onEndSession,
}: Props) {
  const { t } = useTranslation();
  const mostExpensive = slots.reduce((acc, s) => (s.costUSD > acc.costUSD ? s : acc), slots[0]);
  const cheapest = slots.reduce((acc, s) => (s.costUSD < acc.costUSD ? s : acc), slots[0]);

  const bestSlot = slots.find((s) => s.slotKey === bestSlotKey);
  const paySlot = slots.find((s) => s.slotKey === payMostSlotKey);
  const gapInsight = bestSlot && paySlot && bestSlot.model.id !== paySlot.model.id;

  const ratio = cheapest.costUSD > 0
    ? (mostExpensive.costUSD / Math.max(0.00001, cheapest.costUSD)).toFixed(1)
    : null;

  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s.model.id, (counts.get(s.model.id) ?? 0) + 1);
  const hasDupes = Array.from(counts.values()).some((n) => n > 1);

  const cols = slots.length === 1 ? "sm:grid-cols-1" : slots.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
      <h3 className="text-xl font-semibold text-white">{t("arena.results.title")}</h3>

      <div className={`mt-4 grid gap-3 ${cols}`}>
        {slots.map((s) => (
          <div
            key={s.slotKey}
            className={`rounded-xl border p-4 ${
              s.slotKey === bestSlotKey
                ? "border-emerald-500/40 bg-emerald-500/5"
                : s.slotKey === payMostSlotKey
                  ? "border-amber-500/40 bg-amber-500/5"
                  : "border-white/10 bg-white/[0.03]"
            }`}
            data-testid={`result-card-${s.slotKey}`}
          >
            <div className="flex items-center gap-2">
              <ProviderBadge provider={s.model.provider} className="text-white" />
              {hasDupes && (
                <span className="text-[10px] uppercase tracking-wide text-white/50">
                  {t("arena.results.slotLabel", { n: s.index + 1 })}
                </span>
              )}
            </div>
            <div className="text-xs text-white/50 mt-0.5">{s.model.displayName}</div>
            <div className="mt-3 text-2xl font-semibold text-white tabular-nums">
              ${s.costUSD.toFixed(5)}
            </div>
            <div className="text-[11px] text-white/50">{t("arena.results.tokens", { count: s.tokens })}</div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {s.slotKey === bestSlotKey && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                  {t("arena.results.yourBest")}
                </span>
              )}
              {s.slotKey === payMostSlotKey && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-amber-500/15 text-amber-300">
                  {t("arena.results.paidMost")}
                </span>
              )}
              {s.slotKey === mostExpensive.slotKey && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-rose-500/10 text-rose-200">
                  {t("arena.results.actuallyExpensive")}
                </span>
              )}
              {s.slotKey === cheapest.slotKey && (
                <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-indigo-500/10 text-indigo-200">
                  {t("arena.results.actuallyCheapest")}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {gapInsight && (
        <div className="mt-5 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100">
          <Trans i18nKey="arena.results.interesting" components={{ strong: <strong /> }} />
        </div>
      )}

      {ratio && Number(ratio) > 2 && (
        <div className="mt-3 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
          <Trans i18nKey="arena.results.ratio" values={{ ratio }} components={{ strong: <strong /> }} />
        </div>
      )}

      <p className="mt-4 text-sm text-white/70">{teachingNote}</p>

      <div className="mt-6 flex flex-col sm:flex-row gap-2">
        <Button
          className="bg-indigo-500 hover:bg-indigo-400 text-white"
          onClick={onPlayAgain}
          data-testid="button-play-again"
        >
          {t("arena.results.playAgain")}
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-white hover:bg-white/5"
          onClick={onSwitchMode}
          data-testid="button-switch-mode-results"
        >
          {t("arena.results.switchMode")}
        </Button>
        <Button
          variant="ghost"
          className="text-white/70 hover:text-white"
          onClick={onEndSession}
          data-testid="button-end-session"
        >
          {t("arena.results.endSession")}
        </Button>
      </div>
    </div>
  );
}
