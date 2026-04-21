import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  DollarSign, Users, Ticket, Plug, Plus, ArrowRight,
  TrendingUp, Key, Activity, ShoppingCart, Clock,
  AlertTriangle, CheckCircle, XCircle, Copy, Zap,
  Timer, Hash, ShieldCheck, Trash2, FolderOpen,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, LineChart, Line, Legend,
} from "recharts";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient as qc } from "@/lib/queryClient";

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

function formatTimeAgo(date: string | Date, t: TFunction) {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return t("dashboard.common.justNow");
  if (diffMins < 60) return t("dashboard.common.minutesAgo", { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t("dashboard.common.hoursAgo", { count: diffHours });
  const diffDays = Math.floor(diffHours / 24);
  return t("dashboard.common.daysAgo", { count: diffDays });
}

function RootAdminOverview() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-dashboard-title">{t("dashboard.overview.rootTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.overview.rootSubtitle")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatsCard
          title={t("dashboard.overview.totalSpend")}
          value={`$${((data?.totalSpendCents || 0) / 100).toFixed(2)}`}
          icon={<DollarSign className="w-5 h-5" />}
        />
        <StatsCard
          title={t("dashboard.overview.teamAdminSeats")}
          value={`${data?.activeTeamAdmins || 0} / ${data?.maxTeamAdmins || 0}`}
          icon={<ShieldCheck className="w-5 h-5" />}
        />
        <StatsCard
          title={t("dashboard.overview.activeMembers")}
          value={String(data?.totalMembers || 0)}
          icon={<Users className="w-5 h-5" />}
        />
        <StatsCard
          title={t("dashboard.overview.activeVouchers")}
          value={String(data?.activeVouchers || 0)}
          icon={<Ticket className="w-5 h-5" />}
        />
        <Card className="p-5 relative overflow-hidden" data-testid="stats-card-provider-health">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("dashboard.overview.providerHealth")}</p>
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
                <span className="text-sm text-muted-foreground">{t("dashboard.overview.noProviders")}</span>
              )}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4" data-testid="text-spend-by-team">{t("dashboard.overview.spendByTeam")}</h2>
          {chartTeamData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartTeamData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="name" className="text-xs" tick={{ fill: 'currentColor', fontSize: 12 }} />
                <YAxis tick={{ fill: 'currentColor', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', color: 'hsl(var(--popover-foreground))' }}
                  formatter={(value: number) => [`$${value.toFixed(2)}`, t("dashboard.overview.spendLabel")]}
                />
                <Bar dataKey="spend" fill="#6366F1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<TrendingUp className="w-8 h-8 text-muted-foreground" />}
              title={t("dashboard.overview.noSpendData")}
              description={t("dashboard.overview.noSpendDataDesc")}
            />
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-base font-semibold mb-4" data-testid="text-spend-by-provider">{t("dashboard.overview.spendByProvider")}</h2>
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
                  formatter={(value: number) => [`$${value.toFixed(2)}`, t("dashboard.overview.spendLabel")]}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState
              icon={<Activity className="w-8 h-8 text-muted-foreground" />}
              title={t("dashboard.overview.noProviderData")}
              description={t("dashboard.overview.noProviderDataDesc")}
            />
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold">{t("dashboard.overview.recentAlerts")}</h2>
          </div>
          {recentAlerts.length > 0 ? (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {recentAlerts.map((alert: any, i: number) => (
                <div key={alert.id || i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50" data-testid={`alert-item-${i}`}>
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${alert.thresholdPercent >= 100 ? 'text-red-500' : alert.thresholdPercent >= 90 ? 'text-amber-500' : 'text-yellow-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{alert.userName}</p>
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.overview.budgetReached", { percent: alert.thresholdPercent })}
                      {alert.actionTaken && ` — ${alert.actionTaken}`}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{formatTimeAgo(alert.triggeredAt, t)}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    {alert.accessType === "VOUCHER" ? t("dashboard.overview.voucherBadge") : t("dashboard.overview.teamBadge")}
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle className="w-8 h-8 text-muted-foreground" />}
              title={t("dashboard.overview.noAlerts")}
              description={t("dashboard.overview.noAlertsDesc")}
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold">{t("dashboard.overview.recentVouchers")}</h2>
            <Link href="/dashboard/vouchers">
              <Button variant="secondary" size="sm" data-testid="button-view-vouchers">
                {t("dashboard.common.viewAll")} <ArrowRight className="w-3 h-3 ml-1" />
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
              title={t("dashboard.overview.noVouchers")}
              description={t("dashboard.overview.noVouchersDesc")}
            />
          )}
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.quickActions")}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link href="/dashboard/teams">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-add-team">
              <Users className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">{t("dashboard.overview.addTeamAdmin")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.overview.addTeamAdminDesc")}</p>
            </div>
          </Link>
          <Link href="/dashboard/providers">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-connect-provider">
              <Plug className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">{t("dashboard.overview.connectProvider")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.overview.connectProviderDesc")}</p>
            </div>
          </Link>
          <Link href="/dashboard/vouchers">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-create-voucher">
              <Ticket className="w-5 h-5 text-cyan-500 mb-2" />
              <p className="text-sm font-medium">{t("dashboard.overview.createVoucher")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.overview.createVoucherDesc")}</p>
            </div>
          </Link>
          <Link href="/dashboard/bundles">
            <div className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer" data-testid="action-buy-bundle">
              <ShoppingCart className="w-5 h-5 text-cyan-500 mb-2" />
              <p className="text-sm font-medium">{t("dashboard.overview.buyBundle")}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.overview.buyBundleDesc")}</p>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function TeamAdminOverview() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-team-dashboard-title">{t("dashboard.overview.teamTitle")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.overview.teamSubtitle", { teamName: data?.teamName || t("dashboard.overview.yourTeam") })}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title={t("dashboard.overview.teamSpend")} value={`$${((stats.totalSpendCents || 0) / 100).toFixed(2)}`} icon={<DollarSign className="w-5 h-5" />} />
        <StatsCard title={t("dashboard.overview.directMembers")} value={String(stats.directMemberCount || 0)} icon={<Key className="w-5 h-5" />} />
        <StatsCard title={t("dashboard.overview.voucherRecipients")} value={String(stats.proxyMemberCount || 0)} icon={<Ticket className="w-5 h-5" />} />
        <StatsCard title={t("dashboard.overview.bundleCapacity")} value={String(stats.bundleCapacityRemaining || 0)} icon={<ShoppingCart className="w-5 h-5" />} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <FeatureBadge type="TEAMS" />
            <h2 className="text-base font-semibold">{t("dashboard.overview.teamMembers")}</h2>
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
              title={t("dashboard.overview.addFirstMember")}
              description={t("dashboard.overview.addFirstMemberDesc")}
              action={{ label: t("dashboard.overview.addMember"), onClick: () => window.location.href = "/dashboard/members" }}
            />
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <FeatureBadge type="VOUCHERS" />
            <h2 className="text-base font-semibold">{t("dashboard.overview.voucherRecipients")}</h2>
          </div>
          {proxyMembers.length > 0 ? (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {proxyMembers.map((m: any) => (
                <div key={m.id} className="p-3 rounded-lg bg-muted/50" data-testid={`member-proxy-${m.id}`}>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-medium">{m.isVoucherUser ? t("dashboard.overview.anonymous") : m.userName}</p>
                      {m.voucherCode && (
                        <code className="text-[11px] font-mono text-cyan-600 dark:text-cyan-400">{m.voucherCode}</code>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground">{t("dashboard.overview.requestsCount", { count: m.proxyRequestCount })}</p>
                      {m.periodEnd && (
                        <p className="text-[11px] text-muted-foreground">
                          {t("dashboard.overview.expires", { when: formatTimeAgo(m.periodEnd, t) })}
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
              title={t("dashboard.overview.noVoucherRecipients")}
              description={t("dashboard.overview.noVoucherRecipientsDesc")}
            />
          )}
        </Card>
      </div>

      <Card className="p-5" data-testid="card-spend-overview">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.spendComparison")}</h2>
        {(directMembers.length > 0 || proxyMembers.length > 0) ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={[
              {
                name: t("dashboard.overview.directTeams"),
                direct: directMembers.reduce((s: number, m: any) => s + m.currentPeriodSpendCents, 0) / 100,
                proxy: 0,
              },
              {
                name: t("dashboard.overview.proxyVouchers"),
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
                <p className="font-medium">{t("dashboard.overview.manageMembers")}</p>
                <p className="text-sm text-muted-foreground">{t("dashboard.overview.manageMembersDesc")}</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/dashboard/vouchers">
          <Card className="p-5 hover:bg-muted/50 transition-colors cursor-pointer" data-testid="link-manage-vouchers">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/40"><Ticket className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
              <div>
                <p className="font-medium">{t("dashboard.overview.manageVouchers")}</p>
                <p className="text-sm text-muted-foreground">{t("dashboard.overview.manageVouchersDesc")}</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function ApiKeysManager({ data }: { data: any }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [projectMode, setProjectMode] = useState<"existing" | "new" | "none">("none");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newKeyRevealed, setNewKeyRevealed] = useState<string | null>(null);

  const createKeyMutation = useMutation({
    mutationFn: async (body: any) => {
      const res = await apiRequest("POST", "/api/me/keys", body);
      return res.json();
    },
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: ["/api/dashboard/member-overview"] });
      qc.invalidateQueries({ queryKey: ["/api/me/keys"] });
      setNewKeyRevealed(result.apiKey);
      toast({ title: t("dashboard.overview.apiKeyCreatedToast"), description: result.projectName ? t("dashboard.overview.projectAssignedToast", { name: result.projectName }) : t("dashboard.overview.noProjectAssignedToast") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.overview.failedCreateKey"), description: err.message, variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (keyId: string) => {
      await apiRequest("DELETE", `/api/me/keys/${keyId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/dashboard/member-overview"] });
      qc.invalidateQueries({ queryKey: ["/api/me/keys"] });
      toast({ title: t("dashboard.overview.keyRevoked") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.overview.failedRevokeKey"), description: err.message, variant: "destructive" });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("dashboard.common.copied") });
  };

  const handleCreate = () => {
    const body: any = {};
    if (projectMode === "existing" && selectedProjectId) {
      body.projectId = selectedProjectId;
    } else if (projectMode === "new" && newProjectName.trim()) {
      body.newProjectName = newProjectName.trim();
    }
    createKeyMutation.mutate(body);
  };

  const resetDialog = () => {
    setShowCreateDialog(false);
    setProjectMode("none");
    setSelectedProjectId("");
    setNewProjectName("");
    setNewKeyRevealed(null);
  };

  const activeKeys = data?.activeKeys || [];
  const projects = data?.projects || [];

  return (
    <>
      <Card className="p-6" data-testid="card-api-keys">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-semibold">{t("dashboard.overview.apiKeysTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.apiKeysSubtitle")}</p>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreateDialog(true)}
            disabled={activeKeys.length >= 10}
            data-testid="button-create-project-key"
          >
            <Plus className="w-4 h-4 mr-1" /> {t("dashboard.overview.newKey")}
          </Button>
        </div>

        <div className="space-y-3 mb-4">
          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
            <code className="font-mono text-sm flex-1" data-testid="text-base-url">
              {t("dashboard.overview.baseUrl", { url: `${window.location.origin}/api/v1` })}
            </code>
            <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`${window.location.origin}/api/v1`)} data-testid="button-copy-url">
              <Copy className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {activeKeys.length > 0 ? (
          <div className="space-y-2">
            {activeKeys.map((k: any) => (
              <div key={k.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/50" data-testid={`key-row-${k.id}`}>
                <Key className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <code className="font-mono text-sm">{k.keyPrefix}...</code>
                {k.projectName ? (
                  <Badge variant="secondary" className="text-xs">
                    <FolderOpen className="w-3 h-3 mr-1" />
                    {k.projectName}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">{t("dashboard.common.noProject")}</Badge>
                )}
                <span className="text-xs text-muted-foreground ml-auto">
                  {k.lastUsedAt ? formatTimeAgo(k.lastUsedAt, t) : t("dashboard.common.neverUsed")}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => copyToClipboard(k.keyPrefix)}
                  data-testid={`button-copy-key-${k.id}`}
                >
                  <Copy className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => {
                    if (confirm(t("dashboard.overview.confirmRevokeKey"))) {
                      revokeKeyMutation.mutate(k.id);
                    }
                  }}
                  disabled={revokeKeyMutation.isPending}
                  data-testid={`button-revoke-key-${k.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground mt-2">{t("dashboard.overview.keysActive", { count: activeKeys.length })}</p>
          </div>
        ) : (
          <EmptyState
            icon={<Key className="w-8 h-8 text-muted-foreground" />}
            title={t("dashboard.overview.noActiveKeys")}
            description={t("dashboard.overview.noActiveKeysDesc")}
          />
        )}
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) resetDialog(); else setShowCreateDialog(true); }}>
        <DialogContent>
          {newKeyRevealed ? (
            <>
              <DialogHeader>
                <DialogTitle>{t("dashboard.overview.keyCreated")}</DialogTitle>
                <DialogDescription>{t("dashboard.overview.keyCreatedDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-muted/50 font-mono text-sm break-all" data-testid="text-new-key">
                  {newKeyRevealed}
                </div>
                <Button className="w-full" onClick={() => { copyToClipboard(newKeyRevealed); }} data-testid="button-copy-new-key">
                  <Copy className="w-4 h-4 mr-2" /> {t("dashboard.overview.copyKey")}
                </Button>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetDialog} data-testid="button-close-key-dialog">{t("dashboard.common.done")}</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{t("dashboard.overview.createApiKey")}</DialogTitle>
                <DialogDescription>{t("dashboard.overview.createApiKeyDesc")}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("dashboard.overview.projectAssignment")}</Label>
                  <Select value={projectMode} onValueChange={(v) => { setProjectMode(v as any); setSelectedProjectId(""); setNewProjectName(""); }}>
                    <SelectTrigger data-testid="select-project-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("dashboard.common.noProject")}</SelectItem>
                      {projects.length > 0 && <SelectItem value="existing">{t("dashboard.overview.chooseExisting")}</SelectItem>}
                      <SelectItem value="new">{t("dashboard.overview.createNewProject")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {projectMode === "existing" && (
                  <div className="space-y-2">
                    <Label>{t("dashboard.overview.selectProject")}</Label>
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger data-testid="select-project">
                        <SelectValue placeholder={t("dashboard.overview.chooseProjectPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {projectMode === "new" && (
                  <div className="space-y-2">
                    <Label>{t("dashboard.overview.projectName")}</Label>
                    <Input
                      placeholder={t("dashboard.overview.projectNamePlaceholder")}
                      value={newProjectName}
                      onChange={(e) => setNewProjectName(e.target.value)}
                      maxLength={100}
                      data-testid="input-new-project-name"
                    />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetDialog}>{t("dashboard.common.cancel")}</Button>
                <Button
                  onClick={handleCreate}
                  disabled={createKeyMutation.isPending || (projectMode === "existing" && !selectedProjectId) || (projectMode === "new" && !newProjectName.trim())}
                  data-testid="button-confirm-create-key"
                >
                  {createKeyMutation.isPending ? t("dashboard.overview.creatingKey") : t("dashboard.overview.createKey")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProjectBreakdown({ proxyLogs }: { proxyLogs: any[] }) {
  const { t } = useTranslation();
  if (!proxyLogs || proxyLogs.length === 0) return null;

  const byProject = new Map<string, { requests: number; costCents: number; inputTokens: number; outputTokens: number }>();
  for (const log of proxyLogs) {
    const name = log.projectName || "Unassigned";
    const entry = byProject.get(name) || { requests: 0, costCents: 0, inputTokens: 0, outputTokens: 0 };
    entry.requests++;
    entry.costCents += log.costCents || 0;
    entry.inputTokens += log.inputTokens || 0;
    entry.outputTokens += log.outputTokens || 0;
    byProject.set(name, entry);
  }

  if (byProject.size <= 1 && byProject.has("Unassigned")) return null;

  const sorted = Array.from(byProject.entries()).sort((a, b) => b[1].costCents - a[1].costCents);
  const totalCost = sorted.reduce((sum, [, v]) => sum + v.costCents, 0);

  return (
    <Card className="p-5" data-testid="card-project-breakdown">
      <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.usageByProject")}</h2>
      <div className="space-y-3">
        {sorted.map(([name, stats]) => {
          const pct = totalCost > 0 ? (stats.costCents / totalCost) * 100 : 0;
          return (
            <div key={name} className="space-y-1" data-testid={`project-breakdown-${name}`}>
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{name}</span>
                  <span className="text-xs text-muted-foreground">{t("dashboard.overview.requestsAbbrev", { count: stats.requests })}</span>
                </div>
                <span className="font-mono text-sm">${(stats.costCents / 100).toFixed(4)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(pct, 1)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ProxyMemberOverview({ data }: { data: any }) {
  const { t } = useTranslation();
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
    toast({ title: t("dashboard.common.copied") });
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-member-dashboard-title">{t("dashboard.overview.memberTitle")}</h1>
        <div className="flex items-center gap-2 mt-1">
          <FeatureBadge type="VOUCHERS" />
          <span className="text-sm text-muted-foreground">{t("dashboard.overview.memberProxySubtitle")}</span>
        </div>
      </div>

      <Card className="p-6" data-testid="card-budget">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.budget")}</h2>
        <div className="max-w-lg">
          <BudgetBar spent={data.spendCents} budget={data.budgetCents} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.remaining")}</p>
            <p className="text-2xl font-bold" data-testid="text-budget-remaining">
              ${((data.budgetCents - data.spendCents) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.totalBudget")}</p>
            <p className="text-2xl font-bold">${(data.budgetCents / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.requestsMade")}</p>
            <p className="text-2xl font-bold" data-testid="text-request-count">{data.proxyRequestCount || 0}</p>
          </div>
        </div>
      </Card>

      {daysRemaining !== null && (
        <Card className="p-5" data-testid="card-expiry">
          <div className="flex items-center gap-3">
            <Timer className={`w-5 h-5 ${expiryColor}`} />
            <div>
              <p className="text-sm font-medium">{t("dashboard.overview.voucherExpiry")}</p>
              <p className={`text-lg font-bold ${expiryColor}`} data-testid="text-days-remaining">
                {daysRemaining === 0 ? t("dashboard.overview.expiresToday") : daysRemaining === 1 ? t("dashboard.overview.daysRemainingOne", { count: daysRemaining }) : t("dashboard.overview.daysRemainingOther", { count: daysRemaining })}
              </p>
            </div>
          </div>
        </Card>
      )}

      <ApiKeysManager data={data} />

      <ProjectBreakdown proxyLogs={data.proxyLogs} />

      <Card className="p-5" data-testid="card-models">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.availableModels")}</h2>
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
          <p className="text-sm text-muted-foreground">{t("dashboard.overview.noModelsAvailable")}</p>
        )}
      </Card>

      <Card className="p-5" data-testid="card-recent-requests">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.recentRequests")}</h2>
        {data.proxyLogs && data.proxyLogs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableTime")}</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableModel")}</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableProject")}</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableTokensIn")}</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableTokensOut")}</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableCost")}</th>
                  <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase">{t("dashboard.overview.tableDuration")}</th>
                </tr>
              </thead>
              <tbody>
                {data.proxyLogs.slice(0, 20).map((log: any) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/30" data-testid={`proxy-log-${log.id}`}>
                    <td className="py-2 px-3 text-muted-foreground">{formatTimeAgo(log.createdAt, t)}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-1.5">
                        <ProviderBadge provider={log.provider} />
                        <span className="text-xs font-mono">{log.model}</span>
                      </div>
                    </td>
                    <td className="py-2 px-3 text-xs text-muted-foreground">{log.projectName || "—"}</td>
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
            title={t("dashboard.overview.noRequestsYet")}
            description={t("dashboard.overview.noRequestsYetDesc")}
          />
        )}
      </Card>
    </div>
  );
}

function DirectMemberOverview({ data }: { data: any }) {
  const { t } = useTranslation();
  const usageSnapshots = data?.usageSnapshots || [];

  const chartData = usageSnapshots.slice(-30).map((s: any) => ({
    date: new Date(s.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    cost: s.periodCostCents / 100,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-member-dashboard-title">{t("dashboard.overview.memberTitle")}</h1>
        <div className="flex items-center gap-2 mt-1">
          <FeatureBadge type="TEAMS" />
          <span className="text-sm text-muted-foreground">{t("dashboard.overview.memberDirectSubtitle")}</span>
        </div>
      </div>

      <Card className="p-6" data-testid="card-budget">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.budget")}</h2>
        <div className="max-w-lg">
          <BudgetBar spent={data.spendCents} budget={data.budgetCents} />
        </div>
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.remaining")}</p>
            <p className="text-2xl font-bold" data-testid="text-budget-remaining">
              ${((data.budgetCents - data.spendCents) / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.totalBudget")}</p>
            <p className="text-2xl font-bold">${(data.budgetCents / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("dashboard.overview.period")}</p>
            <p className="text-sm font-medium">
              {data.periodStart && new Date(data.periodStart).toLocaleDateString()} — {data.periodEnd && new Date(data.periodEnd).toLocaleDateString()}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-5" data-testid="card-usage-chart">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.overview.usageTrend")}</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="date" tick={{ fill: 'currentColor', fontSize: 11 }} />
              <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--popover)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--popover-foreground)' }}
                formatter={(value: number) => [`$${value.toFixed(2)}`, t("dashboard.overview.costLabel")]}
              />
              <Line type="monotone" dataKey="cost" stroke="#6366F1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={<TrendingUp className="w-8 h-8 text-muted-foreground" />}
            title={t("dashboard.overview.noUsageData")}
            description={t("dashboard.overview.noUsageDataDesc")}
          />
        )}
      </Card>

      <ProjectBreakdown proxyLogs={data.proxyLogs || []} />

      <ApiKeysManager data={data} />
    </div>
  );
}

function MemberOverview() {
  const { t } = useTranslation();
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
        <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.overview.memberTitle")}</h1>
        <EmptyState
          icon={<Key className="w-8 h-8 text-muted-foreground" />}
          title={t("dashboard.overview.noActiveMembership")}
          description={t("dashboard.overview.noActiveMembershipDesc")}
        />
      </div>
    );
  }

  if (data.accessType === "VOUCHER") {
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
