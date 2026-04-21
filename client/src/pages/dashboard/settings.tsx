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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
      toast({ title: t("dashboard.settings.toastUpgradeSuccessTitle"), description: t("dashboard.settings.toastUpgradeSuccessDescription") });
    } catch (e) {
      toast({ title: t("dashboard.settings.toastUpgradeVerifyingTitle"), description: t("dashboard.settings.toastUpgradeVerifyingDescription") });
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
      toast({ title: t("dashboard.settings.toastSettingsSaved") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastUpdateFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.settings.toastNotificationsSaved") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastNotificationsFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.settings.toastDefaultsSaved") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastDefaultsFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.settings.toastUpgradeFailed"), description: err.message, variant: "destructive" });
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
        title: t("dashboard.settings.toastSeatsAdded"),
        description: t("dashboard.settings.toastSeatsAddedDescription", { previous: data.previousSeats, current: data.newSeats }),
      });
      setAddSeatsCount("1");
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastSeatsFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.settings.toastBillingPortalFailed"), description: err.message, variant: "destructive" });
    },
  });

  const deleteOrgMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/organizations/${orgData?.id}`, {
        confirmName: deleteConfirmName,
      });
    },
    onSuccess: () => {
      toast({ title: t("dashboard.settings.toastOrgDeleted") });
      setDeleteDialogOpen(false);
      navigate("/");
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastDeleteOrgFailed"), description: err.message, variant: "destructive" });
    },
  });

  const revokeAllKeysMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/org/revoke-all-keys", { confirmText: revokeConfirmText });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: t("dashboard.settings.toastRevokeAllSuccessTitle"), description: t("dashboard.settings.toastRevokeAllSuccessDescription", { count: data.revokedCount }) });
      setRevokeDialogOpen(false);
      setRevokeConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastRevokeAllFailed"), description: err.message, variant: "destructive" });
    },
  });

  const disconnectAllMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/org/disconnect-all-providers", { confirmName: disconnectConfirmName });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: t("dashboard.settings.toastDisconnectAllSuccessTitle"), description: t("dashboard.settings.toastDisconnectAllSuccessDescription", { disconnected: data.disconnectedCount, revoked: data.revokedCount }) });
      setDisconnectDialogOpen(false);
      setDisconnectConfirmName("");
      queryClient.invalidateQueries({ queryKey: ["/api/providers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastDisconnectAllFailed"), description: err.message, variant: "destructive" });
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async (type: string) => {
      const res = await apiRequest("POST", `/api/admin/cleanup/${type}?olderThanDays=90`);
      return res.json();
    },
    onSuccess: (data: any) => {
      const msg = data.deletedCount != null ? t("dashboard.settings.toastCleanupCompleteDescription", { count: data.deletedCount }) : t("dashboard.settings.toastCleanupCompleteFallback");
      toast({ title: t("dashboard.settings.toastCleanupCompleteTitle"), description: msg });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.settings.toastCleanupFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.settings.toastExportDownloadedTitle"), description: t("dashboard.settings.toastExportDownloadedDescription", { type }) });
    } catch (e: any) {
      toast({ title: t("dashboard.settings.toastExportFailed"), description: e.message, variant: "destructive" });
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
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-settings-title">{t("dashboard.settings.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.settings.subtitle")}</p>
      </div>

      {graceEndsAt && (
        <Card className="p-4 border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{t("dashboard.settings.gracePeriodTitle")}</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {t("dashboard.settings.gracePeriodDescription", { date: new Date(graceEndsAt).toLocaleDateString() })}
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
              <h2 className="text-base font-semibold">{t("dashboard.settings.organizationHeading")}</h2>
            </div>
            <div className="space-y-4 max-w-md">
              <div className="space-y-2">
                <Label>{t("dashboard.settings.orgNameLabel")}</Label>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} data-testid="input-org-name-settings" />
              </div>
              <div className="space-y-2">
                <Label>{t("dashboard.settings.billingEmailLabel")}</Label>
                <Input type="email" placeholder={t("dashboard.settings.billingEmailPlaceholder")} value={billingEmail} onChange={e => setBillingEmail(e.target.value)} data-testid="input-billing-email" />
                <p className="text-xs text-muted-foreground">{t("dashboard.settings.billingEmailHelper")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("dashboard.settings.descriptionLabel")}</Label>
                <Input placeholder={t("dashboard.settings.descriptionPlaceholder")} value={description} onChange={e => setDescription(e.target.value)} data-testid="input-org-description" maxLength={500} />
                <p className="text-xs text-muted-foreground">{t("dashboard.settings.descriptionCounter", { count: description.length })}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("dashboard.settings.planLabel")}</Label>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
                    {plan}
                  </Badge>
                  {plan === "TEAM" && sub && (
                    <span className="text-xs text-muted-foreground">
                      {t("dashboard.settings.planSeats", { count: sub.seats || billing?.maxTeamAdmins || 0 })}
                      {sub.currentPeriodEnd && ` ${t("dashboard.settings.planRenews", { date: new Date(sub.currentPeriodEnd).toLocaleDateString() })}`}
                    </span>
                  )}
                </div>
              </div>
              {isRootAdmin && (
                <Button onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-settings">
                  {updateMutation.isPending ? t("dashboard.settings.saving") : t("dashboard.settings.saveChanges")}
                </Button>
              )}
            </div>
          </Card>

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">{t("dashboard.settings.notificationsHeading")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("dashboard.settings.notificationsDescription")}
              </p>
              <div className="space-y-4 max-w-lg">
                {([
                  { key: "budgetAlerts" as const, label: t("dashboard.settings.notifBudgetAlertsLabel"), desc: t("dashboard.settings.notifBudgetAlertsDesc") },
                  { key: "spendAnomalies" as const, label: t("dashboard.settings.notifSpendAnomaliesLabel"), desc: t("dashboard.settings.notifSpendAnomaliesDesc") },
                  { key: "providerKeyIssues" as const, label: t("dashboard.settings.notifProviderKeyIssuesLabel"), desc: t("dashboard.settings.notifProviderKeyIssuesDesc") },
                  { key: "voucherRedemptions" as const, label: t("dashboard.settings.notifVoucherRedemptionsLabel"), desc: t("dashboard.settings.notifVoucherRedemptionsDesc") },
                  { key: "memberInvitesAccepted" as const, label: t("dashboard.settings.notifMemberInvitesAcceptedLabel"), desc: t("dashboard.settings.notifMemberInvitesAcceptedDesc") },
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
                <h2 className="text-base font-semibold">{t("dashboard.settings.defaultsHeading")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("dashboard.settings.defaultsDescription")}
              </p>
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label>{t("dashboard.settings.defaultBudgetLabel")}</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder={t("dashboard.settings.defaultBudgetPlaceholder")}
                    value={defaults.defaultBudgetCents}
                    onChange={e => setDefaults(d => ({ ...d, defaultBudgetCents: e.target.value }))}
                    data-testid="input-default-budget"
                  />
                  <p className="text-xs text-muted-foreground">{t("dashboard.settings.defaultBudgetHelper")}</p>
                </div>
                <div className="space-y-2">
                  <Label>{t("dashboard.settings.defaultExpiryLabel")}</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder={t("dashboard.settings.defaultExpiryPlaceholder")}
                    value={defaults.defaultVoucherExpiryDays}
                    onChange={e => setDefaults(d => ({ ...d, defaultVoucherExpiryDays: e.target.value }))}
                    data-testid="input-default-voucher-expiry"
                  />
                  <p className="text-xs text-muted-foreground">{t("dashboard.settings.defaultExpiryHelper")}</p>
                </div>
                <Button
                  onClick={() => defaultsMutation.mutate()}
                  disabled={defaultsMutation.isPending}
                  data-testid="button-save-defaults"
                >
                  {defaultsMutation.isPending ? t("dashboard.settings.saving") : t("dashboard.settings.saveDefaults")}
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">{t("dashboard.settings.planLimitsHeading")}</h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[
                { label: t("dashboard.settings.limitTeams"), testKey: "teams", value: String(limits.maxTeams), icon: <Users className="w-4 h-4" /> },
                { label: t("dashboard.settings.limitTeamAdmins"), testKey: "team admins", value: plan === "FREE" ? t("dashboard.settings.limitTeamAdminsRootOnly") : String(limits.maxTeamAdmins), icon: <Shield className="w-4 h-4" /> },
                { label: t("dashboard.settings.limitMembersPerTeam"), testKey: "members-team", value: String(limits.maxMembersPerTeam), icon: <Users className="w-4 h-4" /> },
                { label: t("dashboard.settings.limitProviders"), testKey: "providers", value: String(limits.maxProviders), icon: <Database className="w-4 h-4" /> },
                { label: t("dashboard.settings.limitVouchers"), testKey: "vouchers", value: String(limits.maxActiveVouchers), icon: <CreditCard className="w-4 h-4" /> },
                { label: t("dashboard.settings.limitRetention"), testKey: "retention", value: t("dashboard.settings.limitRetentionValue", { days: limits.retentionDays }), icon: <Clock className="w-4 h-4" /> },
                { label: t("dashboard.settings.limitUsage"), testKey: "usage", value: t("dashboard.settings.limitUsageRealtime"), icon: <Clock className="w-4 h-4" /> },
              ].map(item => (
                <div key={item.testKey} className="p-3 rounded-lg bg-muted/50" data-testid={`card-plan-limit-${item.testKey}`}>
                  <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                    {item.icon}
                    <span className="text-xs">{item.label}</span>
                  </div>
                  <p className="text-sm font-semibold" data-testid={`text-plan-limit-${item.testKey}`}>{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">{t("dashboard.settings.securityHeading")}</h2>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.securityKeyEncryption")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.securityKeyEncryptionDesc")}</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 no-default-hover-elevate no-default-active-elevate">
                    {t("dashboard.settings.securityActive")}
                  </Badge>
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.securityKeyHashing")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.securityKeyHashingDesc")}</p>
                  </div>
                  <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 no-default-hover-elevate no-default-active-elevate">
                    {t("dashboard.settings.securityActive")}
                  </Badge>
                </div>
              </div>
            </div>
          </Card>

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Download className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">{t("dashboard.settings.dataExportsHeading")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("dashboard.settings.dataExportsDescription")}
              </p>
              <div className="flex flex-wrap gap-3">
                <Button variant="outline" onClick={() => handleExport("usage")} data-testid="button-export-usage" className="gap-2">
                  <Download className="w-4 h-4" />
                  {t("dashboard.settings.exportUsage")}
                </Button>
                <Button variant="outline" onClick={() => handleExport("members")} data-testid="button-export-members" className="gap-2">
                  <Download className="w-4 h-4" />
                  {t("dashboard.settings.exportMembers")}
                </Button>
              </div>
            </Card>
          )}

          {isRootAdmin && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Wrench className="w-5 h-5 text-primary" />
                <h2 className="text-base font-semibold">{t("dashboard.settings.adminToolsHeading")}</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                {t("dashboard.settings.adminToolsDescription")}
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.cleanupVouchersLabel")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.cleanupVouchersDesc")}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupMutation.mutate("expired-vouchers")}
                    disabled={cleanupMutation.isPending}
                    data-testid="button-cleanup-vouchers"
                  >
                    {cleanupMutation.isPending ? t("dashboard.settings.runningButton") : t("dashboard.settings.runButton")}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.cleanupKeysLabel")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.cleanupKeysDesc")}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cleanupMutation.mutate("revoked-keys")}
                    disabled={cleanupMutation.isPending}
                    data-testid="button-cleanup-keys"
                  >
                    {cleanupMutation.isPending ? t("dashboard.settings.runningButton") : t("dashboard.settings.runButton")}
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.cleanupRedisLabel")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.cleanupRedisDesc")}</p>
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
                    {cleanupMutation.isPending ? t("dashboard.settings.runningButton") : t("dashboard.settings.reconcileButton")}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <CreditCard className="w-5 h-5 text-primary" />
              <h2 className="text-base font-semibold">{t("dashboard.settings.billingHeading")}</h2>
            </div>
            {plan === "FREE" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.settings.freePlanDescription")}
                </p>
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold">{t("dashboard.settings.teamPlanName")}</p>
                      <p className="text-2xl font-bold">{t("dashboard.settings.teamPlanPrice")}<span className="text-sm font-normal text-muted-foreground">{t("dashboard.settings.teamPlanPriceCaption")}</span></p>
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-muted-foreground mb-4">
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> {t("dashboard.settings.teamFeature1")}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> {t("dashboard.settings.teamFeature2")}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> {t("dashboard.settings.teamFeature3")}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> {t("dashboard.settings.teamFeature4")}</li>
                    <li className="flex items-center gap-2"><Check className="w-3.5 h-3.5 text-emerald-500" /> {t("dashboard.settings.teamFeature5")}</li>
                  </ul>
                  <div className="flex items-center gap-3 mb-4">
                    <Label className="text-sm shrink-0">{t("dashboard.settings.seatsLabel")}</Label>
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
                      {t("dashboard.settings.seatsTotal", { amount: parseInt(seatCount) * 20 })}
                    </span>
                  </div>
                  <Button
                    onClick={() => upgradeMutation.mutate()}
                    disabled={upgradeMutation.isPending}
                    data-testid="button-upgrade"
                    className="gap-2"
                  >
                    {upgradeMutation.isPending ? t("dashboard.settings.upgradeButtonPending") : t("dashboard.settings.upgradeButton", { count: parseInt(seatCount) })}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.settings.bundleNote")}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.billingPlanLabel")}</p>
                    <p className="text-lg font-bold">{plan}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.billingSeatsLabel")}</p>
                    <p className="text-lg font-bold">{sub?.seats || billing?.maxTeamAdmins || 0}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.billingNextBillingLabel")}</p>
                    <p className="text-lg font-bold">
                      {sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : t("dashboard.settings.billingNextBillingNone")}
                    </p>
                  </div>
                </div>
                {sub?.cancelAtPeriodEnd && (
                  <Card className="p-3 border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10">
                    <p className="text-sm text-amber-700 dark:text-amber-400">
                      {t("dashboard.settings.cancelAtPeriodEnd", { date: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : t("dashboard.settings.cancelAtPeriodEndFallback") })}
                    </p>
                  </Card>
                )}
                {currentSeats < 10 && !sub?.cancelAtPeriodEnd && (
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <p className="text-sm font-medium mb-3">{t("dashboard.settings.addSeatsHeading")}</p>
                    <p className="text-xs text-muted-foreground mb-3">
                      {t("dashboard.settings.addSeatsDescription", { current: currentSeats })}
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
                        {addSeatsMutation.isPending ? t("dashboard.settings.addSeatsPending") : (
                          <>
                            <Plus className="w-3.5 h-3.5" />
                            {t("dashboard.settings.addSeatsButton", { count: parseInt(addSeatsCount), amount: parseInt(addSeatsCount) * 20 })}
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
                      {portalMutation.isPending ? t("dashboard.settings.manageBillingPending") : t("dashboard.settings.manageBillingButton")}
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
                <h2 className="text-base font-semibold text-destructive">{t("dashboard.settings.dangerZoneHeading")}</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/20">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.revokeAllKeysLabel")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.revokeAllKeysDesc")}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setRevokeDialogOpen(true); setRevokeConfirmText(""); }}
                    data-testid="button-revoke-all-keys"
                    className="shrink-0 gap-1.5"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    {t("dashboard.settings.revokeAllButton")}
                  </Button>
                </div>

                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/20">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.disconnectAllLabel")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.disconnectAllDesc")}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setDisconnectDialogOpen(true); setDisconnectConfirmName(""); }}
                    data-testid="button-disconnect-all-providers"
                    className="shrink-0 gap-1.5"
                  >
                    <Unplug className="w-3.5 h-3.5" />
                    {t("dashboard.settings.disconnectAllButton")}
                  </Button>
                </div>

                <Separator />

                <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-destructive/20">
                  <div>
                    <p className="text-sm font-medium">{t("dashboard.settings.deleteOrgLabel")}</p>
                    <p className="text-xs text-muted-foreground">{t("dashboard.settings.deleteOrgDesc")}</p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => { setDeleteDialogOpen(true); setDeleteConfirmName(""); }}
                    data-testid="button-delete-org"
                    className="shrink-0 gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {t("dashboard.settings.deleteOrgButton")}
                  </Button>
                </div>
              </div>

              <AlertDialog open={revokeDialogOpen} onOpenChange={setRevokeDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dashboard.settings.revokeAllDialogTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("dashboard.settings.revokeAllDialogDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <Label className="text-sm text-muted-foreground mb-2 block">{t("dashboard.settings.revokeAllConfirmHelper")}</Label>
                    <Input
                      value={revokeConfirmText}
                      onChange={e => setRevokeConfirmText(e.target.value)}
                      placeholder={t("dashboard.settings.revokeAllConfirmPlaceholder")}
                      data-testid="input-confirm-revoke-all"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-revoke-all">{t("dashboard.settings.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => revokeAllKeysMutation.mutate()}
                      disabled={revokeConfirmText !== "REVOKE ALL" || revokeAllKeysMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-revoke-all"
                    >
                      {revokeAllKeysMutation.isPending ? t("dashboard.settings.revokeAllPending") : t("dashboard.settings.revokeAllSubmit")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={disconnectDialogOpen} onOpenChange={setDisconnectDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dashboard.settings.disconnectAllDialogTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("dashboard.settings.disconnectAllDialogDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <Label className="text-sm text-muted-foreground mb-2 block">{t("dashboard.settings.confirmOrgNameHelper", { name: orgData?.name })}</Label>
                    <Input
                      value={disconnectConfirmName}
                      onChange={e => setDisconnectConfirmName(e.target.value)}
                      placeholder={orgData?.name}
                      data-testid="input-confirm-disconnect-all"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-disconnect-all">{t("dashboard.settings.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => disconnectAllMutation.mutate()}
                      disabled={disconnectConfirmName !== orgData?.name || disconnectAllMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-disconnect-all"
                    >
                      {disconnectAllMutation.isPending ? t("dashboard.settings.disconnectAllPending") : t("dashboard.settings.disconnectAllSubmit")}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dashboard.settings.deleteOrgDialogTitle")}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("dashboard.settings.deleteOrgDialogDescription", { name: orgData?.name })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <Label className="text-sm text-muted-foreground mb-2 block">{t("dashboard.settings.confirmOrgNameHelper", { name: orgData?.name })}</Label>
                    <Input
                      value={deleteConfirmName}
                      onChange={e => setDeleteConfirmName(e.target.value)}
                      placeholder={orgData?.name}
                      data-testid="input-confirm-org-name"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete-org">{t("dashboard.settings.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteOrgMutation.mutate()}
                      disabled={deleteConfirmName !== orgData?.name || deleteOrgMutation.isPending}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete-org"
                    >
                      {deleteOrgMutation.isPending ? t("dashboard.settings.deleteOrgPending") : t("dashboard.settings.deleteOrgSubmit")}
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
