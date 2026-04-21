import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { RoundRunner } from "./round-runner";
import { pickChallenge } from "../content";
import { useArenaSession } from "../session";
import type { Challenge, Persona } from "../types";

interface Props {
  persona: Persona;
  onSwitchMode: () => void;
  onEndSession: () => void;
}

export function PersonaArena({ persona, onSwitchMode, onEndSession }: Props) {
  const { t } = useTranslation();
  const { state, enterMode } = useArenaSession();
  const [playedChallengeIds, setPlayedChallengeIds] = useState<Set<string>>(new Set());
  const [challenge, setChallenge] = useState<Challenge | null>(null);

  useEffect(() => {
    enterMode(persona);
    const next = pickChallenge(persona);
    if (next) {
      setChallenge(next);
      setPlayedChallengeIds(new Set([next.id]));
    }
  }, [persona]); // eslint-disable-line react-hooks/exhaustive-deps

  const handlePlayAgain = () => {
    const excluded = playedChallengeIds;
    const next = pickChallenge(persona, excluded);
    if (next) {
      setChallenge(next);
      setPlayedChallengeIds((s) => new Set([...Array.from(s), next.id]));
    }
  };

  const personaKey =
    persona === "marketing"
      ? "arena.personaArena.modeMarketing"
      : persona === "research"
        ? "arena.personaArena.modeResearch"
        : "arena.personaArena.modeCreative";
  const headerMode = t(personaKey);

  if (!challenge) {
    return (
      <div className="px-4 py-16 text-center text-white/60">
        {t("arena.personaArena.noChallenges", { mode: headerMode })}
      </div>
    );
  }

  if (state.isExhausted) {
    return null;
  }

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-white/50">{t("arena.personaArena.modeLabel")}</div>
          <h2 className="text-xl font-semibold text-white">{headerMode}</h2>
        </div>
        <div className="text-xs text-white/50 tabular-nums">
          {t("arena.personaArena.round", { n: state.roundsPlayed[persona] + 1 })}
        </div>
      </div>
      <RoundRunner
        persona={persona}
        challenge={challenge}
        onPlayAgain={handlePlayAgain}
        onSwitchMode={onSwitchMode}
        onEndSession={onEndSession}
      />
    </div>
  );
}
