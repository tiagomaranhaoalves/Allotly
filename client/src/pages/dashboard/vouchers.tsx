import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { VoucherCard } from "@/components/brand/voucher-card";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Plus, Copy, Check, Info, AlertTriangle } from "lucide-react";
import { useState } from "react";

export default function VouchersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("5");
  const [maxRedemptions, setMaxRedemptions] = useState("5");
  const [expiryDays, setExpiryDays] = useState("1");
  const [providers, setProviders] = useState<string[]>(["OPENAI", "ANTHROPIC"]);
  const [createdCode, setCreatedCode] = useState("");
  const [selectedBundleId, setSelectedBundleId] = useState("");

  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: vouchers, isLoading } = useQuery<any[]>({ queryKey: ["/api/vouchers"] });
  const { data: voucherLimits } = useQuery<any>({ queryKey: ["/api/voucher-limits"] });
  const { data: bundles } = useQuery<any[]>({ queryKey: ["/api/bundles"] });

  const activeBundles = bundles?.filter((b: any) => b.status === "ACTIVE" && new Date(b.expiresAt) > new Date()) || [];

  const limits = selectedBundleId
    ? { maxBudgetPerRecipientCents: 5000, maxRedemptionsPerCode: 50, maxExpiryDays: 30 }
    : voucherLimits?.limits || { maxBudgetPerRecipientCents: 500, maxRedemptionsPerCode: 25, maxExpiryDays: 1 };

  const createMutation = useMutation({
    mutationFn: async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(expiryDays));
      const res = await apiRequest("POST", "/api/vouchers", {
        label,
        budgetCents: Math.round(parseFloat(budgetDollars) * 100),
        allowedProviders: providers,
        maxRedemptions: parseInt(maxRedemptions),
        expiresAt: expiresAt.toISOString(),
        teamId: teams?.[0]?.id,
        bundleId: selectedBundleId || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-limits"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      setCreatedCode(data.code);
      toast({ title: "Voucher created" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create voucher", description: err.message, variant: "destructive" });
    },
  });

  const toggleProvider = (p: string) => {
    setProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const [copied, setCopied] = useState(false);
  const copyCode = () => {
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetForm = () => {
    setLabel("");
    setBudgetDollars(selectedBundleId ? "25" : String((limits.maxBudgetPerRecipientCents || 500) / 100));
    setMaxRedemptions("5");
    setExpiryDays(String(limits.maxExpiryDays || 1));
    setProviders(["OPENAI", "ANTHROPIC"]);
    setSelectedBundleId("");
    setCreatedCode("");
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) resetForm();
  };

  const handleBundleChange = (val: string) => {
    setSelectedBundleId(val === "none" ? "" : val);
    if (val && val !== "none") {
      setBudgetDollars("25");
      setMaxRedemptions("10");
      setExpiryDays("30");
    } else {
      setBudgetDollars(String((voucherLimits?.limits?.maxBudgetPerRecipientCents || 500) / 100));
      setMaxRedemptions("5");
      setExpiryDays(String(voucherLimits?.limits?.maxExpiryDays || 1));
    }
  };

  const canCreateMore = selectedBundleId || (voucherLimits?.remainingCodes ?? 1) > 0;
  const maxBudget = limits.maxBudgetPerRecipientCents / 100;
  const maxRedemptionLimit = limits.maxRedemptionsPerCode;
  const maxExpiry = limits.maxExpiryDays;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-vouchers-heading">Vouchers</h1>
          <p className="text-muted-foreground mt-1">Create and manage voucher codes for AI access</p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-voucher" disabled={!canCreateMore}>
              <Plus className="w-4 h-4 mr-1.5" />
              Create Voucher
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{createdCode ? "Voucher Created!" : "Create Voucher"}</DialogTitle>
            </DialogHeader>
            {createdCode ? (
              <div className="space-y-4 pt-2">
                <div className="text-center p-6 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-2">Voucher Code</p>
                  <code className="text-2xl font-mono font-bold text-primary tracking-widest" data-testid="text-created-voucher-code">
                    {createdCode}
                  </code>
                </div>
                <Button className="w-full" onClick={copyCode} data-testid="button-copy-created-code">
                  {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                  {copied ? "Copied!" : "Copy Code"}
                </Button>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Redemption Link</p>
                  <code className="text-xs font-mono break-all">{window.location.origin}/redeem?code={createdCode}</code>
                </div>
                <Button variant="secondary" className="w-full" onClick={() => handleOpenChange(false)} data-testid="button-done">
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                {activeBundles.length > 0 && (
                  <div className="space-y-2">
                    <Label>Voucher Source</Label>
                    <Select value={selectedBundleId || "none"} onValueChange={handleBundleChange}>
                      <SelectTrigger data-testid="select-voucher-source">
                        <SelectValue placeholder="Select source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">
                          {voucherLimits?.plan === "FREE" ? "Free Plan Voucher" : "Team Plan Voucher"}
                        </SelectItem>
                        {activeBundles.map((b: any) => (
                          <SelectItem key={b.id} value={b.id}>
                            Voucher Bundle (expires {new Date(b.expiresAt).toLocaleDateString()})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-sm flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-blue-700 dark:text-blue-300">
                      {selectedBundleId ? "Bundle Voucher" : `${voucherLimits?.plan || "FREE"} Plan`} Limits
                    </p>
                    <p className="text-blue-600 dark:text-blue-400 text-xs mt-0.5">
                      Max ${maxBudget}/recipient, {maxRedemptionLimit} redemptions, {maxExpiry} day{maxExpiry !== 1 ? 's' : ''} expiry
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input placeholder="AI Workshop March 2026" value={label} onChange={e => setLabel(e.target.value)} data-testid="input-voucher-label" />
                </div>
                <div className="space-y-2">
                  <Label>Budget per Recipient ($)</Label>
                  <Input type="number" min="1" max={maxBudget} value={budgetDollars} onChange={e => setBudgetDollars(e.target.value)} data-testid="input-voucher-budget" />
                  <p className="text-xs text-muted-foreground">Max ${maxBudget}</p>
                </div>
                <div className="space-y-2">
                  <Label>Max Redemptions</Label>
                  <Input type="number" min="1" max={maxRedemptionLimit} value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} data-testid="input-voucher-redemptions" />
                  <p className="text-xs text-muted-foreground">Max {maxRedemptionLimit}</p>
                </div>
                <div className="space-y-2">
                  <Label>Expires In (days)</Label>
                  <Input type="number" min="1" max={maxExpiry} value={expiryDays} onChange={e => setExpiryDays(e.target.value)} data-testid="input-voucher-expiry" />
                  <p className="text-xs text-muted-foreground">Max {maxExpiry} day{maxExpiry !== 1 ? 's' : ''}</p>
                </div>
                <div className="space-y-2">
                  <Label>Allowed AI Providers</Label>
                  <div className="flex flex-wrap gap-3">
                    {[
                      { id: "OPENAI", label: "OpenAI", color: "#10A37F" },
                      { id: "ANTHROPIC", label: "Anthropic", color: "#D4A574" },
                      { id: "GOOGLE", label: "Google", color: "#4285F4" },
                    ].map(p => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                          checked={providers.includes(p.id)}
                          onCheckedChange={() => toggleProvider(p.id)}
                          data-testid={`checkbox-provider-${p.id.toLowerCase()}`}
                        />
                        <span className="flex items-center gap-1.5 text-sm">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                          {p.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm font-medium">Summary</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    ${budgetDollars} x {maxRedemptions} redemptions = ${(parseFloat(budgetDollars || "0") * parseInt(maxRedemptions || "0")).toFixed(2)} total
                  </p>
                  {selectedBundleId && (
                    <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">From Voucher Bundle</p>
                  )}
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={providers.length === 0 || createMutation.isPending} data-testid="button-submit-voucher">
                  {createMutation.isPending ? "Creating..." : "Create Voucher"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {voucherLimits && !selectedBundleId && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{voucherLimits.plan} Plan</Badge>
              <span className="text-sm text-muted-foreground">
                {voucherLimits.activeVouchers}/{voucherLimits.plan === "FREE" ? 1 : 5} active voucher code{voucherLimits.plan === "FREE" ? '' : 's'}
              </span>
            </div>
            {voucherLimits.remainingCodes === 0 && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                Limit reached — purchase a Voucher Bundle for more
              </div>
            )}
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}</div>
      ) : vouchers && vouchers.length > 0 ? (
        <div className="grid sm:grid-cols-2 gap-4">
          {vouchers.map((v: any) => (
            <VoucherCard
              key={v.id}
              code={v.code}
              status={v.status}
              budgetCents={v.budgetCents}
              label={v.label}
              expiresAt={v.expiresAt}
              redemptions={v.currentRedemptions}
              maxRedemptions={v.maxRedemptions}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Ticket className="w-10 h-10 text-muted-foreground" />}
          title="No vouchers yet"
          description="Create voucher codes to distribute AI access to anyone"
          action={{ label: "Create Voucher", onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}
