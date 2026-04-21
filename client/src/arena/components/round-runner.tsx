import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { MockUIFrame } from "./mock-ui-frame";
import { PreflightSnippet } from "./preflight-snippet";
import { AllowlistPanel } from "./allowlist-panel";
import { ParallelStream, type StreamPanelState } from "./parallel-stream";
import { VotingPanel, type VoteSlot } from "./voting-panel";
import { RoundResults } from "./round-results";
import { useArenaSession } from "../session";
import { streamCachedVariant, scaledCostUSD, type StreamController } from "../engine/cached";
import { streamLiveChatCompletion, estimateCostUSD, type LiveStreamHandle } from "../engine/live";
import { modelMeta } from "../data/model-catalog";
import type { Challenge, ModelId, ModelMeta, Persona, CachedVariant } from "../types";

type RoundPhase = "briefing" | "preflight" | "streaming" | "voting" | "results";

interface Props {
  persona: Persona;
  challenge: Challenge;
  onPlayAgain: () => void;
  onSwitchMode: () => void;
  onEndSession: () => void;
}

interface SlotEntry {
  slotKey: string;
  index: number;
  model: ModelMeta;
}

const INITIAL_PANEL: StreamPanelState = {
  text: "",
  status: "pending",
  liveCostUSD: 0,
  tokens: 0,
  durationMs: null,
};

function buildSlots(lineup: ModelId[]): SlotEntry[] {
  return lineup.map((id, index) => ({
    slotKey: `${id}-${index}`,
    index,
    model: modelMeta(id),
  }));
}

function freshPanels(slots: SlotEntry[]): Record<string, StreamPanelState> {
  const out: Record<string, StreamPanelState> = {};
  for (const s of slots) out[s.slotKey] = { ...INITIAL_PANEL };
  return out;
}

export function RoundRunner({ persona, challenge, onPlayAgain, onSwitchMode, onEndSession }: Props) {
  const { t } = useTranslation();
  const { state, spend, syncRemaining, recordVote, incrementRound } = useArenaSession();
  const [phase, setPhase] = useState<RoundPhase>("briefing");
  const [cachedNoticeDismissed, setCachedNoticeDismissed] = useState(false);
  const lineup = state.lineup;

  const slots = useMemo(() => buildSlots(lineup), [lineup]);
  const [panels, setPanels] = useState<Record<string, StreamPanelState>>(() => freshPanels(slots));
  const [votes, setVotes] = useState<{ bestSlotKey: string; payMostSlotKey: string } | null>(null);
  const controllersRef = useRef<Array<StreamController | LiveStreamHandle>>([]);

  useEffect(() => {
    setPhase("briefing");
    setPanels(freshPanels(slots));
    setVotes(null);

    const t1 = window.setTimeout(() => setPhase("preflight"), 1400);
    const t2 = window.setTimeout(() => {
      setPhase("streaming");
      runStreams();
    }, 1900);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      for (const c of controllersRef.current) c.cancel();
      controllersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challenge.id, lineup.join(",")]);

  function runStreams() {
    const streaming: Record<string, StreamPanelState> = {};
    for (const s of slots) streaming[s.slotKey] = { ...INITIAL_PANEL, status: "streaming" };
    setPanels(streaming);

    let outstanding = slots.length;
    const onSlotDone = () => {
      outstanding -= 1;
      if (outstanding === 0) {
        window.setTimeout(() => setPhase("voting"), 400);
      }
    };

    for (const s of slots) {
      const isAllowed = state.allowedModels.includes(s.model.id);
      if (!isAllowed) {
        setPanels((p) => ({
          ...p,
          [s.slotKey]: {
            text: t("arena.stream.blockedPlaceholder", { name: s.model.displayName }),
            status: "done",
            liveCostUSD: 0,
            tokens: 0,
            durationMs: 0,
          },
        }));
        onSlotDone();
        continue;
      }
      if (state.mode === "cached") {
        const variant = pickVariant(s.model.id);
        if (!variant) {
          setPanels((p) => ({
            ...p,
            [s.slotKey]: {
              text: t("arena.stream.noCachedPlaceholder", { name: s.model.displayName }),
              status: "done",
              liveCostUSD: 0,
              tokens: 0,
              durationMs: 0,
            },
          }));
          onSlotDone();
          continue;
        }
        startCachedFor(s, variant, onSlotDone);
      } else {
        startLiveFor(s, onSlotDone);
      }
    }
  }

  function pickVariant(model: ModelId): CachedVariant | null {
    const byModel = challenge.cachedResponses[model];
    if (!byModel || byModel.length === 0) return null;
    return byModel[Math.floor(Math.random() * byModel.length)];
  }

  function startCachedFor(s: SlotEntry, variant: CachedVariant, onDone: () => void) {
    const scaled = scaledCostUSD(variant.costUSD);
    const totalLen = approxTotalLength(variant);

    const ctrl = streamCachedVariant(
      variant,
      (delta) => {
        setPanels((p) => {
          const prev = p[s.slotKey];
          const runningCost = Math.min(scaled, prev.liveCostUSD + scaled * (delta.length / totalLen));
          return {
            ...p,
            [s.slotKey]: { ...prev, text: prev.text + delta, liveCostUSD: runningCost },
          };
        });
      },
      ({ costUSD, tokens, durationMs }) => {
        setPanels((p) => ({
          ...p,
          [s.slotKey]: { ...p[s.slotKey], status: "done", liveCostUSD: costUSD, tokens, durationMs },
        }));
        spend(costUSD);
        onDone();
      },
      1.2,
    );
    controllersRef.current.push(ctrl);
  }

  function startLiveFor(s: SlotEntry, onDone: () => void) {
    if (!state.keyValue) {
      setPanels((p) => ({
        ...p,
        [s.slotKey]: { ...p[s.slotKey], status: "done", text: t("arena.stream.noKey") },
      }));
      onDone();
      return;
    }

    const estimatedInputTokens = Math.max(
      1,
      Math.ceil(((challenge.systemPrompt?.length ?? 0) + challenge.prompt.length) / 4),
    );
    let outputCharCount = 0;

    const handle = streamLiveChatCompletion({
      key: state.keyValue,
      model: s.model.id,
      systemPrompt: challenge.systemPrompt,
      userPrompt: challenge.prompt,
      onDelta: (delta) => {
        outputCharCount += delta.length;
        const estOutTokens = Math.ceil(outputCharCount / 4);
        const runningCost = estimateCostUSD(
          s.model.id,
          estimatedInputTokens,
          estOutTokens,
          state.keyModelPricing,
        );
        setPanels((p) => ({
          ...p,
          [s.slotKey]: {
            ...p[s.slotKey],
            text: p[s.slotKey].text + delta,
            liveCostUSD: runningCost,
            tokens: estimatedInputTokens + estOutTokens,
          },
        }));
      },
      onDone: ({ inputTokens, outputTokens, durationMs, budgetRemainingUSD }) => {
        const finalInput = inputTokens > 0 ? inputTokens : estimatedInputTokens;
        const finalOutput = outputTokens > 0 ? outputTokens : Math.ceil(outputCharCount / 4);
        const totalTokens = finalInput + finalOutput;
        const estimated = estimateCostUSD(
          s.model.id,
          finalInput,
          finalOutput,
          state.keyModelPricing,
        );
        setPanels((p) => ({
          ...p,
          [s.slotKey]: { ...p[s.slotKey], status: "done", tokens: totalTokens, durationMs, liveCostUSD: estimated },
        }));
        if (budgetRemainingUSD !== null) {
          const allocatedRemaining = Math.max(0, budgetRemainingUSD - (state.totalBudgetUSD - state.allocatedUSD));
          syncRemaining(Math.min(state.allocatedUSD, allocatedRemaining));
        }
        onDone();
      },
      onError: ({ message }) => {
        setPanels((p) => ({
          ...p,
          [s.slotKey]: { ...p[s.slotKey], status: "done", text: p[s.slotKey].text + `\n${t("arena.stream.error", { message })}` },
        }));
        onDone();
      },
    });
    controllersRef.current.push(handle);
  }

  function handleVoteSubmit(v: { bestSlotKey: string; payMostSlotKey: string }) {
    setVotes(v);
    const bestSlot = slots.find((s) => s.slotKey === v.bestSlotKey)!;
    const paySlot = slots.find((s) => s.slotKey === v.payMostSlotKey)!;
    const costs: Record<string, number> = {};
    for (const s of slots) costs[s.slotKey] = panels[s.slotKey].liveCostUSD;
    recordVote({
      mode: persona,
      challengeId: challenge.id,
      bestPick: bestSlot.model.id,
      wouldPayMostPick: paySlot.model.id,
      winnerCost: costs[v.bestSlotKey] ?? 0,
      costs,
    });
    incrementRound(persona);
    setPhase("results");
  }

  const slotPanels = slots.map((s) => ({
    model: s.model,
    slotKey: s.slotKey,
    state: panels[s.slotKey] ?? { ...INITIAL_PANEL },
  }));

  const voteSlots: VoteSlot[] = slots.map((s) => ({
    slotKey: s.slotKey,
    index: s.index,
    model: s.model,
  }));

  const showSnippetAndAllowlist =
    phase === "preflight" || phase === "streaming" || phase === "voting" || phase === "results";

  const showCachedNotice =
    state.mode === "cached" &&
    !cachedNoticeDismissed &&
    (phase === "streaming" || phase === "voting" || phase === "results");

  return (
    <div className="space-y-4">
      <MockUIFrame
        variant={challenge.mockUI}
        title={challenge.title}
        contextCopy={challenge.contextCopy}
        prompt={challenge.prompt}
      />

      {showSnippetAndAllowlist && (
        <AllowlistPanel allowedModels={state.allowedModels} lineup={lineup} />
      )}

      {showCachedNotice && (
        <div
          className="flex items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100"
          data-testid="banner-cached-notice"
        >
          <span>{t("arena.cachedNotice")}</span>
          <button
            type="button"
            onClick={() => setCachedNoticeDismissed(true)}
            className="text-amber-100/70 hover:text-white"
            aria-label={t("arena.dismiss")}
            data-testid="button-dismiss-cached-notice"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {(phase === "streaming" || phase === "voting" || phase === "results") && (
        <ParallelStream panels={slotPanels} />
      )}

      {phase === "voting" && <VotingPanel slots={voteSlots} onSubmit={handleVoteSubmit} />}

      {phase === "results" && votes && (
        <RoundResults
          slots={voteSlots.map((vs) => ({
            ...vs,
            costUSD: panels[vs.slotKey]?.liveCostUSD ?? 0,
            tokens: panels[vs.slotKey]?.tokens ?? 0,
          }))}
          bestSlotKey={votes.bestSlotKey}
          payMostSlotKey={votes.payMostSlotKey}
          teachingNote={challenge.teachingNote}
          onPlayAgain={onPlayAgain}
          onSwitchMode={onSwitchMode}
          onEndSession={onEndSession}
        />
      )}

      {phase === "briefing" && (
        <div className="text-center text-sm text-white/60">{t("arena.runner.briefing")}</div>
      )}

      {showSnippetAndAllowlist && (
        <div className="pt-6">
          <PreflightSnippet
            visible={true}
            keyRedacted={state.keyValue ? redact(state.keyValue) : "allotly_sk_demo_arena"}
            model={lineup[0]}
          />
        </div>
      )}
    </div>
  );
}

function approxTotalLength(variant: CachedVariant): number {
  let total = 0;
  for (const c of variant.chunks) total += c.delta.length;
  return Math.max(1, total);
}

function redact(key: string): string {
  if (key.length < 16) return "allotly_sk_***";
  return `${key.slice(0, 11)}…${key.slice(-4)}`;
}
