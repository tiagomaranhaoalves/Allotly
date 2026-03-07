import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { KeyRevealCard } from "@/components/brand/key-reveal-card";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Shield, CheckCircle2, Copy, Terminal, Code2,
  DollarSign, Calendar, ArrowRight, Loader2, AlertTriangle,
} from "lucide-react";

export default function InvitePage() {
  const [, params] = useRoute("/invite/:token");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const token = params?.token || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [welcomeData, setWelcomeData] = useState<any>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<any>(null);

  const { data: inviteInfo, isLoading, error } = useQuery<any>({
    queryKey: ["/api/invite", token],
    queryFn: async () => {
      const res = await fetch(`/api/invite/${token}`);
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    enabled: !!token,
    retry: false,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      setAccepted(true);
      setUserInfo(data.user);
      if (data.welcomeData) {
        setWelcomeData(data.welcomeData);
        if (data.welcomeData.apiKey) {
          setApiKey(data.welcomeData.apiKey);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/session"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to accept invite", description: err.message, variant: "destructive" });
    },
  });

  const handleAccept = () => {
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }
    acceptMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !inviteInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
          <h1 className="text-xl font-bold" data-testid="text-invite-error">Invalid or Expired Invite</h1>
          <p className="text-muted-foreground text-sm">
            This invite link is no longer valid. Please contact your administrator for a new invitation.
          </p>
          <Button onClick={() => navigate("/login")} data-testid="button-go-login">
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

  if (accepted && inviteInfo.orgRole === "TEAM_ADMIN") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md p-8 text-center space-y-6">
          <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-invite-success">Welcome to Allotly!</h1>
            <p className="text-muted-foreground mt-2">
              Your Team Admin account is now active. You can start managing your team.
            </p>
          </div>
          <Button className="w-full" onClick={() => navigate("/dashboard")} data-testid="button-go-dashboard">
            <ArrowRight className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </Card>
      </div>
    );
  }

  if (accepted && inviteInfo.orgRole === "MEMBER") {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://api.allotly.com";

    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-2xl mx-auto py-12 space-y-8">
          <div className="text-center space-y-3">
            <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto" />
            <h1 className="text-3xl font-bold" data-testid="text-welcome-heading">Welcome to Allotly!</h1>
            <p className="text-muted-foreground">
              Your account is active{welcomeData?.teamName ? ` on ${welcomeData.teamName}` : ""}.
              Here's everything you need to get started.
            </p>
          </div>

          {apiKey && (
            <Card className="p-6 space-y-3 border-primary/20">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Your API Key</h2>
              </div>
              <KeyRevealCard keyValue={apiKey} masked={false} />
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium" data-testid="text-key-warning">
                This key will NOT be shown again after you leave this page. Copy it now and store it securely.
              </p>
            </Card>
          )}

          {!apiKey && welcomeData?.keyPrefix && (
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Your API Key</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                Your API key was provided to your administrator. Key prefix: <code className="bg-muted px-1.5 py-0.5 rounded">{welcomeData.keyPrefix}...</code>
              </p>
            </Card>
          )}

          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-lg">Quickstart</h2>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">cURL</p>
                <pre className="bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto" data-testid="text-quickstart-curl">
{`curl ${baseUrl}/api/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey || "YOUR_ALLOTLY_KEY"}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${welcomeData?.allowedModels?.[0]?.modelId || "gpt-4o-mini"}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
                </pre>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Python (OpenAI SDK)</p>
                <pre className="bg-muted/50 rounded-lg p-3 text-xs overflow-x-auto" data-testid="text-quickstart-python">
{`from openai import OpenAI

client = OpenAI(
    api_key="${apiKey || "YOUR_ALLOTLY_KEY"}",
    base_url="${baseUrl}/api/v1"
)

response = client.chat.completions.create(
    model="${welcomeData?.allowedModels?.[0]?.modelId || "gpt-4o-mini"}",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`}
                </pre>
              </div>
            </div>
          </Card>

          {welcomeData?.allowedModels && welcomeData.allowedModels.length > 0 && (
            <Card className="p-6 space-y-3">
              <div className="flex items-center gap-2">
                <Code2 className="w-5 h-5 text-primary" />
                <h2 className="font-semibold text-lg">Available Models</h2>
              </div>
              <div className="grid gap-2">
                {welcomeData.allowedModels.map((m: any) => (
                  <div key={m.modelId} className="flex items-center gap-2 p-2 rounded-md bg-muted/30" data-testid={`model-item-${m.modelId}`}>
                    <ProviderBadge provider={m.provider} size="sm" />
                    <span className="text-sm font-mono">{m.modelId}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card className="p-6 space-y-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-lg">Budget</h2>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {welcomeData?.accessType === "VOUCHER" ? "Total Budget" : "Monthly Budget"}
                </p>
                <p className="text-lg font-bold" data-testid="text-budget-amount">
                  ${((welcomeData?.budgetCents || 0) / 100).toFixed(2)}
                  {welcomeData?.accessType === "TEAM" ? "/mo" : ""}
                </p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <p className="text-xs text-muted-foreground">
                  {welcomeData?.accessType === "VOUCHER" ? "Expires" : "Resets on"}
                </p>
                <p className="text-lg font-bold flex items-center gap-1" data-testid="text-budget-reset">
                  <Calendar className="w-4 h-4" />
                  {welcomeData?.accessType === "VOUCHER" && welcomeData?.voucherExpiresAt
                    ? new Date(welcomeData.voucherExpiresAt).toLocaleDateString()
                    : welcomeData?.periodEnd
                      ? new Date(welcomeData.periodEnd).toLocaleDateString()
                      : "N/A"}
                </p>
              </div>
            </div>
            <FeatureBadge type={welcomeData?.accessType === "VOUCHER" ? "VOUCHERS" : "TEAMS"} />
          </Card>

          <Button className="w-full" size="lg" onClick={() => navigate("/dashboard")} data-testid="button-go-dashboard">
            <ArrowRight className="w-4 h-4 mr-2" />
            Go to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md p-8 space-y-6">
        <div className="text-center space-y-2">
          <Shield className="w-12 h-12 text-primary mx-auto" />
          <h1 className="text-2xl font-bold" data-testid="text-invite-heading">
            {inviteInfo.orgRole === "TEAM_ADMIN" ? "Team Admin Invitation" : "Team Member Invitation"}
          </h1>
          <p className="text-muted-foreground text-sm">
            Welcome, <strong>{inviteInfo.name || inviteInfo.email}</strong>! Set your password to activate your account.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={inviteInfo.email} disabled data-testid="input-invite-email" />
          </div>
          <div className="space-y-2">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={e => setPassword(e.target.value)}
              data-testid="input-invite-password"
            />
          </div>
          <div className="space-y-2">
            <Label>Confirm Password</Label>
            <Input
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              data-testid="input-invite-confirm-password"
            />
          </div>
          <Button
            className="w-full"
            onClick={handleAccept}
            disabled={!password || !confirmPassword || acceptMutation.isPending}
            data-testid="button-accept-invite"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Setting up...
              </>
            ) : (
              "Activate Account"
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
