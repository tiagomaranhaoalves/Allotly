import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronDown, ChevronRight, Lock, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  inferProvider,
  type CatalogEntry,
  type Tier,
} from "../data/model-catalog";
import type { LineupSlots, ModelId, Provider, RepairNote } from "../types";

interface Props {
  onConfirm: () => void;
}

const PROVIDER_ORDER: Provider[] = ["OPENAI", "ANTHROPIC", "GOOGLE"];

export function DualRoleStep({ onConfirm }: Props) {
  const { state, setAllowlist, setLineup, clearRepairs, confirmSetup } = useArenaSession();

  const [adminCollapsed, setAdminCollapsed] = useState(false);
  const [expandedRationale, setExpandedRationale] = useState<ModelId | null>(null);

  const allowed = state.allowedModels;
  const lineup = state.lineup;
  const repairs = state.lastRepairs;
  const isLive = state.mode === "live";

  // In live mode, any allowed id that isn't in the catalog is a user-added
  // custom model. We show it under its own group so it's clearly user-added.
  const customAllowed = useMemo(
    () => allowed.filter((id) => !CATALOG_BY_ID[id]),
    [allowed],
  );

  const [customDraft, setCustomDraft] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);

  function addCustomModel() {
    const id = customDraft.trim();
    if (!id) return;
    if (id.length > 80) {
      setCustomError("Model id is too long.");
      return;
    }
    if (allowed.includes(id)) {
      setCustomError("Already on the allowlist.");
      return;
    }
    setAllowlist([...allowed, id]);
    setCustomDraft("");
    setCustomError(null);
  }

  function removeCustomModel(id: string) {
    if (allowed.length <= 1) return;
    setAllowlist(allowed.filter((m) => m !== id));
  }

  // Auto-fade the inline repair note(s) ~5s after the allowlist toggle.
  useEffect(() => {
    if (repairs.length === 0) return;
    const timer = setTimeout(() => clearRepairs(), 5000);
    return () => clearTimeout(timer);
  }, [repairs, clearRepairs]);

  const grouped = useMemo(() => groupByTier(MODEL_CATALOG), []);

  const summary = useMemo(() => {
    if (allowed.length === 0) return { count: 0, cheapest: 0, max: 0 };
    // Custom (live-only) ids aren't in the catalog, so we can't price them.
    // Compute cheapest/max only across known catalog entries.
    const prices = allowed
      .map((id) => CATALOG_BY_ID[id]?.inputPerM)
      .filter((p): p is number => typeof p === "number");
    return {
      count: allowed.length,
      cheapest: prices.length > 0 ? Math.min(...prices) : 0,
      max: prices.length > 0 ? Math.max(...prices) : 0,
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
                {isLive && (
                  <p
                    className="mt-2 text-xs text-emerald-300/90"
                    data-testid="text-live-any-model"
                  >
                    Live mode: not limited to the catalog — add any model id your key allows
                    below to race it for real.
                  </p>
                )}
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

            {isLive && (
              <div
                className="mt-5 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] p-4"
                data-testid="custom-model-section"
              >
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <div className="text-[11px] uppercase tracking-wide text-emerald-300">
                    Custom · any model your key allows
                  </div>
                  <div className="text-[11px] text-white/40">
                    e.g. <code className="font-mono">o3</code>, <code className="font-mono">claude-opus-4-1</code>, <code className="font-mono">gemini-1.5-pro</code>
                  </div>
                </div>
                <div className="flex items-stretch gap-2">
                  <Input
                    value={customDraft}
                    onChange={(e) => {
                      setCustomDraft(e.target.value);
                      if (customError) setCustomError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomModel();
                      }
                    }}
                    placeholder="model id (e.g. gpt-5)"
                    className="bg-neutral-950 border-white/10 text-white text-sm"
                    data-testid="input-custom-model"
                  />
                  <Button
                    type="button"
                    onClick={addCustomModel}
                    disabled={!customDraft.trim()}
                    className="bg-emerald-500 hover:bg-emerald-400 text-black"
                    data-testid="button-add-custom-model"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add
                  </Button>
                </div>
                {customError && (
                  <p className="mt-2 text-xs text-rose-300" data-testid="text-custom-model-error">
                    {customError}
                  </p>
                )}
                {customAllowed.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" data-testid="list-custom-models">
                    {customAllowed.map((id) => {
                      const provider = inferProvider(id);
                      return (
                        <li
                          key={id}
                          className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100"
                          data-testid={`custom-model-${id}`}
                        >
                          <ProviderBadge provider={provider} className="text-white" />
                          <code className="font-mono">{id}</code>
                          <button
                            type="button"
                            onClick={() => removeCustomModel(id)}
                            className="text-emerald-200/80 hover:text-rose-200"
                            aria-label={`Remove ${id}`}
                            data-testid={`button-remove-custom-${id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-white/50 leading-relaxed">
                  These will be sent to the proxy as-is. If your key permits them, the round
                  streams from the real provider. Cached responses aren't available for custom
                  ids — you&rsquo;ll see live output only.
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="text-xs text-white/60">
                {summary.count} of {MODEL_CATALOG.length + customAllowed.length} allowed · cheapest{" "}
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
            {[0, 1, 2].map((i) => {
              const idx = i as 0 | 1 | 2;
              return (
                <SlotPicker
                  key={i}
                  index={idx}
                  value={lineup[idx]}
                  allowed={allowed}
                  customAllowed={customAllowed}
                  disabled={!adminCollapsed}
                  onChange={(v) => changeSlot(idx, v)}
                  repair={repairs.find((r) => r.slotIndex === idx) ?? null}
                />
              );
            })}
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
  customAllowed,
  disabled,
  onChange,
  repair,
}: {
  index: 0 | 1 | 2;
  value: ModelId;
  allowed: ModelId[];
  customAllowed: ModelId[];
  disabled: boolean;
  onChange: (v: ModelId) => void;
  repair: RepairNote | null;
}) {
  const catalogMeta = CATALOG_BY_ID[value];
  const isCustomValue = !catalogMeta;
  const meta = catalogMeta ?? {
    id: value,
    displayName: value,
    provider: inferProvider(value),
    inputPerM: 0,
    outputPerM: 0,
    hasCachedContent: false,
  };
  const valueAllowed = allowed.includes(value);

  // Group allowed CATALOG models by provider for the dropdown.
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
          {customAllowed.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-emerald-300/80 text-[10px] uppercase tracking-wide">
                Custom (live only)
              </SelectLabel>
              {customAllowed.map((id) => (
                <SelectItem
                  key={id}
                  value={id}
                  className="text-white focus:bg-white/10 focus:text-white"
                  data-testid={`slot-${index}-option-${id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{id}</span>
                    <span className="text-[10px] text-emerald-300">live only</span>
                  </div>
                </SelectItem>
              ))}
            </SelectGroup>
          )}
        </SelectContent>
      </Select>

      <div className="mt-3 flex items-center justify-between text-xs">
        <ProviderBadge provider={meta.provider} className="text-white" />
        <div className="font-mono text-white/70 tabular-nums">
          {isCustomValue ? "live only" : `$${meta.inputPerM.toFixed(2)}/1M in`}
        </div>
      </div>

      {!valueAllowed ? (
        <div className="mt-2 text-[11px] text-rose-300 flex items-center gap-1">
          <Lock className="w-3 h-3" /> Not on the allowlist anymore
        </div>
      ) : isCustomValue ? (
        <div className="mt-2 text-[11px] text-emerald-300 flex items-center gap-1">
          <Check className="w-3 h-3" /> Custom model · streams live from your key
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

      {repair && (
        <div
          className="mt-3 rounded-md border border-amber-400/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-100 leading-snug animate-in fade-in slide-in-from-top-1 duration-300"
          role="status"
          data-testid={`repair-note-${index}`}
        >
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5">⚠</span>
            <div className="min-w-0">
              <div className="font-medium">Slot {index + 1} auto-repaired</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-amber-200/90">
                <span className="line-through decoration-amber-300/60">
                  {CATALOG_BY_ID[repair.from]?.displayName ?? repair.from}
                </span>
                <ArrowRight className="w-3 h-3" />
                <span className="text-white">
                  {CATALOG_BY_ID[repair.to]?.displayName ?? repair.to}
                </span>
              </div>
              <div className="mt-0.5 text-amber-200/70">
                because you blocked it on the allowlist.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
