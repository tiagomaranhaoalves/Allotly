import { LogoFull } from "@/components/logo";
import { KeyRevealCard } from "@/components/brand/key-reveal-card";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { BudgetBar } from "@/components/brand/budget-bar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useState, useEffect, useRef } from "react";
import { apiRequest } from "@/lib/queryClient";
import { ConnectorGrid } from "@/components/connectors";
import { useAuth } from "@/lib/auth";
import {
  Ticket, ArrowRight, Check, AlertTriangle, Copy, Clock, Shield,
  Zap, Code, Terminal, ExternalLink, Monitor, Wrench, GraduationCap, Blocks,
  PlugZap,
} from "lucide-react";

type RedeemState = "input" | "preview" | "choose" | "redeeming" | "success";

interface VoucherInfo {
  code: string;
  budgetCents: number;
  allowedProviders: string[];
  allowedModels: { modelId: string; displayName: string; provider: string }[];
  expiresAt: string;
  remainingRedemptions: number;
}

interface RedeemResult {
  apiKey: string;
  keyPrefix: string;
  budgetCents: number;
  expiresAt: string;
  models: { modelId: string; displayName: string; provider: string }[];
  baseUrl: string;
  hasAccount: boolean;
}

function formatCode(raw: string): string {
  const clean = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 17);
  const parts = [];
  if (clean.length > 0) parts.push(clean.slice(0, 5));
  if (clean.length > 5) parts.push(clean.slice(5, 9));
  if (clean.length > 9) parts.push(clean.slice(9, 13));
  if (clean.length > 13) parts.push(clean.slice(13, 17));
  return parts.join("-");
}

export default function RedeemPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [state, setState] = useState<RedeemState>("input");
  const [codeInput, setCodeInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voucherInfo, setVoucherInfo] = useState<VoucherInfo | null>(null);
  const [redeemResult, setRedeemResult] = useState<RedeemResult | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) {
      setCodeInput(formatCode(code));
    }
  }, []);

  const handleCodeChange = (val: string) => {
    setCodeInput(formatCode(val));
  };

  const validateCode = async () => {
    const cleanCode = codeInput.replace(/-/g, "").toUpperCase();
    if (cleanCode.length < 12) {
      toast({ title: "Invalid code", description: "Please enter a valid voucher code", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const formatted = `${cleanCode.slice(0, 5)}-${cleanCode.slice(5, 9)}-${cleanCode.slice(9, 13)}-${cleanCode.slice(13, 17)}`;
      const res = await fetch(`/api/vouchers/validate/${formatted}`);
      if (!res.ok) {
        const err = await res.json();
        toast({ title: "Invalid voucher", description: err.message, variant: "destructive" });
        return;
      }
      const data = await res.json();
      setVoucherInfo(data);
      setState("preview");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const redeemInstant = async () => {
    setState("redeeming");
    try {
      const res = await apiRequest("POST", "/api/vouchers/redeem", {
        code: voucherInfo!.code,
        instant: true,
      });
      const data = await res.json();
      setRedeemResult(data);
      setState("success");
    } catch (e: any) {
      toast({ title: "Redemption failed", description: e.message, variant: "destructive" });
      setState("preview");
    }
  };

  const redeemWithAccount = async () => {
    if (!email || !password) {
      toast({ title: "Missing fields", description: "Email and password are required", variant: "destructive" });
      return;
    }
    setState("redeeming");
    try {
      const res = await apiRequest("POST", "/api/vouchers/redeem", {
        code: voucherInfo!.code,
        email,
        name,
        password,
        instant: false,
      });
      const data = await res.json();
      setRedeemResult(data);
      setState("success");
    } catch (e: any) {
      toast({ title: "Redemption failed", description: e.message, variant: "destructive" });
      setState("choose");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <Link href="/" data-testid="link-redeem-logo">
            <LogoFull size={28} />
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="sm" data-testid="button-redeem-login">Log in</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-12">
        {state === "input" && (
          <div className="space-y-8">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6">
                <Ticket className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-3xl font-bold tracking-tight">Redeem Voucher</h1>
              <p className="text-muted-foreground mt-2">Enter your Allotly voucher code to get instant AI access</p>
            </div>

            <Card className="p-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Voucher Code</Label>
                  <Input
                    ref={inputRef}
                    value={codeInput}
                    onChange={(e) => handleCodeChange(e.target.value)}
                    placeholder="ALLOT-XXXX-XXXX-XXXX"
                    className="font-mono text-lg text-center tracking-widest"
                    onKeyDown={e => e.key === "Enter" && validateCode()}
                    data-testid="input-voucher-code"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={validateCode}
                  disabled={loading || codeInput.replace(/-/g, "").length < 12}
                  data-testid="button-validate-code"
                >
                  {loading ? "Validating..." : "Validate Code"}
                  {!loading && <ArrowRight className="w-4 h-4 ml-1.5" />}
                </Button>
              </div>
            </Card>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <Shield className="w-5 h-5 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs text-muted-foreground">Encrypted access</p>
              </div>
              <div>
                <Zap className="w-5 h-5 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs text-muted-foreground">Instant API key</p>
              </div>
              <div>
                <Clock className="w-5 h-5 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs text-muted-foreground">Budget controlled</p>
              </div>
            </div>
          </div>
        )}

        {state === "preview" && voucherInfo && (
          <div className="space-y-6">
            <div className="text-center">
              <Badge className="mb-3 no-default-hover-elevate no-default-active-elevate">
                <Check className="w-3 h-3 mr-1" /> Valid Voucher
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight">Your Voucher Details</h1>
            </div>

            <Card className="p-6 space-y-4">
              <div className="text-center">
                <code className="text-lg font-mono font-bold text-primary tracking-widest" data-testid="text-voucher-code-display">
                  {voucherInfo.code}
                </code>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="text-xl font-bold" data-testid="text-voucher-budget">${(voucherInfo.budgetCents / 100).toFixed(2)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-xl font-bold" data-testid="text-voucher-expiry">
                    {new Date(voucherInfo.expiresAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Available Providers</p>
                <div className="flex flex-wrap gap-2">
                  {voucherInfo.allowedProviders.map(p => (
                    <ProviderBadge key={p} provider={p} />
                  ))}
                </div>
              </div>

              {voucherInfo.allowedModels.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Available Models</p>
                  <div className="space-y-1.5">
                    {voucherInfo.allowedModels.map(m => (
                      <div key={m.modelId} className="flex items-center justify-between gap-2 text-sm p-2 rounded bg-muted/30">
                        <span>{m.displayName}</span>
                        <span className="text-xs text-muted-foreground">{m.provider}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            <div className="space-y-3">
              <Button className="w-full" size="lg" onClick={() => setState("choose")} data-testid="button-proceed-redeem">
                Redeem This Voucher <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => { setState("input"); setVoucherInfo(null); }} data-testid="button-back-input">
                Use Different Code
              </Button>
            </div>
          </div>
        )}

        {state === "choose" && voucherInfo && (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight">How Would You Like Your Key?</h1>
              <p className="text-muted-foreground mt-1">Choose how to redeem your ${(voucherInfo.budgetCents / 100).toFixed(2)} voucher</p>
            </div>

            <Tabs defaultValue="instant">
              <TabsList className="grid grid-cols-2 w-full" data-testid="tabs-redeem-method">
                <TabsTrigger value="instant" data-testid="tab-instant">
                  <Zap className="w-4 h-4 mr-1.5" />Instant Key
                </TabsTrigger>
                <TabsTrigger value="account" data-testid="tab-account">
                  <Shield className="w-4 h-4 mr-1.5" />Create Account
                </TabsTrigger>
              </TabsList>

              <TabsContent value="instant" className="mt-4">
                <Card className="p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold">Get Key Instantly</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      No email needed. Get an API key right now. You won't be able to manage it later.
                    </p>
                  </div>
                  <ul className="space-y-2">
                    <li className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />Instant API key, no sign-up</li>
                    <li className="flex items-start gap-2 text-sm"><Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />Works with any OpenAI SDK</li>
                    <li className="flex items-start gap-2 text-sm"><AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />Key shown once — copy it now</li>
                    <li className="flex items-start gap-2 text-sm"><AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />No dashboard or usage tracking</li>
                  </ul>
                  <Button className="w-full" onClick={redeemInstant} data-testid="button-redeem-instant">
                    <Zap className="w-4 h-4 mr-1.5" /> Get API Key Instantly
                  </Button>
                </Card>
              </TabsContent>

              <TabsContent value="account" className="mt-4">
                <Card className="p-6 space-y-4">
                  <div>
                    <h3 className="font-semibold">Create Account</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Sign up to track usage, see your budget, and manage your key.
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-redeem-email" />
                    </div>
                    <div className="space-y-2">
                      <Label>Name (optional)</Label>
                      <Input placeholder="Your name" value={name} onChange={e => setName(e.target.value)} data-testid="input-redeem-name" />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input type="password" placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-redeem-password" />
                    </div>
                  </div>
                  <Button className="w-full" onClick={redeemWithAccount} disabled={!email || !password} data-testid="button-redeem-account">
                    Create Account & Get Key
                  </Button>
                </Card>
              </TabsContent>
            </Tabs>

            <Button variant="secondary" className="w-full" onClick={() => setState("preview")} data-testid="button-back-preview">
              Back
            </Button>
          </div>
        )}

        {state === "redeeming" && (
          <div className="text-center py-20">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-6 animate-pulse">
              <Ticket className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">Redeeming your voucher...</h2>
            <p className="text-muted-foreground mt-2">Setting up your API access</p>
          </div>
        )}

        {state === "success" && redeemResult && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 dark:bg-emerald-900/40 mb-4">
                <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">You're All Set!</h1>
              <p className="text-muted-foreground mt-1">Your API key is ready to use</p>
            </div>

            <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Save your API key now</p>
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">This key will only be shown once and cannot be retrieved later.</p>
                </div>
              </div>
            </div>

            <KeyRevealCard keyValue={redeemResult.apiKey} masked={false} />

            <div className="space-y-4" data-testid="section-post-redeem-connectors">
              <div>
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <PlugZap className="w-5 h-5 text-primary" />
                  Connect your AI tool
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Pick the tool you use, copy the snippet, paste it in. Your key is already filled in below.
                </p>
              </div>
              <ConnectorGrid
                mode="compact"
                keyContext={{
                  kind: "fixed",
                  value: redeemResult.apiKey,
                  prefix: redeemResult.keyPrefix,
                }}
                defaultMasked={false}
                showExamples={false}
              />
            </div>

            {/* Synthetic-voucher upsell: only show for users currently signed in
                under an @allotly.local synthetic identity (instant redemption).
                Real-account users already have a permanent account, so this
                CTA is suppressed for them. */}
            {user?.email?.endsWith("@allotly.local") && (
              <Card className="p-5 space-y-3" data-testid="section-oauth-upsell">
                <h3 className="font-semibold">Want to use Allotly with claude.ai?</h3>
                <p className="text-sm text-muted-foreground">
                  Claim a permanent account to connect your key to Claude.ai, ChatGPT, or Gemini
                  via OAuth. You keep the same budget and key — you just gain a way to manage it
                  later.
                </p>
                <Link href={`/oauth/claim-account?code=${encodeURIComponent(codeInput.replace(/-/g, ""))}`}>
                  <Button className="w-full" data-testid="button-oauth-claim-cta">
                    Claim a permanent account <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </Link>
              </Card>
            )}

            <Card className="p-5 space-y-4">
              <h3 className="font-semibold">Quick Start</h3>

              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">BASE URL</p>
                <code className="block p-3 rounded-lg bg-muted/50 font-mono text-sm break-all" data-testid="text-base-url">
                  {window.location.origin}/api/v1
                </code>
              </div>

              <Tabs defaultValue="curl">
                <TabsList data-testid="tabs-code-example">
                  <TabsTrigger value="curl" data-testid="tab-curl"><Terminal className="w-3 h-3 mr-1" />cURL</TabsTrigger>
                  <TabsTrigger value="python" data-testid="tab-python"><Code className="w-3 h-3 mr-1" />Python</TabsTrigger>
                </TabsList>
                <TabsContent value="curl" className="mt-3">
                  <pre className="p-4 rounded-lg bg-[#1e1e2e] text-[#cdd6f4] font-mono text-xs overflow-x-auto leading-relaxed" data-testid="code-curl">
{`curl ${window.location.origin}/api/v1/chat/completions \\
  -H "Authorization: Bearer ${redeemResult.apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${redeemResult.models?.[0]?.modelId || "gpt-4o-mini"}",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}
                  </pre>
                </TabsContent>
                <TabsContent value="python" className="mt-3">
                  <pre className="p-4 rounded-lg bg-[#1e1e2e] text-[#cdd6f4] font-mono text-xs overflow-x-auto leading-relaxed" data-testid="code-python">
{`from openai import OpenAI

client = OpenAI(
    api_key="${redeemResult.apiKey}",
    base_url="${window.location.origin}/api/v1"
)

response = client.chat.completions.create(
    model="${redeemResult.models?.[0]?.modelId || "gpt-4o-mini"}",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`}
                  </pre>
                </TabsContent>
              </Tabs>
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="font-semibold">Where to Use Your Key</h3>
              <p className="text-xs text-muted-foreground">
                Your Allotly key works anywhere that accepts a custom Provider-compatible endpoint. Just set the base URL and API key.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 rounded-lg bg-muted/50 space-y-1" data-testid="use-case-editors">
                  <div className="flex items-center gap-1.5">
                    <Monitor className="w-3.5 h-3.5 text-indigo-500" />
                    <span className="text-xs font-medium">Code Editors</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">Cursor, VS Code + Continue, Windsurf, JetBrains</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1" data-testid="use-case-frameworks">
                  <div className="flex items-center gap-1.5">
                    <Blocks className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="text-xs font-medium">AI Frameworks</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">LangChain, LlamaIndex, CrewAI, AutoGen</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1" data-testid="use-case-apps">
                  <div className="flex items-center gap-1.5">
                    <Code className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-xs font-medium">Custom Apps</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">Python, JS, Go, Ruby — any OpenAI SDK</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50 space-y-1" data-testid="use-case-nocode">
                  <div className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    <span className="text-xs font-medium">No-Code / Notebooks</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight">Zapier, Make, Retool, Jupyter, Colab</p>
                </div>
              </div>
              <Link href="/docs#code-editors">
                <Button variant="outline" size="sm" className="w-full text-xs" data-testid="button-see-setup-guides">
                  See setup guides <ExternalLink className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </Card>

            <Card className="p-5 space-y-3">
              <h3 className="font-semibold">Your Allocation</h3>
              <BudgetBar spent={0} budget={redeemResult.budgetCents} />
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Budget</p>
                  <p className="text-lg font-bold">${(redeemResult.budgetCents / 100).toFixed(2)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground">Expires</p>
                  <p className="text-lg font-bold">{new Date(redeemResult.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
              {redeemResult.models && redeemResult.models.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Available Models</p>
                  <div className="flex flex-wrap gap-1.5">
                    {redeemResult.models.map(m => (
                      <Badge key={m.modelId} variant="secondary" className="text-xs no-default-hover-elevate no-default-active-elevate">
                        {m.displayName}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </Card>

            {redeemResult.hasAccount ? (
              <Link href="/dashboard/connect">
                <Button className="w-full" data-testid="button-go-dashboard">
                  Done — Go to Dashboard <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            ) : (
              <Link href={`/oauth/claim-account?code=${encodeURIComponent(codeInput.replace(/-/g, ""))}`}>
                <Button className="w-full" data-testid="button-claim-account">
                  Done — Save this key to an account <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
