import { Badge } from "@/components/ui/badge";
import { Key, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";

export function FeatureBadge({ type }: { type: "TEAMS" | "VOUCHERS" }) {
  const { t } = useTranslation();
  if (type === "TEAMS") {
    return (
      <Badge variant="secondary" className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 no-default-hover-elevate no-default-active-elevate" data-testid="badge-feature-teams">
        <Key className="w-3 h-3 mr-1" />
        {t("dashboard.components.featureBadge.teams")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 no-default-hover-elevate no-default-active-elevate" data-testid="badge-feature-vouchers">
      <Ticket className="w-3 h-3 mr-1" />
      {t("dashboard.components.featureBadge.vouchers")}
    </Badge>
  );
}
