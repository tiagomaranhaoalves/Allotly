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
  DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Users, Plus, UserMinus, UserCheck,
  AlertTriangle, Trash2, Pencil,
  RefreshCw, ShieldOff, ArrowRightLeft, Shield, Send,
  Activity, RotateCcw, CreditCard, Zap, Key, Bell, ClipboardList,
  FolderOpen, ChevronDown, ChevronUp,
} from "lucide-react";
import { useState } from "react";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  BUDGET_EXHAUSTED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

function TransferDialog({ member, teams, open, onOpenChange }: { member: any; teams: any[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [targetTeamId, setTargetTeamId] = useState("");
  const [newBudgetCents, setNewBudgetCents] = useState(String(member.monthlyBudgetCents));
  const [transferKeyValue, setTransferKeyValue] = useState<string | null>(null);

  const transferMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/members/${member.id}/transfer`, {
        targetTeamId,
        newBudgetCents: parseInt(newBudgetCents),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      if (data.apiKey) {
        setTransferKeyValue(data.apiKey);
      }
      toast({ title: "Member transferred", description: data.message });
    },
    onError: (err: any) => {
      toast({ title: "Transfer failed", description: err.message, variant: "destructive" });
    },
  });

  const availableTeams = teams.filter(t => t.id !== member.teamId);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setTransferKeyValue(null); setTargetTeamId(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{transferKeyValue ? "Transfer Complete — New API Key" : "Transfer Member"}</DialogTitle>
          <DialogDescription>
            {transferKeyValue
              ? "The member's new API key is shown below. Their old key has been revoked."
              : `Move ${member.user?.name || member.user?.email} to a different team.`}
          </DialogDescription>
        </DialogHeader>
        {transferKeyValue ? (
          <div className="space-y-4 pt-2">
            <KeyRevealCard keyValue={transferKeyValue} masked={false} />
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Copy this key and share it securely. It will NOT be shown again.
            </p>
            <Button className="w-full" onClick={() => { onOpenChange(false); setTransferKeyValue(null); }} data-testid="button-done-transfer">
              Done
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Target Team</Label>
              {availableTeams.length > 0 ? (
                <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                  <SelectTrigger data-testid="select-transfer-team">
                    <SelectValue placeholder="Select a team" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTeams.map(t => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm text-muted-foreground">No other teams available.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>New Monthly Budget (cents)</Label>
              <Input type="number" value={newBudgetCents} onChange={e => setNewBudgetCents(e.target.value)} data-testid="input-transfer-budget" />
              <p className="text-xs text-muted-foreground">${(parseInt(newBudgetCents || "0") / 100).toFixed(2)} per month</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                onClick={() => transferMutation.mutate()}
                disabled={!targetTeamId || transferMutation.isPending}
                data-testid="button-confirm-transfer"
              >
                {transferMutation.isPending ? "Transferring..." : "Transfer Member"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangeRoleDialog({ member, open, onOpenChange }: { member: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const currentRole = member.user?.orgRole || "MEMBER";
  const [newRole, setNewRole] = useState(currentRole === "MEMBER" ? "TEAM_ADMIN" : "MEMBER");

  const changeRoleMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/members/${member.id}/change-role`, { newRole });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      onOpenChange(false);
      toast({ title: "Role updated", description: `Changed to ${newRole}` });
    },
    onError: (err: any) => {
      toast({ title: "Role change failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Role</DialogTitle>
          <DialogDescription>
            Change the role of {member.user?.name || member.user?.email}. This only affects permissions — their API key and budget are unchanged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Current Role</Label>
            <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">{currentRole}</Badge>
          </div>
          <div className="space-y-2">
            <Label>New Role</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger data-testid="select-new-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TEAM_ADMIN">Team Admin</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => changeRoleMutation.mutate()}
              disabled={newRole === currentRole || changeRoleMutation.isPending}
              data-testid="button-confirm-change-role"
            >
              {changeRoleMutation.isPending ? "Changing..." : "Change Role"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberActivityPanel({ memberId }: { memberId: string }) {
  const { data, isLoading } = useQuery<{
    budgetEvents: any[];
    keyEvents: any[];
    recentRequests: any[];
    auditEntries: any[];
  }>({
    queryKey: ["/api/members", memberId, "activity"],
    queryFn: async () => {
      const res = await fetch(`/api/members/${memberId}/activity`);
      if (!res.ok) throw new Error("Failed to fetch activity");
      return res.json();
    },
  });

  if (isLoading) {
    return <div className="space-y-2 p-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-8" />)}</div>;
  }

  const { budgetEvents = [], keyEvents = [], recentRequests = [], auditEntries = [] } = data || {};

  return (
    <Tabs defaultValue="requests" className="w-full">
      <TabsList className="w-full grid grid-cols-4 h-8">
        <TabsTrigger value="requests" className="text-xs gap-1" data-testid="tab-requests">
          <Zap className="w-3 h-3" /> Requests ({recentRequests.length})
        </TabsTrigger>
        <TabsTrigger value="budget" className="text-xs gap-1" data-testid="tab-budget">
          <Bell className="w-3 h-3" /> Budget ({budgetEvents.length})
        </TabsTrigger>
        <TabsTrigger value="keys" className="text-xs gap-1" data-testid="tab-keys">
          <Key className="w-3 h-3" /> Keys ({keyEvents.length})
        </TabsTrigger>
        <TabsTrigger value="admin" className="text-xs gap-1" data-testid="tab-admin">
          <ClipboardList className="w-3 h-3" /> Admin ({auditEntries.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="requests" className="mt-2">
        {recentRequests.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No recent API requests</p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {recentRequests.map((r: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30" data-testid={`row-request-${i}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate ${r.statusCode >= 400 ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
                    {r.statusCode || "200"}
                  </Badge>
                  <span className="font-mono">{r.model}</span>
                  <span className="text-muted-foreground">{r.provider}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-muted-foreground">{r.inputTokens || 0}→{r.outputTokens || 0} tok</span>
                  <span className="font-medium">${((r.costCents || 0) / 100).toFixed(4)}</span>
                  <span className="text-muted-foreground">{new Date(r.timestamp).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="budget" className="mt-2">
        {budgetEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No budget alerts triggered</p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {budgetEvents.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30" data-testid={`row-budget-event-${i}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 no-default-hover-elevate no-default-active-elevate">
                    {e.type}
                  </Badge>
                  {e.actionTaken && <span className="text-muted-foreground">{e.actionTaken}</span>}
                </div>
                <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="keys" className="mt-2">
        {keyEvents.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No API key events</p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {keyEvents.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30" data-testid={`row-key-event-${i}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate ${e.type === "revoked" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"}`}>
                    {e.type}
                  </Badge>
                  <span className="font-mono">{e.keyPrefix}...</span>
                </div>
                <div className="flex items-center gap-2">
                  {e.lastUsed && <span className="text-muted-foreground">last used {new Date(e.lastUsed).toLocaleDateString()}</span>}
                  <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="admin" className="mt-2">
        {auditEntries.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">No admin actions recorded</p>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-1">
            {auditEntries.map((e: any, i: number) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-muted/30" data-testid={`row-admin-event-${i}`}>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 no-default-hover-elevate no-default-active-elevate">
                    {e.action}
                  </Badge>
                  <span className="text-muted-foreground">by {e.actorId === "system" ? "System" : e.actorId.slice(0, 8)}</span>
                </div>
                <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleString()}</span>
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

function BudgetResetDialog({ member, open, onOpenChange }: { member: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/members/${member.id}/budget/reset`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      onOpenChange(false);
      toast({ title: "Budget reset", description: `Spend zeroed. New period ends ${new Date(data.newPeriodEnd).toLocaleDateString()}` });
    },
    onError: (err: any) => {
      toast({ title: "Reset failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reset Budget Period?</AlertDialogTitle>
          <AlertDialogDescription>
            This will zero out the current spend for <strong>{member.user?.name || member.user?.email}</strong>,
            start a new billing period, and clear all budget alerts.
            {member.status === "BUDGET_EXHAUSTED" && (
              <span className="block mt-2 text-emerald-600 dark:text-emerald-400 font-medium">
                This member is currently budget-exhausted and will be reactivated.
              </span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
            data-testid="button-confirm-budget-reset"
          >
            {resetMutation.isPending ? "Resetting..." : "Reset Budget"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BudgetCreditDialog({ member, open, onOpenChange }: { member: any; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [amountDollars, setAmountDollars] = useState("");
  const [reason, setReason] = useState("");

  const creditMutation = useMutation({
    mutationFn: async () => {
      const amountCents = Math.round(parseFloat(amountDollars) * 100);
      const res = await apiRequest("POST", `/api/members/${member.id}/budget/credit`, {
        amountCents,
        reason,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      onOpenChange(false);
      setAmountDollars("");
      setReason("");
      toast({
        title: "Credit applied",
        description: `$${(data.amountCents / 100).toFixed(2)} credit applied. Spend: $${(data.previousSpendCents / 100).toFixed(2)} → $${(data.newSpendCents / 100).toFixed(2)}`,
      });
    },
    onError: (err: any) => {
      toast({ title: "Credit failed", description: err.message, variant: "destructive" });
    },
  });

  const amountCents = Math.round(parseFloat(amountDollars || "0") * 100);
  const isValid = amountCents >= 1 && reason.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setAmountDollars(""); setReason(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Budget Credit</DialogTitle>
          <DialogDescription>
            Apply a credit to reduce the current spend for {member.user?.name || member.user?.email}.
            {member.status === "BUDGET_EXHAUSTED" && (
              <span className="block mt-1 text-emerald-600 dark:text-emerald-400 font-medium">
                If the credit brings spend below the budget limit, the member will be reactivated.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Credit Amount ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={amountDollars}
              onChange={e => setAmountDollars(e.target.value)}
              placeholder="5.00"
              data-testid="input-credit-amount"
            />
            {amountDollars && <p className="text-xs text-muted-foreground">{amountCents} cents</p>}
          </div>
          <div className="space-y-2">
            <Label>Reason (required)</Label>
            <Textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Courtesy credit for service disruption"
              rows={2}
              data-testid="input-credit-reason"
            />
          </div>
          <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current spend</span>
              <span className="font-medium">${(member.currentPeriodSpendCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Credit</span>
              <span className="font-medium text-emerald-600">-${(amountCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex justify-between border-t pt-1">
              <span className="text-muted-foreground">New spend</span>
              <span className="font-medium">${(Math.max(0, member.currentPeriodSpendCents - amountCents) / 100).toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              onClick={() => creditMutation.mutate()}
              disabled={!isValid || creditMutation.isPending}
              data-testid="button-confirm-credit"
            >
              {creditMutation.isPending ? "Applying..." : "Apply Credit"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberCard({
  member,
  onRemove,
  isSelected,
  onSelectToggle,
  teams,
  isRootAdmin,
}: {
  member: any;
  onRemove: (id: string) => void;
  isSelected: boolean;
  onSelectToggle: (id: string) => void;
  teams: any[];
  isRootAdmin: boolean;
}) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState(String(member.monthlyBudgetCents));
  const [editName, setEditName] = useState(member.user?.name || "");
  const [editEmail, setEditEmail] = useState(member.user?.email || "");
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const [regenKeyValue, setRegenKeyValue] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [changeRoleOpen, setChangeRoleOpen] = useState(false);
  const [budgetResetOpen, setBudgetResetOpen] = useState(false);
  const [budgetCreditOpen, setBudgetCreditOpen] = useState(false);
  const [showActivity, setShowActivity] = useState(false);

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
      const payload: Record<string, any> = {
        monthlyBudgetCents: parseInt(newBudget),
      };
      if (editName && editName !== member.user?.name) payload.userName = editName;
      if (editEmail && editEmail !== member.user?.email) payload.userEmail = editEmail;
      await apiRequest("PATCH", `/api/members/${member.id}/budget`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      setBudgetOpen(false);
      toast({ title: "Member updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
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

  const resendInviteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/members/${member.id}/resend-invite`);
    },
    onSuccess: () => {
      toast({ title: "Invite re-sent", description: `A new invite email has been sent to ${member.user?.email}` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to resend invite", description: err.message, variant: "destructive" });
    },
  });

  const budgetDisplay = member.accessType === "TEAM"
    ? `$${(member.monthlyBudgetCents / 100).toFixed(2)}/mo`
    : `$${(member.monthlyBudgetCents / 100).toFixed(2)} (fixed)`;

  const isInvited = member.user?.status === "INVITED";

  return (
    <>
      <Card className="overflow-hidden" data-testid={`member-card-${member.id}`}>
        <div
          className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={() => setExpanded(!expanded)}
          data-testid={`button-expand-${member.id}`}
        >
          <div className="flex items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div
                className="flex items-center justify-center shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onSelectToggle(member.id)}
                  data-testid={`checkbox-select-${member.id}`}
                />
              </div>
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
              {isInvited && (
                <Badge variant="outline" className="text-xs no-default-hover-elevate no-default-active-elevate">INVITED</Badge>
              )}
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
                    <Dialog open={budgetOpen} onOpenChange={(o) => { setBudgetOpen(o); if (o) { setNewBudget(String(member.monthlyBudgetCents)); setEditName(member.user?.name || ""); setEditEmail(member.user?.email || ""); } }}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-edit-budget-${member.id}`}>
                          <Pencil className="w-3 h-3 mr-1" />
                          Edit Member
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Member</DialogTitle>
                          <DialogDescription>Update details for {member.user?.name || member.user?.email}.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input value={editName} onChange={e => setEditName(e.target.value)} data-testid="input-edit-member-name" />
                          </div>
                          <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} data-testid="input-edit-member-email" />
                          </div>
                          <div className="space-y-2">
                            <Label>Monthly Budget (cents)</Label>
                            <Input type="number" value={newBudget} onChange={e => setNewBudget(e.target.value)} data-testid="input-edit-budget" />
                            <p className="text-xs text-muted-foreground">${(parseInt(newBudget || "0") / 100).toFixed(2)} per month</p>
                          </div>
                          <Button className="w-full" onClick={() => budgetMutation.mutate()} disabled={budgetMutation.isPending} data-testid="button-save-budget">
                            {budgetMutation.isPending ? "Saving..." : "Save Changes"}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setBudgetResetOpen(true)}
                      data-testid={`button-budget-reset-${member.id}`}
                    >
                      <RotateCcw className="w-3 h-3 mr-1" />
                      Reset Budget
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => setBudgetCreditOpen(true)}
                      data-testid={`button-budget-credit-${member.id}`}
                    >
                      <CreditCard className="w-3 h-3 mr-1" />
                      Add Credit
                    </Button>

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

                {teams.length > 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setTransferOpen(true)}
                    data-testid={`button-transfer-${member.id}`}
                  >
                    <ArrowRightLeft className="w-3 h-3 mr-1" />
                    Transfer
                  </Button>
                )}

                {isRootAdmin && member.user?.orgRole !== "ROOT_ADMIN" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => setChangeRoleOpen(true)}
                    data-testid={`button-change-role-${member.id}`}
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    Change Role
                  </Button>
                )}

                {isInvited && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => resendInviteMutation.mutate()}
                    disabled={resendInviteMutation.isPending}
                    data-testid={`button-resend-invite-${member.id}`}
                  >
                    <Send className="w-3 h-3 mr-1" />
                    {resendInviteMutation.isPending ? "Sending..." : "Resend Invite"}
                  </Button>
                )}
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
                    <AlertDialogTitle>Delete Member</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently remove <strong>{member.user?.name || member.user?.email}</strong> and free their email address for reuse. All API keys, usage data, and budget history will be deleted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-remove">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => { onRemove(member.id); setConfirmRemoveOpen(false); }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-remove"
                    >
                      Delete Member
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="pt-2 border-t">
              <Button
                size="sm"
                variant={showActivity ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowActivity(!showActivity)}
                data-testid={`button-activity-${member.id}`}
              >
                <Activity className="w-3 h-3" />
                {showActivity ? "Hide Activity" : "View Activity"}
              </Button>
            </div>

            {showActivity && (
              <div className="pt-2 border-t">
                <MemberActivityPanel memberId={member.id} />
              </div>
            )}
          </div>
        )}
      </Card>

      <TransferDialog member={member} teams={teams} open={transferOpen} onOpenChange={setTransferOpen} />
      <ChangeRoleDialog member={member} open={changeRoleOpen} onOpenChange={setChangeRoleOpen} />
      <BudgetResetDialog member={member} open={budgetResetOpen} onOpenChange={setBudgetResetOpen} />
      <BudgetCreditDialog member={member} open={budgetCreditOpen} onOpenChange={setBudgetCreditOpen} />
    </>
  );
}

function BulkActionBar({
  selectedIds,
  members,
  onClearSelection,
}: {
  selectedIds: Set<string>;
  members: any[];
  onClearSelection: () => void;
}) {
  const { toast } = useToast();
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkSuspendOpen, setBulkSuspendOpen] = useState(false);
  const [bulkReactivateOpen, setBulkReactivateOpen] = useState(false);

  const selectedMembers = members.filter(m => selectedIds.has(m.id));
  const selectedNames = selectedMembers.map(m => m.user?.name || m.user?.email || "Unknown");

  const bulkSuspendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/members/bulk/suspend", {
        membershipIds: Array.from(selectedIds),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      const suspended = data.results.filter((r: any) => r.status === "suspended").length;
      const errors = data.results.filter((r: any) => r.status === "error").length;
      toast({
        title: `${suspended} member${suspended !== 1 ? "s" : ""} suspended`,
        description: errors > 0 ? `${errors} failed` : undefined,
      });
      onClearSelection();
      setBulkSuspendOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Bulk suspend failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkReactivateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/members/bulk/reactivate", {
        membershipIds: Array.from(selectedIds),
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      const reactivated = data.results.filter((r: any) => r.status === "reactivated").length;
      const errors = data.results.filter((r: any) => r.status === "error").length;
      toast({
        title: `${reactivated} member${reactivated !== 1 ? "s" : ""} reactivated`,
        description: errors > 0 ? `${errors} failed` : undefined,
      });
      onClearSelection();
      setBulkReactivateOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Bulk reactivate failed", description: err.message, variant: "destructive" });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/members/bulk/delete", {
        membershipIds: Array.from(selectedIds),
        confirm: true,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      const deleted = data.results.filter((r: any) => r.status === "deleted").length;
      const errors = data.results.filter((r: any) => r.status === "error").length;
      toast({
        title: `${deleted} member${deleted !== 1 ? "s" : ""} deleted`,
        description: errors > 0 ? `${errors} failed` : undefined,
      });
      onClearSelection();
      setBulkDeleteOpen(false);
    },
    onError: (err: any) => {
      toast({ title: "Bulk delete failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card className="p-3 border-primary/30 bg-primary/5" data-testid="bulk-action-bar">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="no-default-hover-elevate no-default-active-elevate">
            {selectedIds.size} selected
          </Badge>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClearSelection} data-testid="button-clear-selection">
            Clear
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog open={bulkSuspendOpen} onOpenChange={setBulkSuspendOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-bulk-suspend">
                <UserMinus className="w-3 h-3 mr-1" />
                Suspend Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Suspend {selectedIds.size} member{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The following members will be suspended and lose API access:
                  <span className="block mt-2 text-sm font-medium">{selectedNames.join(", ")}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkSuspendMutation.mutate()}
                  disabled={bulkSuspendMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-bulk-suspend"
                >
                  {bulkSuspendMutation.isPending ? "Suspending..." : "Suspend All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={bulkReactivateOpen} onOpenChange={setBulkReactivateOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-bulk-reactivate">
                <UserCheck className="w-3 h-3 mr-1" />
                Reactivate Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reactivate {selectedIds.size} member{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                <AlertDialogDescription>
                  The following members will be reactivated with new API keys:
                  <span className="block mt-2 text-sm font-medium">{selectedNames.join(", ")}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkReactivateMutation.mutate()}
                  disabled={bulkReactivateMutation.isPending}
                  data-testid="button-confirm-bulk-reactivate"
                >
                  {bulkReactivateMutation.isPending ? "Reactivating..." : "Reactivate All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="destructive" className="h-7 text-xs" data-testid="button-bulk-delete">
                <Trash2 className="w-3 h-3 mr-1" />
                Delete Selected
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedIds.size} member{selectedIds.size !== 1 ? "s" : ""}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the following members and free their email addresses. This cannot be undone.
                  <span className="block mt-2 text-sm font-medium">{selectedNames.join(", ")}</span>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => bulkDeleteMutation.mutate()}
                  disabled={bulkDeleteMutation.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-bulk-delete"
                >
                  {bulkDeleteMutation.isPending ? "Deleting..." : "Delete All"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </Card>
  );
}

function ProjectsSection({ teamId }: { teamId: string }) {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const { data: projects, isLoading } = useQuery<any[]>({
    queryKey: ["/api/teams", teamId, "projects"],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${teamId}/projects`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load projects");
      return res.json();
    },
    enabled: !!teamId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/teams/${teamId}/projects`, {
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "projects"] });
      toast({ title: "Project created" });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create project", description: err.message, variant: "destructive" });
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const res = await apiRequest("PATCH", `/api/projects/${id}`, { name });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "projects"] });
      toast({ title: "Project renamed" });
      setEditingId(null);
    },
    onError: (err: any) => {
      toast({ title: "Failed to rename", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams", teamId, "projects"] });
      toast({ title: "Project deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
    },
  });

  const count = projects?.length || 0;

  return (
    <Card className="overflow-hidden" data-testid="card-projects">
      <button
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
        data-testid="button-toggle-projects"
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Projects</span>
          <Badge variant="secondary" className="text-xs">{count}</Badge>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Projects help organize API keys by purpose. Members can assign their keys to these projects for usage tracking.
          </p>

          {isLoading ? (
            <Skeleton className="h-16" />
          ) : projects && projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 p-2.5 rounded-lg bg-muted/50" data-testid={`project-row-${p.id}`}>
                  {editingId === p.id ? (
                    <>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-8 text-sm flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && editName.trim()) renameMutation.mutate({ id: p.id, name: editName.trim() });
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        data-testid={`input-rename-project-${p.id}`}
                      />
                      <Button size="sm" variant="ghost" onClick={() => { if (editName.trim()) renameMutation.mutate({ id: p.id, name: editName.trim() }); }}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <FolderOpen className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="text-sm font-medium flex-1">{p.name}</span>
                      {p.description && <span className="text-xs text-muted-foreground hidden sm:inline">{p.description}</span>}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => { setEditingId(p.id); setEditName(p.name); }}
                        data-testid={`button-rename-project-${p.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => { if (confirm(`Delete project "${p.name}"?`)) deleteMutation.mutate(p.id); }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-project-${p.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">No projects yet</p>
          )}

          {showCreate ? (
            <div className="space-y-2 p-3 rounded-lg border">
              <Input
                placeholder="Project name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={100}
                data-testid="input-new-project-name"
              />
              <Input
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                maxLength={500}
                data-testid="input-new-project-desc"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createMutation.mutate()} disabled={!newName.trim() || createMutation.isPending} data-testid="button-confirm-create-project">
                  {createMutation.isPending ? "Creating..." : "Create"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowCreate(true)} data-testid="button-add-project">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Project
            </Button>
          )}
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
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

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
  const isRootAdmin = user?.orgRole === "ROOT_ADMIN";

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

  const toggleMemberSelection = (id: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (members) {
      setSelectedMemberIds(new Set(members.map(m => m.id)));
    }
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

      {selectedMemberIds.size > 0 && members && user?.orgRole !== "MEMBER" && (
        <BulkActionBar
          selectedIds={selectedMemberIds}
          members={members}
          onClearSelection={() => setSelectedMemberIds(new Set())}
        />
      )}

      {user?.orgRole !== "MEMBER" && (selectedTeam || teams?.[0]?.id) && (
        <ProjectsSection teamId={selectedTeam || teams?.[0]?.id} />
      )}

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : members && members.length > 0 ? (
        <div className="space-y-3" data-testid="members-list">
          {members.length > 1 && user?.orgRole !== "MEMBER" && (
            <div className="flex items-center gap-2 px-1">
              <Checkbox
                checked={selectedMemberIds.size === members.length}
                onCheckedChange={(checked) => {
                  if (checked) selectAll();
                  else setSelectedMemberIds(new Set());
                }}
                data-testid="checkbox-select-all"
              />
              <span className="text-xs text-muted-foreground">Select all</span>
            </div>
          )}
          {members.map(m => (
            <MemberCard
              key={m.id}
              member={m}
              onRemove={(id) => removeMutation.mutate(id)}
              isSelected={selectedMemberIds.has(m.id)}
              onSelectToggle={toggleMemberSelection}
              teams={teams || []}
              isRootAdmin={isRootAdmin}
            />
          ))}
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
