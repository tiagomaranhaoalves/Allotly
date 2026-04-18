import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import type { ModelMeta, ModelId } from "../types";

interface Props {
  models: ModelMeta[];
  onSubmit: (votes: { bestPick: ModelId; wouldPayMostPick: ModelId }) => void;
}

export function VotingPanel({ models, onSubmit }: Props) {
  const [best, setBest] = useState<ModelId | null>(null);
  const [payMost, setPayMost] = useState<ModelId | null>(null);

  function handleSubmit() {
    if (!best || !payMost) return;
    onSubmit({ bestPick: best, wouldPayMostPick: payMost });
  }

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5">
      <h3 className="text-white font-semibold">One click each.</h3>
      <p className="mt-1 text-sm text-white/60">
        The gap between these two answers is the teaching moment.
      </p>

      <VoteRow
        label="Which output is best?"
        models={models}
        value={best}
        onChange={setBest}
        testIdPrefix="vote-best"
      />
      <VoteRow
        label="Which would you have paid the most for?"
        models={models}
        value={payMost}
        onChange={setPayMost}
        testIdPrefix="vote-paymost"
      />

      <div className="mt-5 flex justify-end">
        <Button
          className="bg-indigo-500 hover:bg-indigo-400 text-white"
          disabled={!best || !payMost}
          onClick={handleSubmit}
          data-testid="button-submit-votes"
        >
          Reveal results
        </Button>
      </div>
    </div>
  );
}

function VoteRow({
  label,
  models,
  value,
  onChange,
  testIdPrefix,
}: {
  label: string;
  models: ModelMeta[];
  value: ModelId | null;
  onChange: (v: ModelId) => void;
  testIdPrefix: string;
}) {
  return (
    <div className="mt-4">
      <div className="text-sm text-white/80 mb-2">{label}</div>
      <div className="grid gap-2 sm:grid-cols-3">
        {models.map((m) => {
          const selected = value === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange(m.id)}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-indigo-400/60 bg-indigo-500/15"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/5"
              }`}
              data-testid={`${testIdPrefix}-${m.id}`}
            >
              <ProviderBadge provider={m.provider} className="text-white" />
              <div className="mt-0.5 text-xs text-white/60">{m.displayName}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
