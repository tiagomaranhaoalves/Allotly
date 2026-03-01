import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { StatsCard } from "@/components/brand/stats-card";
import { BudgetBar } from "@/components/brand/budget-bar";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import {
  DollarSign, Users, Ticket, Plug, Plus, ArrowRight,
  TrendingUp, Key, Activity,
} from "lucide-react";

function RootAdminOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/overview"] });
  const { data: providers } = useQuery<any[]>({ queryKey: ["/api/providers"] });
  const { data: vouchers } = useQuery<any[]>({ queryKey: ["/api/vouchers"] });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Organization overview and quick actions</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Spend"
          value={`$${((data?.totalSpendCents || 0) / 100).toFixed(2)}`}
          icon={<DollarSign className="w-5 h-5" />}
          change={12}
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
        <StatsCard
          title="Providers"
          value={String(data?.providerCount || 0)}
          icon={<Plug className="w-5 h-5" />}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between gap-2 mb-4">
            <h2 className="text-base font-semibold">Connected Providers</h2>
            <Link href="/dashboard/providers">
              <Button variant="secondary" size="sm" data-testid="button-manage-providers">
                Manage <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
          {providers && providers.length > 0 ? (
            <div className="space-y-3">
              {providers.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between gap-2 p-3 rounded-lg bg-muted/50">
                  <ProviderBadge provider={p.provider} />
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"}`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Plug className="w-8 h-8 text-muted-foreground" />}
              title="No providers connected"
              description="Connect your AI provider accounts to get started"
              action={{ label: "Connect Provider", onClick: () => {} }}
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
            <div className="space-y-3">
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
          <Link href="/dashboard/providers">
            <div className="p-4 rounded-lg bg-muted/50 hover-elevate cursor-pointer">
              <Plug className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Connect Provider</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add OpenAI, Anthropic, or Google</p>
            </div>
          </Link>
          <Link href="/dashboard/teams">
            <div className="p-4 rounded-lg bg-muted/50 hover-elevate cursor-pointer">
              <Users className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Add Team Admin</p>
              <p className="text-xs text-muted-foreground mt-0.5">Create a new team with admin</p>
            </div>
          </Link>
          <Link href="/dashboard/vouchers">
            <div className="p-4 rounded-lg bg-muted/50 hover-elevate cursor-pointer">
              <Ticket className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Create Voucher</p>
              <p className="text-xs text-muted-foreground mt-0.5">Generate a new access code</p>
            </div>
          </Link>
          <Link href="/dashboard/members">
            <div className="p-4 rounded-lg bg-muted/50 hover-elevate cursor-pointer">
              <Plus className="w-5 h-5 text-primary mb-2" />
              <p className="text-sm font-medium">Add Member</p>
              <p className="text-xs text-muted-foreground mt-0.5">Add a new team member</p>
            </div>
          </Link>
        </div>
      </Card>
    </div>
  );
}

function TeamAdminOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/overview"] });

  if (isLoading) {
    return <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Team Dashboard</h1>
        <p className="text-muted-foreground mt-1">Manage your team members and vouchers</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Team Spend" value={`$${((data?.totalSpendCents || 0) / 100).toFixed(2)}`} icon={<DollarSign className="w-5 h-5" />} />
        <StatsCard title="Direct Members" value={String(data?.directMemberCount || 0)} icon={<Key className="w-5 h-5" />} />
        <StatsCard title="Voucher Recipients" value={String(data?.proxyMemberCount || 0)} icon={<Ticket className="w-5 h-5" />} />
        <StatsCard title="Total Members" value={String(data?.totalMembers || 0)} icon={<Users className="w-5 h-5" />} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Link href="/dashboard/members">
          <Card className="p-5 hover-elevate cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10"><Users className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="font-medium">Manage Members</p>
                <p className="text-sm text-muted-foreground">Add, modify, or suspend team members</p>
              </div>
            </div>
          </Card>
        </Link>
        <Link href="/dashboard/vouchers">
          <Card className="p-5 hover-elevate cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/40"><Ticket className="w-5 h-5 text-cyan-600 dark:text-cyan-400" /></div>
              <div>
                <p className="font-medium">Manage Vouchers</p>
                <p className="text-sm text-muted-foreground">Create and distribute voucher codes</p>
              </div>
            </div>
          </Card>
        </Link>
      </div>
    </div>
  );
}

function MemberOverview() {
  const { data, isLoading } = useQuery<any>({ queryKey: ["/api/dashboard/overview"] });

  if (isLoading) {
    return <Skeleton className="h-48" />;
  }

  const budget = data?.budgetCents || 0;
  const spent = data?.spendCents || 0;
  const accessMode = data?.accessMode || "DIRECT";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Dashboard</h1>
        <div className="flex items-center gap-2 mt-1">
          <FeatureBadge type={accessMode === "DIRECT" ? "TEAMS" : "VOUCHERS"} />
          <span className="text-sm text-muted-foreground">
            {accessMode === "DIRECT" ? "Direct provider access" : "Proxy-based access"}
          </span>
        </div>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold mb-4">Budget</h2>
        <div className="max-w-lg">
          <BudgetBar spent={spent} budget={budget} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div>
            <p className="text-sm text-muted-foreground">Remaining</p>
            <p className="text-2xl font-bold">${((budget - spent) / 100).toFixed(2)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total Budget</p>
            <p className="text-2xl font-bold">${(budget / 100).toFixed(2)}</p>
          </div>
        </div>
      </Card>

      {accessMode === "PROXY" && (
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-2">Your API Key</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Use this base URL with any OpenAI-compatible client
          </p>
          <div className="p-3 rounded-lg bg-muted/50">
            <code className="font-mono text-sm">Base URL: {window.location.origin}/api/v1</code>
          </div>
        </Card>
      )}
    </div>
  );
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
