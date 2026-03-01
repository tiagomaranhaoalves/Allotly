import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { BarChart3, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";

export default function AnalyticsPage() {
  const { data: models } = useQuery<any[]>({ queryKey: ["/api/models"] });

  const mockCostByModel = [
    { model: "GPT-4o", provider: "OPENAI", cost: 45230, requests: 1250 },
    { model: "Claude Sonnet 4.5", provider: "ANTHROPIC", cost: 31200, requests: 890 },
    { model: "GPT-4o Mini", provider: "OPENAI", cost: 8900, requests: 4200 },
    { model: "Gemini 2.5 Flash", provider: "GOOGLE", cost: 3400, requests: 2100 },
    { model: "Claude Haiku 4.5", provider: "ANTHROPIC", cost: 2100, requests: 1800 },
  ];

  const maxCost = Math.max(...mockCostByModel.map(m => m.cost));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground mt-1">Cost breakdown, trends, and optimization insights</p>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-6">
          <BarChart3 className="w-5 h-5 text-primary" />
          <h2 className="text-base font-semibold">Cost per Model</h2>
        </div>
        <div className="space-y-4">
          {mockCostByModel.map(item => (
            <div key={item.model} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.model}</span>
                  <ProviderBadge provider={item.provider} className="text-xs" />
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold">${(item.cost / 100).toFixed(2)}</span>
                  <span className="text-xs text-muted-foreground ml-2">{item.requests.toLocaleString()} requests</span>
                </div>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${(item.cost / maxCost) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="text-base font-semibold">Spend Forecast</h2>
          </div>
          <div className="space-y-4">
            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-sm text-muted-foreground">Projected month-end</p>
              <p className="text-3xl font-bold mt-1">$2,890</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Within budget</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Daily avg</p>
                <p className="text-lg font-semibold">$96</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">Days remaining</p>
                <p className="text-lg font-semibold">18</p>
              </div>
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold">Optimization Tips</h2>
          </div>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/30">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Model downgrade opportunity</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                3 members using GPT-4o for tasks GPT-4o-mini could handle — save ~$45/month
              </p>
            </div>
            <div className="p-3 rounded-lg bg-muted/50">
              <p className="text-sm font-medium">Budget utilization</p>
              <p className="text-xs text-muted-foreground mt-1">
                2 members have used less than 10% of their budget this period
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-semibold">Anomaly Detection</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          No anomalies detected. Members spending within their 7-day rolling averages.
        </p>
      </Card>
    </div>
  );
}
