import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { BudgetBar } from "@/components/brand/budget-bar";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, UserMinus, UserCheck, Key, CheckCircle2,
  Clock, AlertTriangle, Trash2, DollarSign, Pencil, Link2,
  Copy, RotateCcw, Ban, BookOpen, Ticket, ArrowLeftRight,
} from "lucide-react";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  BUDGET_EXHAUSTED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

const SETUP_STATUS_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  PENDING: { icon: Clock, color: "text-muted-foreground", label: "Not started" },
  PROVISIONING: { icon: RotateCcw, color: "text-blue-500", label: "Provisioning..." },
  AWAITING_MEMBER: { icon: Clock, color: "text-amber-500", label: "Awaiting setup" },
  COMPLETE: { icon: CheckCircle2, color: "text-emerald-500", label: "Active" },
};

function ProviderLinkRow({
  link,
  membershipId,
}: {
  link: any;
  membershipId: string;
}) {
  const { toast } = useToast();
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const config = SETUP_STATUS_CONFIG[link.setupStatus] || SETUP_STATUS_CONFIG.PENDING;
  const StatusIcon = config.icon;

  const markCompleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/members/${membershipId}/mark-complete/${link.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members", membershipId, "provider-links"] });
      toast({ title: "Marked as complete" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/members/${membershipId}/revoke-key/${link.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members", membershipId, "provider-links"] });
      toast({ title: "Key revoked" });
    },
  });

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/50" data-testid={`provider-link-${link.id}`}>
      <div className="flex items-center gap-3">
        <ProviderBadge provider={link.provider || "UNKNOWN"} />
        <div className="flex items-center gap-1.5">
          <StatusIcon className={`w-3.5 h-3.5 ${config.color}`} />
          <span className={`text-xs ${config.color}`}>{config.label}</span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        {link.setupInstructions && (
          <Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2" data-testid={`button-instructions-${link.id}`}>
                <BookOpen className="w-3.5 h-3.5" />
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Setup Instructions</DialogTitle>
              </DialogHeader>
              <div className="prose prose-sm dark:prose-invert max-h-80 overflow-y-auto whitespace-pre-wrap text-sm">
                {link.setupInstructions}
              </div>
            </DialogContent>
          </Dialog>
        )}
        {link.setupStatus === "AWAITING_MEMBER" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => markCompleteMutation.mutate()}
            disabled={markCompleteMutation.isPending}
            data-testid={`button-mark-complete-${link.id}`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
            Mark Complete
          </Button>
        )}
        {link.setupStatus === "COMPLETE" && link.status !== "REVOKED" && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
            onClick={() => revokeMutation.mutate()}
            disabled={revokeMutation.isPending}
            data-testid={`button-revoke-${link.id}`}
          >
            <Ban className="w-3.5 h-3.5 mr-1" />
            Revoke
          </Button>
        )}
        {link.status === "REVOKED" && (
          <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px]">
            Revoked
          </Badge>
        )}
      </div>
    </div>
  );
}

function MemberCard({ member, providers, onRemove }: { member: any; providers: any[]; onRemove: (id: string) => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState(String(member.monthlyBudgetCents));
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [provisionedKey, setProvisionedKey] = useState<string | null>(null);

  const { data: links } = useQuery<any[]>({
    queryKey: ["/api/members", member.id, "provider-links"],
    queryFn: async () => {
      const res = await fetch(`/api/members/${member.id}/provider-links`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: expanded,
  });

  const suspendMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/members/${member.id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member suspended" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/members/${member.id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member reactivated" });
    },
  });

  const budgetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/members/${member.id}/budget`, {
        monthlyBudgetCents: parseInt(newBudget),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setBudgetOpen(false);
      toast({ title: "Budget updated" });
    },
  });

  const accessModeMutation = useMutation({
    mutationFn: async () => {
      const newMode = member.accessMode === "DIRECT" ? "PROXY" : "DIRECT";
      await apiRequest("PATCH", `/api/members/${member.id}/budget`, { accessMode: newMode });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: `Switched to ${member.accessMode === "DIRECT" ? "Voucher" : "Teams"} mode` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to switch mode", description: err.message, variant: "destructive" });
    },
  });

  const provisionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/members/${member.id}/provision`, {
        providerConnectionId: selectedProvider,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members", member.id, "provider-links"] });
      if (data.provisionedKey) {
        setProvisionedKey(data.provisionedKey);
      } else {
        setProvisionOpen(false);
        toast({ title: "Provider provisioned", description: "Check setup instructions for next steps." });
      }
    },
    onError: (err: any) => {
      toast({ title: "Provisioning failed", description: err.message, variant: "destructive" });
    },
  });

  const linkedProviderIds = links?.map((l: any) => l.providerConnectionId) || [];
  const availableProviders = providers.filter(p => !linkedProviderIds.includes(p.id));

  const completedCount = links?.filter((l: any) => l.setupStatus === "COMPLETE").length || 0;
  const totalLinks = links?.length || 0;

  return (
    <Card className="overflow-hidden" data-testid={`member-card-${member.id}`}>
      <div
        className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
        data-testid={`button-expand-${member.id}`}
      >
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
              {member.user?.name?.[0] || member.user?.email?.[0] || "?"}
            </div>
            <div>
              <p className="font-medium text-sm">{member.user?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground">{member.user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {expanded && totalLinks > 0 && (
              <span className="text-xs text-muted-foreground">
                {completedCount}/{totalLinks} providers
              </span>
            )}
            <FeatureBadge type={member.accessMode === "DIRECT" ? "TEAMS" : "VOUCHERS"} />
            <Badge variant="secondary" className={`${STATUS_STYLES[member.status] || ""} no-default-hover-elevate no-default-active-elevate`}>
              {member.status}
            </Badge>
          </div>
        </div>
        <BudgetBar spent={member.currentPeriodSpendCents} budget={member.monthlyBudgetCents} />
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
          {member.accessMode === "DIRECT" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Provider Access</h4>
                {availableProviders.length > 0 && (
                  <Dialog open={provisionOpen} onOpenChange={(o) => { setProvisionOpen(o); if (!o) { setProvisionedKey(null); setSelectedProvider(""); } }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-provision-${member.id}`}>
                        <Link2 className="w-3.5 h-3.5 mr-1" />
                        Provision Provider
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Provision Provider Access</DialogTitle>
                        <DialogDescription>
                          Set up API key access for {member.user?.name || member.user?.email} on a provider.
                        </DialogDescription>
                      </DialogHeader>
                      {provisionedKey ? (
                        <div className="space-y-4 pt-2">
                          <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                              <span className="font-medium text-sm text-emerald-700 dark:text-emerald-300">Key Provisioned</span>
                            </div>
                            <div className="bg-white dark:bg-gray-900 rounded-md p-3 font-mono text-xs break-all border" data-testid="provisioned-key-value">
                              {provisionedKey}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="mt-2 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(provisionedKey);
                                toast({ title: "Key copied to clipboard" });
                              }}
                              data-testid="button-copy-key"
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" />
                              Copy Key
                            </Button>
                            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              This key is shown only once. Save it securely now.
                            </p>
                          </div>
                          <Button className="w-full" onClick={() => { setProvisionOpen(false); setProvisionedKey(null); }}>
                            Done
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <Label>Provider</Label>
                            <Select value={selectedProvider} onValueChange={setSelectedProvider}>
                              <SelectTrigger data-testid="select-provider-provision">
                                <SelectValue placeholder="Select a provider" />
                              </SelectTrigger>
                              <SelectContent>
                                {availableProviders.map((p: any) => (
                                  <SelectItem key={p.id} value={p.id}>
                                    <span className="flex items-center gap-2">
                                      <ProviderBadge provider={p.provider} />
                                      {p.displayName && <span className="text-muted-foreground text-xs">({p.displayName})</span>}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            className="w-full"
                            onClick={() => provisionMutation.mutate()}
                            disabled={!selectedProvider || provisionMutation.isPending}
                            data-testid="button-submit-provision"
                          >
                            {provisionMutation.isPending ? "Provisioning..." : "Provision Access"}
                          </Button>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                )}
              </div>
              {links && links.length > 0 ? (
                <div className="space-y-1.5">
                  {links.map((link: any) => (
                    <ProviderLinkRow key={link.id} link={link} membershipId={member.id} />
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-2">No providers provisioned yet. Click "Provision Provider" to set up access.</p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={accessModeMutation.isPending}
                    data-testid={`button-switch-mode-${member.id}`}
                  >
                    <ArrowLeftRight className="w-3 h-3 mr-1" />
                    Switch to {member.accessMode === "DIRECT" ? "Voucher" : "Teams"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Switch Access Mode?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Switch <strong>{member.user?.name || member.user?.email}</strong> from{" "}
                      <strong>{member.accessMode === "DIRECT" ? "Teams" : "Voucher"}</strong> to{" "}
                      <strong>{member.accessMode === "DIRECT" ? "Voucher" : "Teams"}</strong> mode?
                      {member.accessMode === "DIRECT"
                        ? " In Voucher mode, requests route through Allotly for real-time budget enforcement."
                        : " In Teams mode, the member uses scoped provider keys directly. You'll need to provision provider access separately."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => accessModeMutation.mutate()} data-testid={`button-confirm-switch-mode-${member.id}`}>
                      Switch Mode
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-edit-budget-${member.id}`}>
                    <Pencil className="w-3 h-3 mr-1" />
                    Edit Budget
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Monthly Budget</DialogTitle>
                    <DialogDescription>Update the monthly spending limit for {member.user?.name || member.user?.email}.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div className="space-y-2">
                      <Label>Monthly Budget (cents)</Label>
                      <Input type="number" value={newBudget} onChange={e => setNewBudget(e.target.value)} data-testid="input-edit-budget" />
                      <p className="text-xs text-muted-foreground">${(parseInt(newBudget || "0") / 100).toFixed(2)} per month</p>
                    </div>
                    <Button className="w-full" onClick={() => budgetMutation.mutate()} disabled={budgetMutation.isPending} data-testid="button-save-budget">
                      {budgetMutation.isPending ? "Saving..." : "Save Budget"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>

              {member.status === "ACTIVE" ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={suspendMutation.isPending}
                      data-testid={`button-suspend-${member.id}`}
                    >
                      <UserMinus className="w-3 h-3 mr-1" />
                      Suspend
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Suspend Member?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to suspend <strong>{member.user?.name || member.user?.email}</strong>? They will lose access to all AI providers until reactivated.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid="button-cancel-suspend">Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => suspendMutation.mutate()}
                        className="bg-red-600 text-white hover:bg-red-700"
                        data-testid="button-confirm-suspend"
                      >
                        Suspend Member
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : member.status === "SUSPENDED" ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => reactivateMutation.mutate()}
                  disabled={reactivateMutation.isPending}
                  data-testid={`button-reactivate-${member.id}`}
                >
                  <UserCheck className="w-3 h-3 mr-1" />
                  Reactivate
                </Button>
              ) : null}
            </div>

            <AlertDialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" data-testid={`button-remove-${member.id}`}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Remove
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Member</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove <strong>{member.user?.name || member.user?.email}</strong>? Their account and all provider links will be deleted permanently.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { onRemove(member.id); setConfirmRemoveOpen(false); }}
                    className="bg-red-600 text-white hover:bg-red-700"
                    data-testid="button-confirm-remove"
                  >
                    Remove Member
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function MembersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [budgetCents, setBudgetCents] = useState("5000");
  const [accessMode, setAccessMode] = useState("DIRECT");
  const [selectedTeam, setSelectedTeam] = useState("");

  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: members, isLoading } = useQuery<any[]>({ queryKey: ["/api/members"] });
  const { data: providers } = useQuery<any[]>({
    queryKey: ["/api/providers/available"],
    enabled: user?.orgRole !== "MEMBER",
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const teamId = selectedTeam || teams?.[0]?.id;
      await apiRequest("POST", "/api/members", {
        email, name, password, budgetCents: parseInt(budgetCents), accessMode, teamId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member added successfully" });
      setOpen(false);
      setEmail("");
      setName("");
      setPassword("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to add member", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/members/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member removed" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove member", description: err.message, variant: "destructive" });
    },
  });

  const directMembers = members?.filter(m => m.accessMode === "DIRECT") || [];
  const proxyMembers = members?.filter(m => m.accessMode === "PROXY") || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members and their budgets
            {members && members.length > 0 && (
              <span className="ml-1">· {members.length} member{members.length !== 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        {user?.orgRole !== "MEMBER" && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-member">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Team Member</DialogTitle>
                <DialogDescription>Create a new member account with a spending budget.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                {teams && teams.length > 1 && (
                  <div className="space-y-2">
                    <Label>Team</Label>
                    <Select value={selectedTeam || teams[0]?.id || ""} onValueChange={setSelectedTeam}>
                      <SelectTrigger data-testid="select-member-team">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="member@company.com" value={email} onChange={e => setEmail(e.target.value)} data-testid="input-member-email" />
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="John Doe" value={name} onChange={e => setName(e.target.value)} data-testid="input-member-name" />
                </div>
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input type="password" placeholder="Set initial password" value={password} onChange={e => setPassword(e.target.value)} data-testid="input-member-password" />
                </div>
                <div className="space-y-2">
                  <Label>Monthly Budget (cents)</Label>
                  <Input type="number" value={budgetCents} onChange={e => setBudgetCents(e.target.value)} data-testid="input-member-budget" />
                  <p className="text-xs text-muted-foreground">${(parseInt(budgetCents || "0") / 100).toFixed(2)} per month</p>
                </div>
                <div className="space-y-2">
                  <Label>Access Mode</Label>
                  <Select value={accessMode} onValueChange={setAccessMode}>
                    <SelectTrigger data-testid="select-access-mode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="DIRECT">Teams</SelectItem>
                      <SelectItem value="PROXY">Voucher</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!email || createMutation.isPending} data-testid="button-submit-member">
                  {createMutation.isPending ? "Adding..." : "Add Member"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : members && members.length > 0 ? (
        <Tabs defaultValue="all">
          <TabsList data-testid="tabs-members">
            <TabsTrigger value="all" data-testid="tab-all">
              <Users className="w-3.5 h-3.5 mr-1.5" />
              All ({members.length})
            </TabsTrigger>
            <TabsTrigger value="direct" data-testid="tab-direct">
              <Key className="w-3.5 h-3.5 mr-1.5" />
              Teams Members ({directMembers.length})
            </TabsTrigger>
            <TabsTrigger value="proxy" data-testid="tab-proxy">
              <Ticket className="w-3.5 h-3.5 mr-1.5" />
              Voucher Recipients ({proxyMembers.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-3 mt-4">
            {members.map(m => <MemberCard key={m.id} member={m} providers={providers || []} onRemove={(id) => removeMutation.mutate(id)} />)}
          </TabsContent>
          <TabsContent value="direct" className="space-y-3 mt-4">
            {directMembers.length > 0 ? directMembers.map(m => <MemberCard key={m.id} member={m} providers={providers || []} onRemove={(id) => removeMutation.mutate(id)} />) : (
              <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No direct members" description="Add members with direct provider access" />
            )}
          </TabsContent>
          <TabsContent value="proxy" className="space-y-3 mt-4">
            {proxyMembers.length > 0 ? proxyMembers.map(m => <MemberCard key={m.id} member={m} providers={providers || []} onRemove={(id) => removeMutation.mutate(id)} />) : (
              <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No voucher recipients" description="Create vouchers to distribute proxy access" />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState
          icon={<Users className="w-10 h-10 text-muted-foreground" />}
          title="No members yet"
          description="Add team members to start distributing AI access"
          action={user?.orgRole !== "MEMBER" ? { label: "Add Member", onClick: () => setOpen(true) } : undefined}
        />
      )}
    </div>
  );
}
