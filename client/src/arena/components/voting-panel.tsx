import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import type { ModelMeta } from "../types";

export interface VoteSlot {
  slotKey: string;
  index: number;
  model: ModelMeta;
}

interface Props {
  slots: VoteSlot[];
  onSubmit: (votes: { bestSlotKey: string; payMostSlotKey: string }) => void;
}

export function VotingPanel({ slots, onSubmit }: Props) {
  const [best, setBest] = useState<string | null>(null);
  const [payMost, setPayMost] = useState<string | null>(null);

  function handleSubmit() {
    if (!best || !payMost) return;
    onSubmit({ bestSlotKey: best, payMostSlotKey: payMost });
  }

  // Detect duplicate models in lineup so we can label slots disambiguatingly.
  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s.model.id, (counts.get(s.model.id) ?? 0) + 1);
  const hasDupes = Array.from(counts.values()).some((n) => n > 1);

  return (
    <div className="rounded-xl border border-white/10 bg-neutral-900/60 p-5">
      <h3 className="text-white font-semibold">One click each.</h3>
      <p className="mt-1 text-sm text-white/60">
        The gap between these two answers is the teaching moment.
      </p>

      <VoteRow
        label="Which output is best?"
        slots={slots}
        value={best}
        onChange={setBest}
        showSlotLabel={hasDupes}
        testIdPrefix="vote-best"
      />
      <VoteRow
        label="Which would you have paid the most for?"
        slots={slots}
        value={payMost}
        onChange={setPayMost}
        showSlotLabel={hasDupes}
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
  slots,
  value,
  onChange,
  showSlotLabel,
  testIdPrefix,
}: {
  label: string;
  slots: VoteSlot[];
  value: string | null;
  onChange: (v: string) => void;
  showSlotLabel: boolean;
  testIdPrefix: string;
}) {
  const cols = slots.length === 1 ? "sm:grid-cols-1" : slots.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <div className="mt-4">
      <div className="text-sm text-white/80 mb-2">{label}</div>
      <div className={`grid gap-2 ${cols}`}>
        {slots.map((s) => {
          const selected = value === s.slotKey;
          return (
            <button
              key={s.slotKey}
              type="button"
              onClick={() => onChange(s.slotKey)}
              className={`rounded-lg border px-3 py-2.5 text-left transition ${
                selected
                  ? "border-indigo-400/60 bg-indigo-500/15"
                  : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/5"
              }`}
              data-testid={`${testIdPrefix}-${s.slotKey}`}
            >
              <div className="flex items-center gap-2">
                <ProviderBadge provider={s.model.provider} className="text-white" />
                {showSlotLabel && (
                  <span className="text-[10px] uppercase tracking-wide text-white/50">
                    Slot {s.index + 1}
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-xs text-white/60">{s.model.displayName}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
