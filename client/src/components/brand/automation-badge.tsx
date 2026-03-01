import { Badge } from "@/components/ui/badge";
import { Zap, Clock, BookOpen } from "lucide-react";

const CONFIG: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  FULL_AUTO: { label: "Instant Setup", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: <Zap className="w-3 h-3 mr-1" /> },
  SEMI_AUTO: { label: "Quick Setup", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: <Clock className="w-3 h-3 mr-1" /> },
  GUIDED: { label: "Guided Setup", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300", icon: <BookOpen className="w-3 h-3 mr-1" /> },
};

export function AutomationBadge({ level }: { level: string }) {
  const config = CONFIG[level] || CONFIG.GUIDED;
  return (
    <Badge variant="secondary" className={`${config.className} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-automation-${level.toLowerCase()}`}>
      {config.icon}
      {config.label}
    </Badge>
  );
}
