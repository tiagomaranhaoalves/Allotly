import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { pickBattle } from "../content";
import { streamCachedBattleExchange, scaledCostUSD, type StreamController } from "../engine/cached";
import { useArenaSession } from "../session";
import { DEFAULT_MODELS } from "../types";
import type { SecretKeeperBattle, SecretKeeperDifficulty, ModelMeta } from "../types";

interface Props {
  onSwitchMode: () => void;
  onEndSession: () => void;
}

type Phase = "setup" | "playing" | "verdict";

interface TranscriptTurn {
  role: "attacker" | "defender";
  model: ModelMeta;
  text: string;
  costUSD: number;
  done: boolean;
}

export function SecretKeeper({ onSwitchMode, onEndSession }: Props) {
  const { t } = useTranslation();
  const { state, enterMode, spend, incrementRound } = useArenaSession();
  const [difficulty, setDifficulty] = useState<SecretKeeperDifficulty>("easy");
  const [phase, setPhase] = useState<Phase>("setup");
  const [battle, setBattle] = useState<SecretKeeperBattle | null>(null);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const controllersRef = useRef<StreamController[]>([]);

  useEffect(() => {
    enterMode("secret-keeper");
    return () => {
      for (const c of controllersRef.current) c.cancel();
      controllersRef.current = [];
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const modelLookup = useMemo<Record<string, ModelMeta>>(() => {
    const out: Record<string, ModelMeta> = {};
    for (const m of DEFAULT_MODELS) out[m.id] = m;
    return out;
  }, []);

  function startBattle() {
    const b = pickBattle(difficulty);
    if (!b) return;
    setBattle(b);
    setTranscript([]);
    setPhase("playing");

    let idx = 0;
    const playNext = () => {
      if (state.isExhausted) return;
      if (idx >= b.exchanges.length) {
        setPhase("verdict");
        incrementRound("secret-keeper");
        return;
      }
      const exchange = b.exchanges[idx];
      const meta = modelLookup[exchange.model];
      idx += 1;

      setTranscript((tt) => [
        ...tt,
        {
          role: exchange.role,
          model: meta,
          text: "",
          costUSD: 0,
          done: false,
        },
      ]);

      const runningCost = scaledCostUSD(exchange.costUSD);
      const ctrl = streamCachedBattleExchange(
        exchange,
        (delta) => {
          setTranscript((tt) => {
            if (tt.length === 0) return tt;
            const last = tt[tt.length - 1];
            return [...tt.slice(0, -1), { ...last, text: last.text + delta }];
          });
        },
        () => {
          setTranscript((tt) => {
            if (tt.length === 0) return tt;
            const last = tt[tt.length - 1];
            return [...tt.slice(0, -1), { ...last, costUSD: runningCost, done: true }];
          });
          spend(runningCost);
          window.setTimeout(playNext, 500);
        },
        1.0,
      );
      controllersRef.current.push(ctrl);
    };

    playNext();
  }

  function reset() {
    for (const c of controllersRef.current) c.cancel();
    controllersRef.current = [];
    setBattle(null);
    setTranscript([]);
    setPhase("setup");
  }

  if (state.isExhausted) return null;

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">{t("arena.secretKeeper.modeLabel")}</div>
          <h2 className="text-xl font-semibold text-white">{t("arena.secretKeeper.title")}</h2>
        </div>
        <div className="text-xs text-white/50">{t("arena.secretKeeper.subtitle")}</div>
      </div>

      {phase === "setup" && (
        <SetupPanel
          difficulty={difficulty}
          onDifficultyChange={setDifficulty}
          onStart={startBattle}
        />
      )}

      {(phase === "playing" || phase === "verdict") && battle && (
        <BattleView
          battle={battle}
          transcript={transcript}
          phase={phase}
          onReplay={reset}
          onSwitchMode={onSwitchMode}
          onEndSession={onEndSession}
        />
      )}
    </div>
  );
}

function SetupPanel({
  difficulty,
  onDifficultyChange,
  onStart,
}: {
  difficulty: SecretKeeperDifficulty;
  onDifficultyChange: (d: SecretKeeperDifficulty) => void;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const options: Array<{ id: SecretKeeperDifficulty; title: string; desc: string }> = [
    { id: "easy", title: t("arena.secretKeeper.easyTitle"), desc: t("arena.secretKeeper.easyDesc") },
    { id: "medium", title: t("arena.secretKeeper.mediumTitle"), desc: t("arena.secretKeeper.mediumDesc") },
    { id: "hard", title: t("arena.secretKeeper.hardTitle"), desc: t("arena.secretKeeper.hardDesc") },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
      <h3 className="text-lg font-semibold text-white">{t("arena.secretKeeper.chooseDifficulty")}</h3>
      <p className="mt-1 text-sm text-white/60">
        {t("arena.secretKeeper.chooseDesc")}
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {options.map((o) => {
          const selected = difficulty === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onDifficultyChange(o.id)}
              className={`rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-indigo-400/60 bg-indigo-500/10"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/5"
              }`}
              data-testid={`sk-difficulty-${o.id}`}
            >
              <div className="text-white font-semibold">{o.title}</div>
              <div className="mt-1 text-sm text-white/60">{o.desc}</div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          className="bg-indigo-500 hover:bg-indigo-400 text-white"
          onClick={onStart}
          data-testid="button-start-battle"
        >
          {t("arena.secretKeeper.startBattle")}
        </Button>
      </div>
    </div>
  );
}

function BattleView({
  battle,
  transcript,
  phase,
  onReplay,
  onSwitchMode,
  onEndSession,
}: {
  battle: SecretKeeperBattle;
  transcript: TranscriptTurn[];
  phase: Phase;
  onReplay: () => void;
  onSwitchMode: () => void;
  onEndSession: () => void;
}) {
  const { t } = useTranslation();
  const leakedRound = battle.leakedAtRound;
  const totalCost = transcript.reduce((acc, tt) => acc + tt.costUSD, 0);

  const difficultyLabel =
    battle.difficulty === "easy"
      ? t("arena.secretKeeper.difficultyEasy")
      : battle.difficulty === "medium"
        ? t("arena.secretKeeper.difficultyMedium")
        : t("arena.secretKeeper.difficultyHard");

  return (
    <div>
      <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-4 mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">{t("arena.secretKeeper.passwordIs")}</div>
          <div className="text-lg font-mono font-semibold text-amber-300">
            {battle.password}
            {battle.rule && <span className="ml-2 text-xs text-white/60 font-sans">({battle.rule})</span>}
          </div>
        </div>
        <div className="text-sm text-white/70">
          {t("arena.secretKeeper.difficultyLabel")} <span className="text-white">{difficultyLabel}</span>
        </div>
      </div>

      <div className="space-y-3">
        {transcript.map((turn, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 ${
              turn.role === "attacker"
                ? "border-rose-500/20 bg-rose-500/5"
                : "border-emerald-500/20 bg-emerald-500/5"
            }`}
            data-testid={`sk-turn-${i}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 ${
                    turn.role === "attacker"
                      ? "bg-rose-500/15 text-rose-300"
                      : "bg-emerald-500/15 text-emerald-300"
                  }`}
                >
                  {turn.role === "attacker"
                    ? t("arena.secretKeeper.roleAttacker")
                    : t("arena.secretKeeper.roleDefender")}
                </span>
                <ProviderBadge provider={turn.model.provider} className="text-white" />
                <span className="text-xs text-white/50">{turn.model.displayName}</span>
              </div>
              <div className="text-[11px] font-mono text-white/60 tabular-nums">
                ${turn.costUSD.toFixed(5)}
              </div>
            </div>
            <div className="mt-2 text-sm text-white/90 whitespace-pre-wrap">
              {turn.text}
              {!turn.done && (
                <span className="inline-block h-3.5 w-1 align-middle bg-white/70 animate-pulse ml-0.5" />
              )}
            </div>
          </div>
        ))}
      </div>

      {phase === "verdict" && (
        <div className="mt-6 rounded-2xl border border-white/10 bg-neutral-900/60 p-6">
          <h3 className="text-xl font-semibold text-white">
            {battle.outcome === "defender_wins"
              ? t("arena.secretKeeper.defenderWins")
              : t("arena.secretKeeper.attackerWins", { n: leakedRound })}
          </h3>
          <p className="mt-2 text-sm text-white/70">
            {t("arena.secretKeeper.totalCost")}{" "}
            <span className="font-mono text-white tabular-nums">${totalCost.toFixed(5)}</span>
          </p>
          <div className="mt-5 flex flex-col sm:flex-row gap-2">
            <Button
              className="bg-indigo-500 hover:bg-indigo-400 text-white"
              onClick={onReplay}
              data-testid="button-sk-replay"
            >
              {t("arena.secretKeeper.playAgain")}
            </Button>
            <Button
              variant="outline"
              className="border-white/15 text-white hover:bg-white/5"
              onClick={onSwitchMode}
              data-testid="button-sk-switch"
            >
              {t("arena.secretKeeper.switchMode")}
            </Button>
            <Button
              variant="ghost"
              className="text-white/70 hover:text-white"
              onClick={onEndSession}
              data-testid="button-sk-end"
            >
              {t("arena.secretKeeper.endSession")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
