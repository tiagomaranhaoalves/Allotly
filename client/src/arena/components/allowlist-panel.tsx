import { Lock, Check, Zap } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { CATALOG_BY_ID, MODEL_CATALOG } from "../data/model-catalog";
import type { ModelId } from "../types";

interface Props {
  allowedModels: ModelId[];
  lineup: ModelId[];
}

export function AllowlistPanel({ allowedModels, lineup }: Props) {
  const { t } = useTranslation();
  const allowedSet = new Set(allowedModels);
  const lineupSet = new Set(lineup);

  const allowedSorted = MODEL_CATALOG
    .filter((m) => allowedSet.has(m.id))
    .sort((a, b) => a.inputPerM - b.inputPerM);
  const blocked = MODEL_CATALOG.filter((m) => !allowedSet.has(m.id));

  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900/60 px-4 py-3" data-testid="allowlist-panel">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/50">{t("arena.allowlist.title")}</div>
          <div className="text-xs text-white/70">
            {t("arena.allowlist.desc")}
          </div>
        </div>
        <div className="text-[10px] text-white/40 hidden sm:block">{t("arena.allowlist.setPerKey")}</div>
      </div>

      <div className="grid gap-1.5">
        {allowedSorted.map((m) => {
          const inLineup = lineupSet.has(m.id);
          return (
            <div
              key={m.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded border text-xs ${
                inLineup
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-white/10 bg-white/[0.02]"
              }`}
              data-testid={`allowed-model-${m.id}`}
            >
              {inLineup ? (
                <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
              ) : (
                <Check className="w-3 h-3 text-white/40 shrink-0" />
              )}
              <ProviderBadge provider={m.provider} className="text-white" />
              <span className={`font-medium truncate ${inLineup ? "text-white/95" : "text-white/70"}`}>
                {m.displayName}
              </span>
              {inLineup && (
                <span className="text-[9px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 rounded px-1 py-0.5">
                  {t("arena.allowlist.inLineup")}
                </span>
              )}
              <code className="text-[10px] font-mono text-white/40 ml-auto truncate hidden sm:inline">
                ${CATALOG_BY_ID[m.id].inputPerM.toFixed(2)}
              </code>
            </div>
          );
        })}

        {blocked.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/5 bg-white/[0.02] text-xs opacity-50"
            title={t("arena.allowlist.blockedTitle")}
            data-testid={`blocked-model-${m.id}`}
          >
            <Lock className="w-3 h-3 text-white/40 shrink-0" />
            <ProviderBadge provider={m.provider} className="text-white" />
            <span className="text-white/60 line-through truncate">{m.displayName}</span>
            <span className="text-[10px] text-white/40 ml-auto truncate hidden sm:inline">
              {t("arena.allowlist.blocked")}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-white/40">
        <Trans
          i18nKey="arena.allowlist.blockedNote"
          components={{ code: <code className="font-mono" /> }}
        />
      </div>
    </div>
  );
}
