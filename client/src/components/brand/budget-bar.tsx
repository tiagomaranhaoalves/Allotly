import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatUsdCents, normalizeCurrency, type SupportedCurrency } from "@/lib/currency";

interface BudgetBarProps {
  /** USD-cents (canonical wire unit). */
  spent: number;
  /** USD-cents (canonical wire unit). */
  budget: number;
  className?: string;
  showLabel?: boolean;
  /** Override currency; falls back to /api/org/settings query when omitted. */
  currency?: SupportedCurrency;
  /** FX rate (USD→currency); falls back to /api/fx-rates query when omitted. */
  fxRate?: number;
  /** Server-formatted strings used when client Intl formatting fails. */
  serverFormatted?: { spent?: string; total?: string };
}

export function BudgetBar({ spent, budget, className = "", showLabel = true, currency, fxRate, serverFormatted }: BudgetBarProps) {
  const { t } = useTranslation();
  const callerProvided = currency !== undefined;
  const { data: org } = useQuery<any>({
    queryKey: ["/api/org/settings"],
    staleTime: 60_000,
    enabled: !callerProvided,
  });
  const { data: fx } = useQuery<any>({
    queryKey: ["/api/fx-rates"],
    staleTime: 60 * 60_000,
    enabled: !callerProvided,
  });

  const ccy: SupportedCurrency = currency || normalizeCurrency(org?.currency);
  const rate: number | undefined = callerProvided ? fxRate : fx?.rates?.[ccy];

  const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const color = percent >= 90 ? "bg-red-500" : percent >= 60 ? "bg-amber-500" : "bg-emerald-500";
  const bgColor = percent >= 90 ? "bg-red-100 dark:bg-red-950/30" : percent >= 60 ? "bg-amber-100 dark:bg-amber-950/30" : "bg-emerald-100 dark:bg-emerald-950/30";
  const textColor = percent >= 90 ? "text-red-600 dark:text-red-400" : percent >= 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  const { spentFmt, budgetFmt } = useMemo(() => ({
    spentFmt: formatUsdCents(spent, ccy, rate, undefined, serverFormatted?.spent),
    budgetFmt: formatUsdCents(budget, ccy, rate, undefined, serverFormatted?.total),
  }), [spent, budget, ccy, rate, serverFormatted?.spent, serverFormatted?.total]);

  return (
    <div className={`w-full ${className}`} data-testid="budget-bar" aria-label={t("dashboard.components.budgetBar.ariaLabel")}>
      <div className={`h-2.5 rounded-full overflow-hidden ${bgColor}`}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center justify-between gap-1 mt-1.5">
          <span className="text-xs font-medium text-muted-foreground" data-testid="text-budget-bar-amounts">
            <span className={`font-semibold ${textColor}`}>{spentFmt}</span> / {budgetFmt}
          </span>
          <span className={`text-xs font-bold ${textColor}`}>
            {t("dashboard.components.budgetBar.percent", { percent: percent.toFixed(0) })}
          </span>
        </div>
      )}
    </div>
  );
}
