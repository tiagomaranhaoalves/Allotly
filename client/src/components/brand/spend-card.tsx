import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown } from "lucide-react";

const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10A37F",
  ANTHROPIC: "#D4A574",
  GOOGLE: "#4285F4",
};

const PROVIDER_NAMES: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google",
};

type ProviderType = "OPENAI" | "ANTHROPIC" | "GOOGLE";

interface SpendCardProps {
  provider: ProviderType;
  amountCents: number;
  trend?: number;
  className?: string;
}

export function SpendCard({ provider, amountCents, trend, className = "" }: SpendCardProps) {
  const color = PROVIDER_COLORS[provider] || "#6366F1";
  const name = PROVIDER_NAMES[provider] || provider;

  return (
    <Card className={`p-5 relative overflow-hidden ${className}`} data-testid={`spend-card-${provider.toLowerCase()}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: color }} />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{name}</span>
          </div>
          <p className="text-2xl font-extrabold tracking-tight">${(amountCents / 100).toFixed(2)}</p>
        </div>
        <div className="p-2.5 rounded-xl shrink-0" style={{ backgroundColor: `${color}15` }}>
          <div className="w-5 h-5 rounded-full" style={{ backgroundColor: color, opacity: 0.8 }} />
        </div>
      </div>
      {trend !== undefined && trend !== 0 && (
        <div className="flex items-center gap-1.5 mt-3">
          {trend > 0 ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30">
              <TrendingUp className="w-3 h-3 text-red-600 dark:text-red-400" />
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">+{trend}%</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30">
              <TrendingDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{trend}%</span>
            </div>
          )}
          <span className="text-[11px] text-muted-foreground">vs last period</span>
        </div>
      )}
    </Card>
  );
}
