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
import { Settings as SettingsIcon, Building, CreditCard, Shield } from "lucide-react";
import { useState, useEffect } from "react";

export default function SettingsPage() {
  const { user, organization } = useAuth();
  const { toast } = useToast();
  const { data: orgData, isLoading } = useQuery<any>({ queryKey: ["/api/org/settings"] });

  const [orgName, setOrgName] = useState("");

  useEffect(() => {
    if (orgData) setOrgName(orgData.name);
  }, [orgData]);

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
                    <p className="text-sm font-medium">Provider Key Encryption</p>
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
            <p className="text-sm text-muted-foreground mb-4">
              {orgData?.plan === "FREE"
                ? "You're on the Free plan. Upgrade to Team for more features."
                : "Manage your subscription and billing."}
            </p>
            {orgData?.plan === "FREE" && (
              <Button variant="outline" data-testid="button-upgrade">
                Upgrade to Team
              </Button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
