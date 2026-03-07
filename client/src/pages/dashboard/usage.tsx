import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { BudgetBar } from "@/components/brand/budget-bar";
import { Badge } from "@/components/ui/badge";
import { Activity, Zap, DollarSign, Clock, Hash } from "lucide-react";

export default function UsagePage() {
  const { user } = useAuth();

  const { data: overview, isLoading } = useQuery<any>({
    queryKey: ["/api/dashboard/member-overview"],
  });

  const membership = overview?.membership;
  const hasUsage = membership && (membership.currentPeriodSpendCents > 0 || overview?.proxyRequestCount > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-usage-heading">Usage</h1>
        <p className="text-muted-foreground mt-1">View your API usage and spending</p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
          </div>
          <Skeleton className="h-40" />
        </div>
      ) : membership ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-5" data-testid="card-spend">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Current Spend</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-current-spend">
                ${((overview?.spendCents || membership.currentPeriodSpendCents || 0) / 100).toFixed(2)}
              </p>
            </Card>
            <Card className="p-5" data-testid="card-budget">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Budget</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-budget">
                ${((overview?.budgetCents || membership.monthlyBudgetCents || 0) / 100).toFixed(2)}
              </p>
            </Card>
            <Card className="p-5" data-testid="card-requests">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Requests</span>
              </div>
              <p className="text-2xl font-bold" data-testid="text-request-count">
                {(overview?.proxyRequestCount || 0).toLocaleString()}
              </p>
            </Card>
            <Card className="p-5" data-testid="card-status">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
              </div>
              <Badge
                variant="secondary"
                className={`no-default-hover-elevate no-default-active-elevate mt-1 ${
                  membership.status === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : membership.status === "SUSPENDED"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
                data-testid="badge-status"
              >
                {membership.status}
              </Badge>
            </Card>
          </div>

          <Card className="p-6" data-testid="card-budget-bar">
            <h2 className="text-base font-semibold mb-4">Budget Utilization</h2>
            <div className="max-w-lg">
              <BudgetBar
                spent={overview?.spendCents || membership.currentPeriodSpendCents || 0}
                budget={overview?.budgetCents || membership.monthlyBudgetCents || 0}
                showLabel
              />
            </div>
            {membership.periodEnd && (
              <div className="flex items-center gap-1.5 mt-4 text-sm text-muted-foreground">
                <Clock className="w-3.5 h-3.5" />
                <span>Period resets {new Date(membership.periodEnd).toLocaleDateString()}</span>
              </div>
            )}
          </Card>

          {!hasUsage && (
            <EmptyState
              icon={<Activity className="w-10 h-10 text-muted-foreground" />}
              title="No usage data yet"
              description="Once your team starts making API calls, usage will appear here"
            />
          )}
        </div>
      ) : (
        <EmptyState
          icon={<Activity className="w-10 h-10 text-muted-foreground" />}
          title="No usage data yet"
          description="Once your team starts making API calls, usage will appear here"
        />
      )}
    </div>
  );
}
