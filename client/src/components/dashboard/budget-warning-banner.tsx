import { useQuery } from "@tanstack/react-query";
import { Trans, useTranslation } from "react-i18next";
import { Link } from "wouter";
import { AlertTriangle, AlertCircle, XCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type WarningLevel = "low" | "critical" | "exhausted";
type WarningBranch = "admin" | "member" | "voucher";

interface BudgetWarning {
  level: WarningLevel;
  message: string;
  remaining_pct: number;
  suggestion: {
    text: string;
    cheapest_model_in_allowlist: string | null;
    topup_url: string | null;
    topup_via_mcp_tool: string | null;
  };
}

interface MemberOverviewResponse {
  warning?: BudgetWarning | null;
  display?: {
    formatted: { remaining: string; total: string };
  };
  accessType?: string;
}

function pickBranch(w: BudgetWarning): WarningBranch {
  if (w.suggestion.topup_via_mcp_tool === "request_topup") return "voucher";
  if (w.suggestion.topup_url) return "admin";
  return "member";
}

const LEVEL_STYLES: Record<WarningLevel, { className: string; Icon: typeof AlertTriangle }> = {
  low: {
    className:
      "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200 [&>svg]:text-amber-600 dark:[&>svg]:text-amber-400",
    Icon: AlertTriangle,
  },
  critical: {
    className:
      "border-orange-400/60 bg-orange-50 text-orange-900 dark:border-orange-500/40 dark:bg-orange-950/30 dark:text-orange-200 [&>svg]:text-orange-600 dark:[&>svg]:text-orange-400",
    Icon: AlertCircle,
  },
  exhausted: {
    className:
      "border-red-400/60 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/30 dark:text-red-200 [&>svg]:text-red-600 dark:[&>svg]:text-red-400",
    Icon: XCircle,
  },
};

export function BudgetWarningBanner() {
  const { t, i18n } = useTranslation();
  const { data } = useQuery<MemberOverviewResponse>({
    queryKey: ["/api/dashboard/member-overview"],
  });

  // Banner is scoped to TEAM users (admins + members). Voucher recipients
  // receive warnings via MCP tool responses, not via the dashboard banner.
  const warning = data?.warning;
  if (!warning) return null;
  if (data?.accessType && data.accessType !== "TEAM") return null;

  const branch = pickBranch(warning);
  const { className, Icon } = LEVEL_STYLES[warning.level];

  const cheapest = warning.suggestion.cheapest_model_in_allowlist;
  const topupUrl = warning.suggestion.topup_url;
  const amountRemaining = data?.display?.formatted.remaining ?? "";
  const amountTotal = data?.display?.formatted.total ?? "";

  // Message: localize when key exists, otherwise fall back to server-rendered
  // English text (which is locked-source-of-truth and already includes formatted
  // amounts).
  const messageKey = `dashboard.budgetWarning.${branch}.${warning.level}.message`;
  const messageText = i18n.exists(messageKey)
    ? t(messageKey, {
        remaining_pct: warning.remaining_pct,
        amount_remaining: amountRemaining,
        amount_total: amountTotal,
      })
    : warning.message;

  // Suggestion key: only "low" / "critical" support a cheaper-model variant.
  // "exhausted" only ships a single `suggestion` key per branch.
  const suggestionKeyBase = `dashboard.budgetWarning.${branch}.${warning.level}`;
  const useCheaperVariant =
    warning.level !== "exhausted" && cheapest && i18n.exists(`${suggestionKeyBase}.suggestion`);
  const suggestionKey = useCheaperVariant
    ? `${suggestionKeyBase}.suggestion`
    : warning.level === "exhausted"
      ? `${suggestionKeyBase}.suggestion`
      : `${suggestionKeyBase}.suggestion_no_model`;
  const suggestionExists = i18n.exists(suggestionKey);

  // Per-branch <Trans /> components map. <0> is the model code chip; <1> is
  // either the topup link (admin) or a request_topup code chip (voucher).
  // Member branch never uses <1> in copy but we provide a no-op span for safety.
  const codeClass = "rounded bg-black/5 px-1 py-0.5 font-mono text-xs dark:bg-white/10";
  const transComponents =
    branch === "admin"
      ? [
          <code className={codeClass} key="0" />,
          <Link
            href={topupUrl ?? "/dashboard/billing"}
            className="font-medium underline underline-offset-2 hover:opacity-80"
            key="1"
            data-testid="link-budget-warning-topup"
          />,
        ]
      : branch === "voucher"
        ? [
            <code className={codeClass} key="0" />,
            <code className={codeClass} key="1" />,
          ]
        : [
            <code className={codeClass} key="0" />,
            <span key="1" />,
          ];

  return (
    <Alert
      className={cn("flex items-start gap-3", className)}
      data-testid={`alert-budget-warning-${warning.level}`}
    >
      <Icon className="h-4 w-4" />
      <AlertDescription className="flex-1 space-y-2">
        <p className="font-medium" data-testid="text-budget-warning-message">
          {messageText}
        </p>
        <p className="text-sm" data-testid="text-budget-warning-suggestion">
          {suggestionExists ? (
            <Trans
              i18nKey={suggestionKey}
              values={{
                cheapest_model: cheapest ?? "",
                topup_url: topupUrl ?? "/dashboard/billing",
              }}
              components={transComponents}
            />
          ) : (
            warning.suggestion.text
          )}
        </p>
        {branch === "admin" && topupUrl && (
          <div className="pt-1">
            <Button
              asChild
              size="sm"
              variant="outline"
              data-testid="button-budget-warning-topup"
            >
              <Link href={topupUrl}>{t("dashboard.budgetWarning.topUp")}</Link>
            </Button>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

export default BudgetWarningBanner;
