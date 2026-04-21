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
import {
  Ticket, Plus, Copy, Check, Info, AlertTriangle, Link2, Mail, Send, Ban,
  ExternalLink, Pencil, Trash2, Download, Clock, DollarSign, ChevronDown,
  ChevronUp, User, Key, Activity, Layers,
} from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

const PROVIDERS = [
  { id: "OPENAI", label: "OpenAI", color: "#10A37F" },
  { id: "ANTHROPIC", label: "Anthropic", color: "#D4A574" },
  { id: "GOOGLE", label: "Google", color: "#4285F4" },
  { id: "AZURE_OPENAI", label: "Azure", color: "#0078D4" },
];

export default function VouchersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [budgetDollars, setBudgetDollars] = useState("5");
  const [maxRedemptions, setMaxRedemptions] = useState("5");
  const [expiryDays, setExpiryDays] = useState("1");
  const [providers, setProviders] = useState<string[]>(["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"]);
  const [createdCode, setCreatedCode] = useState("");
  const [selectedBundleId, setSelectedBundleId] = useState("");

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkCount, setBulkCount] = useState("10");
  const [bulkBudget, setBulkBudget] = useState("5");
  const [bulkExpiryDays, setBulkExpiryDays] = useState("7");
  const [bulkProviders, setBulkProviders] = useState<string[]>(["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"]);
  const [bulkLabel, setBulkLabel] = useState("");
  const [bulkCreatedCodes, setBulkCreatedCodes] = useState<{ id: string; code: string; budgetCents: number; expiresAt: string }[]>([]);

  const [extendVoucherId, setExtendVoucherId] = useState<string | null>(null);
  const [extendDate, setExtendDate] = useState("");

  const [topUpVoucherId, setTopUpVoucherId] = useState<string | null>(null);
  const [topUpAmount, setTopUpAmount] = useState("5");

  const [exportStatus, setExportStatus] = useState("all");
  const [listFilter, setListFilter] = useState("all");

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [expandedVoucherId, setExpandedVoucherId] = useState<string | null>(null);

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
      toast({ title: t("dashboard.vouchers.toastVoucherCreatedTitle"), description: t("dashboard.vouchers.toastVoucherCreatedDescription") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastVoucherCreateFailed"), description: err.message, variant: "destructive" });
    },
  });

  const bulkCreateMutation = useMutation({
    mutationFn: async () => {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + parseInt(bulkExpiryDays));
      const res = await apiRequest("POST", "/api/vouchers/bulk-create", {
        count: parseInt(bulkCount),
        budgetCents: Math.round(parseFloat(bulkBudget) * 100),
        expiresAt: expiresAt.toISOString(),
        allowedProviders: bulkProviders,
        teamId: teams?.[0]?.id,
        label: bulkLabel || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-limits"] });
      setBulkCreatedCodes(data.vouchers);
      toast({ title: t("dashboard.vouchers.toastBulkCreatedTitle", { count: data.vouchers.length }), description: t("dashboard.vouchers.toastBulkCreatedDescription") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastBulkCreateFailed"), description: err.message, variant: "destructive" });
    },
  });

  const extendMutation = useMutation({
    mutationFn: async () => {
      if (!extendVoucherId) return;
      const res = await apiRequest("POST", `/api/vouchers/${extendVoucherId}/extend`, {
        newExpiresAt: new Date(extendDate).toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      toast({ title: t("dashboard.vouchers.toastExtended") });
      setExtendVoucherId(null);
      setExtendDate("");
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastExtendFailed"), description: err.message, variant: "destructive" });
    },
  });

  const topUpMutation = useMutation({
    mutationFn: async () => {
      if (!topUpVoucherId) return;
      const res = await apiRequest("POST", `/api/vouchers/${topUpVoucherId}/top-up`, {
        additionalBudgetCents: Math.round(parseFloat(topUpAmount) * 100),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      toast({ title: t("dashboard.vouchers.toastToppedUp") });
      setTopUpVoucherId(null);
      setTopUpAmount("5");
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastTopUpFailed"), description: err.message, variant: "destructive" });
    },
  });

  const toggleProvider = (p: string) => {
    setProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const toggleBulkProvider = (p: string) => {
    setBulkProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [copiedBulk, setCopiedBulk] = useState(false);

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

  const copyAllBulkCodes = () => {
    const text = bulkCreatedCodes.map(v => v.code).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedBulk(true);
    setTimeout(() => setCopiedBulk(false), 2000);
  };

  const downloadBulkCsv = () => {
    const header = "code,budgetCents,expiresAt,redeemLink";
    const rows = bulkCreatedCodes.map(v =>
      `${v.code},${v.budgetCents},${new Date(v.expiresAt).toISOString()},${window.location.origin}/redeem?code=${v.code}`
    );
    const csv = [header, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `allotly-vouchers-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendVoucherEmail = async () => {
    if (!emailTo || !createdCode) return;
    setSendingEmail(true);
    try {
      await apiRequest("POST", "/api/vouchers/send-email", {
        email: emailTo,
        code: createdCode,
      });
      toast({ title: t("dashboard.vouchers.toastInviteSentTitle"), description: t("dashboard.vouchers.toastInviteSentDescription", { email: emailTo }) });
      setEmailTo("");
      setShowEmailForm(false);
    } catch (err: any) {
      toast({ title: t("dashboard.vouchers.toastSendFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.vouchers.toastVoucherUpdated") });
      setEditVoucherId(null);
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastUpdateFailed"), description: err.message, variant: "destructive" });
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
      toast({ title: t("dashboard.vouchers.toastVoucherRevoked") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastRevokeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await apiRequest("POST", "/api/vouchers/bulk/revoke", { voucherIds: ids });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-limits"] });
      const succeeded = data.results.filter((r: any) => r.success).length;
      toast({ title: t("dashboard.vouchers.toastBulkRevokedTitle", { count: succeeded }) });
      setSelectedIds(new Set());
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastBulkRevokeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const deleteVoucherMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/vouchers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/voucher-limits"] });
      toast({ title: t("dashboard.vouchers.toastVoucherDeleted") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.vouchers.toastDeleteFailed"), description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setLabel("");
    setBudgetDollars(selectedBundleId ? "25" : String((limits.maxBudgetPerRecipientCents || 500) / 100));
    setMaxRedemptions("5");
    setExpiryDays(String(limits.maxExpiryDays || 1));
    setProviders(["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"]);
    setSelectedBundleId("");
    setCreatedCode("");
  };

  const resetBulkForm = () => {
    setBulkCount("10");
    setBulkBudget("5");
    setBulkExpiryDays("7");
    setBulkProviders(["OPENAI", "ANTHROPIC", "GOOGLE", "AZURE_OPENAI"]);
    setBulkLabel("");
    setBulkCreatedCodes([]);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (!o) resetForm();
  };

  const handleBulkOpenChange = (o: boolean) => {
    setBulkOpen(o);
    if (!o) resetBulkForm();
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

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredVouchers = listFilter === "all"
    ? vouchers
    : vouchers?.filter((v: any) => v.status === listFilter);

  const revokableVouchers = filteredVouchers?.filter((v: any) => v.status === "ACTIVE" || v.status === "FULLY_REDEEMED") || [];
  const allRevokableSelected = revokableVouchers.length > 0 && revokableVouchers.every((v: any) => selectedIds.has(v.id));

  const toggleSelectAll = () => {
    if (allRevokableSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(revokableVouchers.map((v: any) => v.id)));
    }
  };

  const exportVouchers = async () => {
    try {
      const params = new URLSearchParams();
      if (exportStatus !== "all") params.set("status", exportStatus);
      const res = await fetch(`/api/vouchers/export?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `allotly-vouchers-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: t("dashboard.vouchers.toastExportComplete") });
    } catch (err: any) {
      toast({ title: t("dashboard.vouchers.toastExportFailed"), description: err.message, variant: "destructive" });
    }
  };

  const isRedeemed = (v: any) => v.currentRedemptions > 0;
  const canExtendOrTopUp = (v: any) => isRedeemed(v) && (v.status === "ACTIVE" || v.status === "FULLY_REDEEMED");
  const canRevoke = (v: any) => v.status === "ACTIVE" || v.status === "FULLY_REDEEMED";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-vouchers-heading">{t("dashboard.vouchers.heading")}</h1>
          <p className="text-muted-foreground mt-1">{t("dashboard.vouchers.subheading")}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Select value={exportStatus} onValueChange={setExportStatus}>
              <SelectTrigger className="w-[130px] h-9" data-testid="select-export-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("dashboard.vouchers.exportStatusAll")}</SelectItem>
                <SelectItem value="ACTIVE">{t("dashboard.vouchers.exportStatusActive")}</SelectItem>
                <SelectItem value="FULLY_REDEEMED">{t("dashboard.vouchers.exportStatusRedeemed")}</SelectItem>
                <SelectItem value="EXPIRED">{t("dashboard.vouchers.exportStatusExpired")}</SelectItem>
                <SelectItem value="REVOKED">{t("dashboard.vouchers.exportStatusRevoked")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={exportVouchers} data-testid="button-export-csv">
              <Download className="w-4 h-4 mr-1.5" />
              {t("dashboard.vouchers.exportCsvButton")}
            </Button>
          </div>

          <Dialog open={bulkOpen} onOpenChange={handleBulkOpenChange}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-bulk-create-vouchers">
                <Layers className="w-4 h-4 mr-1.5" />
                {t("dashboard.vouchers.bulkCreateButton")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{bulkCreatedCodes.length > 0 ? t("dashboard.vouchers.bulkCreatedTitle", { count: bulkCreatedCodes.length }) : t("dashboard.vouchers.bulkCreateDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {bulkCreatedCodes.length > 0 ? t("dashboard.vouchers.bulkCreatedDescription") : t("dashboard.vouchers.bulkCreateDialogDescription")}
                </DialogDescription>
              </DialogHeader>
              {bulkCreatedCodes.length > 0 ? (
                <div className="space-y-4 pt-2">
                  <div className="max-h-60 overflow-y-auto rounded-lg border bg-muted/30 p-3">
                    <div className="grid gap-1">
                      {bulkCreatedCodes.map((v, i) => (
                        <code key={v.id} className="text-xs font-mono text-foreground" data-testid={`text-bulk-code-${i}`}>
                          {v.code}
                        </code>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={copyAllBulkCodes} data-testid="button-copy-all-codes">
                      {copiedBulk ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                      {copiedBulk ? t("dashboard.vouchers.copied") : t("dashboard.vouchers.copyAll")}
                    </Button>
                    <Button variant="outline" onClick={downloadBulkCsv} data-testid="button-download-bulk-csv">
                      <Download className="w-4 h-4 mr-1.5" />
                      {t("dashboard.vouchers.downloadCsv")}
                    </Button>
                  </div>
                  <Button variant="secondary" className="w-full" onClick={() => handleBulkOpenChange(false)} data-testid="button-bulk-done">
                    {t("dashboard.vouchers.done")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bulk-count">{t("dashboard.vouchers.bulkCount")}</Label>
                      <Input id="bulk-count" type="number" min="1" max="500" value={bulkCount} onChange={e => setBulkCount(e.target.value)} data-testid="input-bulk-count" />
                      <p className="text-xs text-muted-foreground">{t("dashboard.vouchers.bulkCountHelper")}</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bulk-budget">{t("dashboard.vouchers.bulkBudget")}</Label>
                      <Input id="bulk-budget" type="number" min="1" value={bulkBudget} onChange={e => setBulkBudget(e.target.value)} data-testid="input-bulk-budget" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bulk-expiry">{t("dashboard.vouchers.bulkExpiry")}</Label>
                      <Input id="bulk-expiry" type="number" min="1" value={bulkExpiryDays} onChange={e => setBulkExpiryDays(e.target.value)} data-testid="input-bulk-expiry" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bulk-label">{t("dashboard.vouchers.bulkLabelOptional")}</Label>
                      <Input id="bulk-label" placeholder={t("dashboard.vouchers.bulkLabelPlaceholder")} value={bulkLabel} onChange={e => setBulkLabel(e.target.value)} data-testid="input-bulk-label" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("dashboard.vouchers.allowedProviders")}</Label>
                    <div className="flex flex-wrap gap-3">
                      {PROVIDERS.map(p => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                          <Checkbox
                            checked={bulkProviders.includes(p.id)}
                            onCheckedChange={() => toggleBulkProvider(p.id)}
                            data-testid={`checkbox-bulk-provider-${p.id.toLowerCase()}`}
                          />
                          <span className="flex items-center gap-1.5 text-sm">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                            {p.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-950/30 text-sm">
                    <p className="font-medium text-cyan-700 dark:text-cyan-300">{t("dashboard.vouchers.bulkSummaryTitle")}</p>
                    <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-0.5">
                      {t("dashboard.vouchers.bulkSummaryDescription", { count: bulkCount, budget: bulkBudget, total: (parseInt(bulkCount || "0") * parseFloat(bulkBudget || "0")).toFixed(2) })}
                    </p>
                  </div>
                  <Button className="w-full" onClick={() => bulkCreateMutation.mutate()} disabled={bulkProviders.length === 0 || bulkCreateMutation.isPending} data-testid="button-submit-bulk-create">
                    {bulkCreateMutation.isPending ? t("dashboard.vouchers.bulkSubmitPending") : t("dashboard.vouchers.bulkSubmit", { count: bulkCount })}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-voucher" disabled={!canCreateMore}>
                <Plus className="w-4 h-4 mr-1.5" />
                {t("dashboard.vouchers.createButton")}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{createdCode ? t("dashboard.vouchers.createdTitle") : t("dashboard.vouchers.createDialogTitle")}</DialogTitle>
                <DialogDescription>
                  {createdCode ? t("dashboard.vouchers.createdDescription") : t("dashboard.vouchers.createDialogDescription")}
                </DialogDescription>
              </DialogHeader>
              {createdCode ? (
                <div className="space-y-4 pt-2">
                  <div className="text-center p-6 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground mb-2">{t("dashboard.vouchers.voucherCodeLabel")}</p>
                    <code className="text-2xl font-mono font-bold text-primary tracking-widest" data-testid="text-created-voucher-code">
                      {createdCode}
                    </code>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={copyCode} data-testid="button-copy-created-code">
                      {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />}
                      {copied ? t("dashboard.vouchers.copied") : t("dashboard.vouchers.copyCode")}
                    </Button>
                    <Button variant="outline" onClick={copyLink} data-testid="button-copy-redeem-link">
                      {copiedLink ? <Check className="w-4 h-4 mr-1.5" /> : <Link2 className="w-4 h-4 mr-1.5" />}
                      {copiedLink ? t("dashboard.vouchers.copied") : t("dashboard.vouchers.copyActivationLink")}
                    </Button>
                  </div>

                  {showEmailForm ? (
                    <div className="space-y-2 p-3 rounded-lg border bg-muted/30">
                      <Label className="text-xs">{t("dashboard.vouchers.recipientEmailLabel")}</Label>
                      <div className="flex gap-2">
                        <Input
                          type="email"
                          placeholder={t("dashboard.vouchers.recipientEmailPlaceholder")}
                          value={emailTo}
                          onChange={e => setEmailTo(e.target.value)}
                          className="h-9 text-sm"
                          data-testid="input-voucher-email"
                        />
                        <Button size="sm" className="h-9 shrink-0" onClick={sendVoucherEmail} disabled={!emailTo || sendingEmail} data-testid="button-send-voucher-email">
                          {sendingEmail ? t("dashboard.vouchers.sendingEmail") : <><Send className="w-3.5 h-3.5 mr-1" /> {t("dashboard.vouchers.sendButton")}</>}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" className="w-full" onClick={() => setShowEmailForm(true)} data-testid="button-show-email-form">
                      <Mail className="w-4 h-4 mr-1.5" />
                      {t("dashboard.vouchers.sendViaEmail")}
                    </Button>
                  )}

                  <Button
                    className="w-full"
                    onClick={() => window.open(redeemLink, "_blank")}
                    data-testid="button-activate-now"
                  >
                    <ExternalLink className="w-4 h-4 mr-1.5" />
                    {t("dashboard.vouchers.activateNow")}
                  </Button>

                  <Button variant="secondary" className="w-full" onClick={() => handleOpenChange(false)} data-testid="button-done">
                    {t("dashboard.vouchers.done")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {activeBundles.length > 0 && (
                    <div className="space-y-2">
                      <Label>{t("dashboard.vouchers.voucherSourceLabel")}</Label>
                      <Select value={selectedBundleId || "none"} onValueChange={handleBundleChange}>
                        <SelectTrigger data-testid="select-voucher-source">
                          <SelectValue placeholder={t("dashboard.vouchers.voucherSourcePlaceholder")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {voucherLimits?.plan === "FREE" ? t("dashboard.vouchers.sourceFreePlan") : t("dashboard.vouchers.sourceTeamPlan")}
                          </SelectItem>
                          {activeBundles.map((b: any) => (
                            <SelectItem key={b.id} value={b.id}>
                              {t("dashboard.vouchers.sourceBundle", { date: new Date(b.expiresAt).toLocaleDateString() })}
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
                        {selectedBundleId ? t("dashboard.vouchers.limitsTitleBundle") : t("dashboard.vouchers.limitsTitlePlan", { plan: voucherLimits?.plan || "FREE" })}
                      </p>
                      <p className="text-blue-600 dark:text-blue-400 text-xs mt-0.5">
                        {t("dashboard.vouchers.limitsDescription", { maxBudget, maxRedemptions: maxRedemptionLimit, maxExpiry })}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="voucher-label">{t("dashboard.vouchers.labelOptional")}</Label>
                    <Input id="voucher-label" placeholder={t("dashboard.vouchers.labelPlaceholder")} value={label} onChange={e => setLabel(e.target.value)} data-testid="input-voucher-label" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voucher-budget">{t("dashboard.vouchers.budgetLabel")}</Label>
                    <Input id="voucher-budget" type="number" min="1" max={maxBudget} value={budgetDollars} onChange={e => setBudgetDollars(e.target.value)} data-testid="input-voucher-budget" />
                    <p className="text-xs text-muted-foreground">{t("dashboard.vouchers.maxLabel", { amount: maxBudget })}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voucher-redemptions">{t("dashboard.vouchers.redemptionsLabel")}</Label>
                    <Input id="voucher-redemptions" type="number" min="1" max={maxRedemptionLimit} value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} data-testid="input-voucher-redemptions" />
                    <p className="text-xs text-muted-foreground">{t("dashboard.vouchers.maxLabelCount", { count: maxRedemptionLimit })}</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="voucher-expiry">{t("dashboard.vouchers.expiryLabel")}</Label>
                    <Input id="voucher-expiry" type="number" min="1" max={maxExpiry} value={expiryDays} onChange={e => setExpiryDays(e.target.value)} data-testid="input-voucher-expiry" />
                    <p className="text-xs text-muted-foreground">{t("dashboard.vouchers.maxLabelDays", { count: maxExpiry })}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("dashboard.vouchers.allowedProviders")}</Label>
                    <div className="flex flex-wrap gap-3">
                      {PROVIDERS.map(p => (
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
                    <p className="text-sm font-medium">{t("dashboard.vouchers.summaryTitle")}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("dashboard.vouchers.summaryDescription", { budget: budgetDollars, redemptions: maxRedemptions, total: (parseFloat(budgetDollars || "0") * parseInt(maxRedemptions || "0")).toFixed(2) })}
                    </p>
                    {selectedBundleId && (
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">{t("dashboard.vouchers.fromBundle")}</p>
                    )}
                  </div>
                  <Button className="w-full" onClick={() => createMutation.mutate()} disabled={providers.length === 0 || createMutation.isPending} data-testid="button-submit-voucher">
                    {createMutation.isPending ? t("dashboard.vouchers.submitCreatePending") : t("dashboard.vouchers.submitCreate")}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {voucherLimits && !selectedBundleId && (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate text-xs">{t("dashboard.vouchers.planBadge", { plan: voucherLimits.plan })}</Badge>
              <span className="text-sm text-muted-foreground">
                {t("dashboard.vouchers.activeCounter", { active: voucherLimits.activeVouchers, max: voucherLimits.plan === "FREE" ? 1 : 5 })}
              </span>
            </div>
            {voucherLimits.remainingCodes === 0 && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 text-xs">
                <AlertTriangle className="w-3.5 h-3.5" />
                {t("dashboard.vouchers.limitReached")}
              </div>
            )}
          </div>
        </Card>
      )}

      {selectedIds.size > 0 && (
        <Card className="p-3 border-cyan-200 dark:border-cyan-800 bg-cyan-50/50 dark:bg-cyan-950/30">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
              {t("dashboard.vouchers.selectedCount", { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={bulkRevokeMutation.isPending}
                    data-testid="button-bulk-revoke"
                  >
                    <Ban className="w-3.5 h-3.5 mr-1" />
                    {bulkRevokeMutation.isPending ? t("dashboard.vouchers.revoking") : t("dashboard.vouchers.revokeSelected")}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t("dashboard.vouchers.bulkRevokeTitle", { count: selectedIds.size })}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t("dashboard.vouchers.bulkRevokeDescription")}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-bulk-revoke">{t("dashboard.vouchers.cancel")}</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => bulkRevokeMutation.mutate(Array.from(selectedIds))}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-bulk-revoke"
                    >
                      {t("dashboard.vouchers.bulkRevokeSubmit", { count: selectedIds.size })}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} data-testid="button-clear-selection">
                {t("dashboard.vouchers.clearSelection")}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={!!editVoucherId} onOpenChange={(o) => { if (!o) setEditVoucherId(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("dashboard.vouchers.editDialogTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.vouchers.editDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.editLabel")}</Label>
              <Input placeholder={t("dashboard.vouchers.editLabelPlaceholder")} value={editVoucherLabel} onChange={e => setEditVoucherLabel(e.target.value)} data-testid="input-edit-voucher-label" />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.editBudget")}</Label>
              <Input type="number" min="1" value={editVoucherBudget} onChange={e => setEditVoucherBudget(e.target.value)} data-testid="input-edit-voucher-budget" />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.editRedemptions")}</Label>
              <Input type="number" min="1" value={editVoucherMaxRedemptions} onChange={e => setEditVoucherMaxRedemptions(e.target.value)} data-testid="input-edit-voucher-redemptions" />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.editExpiresAt")}</Label>
              <Input type="datetime-local" value={editVoucherExpiry} onChange={e => setEditVoucherExpiry(e.target.value)} data-testid="input-edit-voucher-expiry" />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.allowedProviders")}</Label>
              <div className="flex flex-wrap gap-3">
                {PROVIDERS.map(p => (
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
              {editVoucherMutation.isPending ? t("dashboard.vouchers.savingChanges") : t("dashboard.vouchers.saveChanges")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!extendVoucherId} onOpenChange={(o) => { if (!o) { setExtendVoucherId(null); setExtendDate(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dashboard.vouchers.extendDialogTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.vouchers.extendDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.extendDateLabel")}</Label>
              <Input type="datetime-local" value={extendDate} onChange={e => setExtendDate(e.target.value)} data-testid="input-extend-date" />
            </div>
            <Button className="w-full" onClick={() => extendMutation.mutate()} disabled={!extendDate || extendMutation.isPending} data-testid="button-submit-extend">
              {extendMutation.isPending ? t("dashboard.vouchers.extendingPending") : t("dashboard.vouchers.extendSubmit")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!topUpVoucherId} onOpenChange={(o) => { if (!o) { setTopUpVoucherId(null); setTopUpAmount("5"); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("dashboard.vouchers.topUpDialogTitle")}</DialogTitle>
            <DialogDescription>{t("dashboard.vouchers.topUpDialogDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("dashboard.vouchers.topUpAmountLabel")}</Label>
              <Input type="number" min="1" value={topUpAmount} onChange={e => setTopUpAmount(e.target.value)} data-testid="input-topup-amount" />
            </div>
            <Button className="w-full" onClick={() => topUpMutation.mutate()} disabled={!topUpAmount || parseFloat(topUpAmount) <= 0 || topUpMutation.isPending} data-testid="button-submit-topup">
              {topUpMutation.isPending ? t("dashboard.vouchers.topUpPending") : t("dashboard.vouchers.topUpSubmit", { amount: topUpAmount })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {vouchers && vouchers.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground">{t("dashboard.vouchers.filterLabel")}</span>
          <Select value={listFilter} onValueChange={(val) => { setListFilter(val); setSelectedIds(new Set()); }}>
            <SelectTrigger className="w-[160px] h-9" data-testid="select-voucher-list-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("dashboard.vouchers.filterAllVouchers", { count: vouchers.length })}</SelectItem>
              <SelectItem value="ACTIVE">{t("dashboard.vouchers.filterActive", { count: vouchers.filter((v: any) => v.status === "ACTIVE").length })}</SelectItem>
              <SelectItem value="FULLY_REDEEMED">{t("dashboard.vouchers.filterRedeemed", { count: vouchers.filter((v: any) => v.status === "FULLY_REDEEMED").length })}</SelectItem>
              <SelectItem value="EXPIRED">{t("dashboard.vouchers.filterExpired", { count: vouchers.filter((v: any) => v.status === "EXPIRED").length })}</SelectItem>
              <SelectItem value="REVOKED">{t("dashboard.vouchers.filterRevoked", { count: vouchers.filter((v: any) => v.status === "REVOKED").length })}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="grid sm:grid-cols-2 gap-4">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-40" />)}</div>
      ) : filteredVouchers && filteredVouchers.length > 0 ? (
        <div className="space-y-2">
          {revokableVouchers.length > 0 && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={allRevokableSelected}
                onCheckedChange={toggleSelectAll}
                data-testid="checkbox-select-all-vouchers"
              />
              <span className="text-xs text-muted-foreground">{t("dashboard.vouchers.selectAll")}</span>
            </div>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            {filteredVouchers.map((v: any) => (
              <div key={v.id} className="relative">
                <div className="flex items-start gap-2">
                  {canRevoke(v) && (
                    <div className="pt-4 pl-1">
                      <Checkbox
                        checked={selectedIds.has(v.id)}
                        onCheckedChange={() => toggleSelect(v.id)}
                        data-testid={`checkbox-voucher-${v.id}`}
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <VoucherCard
                      code={v.code}
                      status={v.status}
                      budgetCents={v.budgetCents}
                      label={v.label}
                      expiresAt={v.expiresAt}
                      redemptions={v.currentRedemptions}
                      maxRedemptions={v.maxRedemptions}
                      actions={(
                        <div className="flex items-center gap-1 flex-wrap">
                          {canExtendOrTopUp(v) && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-cyan-600 hover:text-cyan-700 dark:text-cyan-400"
                                onClick={() => {
                                  setExtendVoucherId(v.id);
                                  const current = new Date(v.expiresAt);
                                  current.setDate(current.getDate() + 7);
                                  setExtendDate(current.toISOString().slice(0, 16));
                                }}
                                data-testid={`button-extend-voucher-${v.id}`}
                              >
                                <Clock className="w-3.5 h-3.5 mr-1" />
                                {t("dashboard.vouchers.extendAction")}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
                                onClick={() => setTopUpVoucherId(v.id)}
                                data-testid={`button-topup-voucher-${v.id}`}
                              >
                                <DollarSign className="w-3.5 h-3.5 mr-1" />
                                {t("dashboard.vouchers.topUpAction")}
                              </Button>
                            </>
                          )}
                          {v.status === "ACTIVE" && v.currentRedemptions === 0 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => openEditVoucher(v)}
                              data-testid={`button-edit-voucher-${v.id}`}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              {t("dashboard.vouchers.editAction")}
                            </Button>
                          )}
                          {canRevoke(v) && (
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
                                  {t("dashboard.vouchers.revokeAction")}
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("dashboard.vouchers.revokeDialogTitle")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {v.currentRedemptions > 0
                                      ? t("dashboard.vouchers.revokeDescriptionRedeemed", { code: v.code, count: v.currentRedemptions })
                                      : t("dashboard.vouchers.revokeDescriptionUnredeemed", { code: v.code })
                                    }
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel data-testid="button-cancel-revoke-voucher">{t("dashboard.vouchers.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => revokeMutation.mutate(v.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    data-testid="button-confirm-revoke-voucher"
                                  >
                                    {t("dashboard.vouchers.revokeSubmit")}
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
                                {t("dashboard.vouchers.deleteAction")}
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("dashboard.vouchers.deleteDialogTitle")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {v.currentRedemptions > 0
                                    ? t("dashboard.vouchers.deleteDescriptionRedeemed", { count: v.currentRedemptions })
                                    : t("dashboard.vouchers.deleteDescriptionUnredeemed", { code: v.code })
                                  }
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel data-testid="button-cancel-delete-voucher">{t("dashboard.vouchers.cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteVoucherMutation.mutate(v.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  data-testid="button-confirm-delete-voucher"
                                >
                                  {t("dashboard.vouchers.deleteSubmit")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          {isRedeemed(v) && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => setExpandedVoucherId(expandedVoucherId === v.id ? null : v.id)}
                              data-testid={`button-details-voucher-${v.id}`}
                            >
                              {expandedVoucherId === v.id ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                              {t("dashboard.vouchers.detailsAction")}
                            </Button>
                          )}
                        </div>
                      )}
                    />
                    {expandedVoucherId === v.id && <VoucherDetailsPanel voucherId={v.id} />}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : vouchers && vouchers.length > 0 && filteredVouchers?.length === 0 ? (
        <EmptyState
          icon={<Ticket className="w-10 h-10 text-muted-foreground" />}
          title={t("dashboard.vouchers.emptyFilterTitle")}
          description={t("dashboard.vouchers.emptyFilterDescription", { status: listFilter === "FULLY_REDEEMED" ? "redeemed" : listFilter.toLowerCase() })}
        />
      ) : (
        <EmptyState
          icon={<Ticket className="w-10 h-10 text-muted-foreground" />}
          title={t("dashboard.vouchers.emptyTitle")}
          description={t("dashboard.vouchers.emptyDescription")}
          action={{ label: t("dashboard.vouchers.emptyAction"), onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}

function VoucherDetailsPanel({ voucherId }: { voucherId: string }) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/vouchers", voucherId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/vouchers/${voucherId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load details");
      return res.json();
    },
  });

  if (isLoading) return <div className="p-3 mt-1"><Skeleton className="h-20" /></div>;
  if (!data?.details?.length) return <div className="p-3 mt-1 text-xs text-muted-foreground">{t("dashboard.vouchers.detailsNoData")}</div>;

  return (
    <div className="mt-1 rounded-lg border bg-muted/20 p-3 space-y-3" data-testid={`panel-voucher-details-${voucherId}`}>
      {data.details.map((d: any, i: number) => (
        <div key={i} className="space-y-1.5 text-xs">
          {i > 0 && <div className="border-t pt-2" />}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div className="flex items-center gap-1.5">
              <User className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{t("dashboard.vouchers.detailsRedeemedBy")}</span>
              <span className="font-medium" data-testid={`text-redeemed-by-${i}`}>{d.redeemedBy}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{t("dashboard.vouchers.detailsAt")}</span>
              <span data-testid={`text-redeemed-at-${i}`}>{new Date(d.redeemedAt).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Key className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{t("dashboard.vouchers.detailsKey")}</span>
              <code className="text-xs font-mono" data-testid={`text-key-prefix-${i}`}>{d.keyPrefix || "—"}...</code>
            </div>
            <div className="flex items-center gap-1.5">
              <DollarSign className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{t("dashboard.vouchers.detailsSpent")}</span>
              <span data-testid={`text-current-spend-${i}`}>${(d.currentSpendCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{t("dashboard.vouchers.detailsRequests")}</span>
              <span data-testid={`text-requests-made-${i}`}>{d.requestsMade}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{t("dashboard.vouchers.detailsLastRequest")}</span>
              <span data-testid={`text-last-request-${i}`}>{d.lastRequestAt ? new Date(d.lastRequestAt).toLocaleString() : t("dashboard.vouchers.detailsNever")}</span>
            </div>
          </div>
          <Badge variant="secondary" className="text-[10px] no-default-hover-elevate no-default-active-elevate" data-testid={`badge-membership-status-${i}`}>
            {d.membershipStatus}
          </Badge>
        </div>
      ))}
    </div>
  );
}
