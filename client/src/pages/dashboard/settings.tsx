import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Settings as SettingsIcon, Building, CreditCard, Shield,
  ExternalLink, Check, AlertTriangle, Users, Database,
  Clock, Zap,
} from "lucide-react";
import { useState, useEffect } from "react";

const PLAN_LIMITS = {
  FREE: {
    maxTeams: 1, maxTeamAdmins: 0, maxMembersPerTeam: 5,
    maxProviders: 3, maxActiveVouchers: 1, retentionDays: 7,
    pollingInterval: "60 min",
  },
  TEAM: {
    maxTeams: 3, maxTeamAdmins: 10, maxMembersPerTeam: 20,
    maxProviders: 3, maxActiveVouchers: "5/admin", retentionDays: 90,
    pollingInterval: "15 min",
  },
};

export default function SettingsPage() {
  const { user, organization } = useAuth();
  const { toast } = useToast();
  const { data: orgData, isLoading } = useQuery<any>({ queryKey: ["/api/org/settings"] });
  const { data: billing } = useQuery<any>({ queryKey: ["/api/billing/subscription"] });

  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (orgData) setOrgName(orgData.name);
  }, [orgData]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      handleUpgradeSuccess();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handleUpgradeSuccess = async () => {
    try {
      await apiRequest("POST", "/api/stripe/handle-success", { type: "team_upgrade" });
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      toast({ title: "Upgrade successful!", description: "Your organization is now on the Team plan." });
    } catch (e) {
      toast({ title: "Verifying upgrade...", description: "Please refresh the page in a moment." });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", "/api/org/settings", { name: orgName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      toast({ title: "Settings updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", { type: "team_upgrade" });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Upgrade failed", description: err.message, variant: "destructive" });
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/portal");
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Failed to open billing portal", description: err.message, variant: "destructive" });
    },
  });

  const plan = orgData?.plan || "FREE";
  const limits = plan === "TEAM" ? PLAN_LIMITS.TEAM : PLAN_LIMITS.FREE;
  const sub = billing?.subscription;
  const graceEndsAt = billing?.graceEndsAt || orgData?.graceEndsAt;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your organization settings</p>
      </div>

      {graceEndsAt && (
        <Card className="p-4 border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">Grace Period Active</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Your subscription requires attention. Grace period ends {new Date(graceEndsAt).toLocaleDateString()}.
                Please update your payment method to avoid losing Team features.
              </p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-48" />
      ) : (
        <>
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Building className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">Organization</h2>
            </div>
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>Organization Name</Label>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} data-testid="input-org-name-settings" />
              </div>
              <div className="space-y-2">
                <Label>Plan</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                    {plan}
                  </Badge>
                  {plan === "TEAM" && sub && (
                    <span className="text-xs text-muted-foreground">
                      {sub.seats || billing?.maxTeamAdmins || 0} seat(s)
                      {sub.currentPeriodEnd && ` · Renews ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`}
                    </span>
                  )}
                </div>
              </div>
              {user?.orgRole === "ROOT_ADMIN" && (
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-settings">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">Plan Limits</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { label: "Teams", value: String(limits.maxTeams), icon: <Users className="w-4 h-4" /> },
                { label: "Team Admins", value: plan === "FREE" ? "Root only" : String(limits.maxTeamAdmins), icon: <Shield className="w-4 h-4" /> },
                { label: "Members/Team", value: String(limits.maxMembersPerTeam), icon: <Users className="w-4 h-4" /> },
                { label: "Providers", value: String(limits.maxProviders), icon: <Database className="w-4 h-4" /> },
                { label: "Vouchers", value: String(limits.maxActiveVouchers), icon: <CreditCard className="w-4 h-4" /> },
                { label: "Retention", value: `${limits.retentionDays}d`, icon: <Clock className="w-4 h-4" /> },
                { label: "Polling", value: limits.pollingInterval, icon: <Clock className="w-4 h-4" /> },
              ].map(item => (
                <div key={item.label} className="p-3 rounded-lg bg-muted/50" data-testid={`card-plan-limit-${item.label.toLowerCase().replace(/\//g, '-')}`}>
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    {item.icon}
                    <span className="text-xs">{item.label}</span>
                  </div>
                  <p className="text-sm font-semibold" data-testid={`text-plan-limit-${item.label.toLowerCase().replace(/\//g, '-')}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">Security</h2>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">AI Provider Key Encryption</p>
                    <p className="text-xs text-muted-foreground">AES-256-GCM</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 no-default-hover-elevate no-default-active-elevate">
                    Active
                  </Badge>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">API Key Hashing</p>
                    <p className="text-xs text-muted-foreground">SHA-256</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 no-default-hover-elevate no-default-active-elevate">
                    Active
                  </Badge>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">Billing</h2>
            </div>
            {plan === "FREE" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You're on the Free plan. Upgrade to Team for more features including up to 10 Team Admins, 20 members per team, 90-day retention, and expanded voucher limits.
                </p>
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold">Team Plan</p>
                      <p className="text-2xl font-bold">$20<span className="text-sm font-normal text-muted-foreground">/mo per Team Admin seat</span></p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground mb-4">
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Up to 10 Team Admins, 20 members per team</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 3 AI Provider connections</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 15-minute usage polling, 90-day retention</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 5 voucher codes per admin, 50 redemptions each</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> AI usage analytics + audit log</li>
                  </ul>
                  <Button
                    onClick={() => upgradeMutation.mutate()}
                    disabled={upgradeMutation.isPending}
                    data-testid="button-upgrade"
                    className="gap-2"
                  >
                    {upgradeMutation.isPending ? "Redirecting to checkout..." : "Upgrade to Team"}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Bundle purchases are available on all plans regardless of subscription.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Plan</p>
                    <p className="text-lg font-bold">{plan}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Seats</p>
                    <p className="text-lg font-bold">{sub?.seats || billing?.maxTeamAdmins || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Next Billing</p>
                    <p className="text-lg font-bold">
                      {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "—"}
                    </p>
                  </div>
                </div>
                {sub?.cancelAtPeriodEnd && (
                  <Card className="p-3 border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      Your subscription will end at the current period. You'll be downgraded to Free after {sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "the end of the period"}.
                    </p>
                  </Card>
                )}
                <div className="flex gap-3">
                  {orgData?.stripeSubId && (
                    <Button
                      variant="outline"
                      onClick={() => portalMutation.mutate()}
                      disabled={portalMutation.isPending}
                      data-testid="button-manage-billing"
                      className="gap-2"
                    >
                      {portalMutation.isPending ? "Opening..." : "Manage Billing"}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
