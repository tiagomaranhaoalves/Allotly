import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { useArenaSession } from "../session";
import {
  CATALOG_BY_ID,
  MODEL_CATALOG,
  TIER_INTROS,
  TIER_ORDER,
  groupByTier,
  type CatalogEntry,
  type Tier,
} from "../data/model-catalog";
import type { LineupSlots, ModelId, Provider } from "../types";

interface Props {
  onConfirm: () => void;
}

const PROVIDER_ORDER: Provider[] = ["OPENAI", "ANTHROPIC", "GOOGLE"];

export function DualRoleStep({ onConfirm }: Props) {
  const { state, setAllowlist, setLineup, confirmSetup } = useArenaSession();

  const [adminCollapsed, setAdminCollapsed] = useState(false);
  const [expandedRationale, setExpandedRationale] = useState<ModelId | null>(null);

  const allowed = state.allowedModels;
  const lineup = state.lineup;

  const grouped = useMemo(() => groupByTier(MODEL_CATALOG), []);

  const summary = useMemo(() => {
    if (allowed.length === 0) return { count: 0, cheapest: 0, max: 0 };
    const prices = allowed.map((id) => CATALOG_BY_ID[id].inputPerM);
    return {
      count: allowed.length,
      cheapest: Math.min(...prices),
      max: Math.max(...prices),
    };
  }, [allowed]);

  function toggle(id: ModelId) {
    const next = allowed.includes(id) ? allowed.filter((m) => m !== id) : [...allowed, id];
    if (next.length === 0) return; // never allow empty
    setAllowlist(next);
  }

  function changeSlot(idx: 0 | 1 | 2, value: ModelId) {
    const next = [...lineup] as LineupSlots;
    next[idx] = value;
    setLineup(next);
  }

  function handleContinueToLineup() {
    setAdminCollapsed(true);
  }

  function handleEditAdmin() {
    setAdminCollapsed(false);
  }

  function handleLockAndRun() {
    confirmSetup();
    onConfirm();
  }

  const allowedSorted = useMemo(
    () =>
      MODEL_CATALOG.filter((m) => allowed.includes(m.id)).sort(
        (a, b) => a.inputPerM - b.inputPerM,
      ),
    [allowed],
  );

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 py-10">
      <div className="max-w-5xl mx-auto" data-testid="dual-role-step">
        <div className="mb-6">
          <div className="flex items-center gap-3 text-sm text-white/60">
            <span className="rounded-full bg-indigo-500/15 text-indigo-300 px-2.5 py-1 text-xs font-medium">
              Two hats
            </span>
            <span>Admin curates · developer picks the lineup. Both decisions are yours.</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            You're wearing two hats. Both decisions matter.
          </h2>
        </div>

        {/* PANEL 1 — ADMIN */}
        {!adminCollapsed ? (
          <div
            className="rounded-2xl border border-white/10 bg-neutral-900/60 p-6 mb-5"
            data-testid="admin-panel"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium">
                    Step 1 · Admin hat
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  Which models is this key allowed to call?
                </h3>
                <p className="mt-1 text-sm text-white/65">
                  In production this is the membership editor. Pick what your team's key can call. Allotly enforces this at the proxy — a request for a model that isn't on your list returns{" "}
                  <code className="font-mono text-[12px] text-amber-200">403 model_not_allowed</code> before a token is charged.
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-5">
              {TIER_ORDER.map((tier) => {
                const list = grouped.get(tier) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={tier}>
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-[11px] uppercase tracking-wide text-white/50">
                        {TIER_INTROS[tier].label}
                      </span>
                      <span className="text-[11px] text-white/40">
                        {TIER_INTROS[tier].subtitle}
                      </span>
                    </div>
                    <div className="grid gap-1.5">
                      {list.map((m) => (
                        <ModelRow
                          key={m.id}
                          entry={m}
                          checked={allowed.includes(m.id)}
                          onToggle={() => toggle(m.id)}
                          expanded={expandedRationale === m.id}
                          onExpand={() =>
                            setExpandedRationale((prev) => (prev === m.id ? null : m.id))
                          }
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="text-xs text-white/60">
                {summary.count} of {MODEL_CATALOG.length} allowed · cheapest{" "}
                <span className="font-mono text-white/80">${summary.cheapest.toFixed(2)}</span> · most{" "}
                <span className="font-mono text-white/80">${summary.max.toFixed(2)}</span>/1M in
              </div>
              <Button
                size="sm"
                className="bg-indigo-500 hover:bg-indigo-400 text-white"
                onClick={handleContinueToLineup}
                data-testid="button-continue-to-lineup"
              >
                Continue to lineup →
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleEditAdmin}
            className="w-full mb-5 rounded-xl border border-white/10 bg-neutral-900/40 hover:bg-neutral-900/70 transition px-4 py-3 flex items-center justify-between"
            data-testid="button-edit-admin"
          >
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-emerald-500/15 text-emerald-300 px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium">
                Admin hat ✓
              </span>
              <span className="text-sm text-white/80">
                Allowlist locked: {summary.count} model{summary.count === 1 ? "" : "s"}
              </span>
              <div className="hidden sm:flex items-center gap-1 ml-2">
                {allowedSorted.slice(0, 4).map((m) => (
                  <ProviderBadge key={m.id} provider={m.provider} className="text-white" />
                ))}
                {allowedSorted.length > 4 && (
                  <span className="text-[10px] text-white/50">+{allowedSorted.length - 4}</span>
                )}
              </div>
            </div>
            <span className="text-xs text-white/50 flex items-center gap-1">
              edit <ChevronDown className="w-3 h-3" />
            </span>
          </button>
        )}

        {/* PANEL 2 — DEVELOPER */}
        <div
          className={`rounded-2xl border p-6 transition ${
            adminCollapsed
              ? "border-indigo-400/40 bg-indigo-500/5"
              : "border-white/10 bg-neutral-900/40 opacity-70"
          }`}
          data-testid="developer-panel"
        >
          <div>
            <span className="rounded-full bg-indigo-500/15 text-indigo-300 px-2 py-0.5 text-[10px] uppercase tracking-wide font-medium">
              Step 2 · Developer hat
            </span>
            <h3 className="mt-2 text-lg font-semibold text-white">
              Now pick which 3 to race for this request.
            </h3>
            <p className="mt-1 text-sm text-white/65">
              Same key, three model IDs. Each call hits the proxy with{" "}
              <code className="font-mono text-[12px] text-white/85">model: "..."</code> — Allotly looks at your allowlist,
              picks the right upstream provider, and bills your budget.
            </p>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SlotPicker
                key={i}
                index={i as 0 | 1 | 2}
                value={lineup[i as 0 | 1 | 2]}
                allowed={allowed}
                disabled={!adminCollapsed}
                onChange={(v) => changeSlot(i as 0 | 1 | 2, v)}
              />
            ))}
          </div>

          <p className="mt-4 text-xs text-white/50">
            Same model in two slots is fine — useful for variant testing. We default to one per provider so you see the multi-provider hand-off.
          </p>

          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              className="bg-indigo-500 hover:bg-indigo-400 text-white"
              disabled={!adminCollapsed}
              onClick={handleLockAndRun}
              data-testid="button-lock-lineup"
            >
              Lock lineup and run round
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelRow({
  entry,
  checked,
  onToggle,
  expanded,
  onExpand,
}: {
  entry: CatalogEntry;
  checked: boolean;
  onToggle: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2.5 transition ${
        checked
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
      data-testid={`catalog-row-${entry.id}`}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggle}
          className={`shrink-0 w-4 h-4 rounded border flex items-center justify-center transition ${
            checked ? "border-emerald-400 bg-emerald-500/20" : "border-white/30 bg-transparent hover:border-white/60"
          }`}
          aria-label={checked ? `Block ${entry.displayName}` : `Allow ${entry.displayName}`}
          data-testid={`toggle-${entry.id}`}
        >
          {checked && <Check className="w-3 h-3 text-emerald-300" />}
        </button>
        <ProviderBadge provider={entry.provider} className="text-white" />
        <div className="flex-1 min-w-0">
          <div className="text-sm text-white/90 font-medium truncate">{entry.displayName}</div>
          <div className="text-[10px] font-mono text-white/40 truncate">{entry.id}</div>
        </div>
        <div className="text-right">
          <div className="text-xs font-mono text-white/80 tabular-nums">
            ${entry.inputPerM.toFixed(2)}/1M in
          </div>
          <div className="text-[10px] text-white/40">${entry.outputPerM.toFixed(2)} out</div>
        </div>
        {entry.hasCachedContent ? (
          <span className="hidden md:inline text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300">
            ✓ cached
          </span>
        ) : (
          <span className="hidden md:inline text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/5 text-white/50">
            no cache
          </span>
        )}
        <button
          type="button"
          onClick={onExpand}
          className="text-white/50 hover:text-white p-1"
          aria-label={`${expanded ? "Hide" : "Show"} rationale for ${entry.displayName}`}
          data-testid={`expand-${entry.id}`}
        >
          <ChevronRight className={`w-4 h-4 transition ${expanded ? "rotate-90" : ""}`} />
        </button>
      </div>
      {expanded && (
        <div className="mt-2 pl-7 text-xs text-white/70 leading-relaxed">{entry.rationale}</div>
      )}
    </div>
  );
}

function SlotPicker({
  index,
  value,
  allowed,
  disabled,
  onChange,
}: {
  index: 0 | 1 | 2;
  value: ModelId;
  allowed: ModelId[];
  disabled: boolean;
  onChange: (v: ModelId) => void;
}) {
  const meta = CATALOG_BY_ID[value];
  const valueAllowed = allowed.includes(value);

  // Group allowed models by provider for the dropdown
  const allowedEntries = MODEL_CATALOG.filter((m) => allowed.includes(m.id));
  const byProvider = new Map<Provider, CatalogEntry[]>();
  for (const p of PROVIDER_ORDER) byProvider.set(p, []);
  for (const e of allowedEntries) byProvider.get(e.provider)!.push(e);
  byProvider.forEach((list: CatalogEntry[]) => {
    list.sort((a, b) => a.inputPerM - b.inputPerM);
  });

  return (
    <div
      className="rounded-xl border border-white/10 bg-black/30 p-4"
      data-testid={`slot-${index}`}
    >
      <div className="text-[10px] uppercase tracking-wide text-white/50 mb-2">
        Slot {index + 1}
      </div>
      <Select
        value={value}
        onValueChange={(v) => onChange(v as ModelId)}
        disabled={disabled}
      >
        <SelectTrigger
          className="bg-neutral-950 border-white/15 text-white"
          data-testid={`slot-select-${index}`}
        >
          <SelectValue placeholder="Pick a model" />
        </SelectTrigger>
        <SelectContent className="bg-neutral-950 border-white/15 text-white">
          {PROVIDER_ORDER.map((p) => {
            const list = byProvider.get(p) ?? [];
            if (list.length === 0) return null;
            return (
              <SelectGroup key={p}>
                <SelectLabel className="text-white/50 text-[10px] uppercase tracking-wide">
                  {p}
                </SelectLabel>
                {list.map((e) => (
                  <SelectItem
                    key={e.id}
                    value={e.id}
                    className="text-white focus:bg-white/10 focus:text-white"
                    data-testid={`slot-${index}-option-${e.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <span>{e.displayName}</span>
                      <span className="text-[10px] font-mono text-white/40">
                        ${e.inputPerM.toFixed(2)}
                      </span>
                      {e.hasCachedContent ? (
                        <span className="text-[10px] text-emerald-300">✓ cached</span>
                      ) : (
                        <span className="text-[10px] text-amber-300">🚫 not cached</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectGroup>
            );
          })}
        </SelectContent>
      </Select>

      <div className="mt-3 flex items-center justify-between text-xs">
        <ProviderBadge provider={meta.provider} className="text-white" />
        <div className="font-mono text-white/70 tabular-nums">${meta.inputPerM.toFixed(2)}/1M in</div>
      </div>

      {!valueAllowed ? (
        <div className="mt-2 text-[11px] text-rose-300 flex items-center gap-1">
          <Lock className="w-3 h-3" /> Not on the allowlist anymore
        </div>
      ) : meta.hasCachedContent ? (
        <div className="mt-2 text-[11px] text-emerald-300 flex items-center gap-1">
          <Check className="w-3 h-3" /> Cached response ready
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-amber-300">
          🚫 No cached response — slot will show a placeholder
        </div>
      )}
    </div>
  );
}
