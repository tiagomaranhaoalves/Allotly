import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { BudgetBar } from "@/components/brand/budget-bar";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { EmptyState } from "@/components/brand/empty-state";
import { KeyRevealCard } from "@/components/brand/key-reveal-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Plus, UserMinus, UserCheck,
  AlertTriangle, Trash2, Pencil,
  RefreshCw, ShieldOff,
} from "lucide-react";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  BUDGET_EXHAUSTED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function MemberCard({ member, onRemove }: { member: any; onRemove: (id: string) => void }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState(String(member.monthlyBudgetCents));
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [regenKeyValue, setRegenKeyValue] = useState<string | null>(null);

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

  const regenerateKeyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/members/${member.id}/regenerate-key`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setRegenKeyValue(data.apiKey);
      toast({ title: "API key regenerated", description: "Make sure to copy the API key — it won't be shown again." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to regenerate key", description: err.message, variant: "destructive" });
    },
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/members/${member.id}/revoke-key`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "API key revoked" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to revoke key", description: err.message, variant: "destructive" });
    },
  });

  const budgetDisplay = member.accessType === "TEAM"
    ? `$${(member.monthlyBudgetCents / 100).toFixed(2)}/mo`
    : `$${(member.monthlyBudgetCents / 100).toFixed(2)} (fixed)`;

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
              <p className="font-medium text-sm" data-testid={`text-member-name-${member.id}`}>{member.user?.name || "Unknown"}</p>
              <p className="text-xs text-muted-foreground" data-testid={`text-member-email-${member.id}`}>{member.user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <FeatureBadge type={member.accessType === "TEAM" ? "TEAMS" : "VOUCHERS"} />
            <Badge variant="secondary" className={`${STATUS_STYLES[member.status] || ""} no-default-hover-elevate no-default-active-elevate`} data-testid={`badge-status-${member.id}`}>
              {member.status}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-medium text-muted-foreground" data-testid={`text-budget-display-${member.id}`}>
            {budgetDisplay}
            {member.accessType === "TEAM" && member.periodEnd && (
              <span className="ml-1">· resets {new Date(member.periodEnd).toLocaleDateString()}</span>
            )}
            {member.accessType === "VOUCHER" && member.voucherExpiresAt && (
              <span className="ml-1">· expires {new Date(member.voucherExpiresAt).toLocaleDateString()}</span>
            )}
          </span>
        </div>
        <BudgetBar spent={member.currentPeriodSpendCents} budget={member.monthlyBudgetCents} />
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
          {regenKeyValue && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">New API Key</h4>
              <KeyRevealCard keyValue={regenKeyValue} masked={false} />
              <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                Copy this key now. It will not be shown again.
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t">
            <div className="flex items-center gap-2 flex-wrap">
              {member.accessType === "TEAM" && (
                <>
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

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={regenerateKeyMutation.isPending}
                        data-testid={`button-regenerate-key-${member.id}`}
                      >
                        <RefreshCw className="w-3 h-3 mr-1" />
                        Regenerate Key
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will revoke the current key and generate a new one for <strong>{member.user?.name || member.user?.email}</strong>.
                          The old key will immediately stop working.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => regenerateKeyMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-regenerate">
                          Regenerate Key
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-amber-600 hover:text-amber-700"
                    disabled={revokeKeyMutation.isPending}
                    data-testid={`button-revoke-key-${member.id}`}
                  >
                    <ShieldOff className="w-3 h-3 mr-1" />
                    Revoke Key
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will revoke all active API keys for <strong>{member.user?.name || member.user?.email}</strong>.
                      They will not be able to make any API requests until a new key is generated.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => revokeKeyMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-revoke">
                      Revoke Key
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

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
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
                    Are you sure you want to remove <strong>{member.user?.name || member.user?.email}</strong>? Their account and API keys will be deleted permanently.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { onRemove(member.id); setConfirmRemoveOpen(false); }}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
  const [budgetCents, setBudgetCents] = useState("5000");
  const [accessType, setAccessType] = useState("TEAM");
  const [selectedTeam, setSelectedTeam] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("team") || "";
  });
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [newMemberKey, setNewMemberKey] = useState<string | null>(null);

  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: members, isLoading } = useQuery<any[]>({ queryKey: ["/api/members"] });
  const { data: providers } = useQuery<any[]>({
    queryKey: ["/api/providers/available"],
    enabled: user?.orgRole !== "MEMBER",
  });
  const { data: providerConnections } = useQuery<any[]>({
    queryKey: ["/api/providers"],
    enabled: user?.orgRole === "ROOT_ADMIN",
  });

  const connectedProviders = providers || [];
  const hasProviders = connectedProviders.length > 0;

  const orgAllowedModels: { modelId: string; provider: string }[] = [];
  if (providerConnections) {
    for (const conn of providerConnections) {
      const models = (conn.orgAllowedModels as any[]) || [];
      for (const m of models) {
        if (m.enabled !== false) {
          orgAllowedModels.push({ modelId: m.modelId || m.id, provider: conn.provider });
        }
      }
    }
  }

  const filteredModels = orgAllowedModels.filter(
    m => selectedProviders.length === 0 || selectedProviders.includes(m.provider)
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const teamId = selectedTeam || teams?.[0]?.id;
      const res = await apiRequest("POST", "/api/members", {
        email,
        name,
        budgetCents: parseInt(budgetCents),
        accessType,
        teamId,
        allowedProviders: selectedProviders.length > 0 ? selectedProviders : null,
        allowedModels: selectedModels.length > 0 ? selectedModels : null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      if (data.apiKey) {
        setNewMemberKey(data.apiKey);
        toast({ title: "Member created", description: "Make sure to copy the API key — it won't be shown again." });
      } else {
        toast({ title: "Member created" });
        setOpen(false);
      }
      setEmail("");
      setName("");
      setSelectedProviders([]);
      setSelectedModels([]);
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

  const toggleProvider = (provider: string) => {
    setSelectedProviders(prev =>
      prev.includes(provider) ? prev.filter(p => p !== provider) : [...prev, provider]
    );
    setSelectedModels([]);
  };

  const toggleModel = (modelId: string) => {
    setSelectedModels(prev =>
      prev.includes(modelId) ? prev.filter(m => m !== modelId) : [...prev, modelId]
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-members-heading">Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage team members and their budgets
            {members && members.length > 0 && (
              <span className="ml-1">· {members.length} member{members.length !== 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        {user?.orgRole !== "MEMBER" && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setNewMemberKey(null); } }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-member" disabled={!hasProviders}>
                <Plus className="w-4 h-4 mr-1.5" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{newMemberKey ? "Member Created — API Key" : "Add Team Member"}</DialogTitle>
                <DialogDescription>
                  {newMemberKey
                    ? "The member's API key is shown below. This is the only time it will be displayed."
                    : "Create a new member account with a spending budget. They'll receive an invite email."}
                </DialogDescription>
              </DialogHeader>
              {newMemberKey ? (
                <div className="space-y-4 pt-2">
                  <KeyRevealCard keyValue={newMemberKey} masked={false} />
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium" data-testid="text-new-key-warning">
                    Copy this key and share it securely with the member. It will NOT be shown again.
                  </p>
                  <Button
                    className="w-full"
                    onClick={() => { setOpen(false); setNewMemberKey(null); }}
                    data-testid="button-done-member"
                  >
                    Done
                  </Button>
                </div>
              ) : (
                <div className="space-y-4 pt-2 max-h-[60vh] overflow-y-auto">
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
                    <Label>Monthly Budget (cents)</Label>
                    <Input type="number" value={budgetCents} onChange={e => setBudgetCents(e.target.value)} data-testid="input-member-budget" />
                    <p className="text-xs text-muted-foreground">${(parseInt(budgetCents || "0") / 100).toFixed(2)} per month</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Access Type</Label>
                    <Select value={accessType} onValueChange={setAccessType}>
                      <SelectTrigger data-testid="select-access-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TEAM">Team (monthly reset)</SelectItem>
                        <SelectItem value="VOUCHER">Voucher (fixed budget)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {connectedProviders.length > 0 && (
                    <div className="space-y-2">
                      <Label>Allowed Providers</Label>
                      <div className="space-y-1.5">
                        {connectedProviders.map(p => (
                          <label key={p.provider} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedProviders.includes(p.provider)}
                              onCheckedChange={() => toggleProvider(p.provider)}
                              data-testid={`checkbox-provider-${p.provider.toLowerCase()}`}
                            />
                            {p.displayName || p.provider}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Leave unchecked to allow all connected providers.</p>
                    </div>
                  )}

                  {filteredModels.length > 0 && (
                    <div className="space-y-2">
                      <Label>Allowed Models</Label>
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {filteredModels.map(m => (
                          <label key={m.modelId} className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={selectedModels.includes(m.modelId)}
                              onCheckedChange={() => toggleModel(m.modelId)}
                              data-testid={`checkbox-model-${m.modelId}`}
                            />
                            <span className="font-mono text-xs">{m.modelId}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">{m.provider}</Badge>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">Leave unchecked to allow all org-enabled models.</p>
                    </div>
                  )}

                  <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!email || createMutation.isPending} data-testid="button-submit-member">
                    {createMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      {!hasProviders && user?.orgRole !== "MEMBER" && (
        <Card className="p-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20" data-testid="warning-no-providers">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">No AI providers connected</p>
              <p className="text-xs text-amber-600 dark:text-amber-400">Connect at least one provider before adding members. Go to Settings → AI Providers.</p>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : members && members.length > 0 ? (
        <div className="space-y-3" data-testid="members-list">
          {members.map(m => <MemberCard key={m.id} member={m} onRemove={(id) => removeMutation.mutate(id)} />)}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="w-10 h-10 text-muted-foreground" />}
          title="Add your first team member"
          description={hasProviders ? "Add team members to start distributing AI access" : "Connect a provider first, then add members"}
          action={user?.orgRole !== "MEMBER" && hasProviders ? { label: "Add Member", onClick: () => setOpen(true) } : undefined}
        />
      )}
    </div>
  );
}
