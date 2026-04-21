import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EmptyStateProps {
  icon: React.ReactNode;
  title?: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  const { t } = useTranslation();
  const displayTitle = title ?? t("dashboard.components.emptyState.defaultTitle");
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center" data-testid="empty-state">
      <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/30 dark:to-indigo-800/10 mb-5 shadow-sm">
        {icon}
      </div>
      <h3 className="text-lg font-bold mb-1.5">{displayTitle}</h3>
      {description && (
        <p className="text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="gap-2" data-testid="button-empty-state-action">
          {action.label}
          <ArrowRight className="w-4 h-4" />
        </Button>
      )}
    </div>
  );
}
