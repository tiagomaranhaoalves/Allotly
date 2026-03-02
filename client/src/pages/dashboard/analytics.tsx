import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { BudgetBar } from "@/components/brand/budget-bar";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { BarChart3, TrendingUp, AlertTriangle, Lightbulb, Users, ArrowUpRight, ArrowDownRight, Calendar } from "lucide-react";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Area, AreaChart, ReferenceLine, Legend, Cell,
} from "recharts";

const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10a37f",
  ANTHROPIC: "#d4a574",
  GOOGLE: "#4285f4",
};

const TIME_RANGES = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function CostPerModelSection() {
  const [days, setDays] = useState(30);
  const { data, isLoading } = useQuery<any[]>({
    queryKey: ["/api/analytics/cost-per-model", days],
    queryFn: () => fetch(`/api/analytics/cost-per-model?days=${days}`, { credentials: "include" }).then(r => r.json()),
  });

  const chartData = (data || []).slice(0, 10).map(item => ({
    name: item.model || "Unknown",
    cost: item.costCents / 100,
    provider: item.provider,
    requests: item.requests,
    fill: PROVIDER_COLORS[item.provider] || "#6366f1",
  }));

  return (
    <Card className="p-5" data-testid="card-cost-per-model">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold" data-testid="heading-cost-per-model">Cost per Model</h2>
        </div>
        <div className="flex gap-1">
          {TIME_RANGES.map(r => (
            <Button
              key={r.value}
              size="sm"
              variant={days === r.value ? "default" : "outline"}
              className="h-7 px-3 text-xs"
              onClick={() => setDays(r.value)}
              data-testid={`button-range-${r.label}`}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : chartData.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-no-cost-data">No usage data available for the selected period.</p>
      ) : (
        <div>
          <div className="h-[300px]" data-testid="chart-cost-per-model">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20, top: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" tickFormatter={v => `$${v}`} tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  formatter={(value: number) => [`$${value.toFixed(2)}`, "Cost"]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={28}>
                  {chartData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border">
            {Object.entries(PROVIDER_COLORS).map(([provider, color]) => {
              const hasData = chartData.some(d => d.provider === provider);
              if (!hasData) return null;
              return (
                <div key={provider} className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm" style={{ background: color }} />
                  <span className="text-xs text-muted-foreground">{provider}</span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 space-y-2">
            {(data || []).slice(0, 10).map((item: any) => (
              <div key={`${item.provider}:${item.model}`} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors" data-testid={`row-model-${item.model}`}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: PROVIDER_COLORS[item.provider] || "#6366f1" }} />
                  <span className="text-sm font-medium">{item.model}</span>
                  <ProviderBadge provider={item.provider} className="text-xs" />
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold">{formatCents(item.costCents)}</span>
                  {item.requests > 0 && (
                    <span className="text-xs text-muted-foreground ml-2">{item.requests.toLocaleString()} req</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function TopSpendersSection() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/analytics/top-spenders"] });
  const [sortField, setSortField] = useState<"spendCents" | "utilization" | "budgetCents">("spendCents");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = (data || []).slice().sort((a, b) => {
    const diff = a[sortField] - b[sortField];
    return sortDir === "desc" ? -diff : diff;
  });

  function toggleSort(field: typeof sortField) {
    if (sortField === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function SortHeader({ field, label, className = "" }: { field: typeof sortField; label: string; className?: string }) {
    const active = sortField === field;
    return (
      <th
        className={`py-2 px-2 font-medium text-muted-foreground text-xs cursor-pointer hover:text-foreground select-none ${className}`}
        onClick={() => toggleSort(field)}
        data-testid={`sort-${field}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active && <span className="text-primary">{sortDir === "desc" ? "↓" : "↑"}</span>}
        </span>
      </th>
    );
  }

  return (
    <Card className="p-5" data-testid="card-top-spenders">
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold" data-testid="heading-top-spenders">Top Spenders</h2>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center" data-testid="text-no-spenders">No member spend data available.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-top-spenders">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">#</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Member</th>
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Team</th>
                <SortHeader field="spendCents" label="Spend" className="text-right" />
                <SortHeader field="budgetCents" label="Budget" className="text-right hidden sm:table-cell" />
                <SortHeader field="utilization" label="Utilization" className="w-32 hidden lg:table-cell" />
                <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs hidden md:table-cell">Type</th>
              </tr>
            </thead>
            <tbody>
              {sorted.slice(0, 15).map((row: any, idx: number) => (
                <tr key={row.membershipId} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-spender-${idx}`}>
                  <td className="py-2.5 px-2 text-muted-foreground font-mono text-xs">{idx + 1}</td>
                  <td className="py-2.5 px-2">
                    <div>
                      <span className="font-medium text-sm">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">{row.email}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-2 text-sm text-muted-foreground hidden md:table-cell">{row.team}</td>
                  <td className="py-2.5 px-2 text-right font-semibold text-sm">{formatCents(row.spendCents)}</td>
                  <td className="py-2.5 px-2 text-right text-sm text-muted-foreground hidden sm:table-cell">{formatCents(row.budgetCents)}</td>
                  <td className="py-2.5 px-2 hidden lg:table-cell">
                    <BudgetBar spent={row.spendCents} budget={row.budgetCents} showLabel={true} />
                  </td>
                  <td className="py-2.5 px-2 text-center hidden md:table-cell">
                    <FeatureBadge type={row.accessMode === "PROXY" ? "VOUCHERS" : "TEAMS"} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function SpendForecastSection() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/analytics/forecast"] });

  const chartData = (data?.dailySpend || []).map((d: any) => ({
    date: d.date,
    spend: d.costCents / 100,
  }));

  if (data && chartData.length > 0) {
    const lastDate = new Date(chartData[chartData.length - 1].date);
    const slope = (data.slope || 0) / 100;
    const intercept = (data.intercept || data.dailyAvg || 0) / 100;
    const baseIndex = chartData.length;
    for (let i = 1; i <= Math.min(data.daysRemaining || 0, 14); i++) {
      const projDate = new Date(lastDate);
      projDate.setDate(projDate.getDate() + i);
      const projectedValue = Math.max(0, intercept + slope * (baseIndex + i - 1));
      chartData.push({
        date: projDate.toISOString().split("T")[0],
        spend: null,
        projected: Math.round(projectedValue * 100) / 100,
      });
    }
  }

  const projectedTotal = data?.projectedMonthEnd || 0;
  const totalBudget = data?.totalBudget || 0;
  const warningExceeds = data?.warningExceeds || false;

  return (
    <Card className="p-5" data-testid="card-spend-forecast">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold" data-testid="heading-spend-forecast">Spend Forecast</h2>
      </div>

      {isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Projected Month-End</p>
              <p className={`text-xl font-bold mt-1 ${warningExceeds ? "text-red-600 dark:text-red-400" : ""}`} data-testid="text-projected-total">
                {formatCents(projectedTotal)}
              </p>
              {warningExceeds && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-xs text-red-600 dark:text-red-400">Exceeds budget</span>
                </div>
              )}
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Daily Average</p>
              <p className="text-xl font-bold mt-1" data-testid="text-daily-avg">{formatCents(data?.dailyAvg || 0)}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Days Remaining</p>
              <p className="text-xl font-bold mt-1" data-testid="text-days-remaining">{data?.daysRemaining || 0}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground">Total Budget</p>
              <p className="text-xl font-bold mt-1" data-testid="text-total-budget">{totalBudget > 0 ? formatCents(totalBudget) : "—"}</p>
            </div>
          </div>

          {chartData.length > 0 && (
            <div className="h-[250px] mt-4" data-testid="chart-forecast">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <defs>
                    <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="projectedGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    stroke="hsl(var(--muted-foreground))"
                    tickFormatter={(d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" tickFormatter={v => `$${v}`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [`$${(value || 0).toFixed(2)}`, name === "spend" ? "Actual" : "Projected"]}
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                    labelFormatter={(d) => new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
                  />
                  <Area type="monotone" dataKey="spend" stroke="#6366f1" fill="url(#spendGradient)" strokeWidth={2} connectNulls={false} dot={false} />
                  <Area type="monotone" dataKey="projected" stroke="#f59e0b" fill="url(#projectedGradient)" strokeWidth={2} strokeDasharray="5 5" connectNulls={false} dot={false} />
                  {totalBudget > 0 && (
                    <ReferenceLine y={totalBudget / 100} stroke="#ef4444" strokeDasharray="8 4" strokeWidth={1.5} label={{ value: "Budget", position: "right", fill: "#ef4444", fontSize: 11 }} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          {chartData.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-forecast-summary">
              At current rate, {warningExceeds ? "spending will exceed budget" : "spending is within budget"} with a projected {formatCents(projectedTotal)} by month end.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

function AnomalyDetectionSection() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/analytics/anomalies"] });

  return (
    <Card className="p-5" data-testid="card-anomalies">
      <div className="flex items-center gap-2 mb-4">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <h2 className="text-base font-semibold" data-testid="heading-anomalies">Anomaly Detection</h2>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-no-anomalies">
          No anomalies detected. Members spending within their 7-day rolling averages.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-anomalies">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 px-2 font-medium text-muted-foreground text-xs">Member</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Today's Spend</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs">Avg Daily</th>
                <th className="text-center py-2 px-2 font-medium text-muted-foreground text-xs">Multiplier</th>
                <th className="text-right py-2 px-2 font-medium text-muted-foreground text-xs hidden sm:table-cell">Detected</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row: any) => (
                <tr key={row.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors" data-testid={`row-anomaly-${row.id}`}>
                  <td className="py-2.5 px-2">
                    <span className="font-medium">{row.memberName}</span>
                    <span className="block text-xs text-muted-foreground">{row.memberEmail}</span>
                  </td>
                  <td className="py-2.5 px-2 text-right font-semibold text-red-600 dark:text-red-400">
                    {formatCents(row.todaySpendCents)}
                  </td>
                  <td className="py-2.5 px-2 text-right text-muted-foreground">
                    {formatCents(row.avgDailyCents)}
                  </td>
                  <td className="py-2.5 px-2 text-center">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                      <ArrowUpRight className="w-3 h-3" />
                      {row.multiplier}x
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                    {new Date(row.detectedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function OptimizationSection() {
  const { data, isLoading } = useQuery<any[]>({ queryKey: ["/api/analytics/optimization"] });

  return (
    <Card className="p-5" data-testid="card-optimization">
      <div className="flex items-center gap-2 mb-4">
        <Lightbulb className="w-5 h-5 text-amber-500" />
        <h2 className="text-base font-semibold" data-testid="heading-optimization">Optimization Recommendations</h2>
      </div>

      {isLoading ? (
        <Skeleton className="h-20 w-full" />
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="text-no-optimizations">
          No optimization recommendations at this time. Usage patterns look efficient.
        </p>
      ) : (
        <div className="space-y-3">
          {data.map((rec: any, idx: number) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border ${
                rec.type === "model_downgrade"
                  ? "bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800/30"
                  : "bg-muted/50 border-border"
              }`}
              data-testid={`card-recommendation-${idx}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className={`text-sm font-medium ${
                    rec.type === "model_downgrade"
                      ? "text-amber-800 dark:text-amber-300"
                      : "text-foreground"
                  }`}>
                    {rec.title}
                  </p>
                  <p className={`text-xs mt-1 ${
                    rec.type === "model_downgrade"
                      ? "text-amber-700 dark:text-amber-400"
                      : "text-muted-foreground"
                  }`}>
                    {rec.description}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    {formatCents(rec.estimatedSavingsCents)}
                  </p>
                  <p className="text-xs text-muted-foreground">est. savings</p>
                </div>
              </div>
              {rec.type === "model_downgrade" && rec.suggestedModelDisplay && (
                <p className="text-xs text-muted-foreground mt-2">
                  Suggested alternative: <span className="font-medium text-foreground">{rec.suggestedModelDisplay}</span>
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function AnalyticsPage() {
  return (
    <div className="space-y-6" data-testid="page-analytics">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="heading-analytics">Analytics</h1>
        <p className="text-muted-foreground mt-1">Cost breakdown, trends, and optimization insights</p>
      </div>

      <CostPerModelSection />
      <TopSpendersSection />
      <SpendForecastSection />

      <div className="grid md:grid-cols-2 gap-6">
        <AnomalyDetectionSection />
        <OptimizationSection />
      </div>
    </div>
  );
}
