import { useEffect, useMemo, useRef, useState } from "react";
import { MockUIFrame } from "./mock-ui-frame";
import { PreflightSnippet } from "./preflight-snippet";
import { AllowlistPanel } from "./allowlist-panel";
import { ParallelStream, type StreamPanelState } from "./parallel-stream";
import { VotingPanel } from "./voting-panel";
import { RoundResults } from "./round-results";
import { useArenaSession } from "../session";
import { streamCachedVariant, scaledCostUSD, type StreamController } from "../engine/cached";
import { streamLiveChatCompletion, estimateCostUSD, type LiveStreamHandle } from "../engine/live";
import { DEFAULT_MODELS } from "../types";
import type { Challenge, ModelId, ModelMeta, Persona, CachedVariant } from "../types";

type RoundPhase = "briefing" | "preflight" | "streaming" | "voting" | "results";

interface Props {
  persona: Persona;
  challenge: Challenge;
  onPlayAgain: () => void;
  onSwitchMode: () => void;
  onEndSession: () => void;
}

const INITIAL_PANEL: StreamPanelState = {
  text: "",
  status: "pending",
  liveCostUSD: 0,
  tokens: 0,
  durationMs: null,
};

function freshPanels(): Record<ModelId, StreamPanelState> {
  return {
    "gpt-4o-mini": { ...INITIAL_PANEL },
    "claude-sonnet-4-20250514": { ...INITIAL_PANEL },
    "gemini-2.5-flash": { ...INITIAL_PANEL },
  };
}

export function RoundRunner({ persona, challenge, onPlayAgain, onSwitchMode, onEndSession }: Props) {
  const { state, spend, syncRemaining, recordVote, incrementRound } = useArenaSession();
  const [phase, setPhase] = useState<RoundPhase>("briefing");
  const [panels, setPanels] = useState<Record<ModelId, StreamPanelState>>(freshPanels);
  const [votes, setVotes] = useState<{ bestPick: ModelId; wouldPayMostPick: ModelId } | null>(null);
  const controllersRef = useRef<Array<StreamController | LiveStreamHandle>>([]);

  const models: ModelMeta[] = useMemo(() => DEFAULT_MODELS, []);

  useEffect(() => {
    setPhase("briefing");
    setPanels(freshPanels());
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
  }, [challenge.id]);

  function runStreams() {
    setPanels({
      "gpt-4o-mini": { ...INITIAL_PANEL, status: "streaming" },
      "claude-sonnet-4-20250514": { ...INITIAL_PANEL, status: "streaming" },
      "gemini-2.5-flash": { ...INITIAL_PANEL, status: "streaming" },
    });

    let outstanding = models.length;
    const onModelDone = () => {
      outstanding -= 1;
      if (outstanding === 0) {
        window.setTimeout(() => setPhase("voting"), 400);
      }
    };

    for (const meta of models) {
      if (state.mode === "cached") {
        startCachedFor(meta, onModelDone);
      } else {
        startLiveFor(meta, onModelDone);
      }
    }
  }

  function pickVariant(model: ModelId): CachedVariant | null {
    const byModel = challenge.cachedResponses[model];
    if (!byModel || byModel.length === 0) return null;
    return byModel[Math.floor(Math.random() * byModel.length)];
  }

  function startCachedFor(meta: ModelMeta, onDone: () => void) {
    const variant = pickVariant(meta.id);
    if (!variant) {
      setPanels((p) => ({
        ...p,
        [meta.id]: { text: "[no cached variant available]", status: "done", liveCostUSD: 0, tokens: 0, durationMs: 0 },
      }));
      onDone();
      return;
    }

    const scaled = scaledCostUSD(variant.costUSD);
    const totalLen = approxTotalLength(variant);

    const ctrl = streamCachedVariant(
      variant,
      (delta) => {
        setPanels((p) => {
          const prev = p[meta.id];
          const runningCost = Math.min(scaled, prev.liveCostUSD + scaled * (delta.length / totalLen));
          return {
            ...p,
            [meta.id]: { ...prev, text: prev.text + delta, liveCostUSD: runningCost },
          };
        });
      },
      ({ costUSD, tokens, durationMs }) => {
        setPanels((p) => ({
          ...p,
          [meta.id]: { ...p[meta.id], status: "done", liveCostUSD: costUSD, tokens, durationMs },
        }));
        spend(costUSD);
        onDone();
      },
      1.2,
    );
    controllersRef.current.push(ctrl);
  }

  function startLiveFor(meta: ModelMeta, onDone: () => void) {
    if (!state.keyValue) {
      setPanels((p) => ({
        ...p,
        [meta.id]: { ...p[meta.id], status: "done", text: "[no key — live mode unavailable]" },
      }));
      onDone();
      return;
    }

    const handle = streamLiveChatCompletion({
      key: state.keyValue,
      model: meta.id,
      systemPrompt: challenge.systemPrompt,
      userPrompt: challenge.prompt,
      onDelta: (delta) => {
        setPanels((p) => ({
          ...p,
          [meta.id]: { ...p[meta.id], text: p[meta.id].text + delta },
        }));
      },
      onDone: ({ inputTokens, outputTokens, durationMs, budgetRemainingUSD }) => {
        const totalTokens = inputTokens + outputTokens;
        const estimated = estimateCostUSD(meta.id, inputTokens, outputTokens);
        setPanels((p) => ({
          ...p,
          [meta.id]: { ...p[meta.id], status: "done", tokens: totalTokens, durationMs, liveCostUSD: estimated },
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
          [meta.id]: { ...p[meta.id], status: "done", text: p[meta.id].text + `\n[error: ${message}]` },
        }));
        onDone();
      },
    });
    controllersRef.current.push(handle);
  }

  function handleVoteSubmit(v: { bestPick: ModelId; wouldPayMostPick: ModelId }) {
    setVotes(v);
    const costs: Record<ModelId, number> = {
      "gpt-4o-mini": panels["gpt-4o-mini"].liveCostUSD,
      "claude-sonnet-4-20250514": panels["claude-sonnet-4-20250514"].liveCostUSD,
      "gemini-2.5-flash": panels["gemini-2.5-flash"].liveCostUSD,
    };
    recordVote({
      mode: persona,
      challengeId: challenge.id,
      bestPick: v.bestPick,
      wouldPayMostPick: v.wouldPayMostPick,
      winnerCost: costs[v.bestPick] ?? 0,
      costs,
    });
    incrementRound(persona);
    setPhase("results");
  }

  const modelCosts: Record<ModelId, number> = {
    "gpt-4o-mini": panels["gpt-4o-mini"].liveCostUSD,
    "claude-sonnet-4-20250514": panels["claude-sonnet-4-20250514"].liveCostUSD,
    "gemini-2.5-flash": panels["gemini-2.5-flash"].liveCostUSD,
  };
  const modelTokens: Record<ModelId, number> = {
    "gpt-4o-mini": panels["gpt-4o-mini"].tokens,
    "claude-sonnet-4-20250514": panels["claude-sonnet-4-20250514"].tokens,
    "gemini-2.5-flash": panels["gemini-2.5-flash"].tokens,
  };

  const showSnippetAndAllowlist = phase === "preflight" || phase === "streaming" || phase === "voting" || phase === "results";

  return (
    <div className="space-y-4">
      <MockUIFrame
        variant={challenge.mockUI}
        title={challenge.title}
        contextCopy={challenge.contextCopy}
        prompt={challenge.prompt}
      />

      {showSnippetAndAllowlist && (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <PreflightSnippet
              visible={true}
              keyRedacted={state.keyValue ? redact(state.keyValue) : "allotly_sk_demo_arena"}
              model={models[0].id}
            />
          </div>
          <div className="lg:col-span-2">
            <AllowlistPanel allowedModels={models} />
          </div>
        </div>
      )}

      {(phase === "streaming" || phase === "voting" || phase === "results") && (
        <ParallelStream panels={models.map((m) => ({ model: m, state: panels[m.id] }))} />
      )}

      {phase === "voting" && <VotingPanel models={models} onSubmit={handleVoteSubmit} />}

      {phase === "results" && votes && (
        <RoundResults
          models={models}
          costs={modelCosts}
          tokens={modelTokens}
          bestPick={votes.bestPick}
          wouldPayMostPick={votes.wouldPayMostPick}
          teachingNote={challenge.teachingNote}
          onPlayAgain={onPlayAgain}
          onSwitchMode={onSwitchMode}
          onEndSession={onEndSession}
        />
      )}

      {phase === "briefing" && (
        <div className="text-center text-sm text-white/60">Briefing the models…</div>
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
