import { ProviderBadge } from "@/components/brand/provider-badge";
import type { ModelMeta } from "../types";

export interface StreamPanelState {
  text: string;
  status: "pending" | "streaming" | "done";
  liveCostUSD: number;
  tokens: number;
  durationMs: number | null;
}

interface Props {
  panels: Array<{ model: ModelMeta; state: StreamPanelState }>;
}

export function ParallelStream({ panels }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {panels.map(({ model, state }) => (
        <div
          key={model.id}
          className={`rounded-xl border p-4 min-h-[280px] transition ${
            state.status === "done"
              ? "border-white/15 bg-neutral-900/70"
              : state.status === "streaming"
                ? "border-indigo-500/30 bg-indigo-500/5"
                : "border-white/10 bg-neutral-900/50"
          }`}
          data-testid={`stream-panel-${model.id}`}
        >
          <div className="flex items-center justify-between">
            <ProviderBadge provider={model.provider} className="text-white" />
            <div className="text-[11px] font-mono text-white/60 tabular-nums">
              ${state.liveCostUSD.toFixed(5)}
            </div>
          </div>
          <div className="mt-1 text-xs text-white/50">{model.displayName}</div>

          <div className="mt-3 text-sm text-white/90 whitespace-pre-wrap leading-relaxed min-h-[200px]">
            {state.text}
            {state.status === "streaming" && (
              <span className="inline-block h-4 w-1.5 align-middle bg-white/70 animate-pulse ml-0.5" />
            )}
          </div>

          <div className="mt-3 flex items-center justify-between text-[11px] text-white/50 tabular-nums">
            <span>
              {state.status === "pending" ? "Waiting…" : state.status === "streaming" ? "Streaming" : "Done"}
            </span>
            <span>
              {state.tokens > 0 ? `${state.tokens} tokens` : ""}
              {state.durationMs !== null ? ` · ${(state.durationMs / 1000).toFixed(1)}s` : ""}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
