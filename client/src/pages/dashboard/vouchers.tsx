import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { VoucherCard } from "@/components/brand/voucher-card";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Plus, Copy, Check } from "lucide-react";
import { useState } from "react";

export default function VouchersPage() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("25");
  const [maxRedemptions, setMaxRedemptions] = useState("5");
  const [expiryDays, setExpiryDays] = useState("30");
  const [providers, setProviders] = useState<string[]>(["OPENAI", "ANTHROPIC"]);
  const [createdCode, setCreatedCode] = useState("");

  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: vouchers, isLoading } = useQuery<any[]>({ queryKey: ["/api/vouchers"] });

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
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vouchers</h1>
          <p className="text-muted-foreground mt-1">Create and manage voucher codes for AI access</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreatedCode(""); }}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-voucher">
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
                <Button variant="secondary" className="w-full" onClick={() => { setOpen(false); setCreatedCode(""); }} data-testid="button-done">
                  Done
                </Button>
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Label (optional)</Label>
                  <Input placeholder="AI Workshop March 2026" value={label} onChange={e => setLabel(e.target.value)} data-testid="input-voucher-label" />
                </div>
                <div className="space-y-2">
                  <Label>Budget per Recipient ($)</Label>
                  <Input type="number" min="1" max="100" value={budgetDollars} onChange={e => setBudgetDollars(e.target.value)} data-testid="input-voucher-budget" />
                </div>
                <div className="space-y-2">
                  <Label>Max Redemptions</Label>
                  <Input type="number" min="1" max="50" value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} data-testid="input-voucher-redemptions" />
                </div>
                <div className="space-y-2">
                  <Label>Expires In (days)</Label>
                  <Input type="number" min="1" max="30" value={expiryDays} onChange={e => setExpiryDays(e.target.value)} data-testid="input-voucher-expiry" />
                </div>
                <div className="space-y-2">
                  <Label>Allowed Providers</Label>
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
                    ${budgetDollars} × {maxRedemptions} redemptions = ${(parseFloat(budgetDollars || "0") * parseInt(maxRedemptions || "0")).toFixed(2)} total
                  </p>
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={providers.length === 0 || createMutation.isPending} data-testid="button-submit-voucher">
                  {createMutation.isPending ? "Creating..." : "Create Voucher"}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

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
