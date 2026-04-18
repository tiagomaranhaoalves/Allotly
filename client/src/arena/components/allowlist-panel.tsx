import { Lock, Check } from "lucide-react";
import { ProviderBadge } from "@/components/brand/provider-badge";
import type { ModelMeta, Provider } from "../types";

interface BlockedModel {
  id: string;
  displayName: string;
  provider: Provider;
  reason: string;
}

const BLOCKED_MODELS: BlockedModel[] = [
  { id: "gpt-4o", displayName: "GPT-4o", provider: "OPENAI", reason: "Restricted: ~10× cost of mini" },
  { id: "o1-preview", displayName: "o1-preview", provider: "OPENAI", reason: "Restricted: reasoning model, premium tier" },
  { id: "claude-opus-4-20250514", displayName: "Claude Opus 4", provider: "ANTHROPIC", reason: "Restricted: premium tier only" },
  { id: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", provider: "GOOGLE", reason: "Restricted: ~8× cost of Flash" },
];

interface Props {
  allowedModels: ModelMeta[];
}

export function AllowlistPanel({ allowedModels }: Props) {
  return (
    <div className="rounded-lg border border-white/10 bg-neutral-900/60 px-4 py-3" data-testid="allowlist-panel">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-white/50">Model allowlist</div>
          <div className="text-xs text-white/70">Your admin allowed these 3 models for this voucher</div>
        </div>
        <div className="text-[10px] text-white/40 hidden sm:block">Set per voucher · enforced at the proxy</div>
      </div>

      <div className="grid gap-1.5">
        {allowedModels.map(m => (
          <div
            key={m.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-emerald-500/20 bg-emerald-500/5 text-xs"
            data-testid={`allowed-model-${m.id}`}
          >
            <Check className="w-3 h-3 text-emerald-400 shrink-0" />
            <ProviderBadge provider={m.provider} className="text-white" />
            <span className="text-white/90 font-medium">{m.displayName}</span>
            <code className="text-[10px] font-mono text-white/40 ml-auto truncate">{m.id}</code>
          </div>
        ))}

        {BLOCKED_MODELS.map(m => (
          <div
            key={m.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded border border-white/5 bg-white/[0.02] text-xs opacity-50"
            title={m.reason}
            data-testid={`blocked-model-${m.id}`}
          >
            <Lock className="w-3 h-3 text-white/40 shrink-0" />
            <ProviderBadge provider={m.provider} className="text-white" />
            <span className="text-white/60 line-through">{m.displayName}</span>
            <span className="text-[10px] text-white/40 ml-auto truncate hidden sm:inline">{m.reason}</span>
          </div>
        ))}
      </div>

      <div className="mt-2 text-[10px] text-white/40">
        In production, requests for blocked models return <code className="font-mono">403 model_not_allowed</code>.
      </div>
    </div>
  );
}
