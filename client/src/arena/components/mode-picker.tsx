import { useTranslation } from "react-i18next";
import { useArenaSession, formatUSD, hasPlayed } from "../session";
import { recommendedSpendUSD } from "../content";
import type { PersonaOrSecretKeeper } from "../types";

interface Props {
  onPick: (mode: PersonaOrSecretKeeper) => void;
}

const PERSONA_CARDS: Array<{
  id: PersonaOrSecretKeeper;
  titleKey: string;
  oneLinerKey: string;
  icon: string;
}> = [
  { id: "marketing", titleKey: "arena.modePicker.cardMarketingTitle", oneLinerKey: "arena.modePicker.cardMarketingOneLiner", icon: "✉️" },
  { id: "research", titleKey: "arena.modePicker.cardResearchTitle", oneLinerKey: "arena.modePicker.cardResearchOneLiner", icon: "📚" },
  { id: "creative", titleKey: "arena.modePicker.cardCreativeTitle", oneLinerKey: "arena.modePicker.cardCreativeOneLiner", icon: "✨" },
];

const SECRET_KEEPER_CARD: {
  id: PersonaOrSecretKeeper;
  titleKey: string;
  oneLinerKey: string;
  icon: string;
} = {
  id: "secret-keeper",
  titleKey: "arena.modePicker.cardSecretKeeperTitle",
  oneLinerKey: "arena.modePicker.cardSecretKeeperOneLiner",
  icon: "🕵️",
};

export function ModePicker({ onPick }: Props) {
  const { t } = useTranslation();
  const { state } = useArenaSession();
  const lineup = state.lineup;

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">{t("arena.modePicker.title")}</h2>
            <p className="mt-1 text-sm text-white/60">{t("arena.modePicker.subtitle")}</p>
          </div>
          <div className="text-sm text-white/70 tabular-nums">
            <span className="text-white/50">{t("arena.modePicker.remaining")} </span>
            <span className="font-semibold text-white" data-testid="text-remaining-budget">
              ${formatUSD(state.remainingUSD, 3)}
            </span>
          </div>
        </div>

        <section
          className="mb-6 rounded-xl border border-white/10 bg-neutral-900/50 p-5"
          data-testid="section-demo-intro"
        >
          <h3 className="text-base font-semibold text-white">{t("arena.modePicker.introTitle")}</h3>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            {t("arena.modePicker.introDesc")}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Step n="1" title={t("arena.modePicker.step1Title")}>
              {lineup.length === 3
                ? t("arena.modePicker.step1Locked")
                : t("arena.modePicker.step1Picked")}
            </Step>
            <Step n="2" title={t("arena.modePicker.step2Title")}>
              {t("arena.modePicker.step2Body")}
            </Step>
            <Step n="3" title={t("arena.modePicker.step3Title")}>
              {t("arena.modePicker.step3Body")}
            </Step>
          </div>

          <p className="mt-4 text-xs text-white/50">
            {t("arena.modePicker.whyMatters")}
          </p>
        </section>

        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50 mb-2">
          {t("arena.modePicker.personaModes")}
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {PERSONA_CARDS.map((card) => (
            <ModeCard key={card.id} card={card} state={state} onPick={onPick} />
          ))}
        </div>

        <section
          className="mt-8 rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-5"
          data-testid="section-secret-keeper-intro"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🕵️</span>
            <div>
              <h3 className="text-base font-semibold text-white">{t("arena.modePicker.skTitle")}</h3>
              <p className="mt-2 text-sm text-white/70 leading-relaxed">
                {t("arena.modePicker.skBody1")}
              </p>
              <p className="mt-3 text-sm text-white/70 leading-relaxed">
                <strong className="text-white">{t("arena.modePicker.skMeasuresLabel")}</strong>{" "}
                {t("arena.modePicker.skMeasures")}
              </p>
              <p className="mt-3 text-sm text-white/70 leading-relaxed">
                <strong className="text-white">{t("arena.modePicker.skRelevantLabel")}</strong>{" "}
                {t("arena.modePicker.skRelevant")}
              </p>

              <div className="mt-4">
                <ModeCard card={SECRET_KEEPER_CARD} state={state} onPick={onPick} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-semibold text-indigo-200">
          {n}
        </span>
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-white/60 leading-relaxed">{children}</p>
    </div>
  );
}

function ModeCard({
  card,
  state,
  onPick,
}: {
  card: { id: PersonaOrSecretKeeper; titleKey: string; oneLinerKey: string; icon: string };
  state: ReturnType<typeof useArenaSession>["state"];
  onPick: (mode: PersonaOrSecretKeeper) => void;
}) {
  const { t } = useTranslation();
  const tried = hasPlayed(state, card.id);
  return (
    <button
      type="button"
      onClick={() => onPick(card.id)}
      className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-indigo-400/40 hover:bg-indigo-500/10 transition"
      data-testid={`mode-picker-${card.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{card.icon}</span>
          <span className="font-semibold text-white">{t(card.titleKey)}</span>
        </div>
        {tried && (
          <span className="text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 rounded px-1.5 py-0.5">
            {t("arena.modePicker.tried")}
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-white/70">{t(card.oneLinerKey)}</p>
      <p className="mt-3 text-xs text-white/50">
        {t("arena.modePicker.recommendedSpend", { amount: recommendedSpendUSD(card.id).toFixed(2) })}
      </p>
    </button>
  );
}
