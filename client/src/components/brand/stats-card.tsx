import { Card } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface StatsCardProps {
  title: string;
  value: string;
  change?: number;
  icon?: React.ReactNode;
  className?: string;
}

export function StatsCard({ title, value, change, icon, className = "" }: StatsCardProps) {
  return (
    <Card className={`p-5 ${className}`} data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1.5">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold tracking-tight">{value}</p>
        </div>
        {icon && (
          <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
            {icon}
          </div>
        )}
      </div>
      {change !== undefined && (
        <div className="flex items-center gap-1 mt-3">
          {change > 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
          ) : change < 0 ? (
            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
          ) : (
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span className={`text-xs font-medium ${change > 0 ? "text-emerald-600 dark:text-emerald-400" : change < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}>
            {change > 0 ? "+" : ""}{change}% from last period
          </span>
        </div>
      )}
    </Card>
  );
}
