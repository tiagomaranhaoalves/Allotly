import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { useTranslation } from "react-i18next";

interface StatsCardProps {
  title: string;
  value: string;
  change?: number;
  icon?: React.ReactNode;
  className?: string;
}

export function StatsCard({ title, value, change, icon, className = "" }: StatsCardProps) {
  const { t } = useTranslation();
  return (
    <Card className={`p-5 relative overflow-hidden ${className}`} data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-extrabold tracking-tight">{value}</p>
        </div>
        {icon && (
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-indigo-800/20 text-indigo-600 dark:text-indigo-400 shrink-0">
            {icon}
          </div>
        )}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1.5 mt-3">
          {change > 0 ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30">
              <TrendingUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{t("dashboard.components.statsCard.increase", { change })}</span>
            </div>
          ) : change < 0 ? (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-900/30">
              <TrendingDown className="w-3 h-3 text-red-600 dark:text-red-400" />
              <span className="text-xs font-semibold text-red-600 dark:text-red-400">{t("dashboard.components.statsCard.decrease", { change })}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-muted">
              <Minus className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">{t("dashboard.components.statsCard.noChange")}</span>
            </div>
          )}
          <span className="text-[11px] text-muted-foreground">{t("dashboard.components.statsCard.vsLastPeriod")}</span>
        </div>
      )}
    </Card>
  );
}
