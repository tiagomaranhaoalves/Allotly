import { useEffect, useMemo, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { ArrowRight, Check, ChevronDown, ChevronRight, ChevronsUpDown, Lock, Plus, X } from "lucide-react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { fetchKeyAllowedModels, type KeyAllowedModel } from "../engine/live";
import type { LineupSlots, ModelId, Provider, RepairNote } from "../types";

interface Props {
  onConfirm: () => void;
}

const PROVIDER_ORDER: Provider[] = ["OPENAI", "ANTHROPIC", "GOOGLE"];

export function DualRoleStep({ onConfirm }: Props) {
  const { t } = useTranslation();
  const session = useArenaSession();
  const { state, setAllowlist, setLineup, clearRepairs, confirmSetup } = session;

  const [adminCollapsed, setAdminCollapsed] = useState(false);
  const [expandedRationale, setExpandedRationale] = useState<ModelId | null>(null);

  const allowed = state.allowedModels;
  const lineup = state.lineup;
  const repairs = state.lastRepairs;
  const isLive = state.mode === "live";

  const customAllowed = useMemo(
    () => allowed.filter((id) => !CATALOG_BY_ID[id]),
    [allowed],
  );

  const [keyModels, setKeyModels] = useState<KeyAllowedModel[]>([]);
  const [keyModelsState, setKeyModelsState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [keyModelsError, setKeyModelsError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const setKeyModelPricingRef = useRef(session.setKeyModelPricing);
  setKeyModelPricingRef.current = session.setKeyModelPricing;

  useEffect(() => {
    if (!isLive || !state.keyValue) {
      setKeyModels([]);
      setKeyModelsState("idle");
      setKeyModelPricingRef.current({});
      return;
    }
    let cancelled = false;
    setKeyModelsState("loading");
    setKeyModelsError(null);
    void (async () => {
      const res = await fetchKeyAllowedModels(state.keyValue!);
      if (cancelled) return;
      if (res.ok) {
        setKeyModels(res.models);
        setKeyModelsState("ready");
        const pricing: Record<string, { input: number; output: number }> = {};
        for (const m of res.models) {
          pricing[m.id] = { input: m.inputPerM, output: m.outputPerM };
        }
        setKeyModelPricingRef.current(pricing);
      } else {
        setKeyModelsError(res.message);
        setKeyModelsState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLive, state.keyValue]);

  const MAX_CUSTOM_MODELS = 3;
  const customAtCap = customAllowed.length >= MAX_CUSTOM_MODELS;

  function addCustomModel(id: string) {
    if (!id) return;
    if (allowed.includes(id)) return;
    if (customAtCap) return;
    setAllowlist([...allowed, id]);
    setPickerOpen(false);
  }

  function removeCustomModel(id: string) {
    if (allowed.length <= 1) return;
    setAllowlist(allowed.filter((m) => m !== id));
  }

  const pickerCandidates = useMemo(
    () =>
      keyModels.filter(
        (m) => !CATALOG_BY_ID[m.id] && !allowed.includes(m.id),
      ),
    [keyModels, allowed],
  );

  useEffect(() => {
    if (repairs.length === 0) return;
    const timer = setTimeout(() => clearRepairs(), 5000);
    return () => clearTimeout(timer);
  }, [repairs, clearRepairs]);

  const grouped = useMemo(() => groupByTier(MODEL_CATALOG), []);

  const summary = useMemo(() => {
    if (allowed.length === 0) return { count: 0, cheapest: 0, max: 0 };
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
    if (next.length === 0) return;
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
              {t("arena.dualRole.twoHats")}
            </span>
            <span>{t("arena.dualRole.adminCuratesDevPicks")}</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">
            {t("arena.dualRole.headline")}
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
                    {t("arena.dualRole.adminStep")}
                  </span>
                </div>
                <h3 className="mt-2 text-lg font-semibold text-white">
                  {t("arena.dualRole.adminQuestion")}
                </h3>
                <p className="mt-1 text-sm text-white/65">
                  <Trans
                    i18nKey="arena.dualRole.adminDesc"
                    components={{ code: <code className="font-mono text-[12px] text-amber-200" /> }}
                  />
                </p>
                {isLive && (
                  <p
                    className="mt-2 text-xs text-emerald-300/90"
                    data-testid="text-live-any-model"
                  >
                    {t("arena.dualRole.liveAnyModel")}
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
                    {t("arena.dualRole.moreFromKey")}
                    <span className="ml-2 text-white/40 normal-case tracking-normal" data-testid="text-custom-cap">
                      {t("arena.dualRole.customAdded", { count: customAllowed.length, cap: MAX_CUSTOM_MODELS })}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/40">
                    {keyModelsState === "loading" && t("arena.dualRole.loadingFromKey")}
                    {keyModelsState === "ready" && t("arena.dualRole.extraAvailable", { count: pickerCandidates.length })}
                    {keyModelsState === "error" && t("arena.dualRole.couldntLoad")}
                  </div>
                </div>
                <p className="text-xs text-white/65 leading-relaxed mb-3">
                  <Trans
                    i18nKey="arena.dualRole.customDesc"
                    components={{ strong: <strong className="text-white" /> }}
                  />
                </p>
                <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      role="combobox"
                      aria-expanded={pickerOpen}
                      disabled={keyModelsState !== "ready" || pickerCandidates.length === 0 || customAtCap}
                      className="w-full justify-between bg-neutral-950 border-white/15 text-white hover:bg-neutral-900 hover:text-white"
                      data-testid="button-open-key-model-picker"
                    >
                      <span className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5" />
                        {keyModelsState === "loading"
                          ? t("arena.dualRole.pickerLoading")
                          : keyModelsState === "error"
                            ? t("arena.dualRole.pickerError")
                            : customAtCap
                              ? t("arena.dualRole.pickerCap", { cap: MAX_CUSTOM_MODELS })
                              : pickerCandidates.length === 0
                                ? t("arena.dualRole.pickerNoCandidates")
                                : t("arena.dualRole.pickerAdd", { remaining: MAX_CUSTOM_MODELS - customAllowed.length })}
                      </span>
                      <ChevronsUpDown className="w-4 h-4 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0 bg-neutral-950 border-white/15"
                    data-testid="popover-key-model-picker"
                  >
                    <Command className="bg-neutral-950 text-white">
                      <CommandInput
                        placeholder={t("arena.dualRole.pickerSearch")}
                        className="text-white placeholder:text-white/40"
                        data-testid="input-key-model-search"
                      />
                      <CommandList>
                        <CommandEmpty>{t("arena.dualRole.pickerNoMatch")}</CommandEmpty>
                        <CommandGroup>
                          {pickerCandidates.map((m) => {
                            const provider = (["OPENAI", "ANTHROPIC", "GOOGLE"].includes(m.provider)
                              ? m.provider
                              : inferProvider(m.id)) as Provider;
                            return (
                              <CommandItem
                                key={m.id}
                                value={`${m.id} ${m.displayName}`}
                                onSelect={() => addCustomModel(m.id)}
                                className="text-white aria-selected:bg-white/10 cursor-pointer"
                                data-testid={`option-key-model-${m.id}`}
                              >
                                <div className="flex w-full items-center gap-2">
                                  <ProviderBadge provider={provider} className="text-white" />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm truncate">{m.displayName}</div>
                                    <div className="text-[10px] font-mono text-white/40 truncate">
                                      {m.id}
                                    </div>
                                  </div>
                                  {m.inputPerM > 0 && (
                                    <div className="text-[10px] font-mono text-white/60 tabular-nums">
                                      ${m.inputPerM.toFixed(2)}/1M
                                    </div>
                                  )}
                                </div>
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {keyModelsState === "error" && keyModelsError && (
                  <p className="mt-2 text-xs text-rose-300" data-testid="text-key-models-error">
                    {keyModelsError}
                  </p>
                )}
                {customAllowed.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2" data-testid="list-custom-models">
                    {customAllowed.map((id) => {
                      const meta = keyModels.find((m) => m.id === id);
                      const provider = (meta && ["OPENAI", "ANTHROPIC", "GOOGLE"].includes(meta.provider)
                        ? meta.provider
                        : inferProvider(id)) as Provider;
                      return (
                        <li
                          key={id}
                          className="inline-flex items-center gap-2 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-100"
                          data-testid={`custom-model-${id}`}
                        >
                          <ProviderBadge provider={provider} className="text-white" />
                          <span>{meta?.displayName ?? id}</span>
                          {meta && meta.displayName !== id && (
                            <code className="font-mono text-[10px] text-emerald-200/70">
                              {id}
                            </code>
                          )}
                          <button
                            type="button"
                            onClick={() => removeCustomModel(id)}
                            className="text-emerald-200/80 hover:text-rose-200"
                            aria-label={t("arena.dualRole.removeAria", { id })}
                            data-testid={`button-remove-custom-${id}`}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between border-t border-white/10 pt-4">
              <div className="text-xs text-white/60">
                <Trans
                  i18nKey="arena.dualRole.summary"
                  values={{
                    count: summary.count,
                    total: MODEL_CATALOG.length + customAllowed.length,
                    cheapest: summary.cheapest.toFixed(2),
                    max: summary.max.toFixed(2),
                  }}
                  components={{ c: <span className="font-mono text-white/80" /> }}
                />
              </div>
              <Button
                size="sm"
                className="bg-indigo-500 hover:bg-indigo-400 text-white"
                onClick={handleContinueToLineup}
                data-testid="button-continue-to-lineup"
              >
                {t("arena.dualRole.continueToLineup")}
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
                {t("arena.dualRole.adminLocked")}
              </span>
              <span className="text-sm text-white/80">
                {t("arena.dualRole.allowlistLocked", { count: summary.count })}
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
              {t("arena.dualRole.edit")} <ChevronDown className="w-3 h-3" />
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
              {t("arena.dualRole.devStep")}
            </span>
            <h3 className="mt-2 text-lg font-semibold text-white">
              {t("arena.dualRole.devQuestion")}
            </h3>
            <p className="mt-1 text-sm text-white/65">
              <Trans
                i18nKey="arena.dualRole.devDesc"
                components={{ code: <code className="font-mono text-[12px] text-white/85" /> }}
              />
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
            {t("arena.dualRole.sameModelOk")}
          </p>

          <div className="mt-6 flex justify-end">
            <Button
              size="lg"
              className="bg-indigo-500 hover:bg-indigo-400 text-white"
              disabled={!adminCollapsed}
              onClick={handleLockAndRun}
              data-testid="button-lock-lineup"
            >
              {t("arena.dualRole.lockAndRun")}
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
  const { t } = useTranslation();
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
          aria-label={
            checked
              ? t("arena.dualRole.rowBlock", { name: entry.displayName })
              : t("arena.dualRole.rowAllow", { name: entry.displayName })
          }
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
          <div className="text-[10px] text-white/40">
            {t("arena.dualRole.rowOut", { price: entry.outputPerM.toFixed(2) })}
          </div>
        </div>
        {entry.hasCachedContent ? (
          <span className="hidden md:inline text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-500/10 text-emerald-300">
            {t("arena.dualRole.rowCached")}
          </span>
        ) : (
          <span className="hidden md:inline text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/5 text-white/50">
            {t("arena.dualRole.rowNoCache")}
          </span>
        )}
        <button
          type="button"
          onClick={onExpand}
          className="text-white/50 hover:text-white p-1"
          aria-label={
            expanded
              ? t("arena.dualRole.rowHideRationale", { name: entry.displayName })
              : t("arena.dualRole.rowShowRationale", { name: entry.displayName })
          }
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
  const { t } = useTranslation();
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
        {t("arena.dualRole.slotLabel", { n: index + 1 })}
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
          <SelectValue placeholder={t("arena.dualRole.slotPlaceholder")} />
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
                        <span className="text-[10px] text-emerald-300">{t("arena.dualRole.slotCached")}</span>
                      ) : (
                        <span className="text-[10px] text-amber-300">{t("arena.dualRole.slotNotCached")}</span>
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
                {t("arena.dualRole.slotCustomGroup")}
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
                    <span className="text-[10px] text-emerald-300">{t("arena.dualRole.slotLiveOnly")}</span>
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
          {isCustomValue
            ? t("arena.dualRole.slotLiveOnly")
            : t("arena.dualRole.slotPriceIn", { price: meta.inputPerM.toFixed(2) })}
        </div>
      </div>

      {!valueAllowed ? (
        <div className="mt-2 text-[11px] text-rose-300 flex items-center gap-1">
          <Lock className="w-3 h-3" /> {t("arena.dualRole.slotNotAllowed")}
        </div>
      ) : isCustomValue ? (
        <div className="mt-2 text-[11px] text-emerald-300 flex items-center gap-1">
          <Check className="w-3 h-3" /> {t("arena.dualRole.slotCustomStreams")}
        </div>
      ) : meta.hasCachedContent ? (
        <div className="mt-2 text-[11px] text-emerald-300 flex items-center gap-1">
          <Check className="w-3 h-3" /> {t("arena.dualRole.slotCachedReady")}
        </div>
      ) : (
        <div className="mt-2 text-[11px] text-amber-300">
          {t("arena.dualRole.slotNoCached")}
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
              <div className="font-medium">{t("arena.dualRole.repairTitle", { n: index + 1 })}</div>
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
                {t("arena.dualRole.repairReason")}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
