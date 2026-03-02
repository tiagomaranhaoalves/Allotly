import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { StatsCard } from "@/components/brand/stats-card";
import { BudgetBar } from "@/components/brand/budget-bar";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { SpendCard } from "@/components/brand/spend-card";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  DollarSign, Users, Ticket, Plug, Plus, ArrowRight,
  TrendingUp, Key, Activity, ShoppingCart, Clock,
  AlertTriangle, CheckCircle, XCircle, Copy, Zap,
  Timer, Hash,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";

const PROVIDER_COLORS: Record<string, string> = {
  OPENAI: "#10A37F",
  ANTHROPIC: "#D4A574",
  GOOGLE: "#4285F4",
};

const PROVIDER_NAMES: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  GOOGLE: "Google",
};

function formatTimeAgo(date: string | Date) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function RootAdminOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/root-overview"] });
  const { data: vouchers } = useQuery<any[]>({ queryKey: ["/api/vouchers"] });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  const spendByTeam = data?.spendByTeam || [];
  const spendByProvider = data?.spendByProvider || [];
  const recentAlerts = data?.recentAlerts || [];
  const providerHealth = data?.providerHealth || [];

  const chartTeamData = spendByTeam.map((t: any) => ({
    name: t.teamName,
    spend: t.spendCents / 100,
  }));

  const chartProviderData = spendByProvider.map((p: any) => ({
    name: PROVIDER_NAMES[p.provider] || p.provider,
    value: p.spendCents / 100,
    provider: p.provider,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Organization overview and insights</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Spend"
          value={`$${((data?.totalSpendCents || 0) / 100).toFixed(2)}`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatsCard
          title="Active Members"
          value={String(data?.totalMembers || 0)}
          icon={<Users className="w-5 h-5" />}
        />
        <StatsCard
          title="Active Vouchers"
          value={String(data?.activeVouchers || 0)}
          icon={<Ticket className="w-5 h-5" />}
        />
        <Card className="p-5 relative overflow-hidden" data-testid="stats-card-provider-health">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Provider Health</p>
            <div className="flex items-center gap-3 mt-3">
              {providerHealth.length > 0 ? providerHealth.map((p: any) => (
                <div key={p.provider} className="flex items-center gap-1.5">
                  {p.status === "ACTIVE" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <XCircle className="w-4 h-4 text-red-500" />
                  )}
                  <span className="text-sm font-medium">{PROVIDER_NAMES[p.provider] || p.provider}</span>
                </div>
              )) : (
                <span className="text-sm text-muted-foreground">No providers</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4" data-testid="text-spend-by-team">Spend by Team</h2>
          {chartTeamData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartTeamData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor', fontSize: 12 }} />
                <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']}
                />
                <Bar dataKey="spend" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<TrendingUp className="w-8 h-8 text-muted-foreground" />}
              title="No spend data"
              description="Spend data will appear once members start using AI"
            />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4" data-testid="text-spend-by-provider">Spend by Provider</h2>
          {chartProviderData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={chartProviderData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                  label={({ name, value, x, y, cx }: any) => (
                    <text x={x} y={y} fill="hsl(var(--foreground))" fontSize={11} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
                      {`${name}: $${value.toFixed(2)}`}
                    </text>
                  )}
                >
                  {chartProviderData.map((entry: any) => (
                    <Cell key={entry.provider} fill={PROVIDER_COLORS[entry.provider] || "#6366F1"} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, 'Spend']}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<Activity className="w-8 h-8 text-muted-foreground" />}
              title="No provider data"
              description="Provider spend will appear after usage"
            />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold">Recent Alerts</h2>
          </div>
          {recentAlerts.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentAlerts.map((alert: any, i: number) => (
                <div key={alert.id || i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50" data-testid={`alert-item-${i}`}>
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${alert.thresholdPercent >= 100 ? 'text-red-500' : alert.thresholdPercent >= 90 ? 'text-amber-500' : 'text-yellow-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{alert.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      Budget {alert.thresholdPercent}% reached
                      {alert.actionTaken && ` — ${alert.actionTaken}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatTimeAgo(alert.triggeredAt)}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {alert.accessMode === "PROXY" ? "Voucher" : "Direct"}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle className="w-8 h-8 text-muted-foreground" />}
              title="No alerts"
              description="All budgets are within limits"
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold">Recent Vouchers</h2>
            <Link href="/dashboard/vouchers">
              <Button variant="secondary" size="sm" data-testid="button-view-vouchers">
                View All <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          {vouchers && vouchers.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {vouchers.slice(0, 5).map((v: any) => (
                <div key={v.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <div>
                    <code className="font-mono text-xs text-primary">{v.code}</code>
                    {v.label && <p className="text-xs text-muted-foreground mt-0.5">{v.label}</p>}
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${v.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`}>
                    {v.currentRedemptions}/{v.maxRedemptions}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Ticket className="w-8 h-8 text-muted-foreground" />}
              title="No vouchers yet"
              description="Create vouchers to distribute AI access"
            />
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">Quick Actions</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/dashboard/teams">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-add-team">
              <Users className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Add Team Admin</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create a new team</p>
            </div>
          </Link>
          <Link href="/dashboard/providers">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-connect-provider">
              <Plug className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Connect Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">OpenAI, Anthropic, Google</p>
            </div>
          </Link>
          <Link href="/dashboard/vouchers">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-create-voucher">
              <Ticket className="w-5 h-5 text-cyan-500 mb-2" />
              <p className="text-sm font-medium">Create Voucher</p>
              <p className="text-xs text-muted-foreground mt-0.5">Generate access codes</p>
            </div>
          </Link>
          <Link href="/dashboard/bundles">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-buy-bundle">
              <ShoppingCart className="w-5 h-5 text-cyan-500 mb-2" />
              <p className="text-sm font-medium">Buy Bundle</p>
              <p className="text-xs text-muted-foreground mt-0.5">Purchase voucher bundles</p>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function TeamAdminOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/team-overview"] });
  const { data: voucherStats } = useQuery<any>({ queryKey: ["/api/dashboard/voucher-stats"] });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );
  }

  const stats = data?.stats || {};
  const directMembers = data?.directMembers || [];
  const proxyMembers = data?.proxyMembers || [];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-team-dashboard-title">Team Dashboard</h1>
        <p className="text-muted-foreground mt-1">{data?.teamName || "Your team"} overview</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Team Spend" value={`$${((stats.totalSpendCents || 0) / 100).toFixed(2)}`} icon={<DollarSign className="w-5 h-5" />} />
        <StatsCard title="Direct Members" value={String(stats.directMemberCount || 0)} icon={<Key className="w-5 h-5" />} />
        <StatsCard title="Voucher Recipients" value={String(stats.proxyMemberCount || 0)} icon={<Ticket className="w-5 h-5" />} />
        <StatsCard title="Bundle Capacity" value={String(stats.bundleCapacityRemaining || 0)} icon={<ShoppingCart className="w-5 h-5" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <FeatureBadge type="TEAMS" />
            <h2 className="text-base font-semibold">Team Members</h2>
          </div>
          {directMembers.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {directMembers.map((m: any) => (
                <div key={m.id} className="p-3 rounded-lg bg-muted/50" data-testid={`member-direct-${m.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-medium">{m.userName}</p>
                      <p className="text-xs text-muted-foreground">{m.userEmail}</p>
                    </div>
                    <Badge variant={m.status === "ACTIVE" ? "default" : "secondary"} className="text-[10px]">
                      {m.status}
                    </Badge>
                  </div>
                  <BudgetBar spent={m.currentPeriodSpendCents} budget={m.monthlyBudgetCents} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Users className="w-8 h-8 text-muted-foreground" />}
              title="No direct members"
              description="Add team members for direct provider access"
              action={{ label: "Add Member", onClick: () => window.location.href = "/dashboard/members" }}
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <FeatureBadge type="VOUCHERS" />
            <h2 className="text-base font-semibold">Voucher Recipients</h2>
          </div>
          {proxyMembers.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {proxyMembers.map((m: any) => (
                <div key={m.id} className="p-3 rounded-lg bg-muted/50" data-testid={`member-proxy-${m.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-medium">{m.isVoucherUser ? "Anonymous" : m.userName}</p>
                      {m.voucherCode && (
                        <code className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">{m.voucherCode}</code>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{m.proxyRequestCount} requests</p>
                      {m.periodEnd && (
                        <p className="text-[11px] text-muted-foreground">
                          Expires {formatTimeAgo(m.periodEnd)}
                        </p>
                      )}
                    </div>
                  </div>
                  <BudgetBar spent={m.currentPeriodSpendCents} budget={m.monthlyBudgetCents} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Ticket className="w-8 h-8 text-muted-foreground" />}
              title="No voucher recipients"
              description="Recipients will appear when vouchers are redeemed"
            />
          )}
        </Card>
      </div>

      <Card className="p-5" data-testid="card-spend-overview">
        <h2 className="text-base font-semibold mb-4">Spend Comparison</h2>
        {(directMembers.length > 0 || proxyMembers.length > 0) ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={[
              {
                name: "Direct (Teams)",
                direct: directMembers.reduce((s: number, m: any) => s + m.currentPeriodSpendCents, 0) / 100,
                proxy: 0,
              },
              {
                name: "Proxy (Vouchers)",
                direct: 0,
                proxy: proxyMembers.reduce((s: number, m: any) => s + m.currentPeriodSpendCents, 0) / 100,
              },
            ]}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="name" tick={{ fill: 'currentColor', fontSize: 12 }} />
              <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`]}
              />
              <Legend />
              <Area type="monotone" dataKey="direct" stackId="1" stroke="#6366F1" fill="#6366F1" fillOpacity={0.3} name="Direct (Teams)" />
              <Area type="monotone" dataKey="proxy" stackId="1" stroke="#06B6D4" fill="#06B6D4" fillOpacity={0.3} name="Proxy (Vouchers)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={<TrendingUp className="w-8 h-8 text-muted-foreground" />}
            title="No spend data"
            description="Spend data will appear once members start using AI"
          />
        )}
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/dashboard/members">
          <Card className="p-5 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="link-manage-members">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="font-medium">Manage Members</p>
                <p className="text-sm text-muted-foreground">Add, modify, or suspend members</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/dashboard/vouchers">
          <Card className="p-5 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="link-manage-vouchers">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/40"><Ticket className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
              <div>
                <p className="font-medium">Manage Vouchers</p>
                <p className="text-sm text-muted-foreground">Create and distribute access codes</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function ProxyMemberOverview({ data }: { data: any }) {
  const { toast } = useToast();

  const daysRemaining = data?.voucherInfo?.expiresAt
    ? Math.max(0, Math.ceil((new Date(data.voucherInfo.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;

  const expiryColor = daysRemaining === null ? "text-muted-foreground"
    : daysRemaining <= 3 ? "text-red-500"
    : daysRemaining <= 7 ? "text-amber-500"
    : "text-emerald-500";

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-member-dashboard-title">My Dashboard</h1>
        <div className="flex items-center gap-2 mt-1">
          <FeatureBadge type="VOUCHERS" />
          <span className="text-sm text-muted-foreground">Proxy-based access via Allotly</span>
        </div>
      </div>

      <Card className="p-6" data-testid="card-budget">
        <h2 className="text-base font-semibold mb-4">Budget</h2>
        <div className="max-w-lg">
          <BudgetBar spent={data.spendCents} budget={data.budgetCents} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className="text-2xl font-bold" data-testid="text-budget-remaining">
              ${((data.budgetCents - data.spendCents) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Budget</p>
            <p className="text-2xl font-bold">${(data.budgetCents / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Requests Made</p>
            <p className="text-2xl font-bold" data-testid="text-request-count">{data.proxyRequestCount || 0}</p>
          </div>
        </div>
      </Card>

      {daysRemaining !== null && (
        <Card className="p-5" data-testid="card-expiry">
          <div className="flex items-center gap-3">
            <Timer className={`w-5 h-5 ${expiryColor}`} />
            <div>
              <p className="text-sm font-medium">Voucher Expiry</p>
              <p className={`text-lg font-bold ${expiryColor}`} data-testid="text-days-remaining">
                {daysRemaining === 0 ? "Expires today" : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining`}
              </p>
            </div>
          </div>
        </Card>
      )}

      <Card className="p-6" data-testid="card-api-key">
        <h2 className="text-base font-semibold mb-2">Your API Key</h2>
        <p className="text-sm text-muted-foreground mb-4">Use this with any OpenAI-compatible client</p>
        <div className="space-y-3">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <code className="font-mono text-sm flex-1" data-testid="text-key-prefix">
              {data.keyPrefix ? `${data.keyPrefix}...` : "No active key"}
            </code>
            {data.keyPrefix && (
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(data.keyPrefix)} data-testid="button-copy-key">
                <Copy className="w-4 h-4" />
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <code className="font-mono text-sm flex-1" data-testid="text-base-url">
              Base URL: {window.location.origin}/api/v1
            </code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${window.location.origin}/api/v1`)} data-testid="button-copy-url">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5" data-testid="card-models">
        <h2 className="text-base font-semibold mb-4">Available Models</h2>
        {data.availableModels && data.availableModels.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-2">
            {data.availableModels.map((m: any) => (
              <div key={m.modelId} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  <ProviderBadge provider={m.provider} />
                  <span className="text-sm">{m.displayName}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No models available</p>
        )}
      </Card>

      <Card className="p-5" data-testid="card-recent-requests">
        <h2 className="text-base font-semibold mb-4">Recent Requests</h2>
        {data.proxyLogs && data.proxyLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Time</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Model</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Tokens In</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Tokens Out</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Cost</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.proxyLogs.slice(0, 20).map((log: any) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`proxy-log-${log.id}`}>
                    <td className="py-2 px-3 text-muted-foreground">{formatTimeAgo(log.createdAt)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <ProviderBadge provider={log.provider} />
                        <span className="text-xs font-mono">{log.model}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">{log.inputTokens?.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono">{log.outputTokens?.toLocaleString()}</td>
                    <td className="py-2 px-3 text-right font-mono">${(log.costCents / 100).toFixed(4)}</td>
                    <td className="py-2 px-3 text-right text-muted-foreground">{log.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={<Zap className="w-8 h-8 text-muted-foreground" />}
            title="No requests yet"
            description="Make your first API call to see activity here"
          />
        )}
      </Card>
    </div>
  );
}

function DirectMemberOverview({ data }: { data: any }) {
  const providerLinks = data?.providerLinks || [];
  const usageSnapshots = data?.usageSnapshots || [];

  const chartData = usageSnapshots.slice(-30).map((s: any) => ({
    date: new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    cost: s.periodCostCents / 100,
  }));

  const providerSpend: Record<string, number> = {};
  for (const link of providerLinks) {
    providerSpend[link.provider] = (providerSpend[link.provider] || 0);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-member-dashboard-title">My Dashboard</h1>
        <div className="flex items-center gap-2 mt-1">
          <FeatureBadge type="TEAMS" />
          <span className="text-sm text-muted-foreground">Direct provider access</span>
        </div>
      </div>

      <Card className="p-6" data-testid="card-budget">
        <h2 className="text-base font-semibold mb-4">Budget</h2>
        <div className="max-w-lg">
          <BudgetBar spent={data.spendCents} budget={data.budgetCents} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className="text-2xl font-bold" data-testid="text-budget-remaining">
              ${((data.budgetCents - data.spendCents) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Budget</p>
            <p className="text-2xl font-bold">${(data.budgetCents / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Period</p>
            <p className="text-sm font-medium">
              {data.periodStart && new Date(data.periodStart).toLocaleDateString()} — {data.periodEnd && new Date(data.periodEnd).toLocaleDateString()}
            </p>
          </div>
        </div>
      </Card>

      {providerLinks.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {providerLinks.map((link: any) => (
            <SpendCard
              key={link.id}
              provider={link.provider}
              amountCents={0}
            />
          ))}
        </div>
      )}

      <Card className="p-5" data-testid="card-usage-chart">
        <h2 className="text-base font-semibold mb-4">Usage Trend</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fill: 'currentColor', fontSize: 11 }} />
              <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--popover-foreground)' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, 'Cost']}
              />
              <Line type="monotone" dataKey="cost" stroke="#6366F1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={<TrendingUp className="w-8 h-8 text-muted-foreground" />}
            title="No usage data yet"
            description="Usage data will appear after your first billing period"
          />
        )}
      </Card>

      <Card className="p-5" data-testid="card-provider-setup">
        <h2 className="text-base font-semibold mb-4">Provider Setup</h2>
        {providerLinks.length > 0 ? (
          <div className="space-y-3">
            {providerLinks.map((link: any) => (
              <div key={link.id} className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50" data-testid={`provider-link-${link.id}`}>
                <div className="flex items-center gap-2">
                  <ProviderBadge provider={link.provider} />
                  <span className="text-sm">{link.providerDisplayName}</span>
                </div>
                <Badge variant={link.setupStatus === "COMPLETE" ? "default" : "secondary"} className={
                  link.setupStatus === "COMPLETE"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : link.setupStatus === "FAILED"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }>
                  {link.setupStatus === "COMPLETE" ? <CheckCircle className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                  {link.setupStatus}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Plug className="w-8 h-8 text-muted-foreground" />}
            title="No providers set up"
            description="Your team admin will provision provider access for you"
          />
        )}
      </Card>
    </div>
  );
}

function MemberOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/member-overview"] });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!data?.membership) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
        <EmptyState
          icon={<Key className="w-8 h-8 text-muted-foreground" />}
          title="No active membership"
          description="You haven't been added to a team yet. Contact your administrator."
        />
      </div>
    );
  }

  if (data.accessMode === "PROXY") {
    return <ProxyMemberOverview data={data} />;
  }

  return <DirectMemberOverview data={data} />;
}

export default function DashboardOverview() {
  const { user } = useAuth();

  if (!user) return null;

  switch (user.orgRole) {
    case "ROOT_ADMIN": return <RootAdminOverview />;
    case "TEAM_ADMIN": return <TeamAdminOverview />;
    default: return <MemberOverview />;
  }
}
