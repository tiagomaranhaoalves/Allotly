export function BudgetBar({ spent, budget, className = "", showLabel = true }: { spent: number; budget: number; className?: string; showLabel?: boolean }) {
  const percent = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const color = percent >= 90 ? "bg-red-500" : percent >= 60 ? "bg-amber-500" : "bg-emerald-500";
  const textColor = percent >= 90 ? "text-red-600 dark:text-red-400" : percent >= 60 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className={`w-full ${className}`} data-testid="budget-bar">
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center justify-between gap-1 mt-1">
          <span className={`text-xs font-medium ${textColor}`}>
            ${(spent / 100).toFixed(2)} / ${(budget / 100).toFixed(2)}
          </span>
          <span className={`text-xs font-semibold ${textColor}`}>
            {percent.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
