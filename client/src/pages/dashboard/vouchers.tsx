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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Plus, Copy, Check, Info, AlertTriangle, Link2, Mail, Send, Ban, ExternalLink, Pencil, Trash2 } from "lucide-react";
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
      toast({ title: "Voucher created", description: "Make sure to copy the voucher code before closing this dialog." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create voucher", description: err.message, variant: "destructive" });
    },
  });

  const toggleProvider = (p: string) => {
    setProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const redeemLink = createdCode ? `${window.location.origin}/redeem?code=${createdCode}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(redeemLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const sendVoucherEmail = async () => {
    if (!emailTo || !createdCode) return;
    setSendingEmail(true);
    try {
      await apiRequest("POST", "/api/vouchers/send-email", {
        email: emailTo,
        code: createdCode,
      });
      toast({ title: "Invite sent", description: `Voucher link sent to ${emailTo}` });
      setEmailTo("");
      setShowEmailForm(false);
    } catch (err: any) {
      toast({ title: "Failed to send", description: err.message, variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  const [editVoucherId, setEditVoucherId] = useState<string | null>(null);
  const [editVoucherLabel, setEditVoucherLabel] = useState("");
  const [editVoucherBudget, setEditVoucherBudget] = useState("");
  const [editVoucherMaxRedemptions, setEditVoucherMaxRedemptions] = useState("");
  const [editVoucherExpiry, setEditVoucherExpiry] = useState("");
  const [editVoucherProviders, setEditVoucherProviders] = useState<string[]>([]);

  const openEditVoucher = (v: any) => {
    setEditVoucherId(v.id);
    setEditVoucherLabel(v.label || "");
    setEditVoucherBudget(String(v.budgetCents / 100));
    setEditVoucherMaxRedemptions(String(v.maxRedemptions));
    setEditVoucherExpiry(new Date(v.expiresAt).toISOString().slice(0, 16));
    setEditVoucherProviders(v.allowedProviders || []);
  };

  const editVoucherMutation = useMutation({
    mutationFn: async () => {
      if (!editVoucherId) return;
      await apiRequest("PATCH", `/api/vouchers/${editVoucherId}`, {
        label: editVoucherLabel || null,
        budgetCents: Math.round(parseFloat(editVoucherBudget) * 100),
        maxRedemptions: parseInt(editVoucherMaxRedemptions),
        expiresAt: new Date(editVoucherExpiry).toISOString(),
        allowedProviders: editVoucherProviders,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      toast({ title: "Voucher updated" });
      setEditVoucherId(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to update voucher", description: err.message, variant: "destructive" });
    },
  });

  const toggleEditProvider = (p: string) => {
    setEditVoucherProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/vouchers/${id}/revoke`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-limits"] });
      toast({ title: "Voucher revoked" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to revoke voucher", description: err.message, variant: "destructive" });
    },
  });

  const deleteVoucherMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/vouchers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-limits"] });
      toast({ title: "Voucher deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete voucher", description: err.message, variant: "destructive" });
    },
  });

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
              <DialogDescription>
                {createdCode ? "Share this code with your recipient." : "Set a budget, expiry, and allowed providers for a new voucher."}
              </DialogDescription>
            </DialogHeader>
            {createdCode ? (
              <div className="space-y-4 pt-2">
                <div className="text-center p-6 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground mb-2">Voucher Code</p>
                  <code className="text-2xl font-mono font-bold text-primary tracking-widest" data-testid="text-created-voucher-code">
                    {createdCode}
                  </code>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={copyCode} data-testid="button-copy-created-code">
                    {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                    {copied ? "Copied!" : "Copy Code"}
                  </Button>
                  <Button variant="outline" onClick={copyLink} data-testid="button-copy-redeem-link">
                    {copiedLink ? <Check className="w-4 h-4 mr-1.5" /> : <Link2 className="w-4 h-4 mr-1.5" />}
                    {copiedLink ? "Copied!" : "Copy Activation Link"}
                  </Button>
                </div>

                {showEmailForm ? (
                  <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                    <Label className="text-xs">Recipient email</Label>
                    <div className="flex gap-2">
                      <Input
                        type="email"
                        placeholder="recipient@company.com"
                        value={emailTo}
                        onChange={e => setEmailTo(e.target.value)}
                        className="h-9 text-sm"
                        data-testid="input-voucher-email"
                      />
                      <Button size="sm" className="h-9 shrink-0" onClick={sendVoucherEmail} disabled={!emailTo || sendingEmail} data-testid="button-send-voucher-email">
                        {sendingEmail ? "Sending..." : <><Send className="w-3.5 h-3.5 mr-1" /> Send</>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" className="w-full" onClick={() => setShowEmailForm(true)} data-testid="button-show-email-form">
                    <Mail className="w-4 h-4 mr-1.5" />
                    Send via Email
                  </Button>
                )}

                <Button
                  className="w-full"
                  onClick={() => window.open(redeemLink, "_blank")}
                  data-testid="button-activate-now"
                >
                  <ExternalLink className="w-4 h-4 mr-1.5" />
                  Activate Code Now
                </Button>

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
                  <Label htmlFor="voucher-label">Label (optional)</Label>
                  <Input id="voucher-label" placeholder="AI Workshop March 2026" value={label} onChange={e => setLabel(e.target.value)} data-testid="input-voucher-label" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-budget">Budget per Recipient ($)</Label>
                  <Input id="voucher-budget" type="number" min="1" max={maxBudget} value={budgetDollars} onChange={e => setBudgetDollars(e.target.value)} data-testid="input-voucher-budget" />
                  <p className="text-xs text-muted-foreground">Max ${maxBudget}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-redemptions">Max Redemptions</Label>
                  <Input id="voucher-redemptions" type="number" min="1" max={maxRedemptionLimit} value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} data-testid="input-voucher-redemptions" />
                  <p className="text-xs text-muted-foreground">Max {maxRedemptionLimit}</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="voucher-expiry">Expires In (days)</Label>
                  <Input id="voucher-expiry" type="number" min="1" max={maxExpiry} value={expiryDays} onChange={e => setExpiryDays(e.target.value)} data-testid="input-voucher-expiry" />
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

      <Dialog open={!!editVoucherId} onOpenChange={(o) => { if (!o) setEditVoucherId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Voucher</DialogTitle>
            <DialogDescription>Update this voucher's settings. Only unredeemed vouchers can be edited.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input placeholder="Optional label" value={editVoucherLabel} onChange={e => setEditVoucherLabel(e.target.value)} data-testid="input-edit-voucher-label" />
            </div>
            <div className="space-y-2">
              <Label>Budget per Recipient ($)</Label>
              <Input type="number" min="1" value={editVoucherBudget} onChange={e => setEditVoucherBudget(e.target.value)} data-testid="input-edit-voucher-budget" />
            </div>
            <div className="space-y-2">
              <Label>Max Redemptions</Label>
              <Input type="number" min="1" value={editVoucherMaxRedemptions} onChange={e => setEditVoucherMaxRedemptions(e.target.value)} data-testid="input-edit-voucher-redemptions" />
            </div>
            <div className="space-y-2">
              <Label>Expires At</Label>
              <Input type="datetime-local" value={editVoucherExpiry} onChange={e => setEditVoucherExpiry(e.target.value)} data-testid="input-edit-voucher-expiry" />
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
                      checked={editVoucherProviders.includes(p.id)}
                      onCheckedChange={() => toggleEditProvider(p.id)}
                      data-testid={`checkbox-edit-provider-${p.id.toLowerCase()}`}
                    />
                    <span className="flex items-center gap-1.5 text-sm">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <Button className="w-full" onClick={() => editVoucherMutation.mutate()} disabled={editVoucherProviders.length === 0 || editVoucherMutation.isPending} data-testid="button-save-voucher-edit">
              {editVoucherMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              actions={(
                <div className="flex items-center gap-1">
                  {v.status === "ACTIVE" && v.currentRedemptions === 0 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => openEditVoucher(v)}
                      data-testid={`button-edit-voucher-${v.id}`}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                  )}
                  {v.status === "ACTIVE" && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          disabled={revokeMutation.isPending}
                          data-testid={`button-revoke-voucher-${v.id}`}
                        >
                          <Ban className="w-3.5 h-3.5 mr-1" />
                          Revoke
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Revoke Voucher?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to revoke voucher <strong>{v.code}</strong>? This will prevent any new redemptions. Existing members who already redeemed this voucher will not be affected. This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel data-testid="button-cancel-revoke-voucher">Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => revokeMutation.mutate(v.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            data-testid="button-confirm-revoke-voucher"
                          >
                            Revoke Voucher
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                        disabled={deleteVoucherMutation.isPending}
                        data-testid={`button-delete-voucher-${v.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Delete
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete Voucher?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {v.currentRedemptions > 0
                            ? <>This voucher has been redeemed {v.currentRedemptions} time(s). Deleting it will also revoke the recipient's API key and remove their membership. This cannot be undone.</>
                            : <>This will permanently delete voucher <strong>{v.code}</strong>. This cannot be undone.</>
                          }
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel data-testid="button-cancel-delete-voucher">Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteVoucherMutation.mutate(v.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          data-testid="button-confirm-delete-voucher"
                        >
                          Delete Voucher
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Ticket className="w-10 h-10 text-muted-foreground" />}
          title="Create your first voucher"
          description="Create voucher codes to distribute AI access to anyone"
          action={{ label: "Create Voucher", onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}
