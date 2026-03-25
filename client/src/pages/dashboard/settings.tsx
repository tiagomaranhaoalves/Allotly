import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Settings as SettingsIcon, Building, CreditCard, Shield,
  ExternalLink, Check, AlertTriangle, Users, Database,
  Clock, Zap, Plus, Trash2, Bell, SlidersHorizontal,
  KeyRound, Unplug, Download, Wrench, RefreshCcw,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

const PLAN_LIMITS = {
  FREE: {
    maxTeams: 1, maxTeamAdmins: 0, maxMembersPerTeam: 5,
    maxProviders: 4, maxActiveVouchers: 1, retentionDays: 7,
    usageTracking: "Real-time",
  },
  TEAM: {
    maxTeams: 10, maxTeamAdmins: 10, maxMembersPerTeam: 20,
    maxProviders: 4, maxActiveVouchers: "5/admin", retentionDays: 90,
    usageTracking: "Real-time",
  },
};

export default function SettingsPage() {
  const { user, organization } = useAuth();
  const { toast } = useToast();
  const { data: orgData, isLoading } = useQuery<any>({ queryKey: ["/api/org/settings"] });
  const { data: billing } = useQuery<any>({ queryKey: ["/api/billing/subscription"] });

  const [, navigate] = useLocation();
  const [orgName, setOrgName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [description, setDescription] = useState("");
  const [seatCount, setSeatCount] = useState("1");
  const [addSeatsCount, setAddSeatsCount] = useState("1");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");

  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false);
  const [revokeConfirmText, setRevokeConfirmText] = useState("");
  const [disconnectDialogOpen, setDisconnectDialogOpen] = useState(false);
  const [disconnectConfirmName, setDisconnectConfirmName] = useState("");

  const [notifications, setNotifications] = useState({
    budgetAlerts: true,
    voucherRedemptions: false,
    memberInvitesAccepted: false,
    spendAnomalies: true,
    providerKeyIssues: true,
  });

  const [defaults, setDefaults] = useState({
    defaultBudgetCents: "",
    defaultVoucherExpiryDays: "",
  });

  useEffect(() => {
    if (orgData) {
      setOrgName(orgData.name);
      setBillingEmail(orgData.billingEmail || "");
      setDescription(orgData.description || "");
      const s = orgData.settings || {};
      if (s.notifications) {
        setNotifications(prev => ({ ...prev, ...s.notifications }));
      }
      if (s.defaults) {
        setDefaults({
          defaultBudgetCents: s.defaults.defaultBudgetCents != null ? String(s.defaults.defaultBudgetCents / 100) : "",
          defaultVoucherExpiryDays: s.defaults.defaultVoucherExpiryDays != null ? String(s.defaults.defaultVoucherExpiryDays) : "",
        });
      }
    }
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
      await apiRequest("PATCH", "/api/org/settings", {
        name: orgName,
        billingEmail: billingEmail || null,
        description: description || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      toast({ title: "Settings saved" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const notificationsMutation = useMutation({
    mutationFn: async (updated: typeof notifications) => {
      await apiRequest("PATCH", "/api/org/settings", {
        settings: { notifications: updated },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      toast({ title: "Notification preferences saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save notifications", description: err.message, variant: "destructive" });
    },
  });

  const defaultsMutation = useMutation({
    mutationFn: async () => {
      const budgetVal = defaults.defaultBudgetCents ? Math.round(parseFloat(defaults.defaultBudgetCents) * 100) : null;
      const expiryVal = defaults.defaultVoucherExpiryDays ? parseInt(defaults.defaultVoucherExpiryDays) : null;
      await apiRequest("PATCH", "/api/org/settings", {
        settings: {
          defaults: {
            defaultBudgetCents: budgetVal,
            defaultVoucherExpiryDays: expiryVal,
          },
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      toast({ title: "Defaults saved" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save defaults", description: err.message, variant: "destructive" });
    },
  });

  const upgradeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", {
        type: "team_upgrade",
        quantity: parseInt(seatCount),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (err: any) => {
      toast({ title: "Upgrade failed", description: err.message, variant: "destructive" });
    },
  });

  const addSeatsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", {
        type: "add_seats",
        quantity: parseInt(addSeatsCount),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.redirect && data.url) {
        window.location.href = data.url;
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["/api/org/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/billing/subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
      toast({
        title: "Seats added",
        description: `Updated from ${data.previousSeats} to ${data.newSeats} Team Admin seat(s).`,
      });
      setAddSeatsCount("1");
    },
    onError: (err: any) => {
      toast({ title: "Failed to add seats", description: err.message, variant: "destructive" });
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

  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/organizations/${orgData?.id}`, {
        confirmName: deleteConfirmName,
      });
    },
    onSuccess: () => {
      toast({ title: "Organization deleted" });
      setDeleteDialogOpen(false);
      navigate("/");
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete organization", description: err.message, variant: "destructive" });
    },
  });

  const revokeAllKeysMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/org/revoke-all-keys", { confirmText: revokeConfirmText });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "All keys revoked", description: `${data.revokedCount} API keys have been revoked.` });
      setRevokeDialogOpen(false);
      setRevokeConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to revoke keys", description: err.message, variant: "destructive" });
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/org/disconnect-all-providers", { confirmName: disconnectConfirmName });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: "All providers disconnected", description: `${data.disconnectedCount} providers disconnected, ${data.revokedCount} keys revoked.` });
      setDisconnectDialogOpen(false);
      setDisconnectConfirmName("");
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to disconnect providers", description: err.message, variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", `/api/admin/cleanup/${type}?olderThanDays=90`);
      return res.json();
    },
    onSuccess: (data: any) => {
      const msg = data.deletedCount != null ? `${data.deletedCount} items cleaned up` : "Cleanup complete";
      toast({ title: "Cleanup complete", description: msg });
    },
    onError: (err: any) => {
      toast({ title: "Cleanup failed", description: err.message, variant: "destructive" });
    },
  });

  const handleExport = async (type: "usage" | "members") => {
    try {
      const res = await fetch(`/api/export/${type}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${type}-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: "Export downloaded", description: `${type} data exported as CSV.` });
    } catch (e: any) {
      toast({ title: "Export failed", description: e.message, variant: "destructive" });
    }
  };

  const toggleNotification = (key: keyof typeof notifications) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    notificationsMutation.mutate(updated);
  };

  const plan = orgData?.plan || "FREE";
  const limits = plan === "TEAM" ? PLAN_LIMITS.TEAM : PLAN_LIMITS.FREE;
  const sub = billing?.subscription;
  const graceEndsAt = billing?.graceEndsAt || orgData?.graceEndsAt;
  const currentSeats = sub?.seats || billing?.maxTeamAdmins || 0;
  const isRootAdmin = user?.orgRole === "ROOT_ADMIN";

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
                <Label>Billing Email</Label>
                <Input type="email" placeholder="billing@company.com" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} data-testid="input-billing-email" />
                <p className="text-xs text-muted-foreground">Optional. Used for invoices and billing notifications.</p>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input placeholder="Brief description of your organization" value={description} onChange={e => setDescription(e.target.value)} data-testid="input-org-description" maxLength={500} />
                <p className="text-xs text-muted-foreground">{description.length}/500 characters</p>
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
              {isRootAdmin && (
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-settings">
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              )}
            </div>
          </Card>

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">Notifications</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Choose which events trigger email notifications to organization admins.
              </p>
              <div className="space-y-4 max-w-lg">
                {([
                  { key: "budgetAlerts" as const, label: "Budget Alerts", desc: "When a member reaches 80% or 100% of their budget" },
                  { key: "spendAnomalies" as const, label: "Spend Anomalies", desc: "When unusual spending patterns are detected" },
                  { key: "providerKeyIssues" as const, label: "Provider Key Issues", desc: "When a provider API key becomes invalid or disconnected" },
                  { key: "voucherRedemptions" as const, label: "Voucher Redemptions", desc: "When a voucher code is redeemed" },
                  { key: "memberInvitesAccepted" as const, label: "Member Invites Accepted", desc: "When an invited member accepts and joins" },
                ]).map(item => (
                  <div key={item.key} className="flex items-center justify-between gap-4" data-testid={`notification-${item.key}`}>
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <Switch
                      checked={notifications[item.key]}
                      onCheckedChange={() => toggleNotification(item.key)}
                      data-testid={`switch-notification-${item.key}`}
                    />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <SlidersHorizontal className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">Organization Defaults</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Default values applied when creating new members or vouchers.
              </p>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>Default Member Budget ($)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="e.g. 10.00"
                    value={defaults.defaultBudgetCents}
                    onChange={e => setDefaults(d => ({ ...d, defaultBudgetCents: e.target.value }))}
                    data-testid="input-default-budget"
                  />
                  <p className="text-xs text-muted-foreground">Monthly budget for new members (in dollars). Leave empty to use the org-level default.</p>
                </div>
                <div className="space-y-2">
                  <Label>Default Voucher Expiry (days)</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="e.g. 30"
                    value={defaults.defaultVoucherExpiryDays}
                    onChange={e => setDefaults(d => ({ ...d, defaultVoucherExpiryDays: e.target.value }))}
                    data-testid="input-default-voucher-expiry"
                  />
                  <p className="text-xs text-muted-foreground">Days until new vouchers expire. Leave empty for no default.</p>
                </div>
                <Button
                  onClick={() => defaultsMutation.mutate()}
                  disabled={defaultsMutation.isPending}
                  data-testid="button-save-defaults"
                >
                  {defaultsMutation.isPending ? "Saving..." : "Save Defaults"}
                </Button>
              </div>
            </Card>
          )}

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
                { label: "Usage", value: limits.usageTracking, icon: <Clock className="w-4 h-4" /> },
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

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">Data Exports</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Export your organization data as CSV files for reporting and analysis.
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => handleExport("usage")} data-testid="button-export-usage" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export Usage Data
                </Button>
                <Button variant="outline" onClick={() => handleExport("members")} data-testid="button-export-members" className="gap-2">
                  <Download className="w-4 h-4" />
                  Export Members
                </Button>
              </div>
            </Card>
          )}

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">Admin Tools</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Maintenance and cleanup utilities for your organization.
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Clean Up Expired Vouchers</p>
                    <p className="text-xs text-muted-foreground">Remove vouchers expired more than 90 days ago</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupMutation.mutate("expired-vouchers")}
                    disabled={cleanupMutation.isPending}
                    data-testid="button-cleanup-vouchers"
                  >
                    {cleanupMutation.isPending ? "Running..." : "Run"}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Clean Up Revoked Keys</p>
                    <p className="text-xs text-muted-foreground">Remove keys revoked more than 90 days ago</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupMutation.mutate("revoked-keys")}
                    disabled={cleanupMutation.isPending}
                    data-testid="button-cleanup-keys"
                  >
                    {cleanupMutation.isPending ? "Running..." : "Run"}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">Reconcile Redis Budgets</p>
                    <p className="text-xs text-muted-foreground">Sync Redis budget counters with database values</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupMutation.mutate("redis-reconcile")}
                    disabled={cleanupMutation.isPending}
                    data-testid="button-cleanup-redis"
                    className="gap-1.5"
                  >
                    <RefreshCcw className="w-3.5 h-3.5" />
                    {cleanupMutation.isPending ? "Running..." : "Reconcile"}
                  </Button>
                </div>
              </div>
            </Card>
          )}

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
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 4 AI Provider connections</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> Real-time usage tracking, 90-day retention</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> 5 voucher codes per admin, 50 redemptions each</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> AI usage analytics + audit log</li>
                  </ul>
                  <div className="flex items-center gap-3 mb-4">
                    <Label className="text-sm shrink-0">Team Admin Seats:</Label>
                    <Select value={seatCount} onValueChange={setSeatCount}>
                      <SelectTrigger className="w-20" data-testid="select-seat-count">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">
                      = ${parseInt(seatCount) * 20}/mo
                    </span>
                  </div>
                  <Button
                    onClick={() => upgradeMutation.mutate()}
                    disabled={upgradeMutation.isPending}
                    data-testid="button-upgrade"
                    className="gap-2"
                  >
                    {upgradeMutation.isPending ? "Redirecting to checkout..." : `Upgrade to Team (${seatCount} seat${parseInt(seatCount) > 1 ? 's' : ''})`}
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
                {currentSeats < 10 && !sub?.cancelAtPeriodEnd && (
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <p className="text-sm font-medium mb-3">Add Team Admin Seats</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      Each additional seat is $20/mo (prorated). You currently have {currentSeats} of 10 max seats.
                    </p>
                    <div className="flex items-center gap-3">
                      <Select value={addSeatsCount} onValueChange={setAddSeatsCount}>
                        <SelectTrigger className="w-20" data-testid="select-add-seats">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 10 - currentSeats }, (_, i) => i + 1).map(n => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => addSeatsMutation.mutate()}
                        disabled={addSeatsMutation.isPending}
                        data-testid="button-add-seats"
                        className="gap-2"
                      >
                        {addSeatsMutation.isPending ? "Adding..." : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            Add {addSeatsCount} Seat{parseInt(addSeatsCount) > 1 ? 's' : ''} (+${parseInt(addSeatsCount) * 20}/mo)
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
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

          {isRootAdmin && (
            <Card className="p-6 border-destructive/50">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                <h2 className="text-base font-semibold text-destructive">Danger Zone</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/20">
                  <div>
                    <p className="text-sm font-medium">Revoke All API Keys</p>
                    <p className="text-xs text-muted-foreground">Immediately revoke every active API key in the organization. Members will lose API access until new keys are issued.</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setRevokeDialogOpen(true); setRevokeConfirmText(""); }}
                    data-testid="button-revoke-all-keys"
                    className="shrink-0 gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    Revoke All
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/20">
                  <div>
                    <p className="text-sm font-medium">Disconnect All Providers</p>
                    <p className="text-xs text-muted-foreground">Disconnect all AI provider connections and revoke all API keys. The proxy will stop routing requests.</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setDisconnectDialogOpen(true); setDisconnectConfirmName(""); }}
                    data-testid="button-disconnect-all-providers"
                    className="shrink-0 gap-1.5"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    Disconnect All
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/20">
                  <div>
                    <p className="text-sm font-medium">Delete Organization</p>
                    <p className="text-xs text-muted-foreground">Permanently delete this organization and all associated data. This action cannot be undone.</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setDeleteDialogOpen(true); setDeleteConfirmName(""); }}
                    data-testid="button-delete-org"
                    className="shrink-0 gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Org
                  </Button>
                </div>
              </div>

              <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke All API Keys</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will immediately revoke every active API key in your organization. All members will lose API access. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <Label className="text-sm text-muted-foreground mb-2 block">Type "REVOKE ALL" to confirm</Label>
                    <Input
                      value={revokeConfirmText}
                      onChange={e => setRevokeConfirmText(e.target.value)}
                      placeholder="REVOKE ALL"
                      data-testid="input-confirm-revoke-all"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-revoke-all">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => revokeAllKeysMutation.mutate()}
                      disabled={revokeConfirmText !== "REVOKE ALL" || revokeAllKeysMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-revoke-all"
                    >
                      {revokeAllKeysMutation.isPending ? "Revoking..." : "Revoke All Keys"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Disconnect All Providers</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will disconnect all AI provider connections and revoke all API keys. The proxy will stop routing requests. Type your organization name to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <Label className="text-sm text-muted-foreground mb-2 block">Type "{orgData?.name}" to confirm</Label>
                    <Input
                      value={disconnectConfirmName}
                      onChange={e => setDisconnectConfirmName(e.target.value)}
                      placeholder={orgData?.name}
                      data-testid="input-confirm-disconnect-all"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-disconnect-all">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      disabled={disconnectConfirmName !== orgData?.name || disconnectAllMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-disconnect-all"
                    >
                      {disconnectAllMutation.isPending ? "Disconnecting..." : "Disconnect All"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Organization</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{orgData?.name}</strong> and all associated data. This action cannot be undone. Type the organization name to confirm.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <Label className="text-sm text-muted-foreground mb-2 block">Type "{orgData?.name}" to confirm</Label>
                    <Input
                      value={deleteConfirmName}
                      onChange={e => setDeleteConfirmName(e.target.value)}
                      placeholder={orgData?.name}
                      data-testid="input-confirm-org-name"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-org">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteOrgMutation.mutate()}
                      disabled={deleteConfirmName !== orgData?.name || deleteOrgMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-org"
                    >
                      {deleteOrgMutation.isPending ? "Deleting..." : "Delete Organization"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
