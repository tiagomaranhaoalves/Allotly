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
import { Settings as SettingsIcon, Building, CreditCard, Shield, ExternalLink, Check } from "lucide-react";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { user, organization } = useAuth();
  const { toast } = useToast();
  const { data: orgData, isLoading } = useQuery<any>({ queryKey: ["/api/org/settings"] });

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
      if (data.url) {
        window.location.href = data.url;
      }
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
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast({ title: "Failed to open billing portal", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your organization settings</p>
      </div>

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
                    {orgData?.plan || "FREE"}
                  </Badge>
                  {orgData?.plan === "TEAM" && (
                    <span className="text-xs text-muted-foreground">Up to 10 Team Admins</span>
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
            {orgData?.plan === "FREE" ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You're on the Free plan. Upgrade to Team for more features including up to 10 Team Admins, 20 members per team, 90-day retention, and expanded voucher limits.
                </p>
                <div className="p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <div>
                      <p className="font-semibold">Team Plan</p>
                      <p className="text-2xl font-bold">$20<span className="text-sm font-normal text-muted-foreground">/mo per Team Admin</span></p>
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
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You're on the <strong>Team</strong> plan. Manage your subscription and billing.
                </p>
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
            )}
          </Card>
        </>
      )}
    </div>
  );
}
