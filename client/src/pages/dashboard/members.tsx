import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { BudgetBar } from "@/components/brand/budget-bar";
import { FeatureBadge } from "@/components/brand/feature-badge";
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
  Clock, AlertTriangle, Trash2, DollarSign, Pencil,
  Copy, Ticket, ArrowLeftRight, ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  BUDGET_EXHAUSTED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};


function MemberCard({ member, providers, onRemove }: { member: any; providers: any[]; onRemove: (id: string) => void }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [expanded, setExpanded] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [newBudget, setNewBudget] = useState(String(member.monthlyBudgetCents));
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);

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

  const accessTypeMutation = useMutation({
    mutationFn: async () => {
      const newType = member.accessType === "TEAM" ? "VOUCHER" : "TEAM";
      await apiRequest("PATCH", `/api/members/${member.id}/budget`, { accessType: newType });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: `Switched to ${member.accessType === "TEAM" ? "Voucher" : "Teams"} mode` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to switch mode", description: err.message, variant: "destructive" });
    },
  });

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
            <FeatureBadge type={member.accessType === "TEAM" ? "TEAMS" : "VOUCHERS"} />
            <Badge variant="secondary" className={`${STATUS_STYLES[member.status] || ""} no-default-hover-elevate no-default-active-elevate`}>
              {member.status}
            </Badge>
          </div>
        </div>
        <BudgetBar spent={member.currentPeriodSpendCents} budget={member.monthlyBudgetCents} />
      </div>

      {expanded && (
        <div className="border-t px-4 py-3 space-y-3 bg-muted/20">
          {member.accessType === "VOUCHER" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Voucher Access</h4>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => navigate("/dashboard/vouchers")}
                  data-testid={`button-go-vouchers-${member.id}`}
                >
                  <Ticket className="w-3.5 h-3.5 mr-1" />
                  Manage Vouchers
                </Button>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p>This member uses <strong className="text-foreground">Voucher mode</strong> — requests route through Allotly's proxy for real-time budget enforcement.</p>
                <p className="mt-1.5">Create a voucher code and share it with the member so they can access AI providers.</p>
              </div>
            </div>
          )}
          {member.accessType === "TEAM" && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Team Access</h4>
              </div>
              <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
                <p>This member uses <strong className="text-foreground">Team mode</strong> with a monthly resetting budget. All requests route through Allotly's proxy using their <code>allotly_sk_</code> key.</p>
              </div>
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
                    disabled={accessTypeMutation.isPending}
                    data-testid={`button-switch-mode-${member.id}`}
                  >
                    <ArrowLeftRight className="w-3 h-3 mr-1" />
                    Switch to {member.accessType === "TEAM" ? "Voucher" : "Teams"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Switch Access Type?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Switch <strong>{member.user?.name || member.user?.email}</strong> from{" "}
                      <strong>{member.accessType === "TEAM" ? "Teams" : "Voucher"}</strong> to{" "}
                      <strong>{member.accessType === "TEAM" ? "Voucher" : "Teams"}</strong> mode?
                      {member.accessType === "TEAM"
                        ? " In Voucher mode, the member has a fixed budget with an expiry date."
                        : " In Teams mode, the member has a monthly resetting budget."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => accessTypeMutation.mutate()} data-testid={`button-confirm-switch-mode-${member.id}`}>
                      Switch Type
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
                        className="bg-destructive text-destructive-foreground"
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
                    className="bg-destructive text-destructive-foreground"
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
  const [, navigate] = useLocation();
  const [open, setOpen] = useState(false);
  const [showVoucherPrompt, setShowVoucherPrompt] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [budgetCents, setBudgetCents] = useState("5000");
  const [accessType, setAccessType] = useState("TEAM");
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
        email, name, budgetCents: parseInt(budgetCents), accessType, teamId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      if (accessType === "VOUCHER") {
        setShowVoucherPrompt(true);
      } else {
        toast({ title: "Member added successfully" });
        setOpen(false);
      }
      setEmail("");
      setName("");
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

  const teamTypeMembers = members?.filter(m => m.accessType === "TEAM") || [];
  const voucherTypeMembers = members?.filter(m => m.accessType === "VOUCHER") || [];

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
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setShowVoucherPrompt(false); }}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-member">
                <Plus className="w-4 h-4 mr-1.5" />
                Add Member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{showVoucherPrompt ? "Member Created!" : "Add Team Member"}</DialogTitle>
                <DialogDescription>
                  {showVoucherPrompt
                    ? "The member has been created in Voucher mode. Create a voucher code to give them access."
                    : "Create a new member account with a spending budget. They'll receive an invite email to set their password."}
                </DialogDescription>
              </DialogHeader>
              {showVoucherPrompt ? (
                <div className="space-y-4 pt-2">
                  <div className="p-4 rounded-lg bg-muted/50 text-sm">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="font-medium">Member added in Voucher mode</span>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      To give them AI access, create a voucher code on the Vouchers page and share it with them.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      setShowVoucherPrompt(false);
                      navigate("/dashboard/vouchers");
                    }}
                    data-testid="button-go-to-vouchers"
                  >
                    <Ticket className="w-4 h-4 mr-1.5" />
                    Go to Vouchers
                  </Button>
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => {
                      setOpen(false);
                      setShowVoucherPrompt(false);
                      toast({ title: "Member added successfully" });
                    }}
                    data-testid="button-done-member"
                  >
                    Done
                  </Button>
                </div>
              ) : (
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
                        <SelectItem value="TEAM">Teams</SelectItem>
                        <SelectItem value="VOUCHER">Voucher</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!email || createMutation.isPending} data-testid="button-submit-member">
                    {createMutation.isPending ? "Adding..." : "Add Member"}
                  </Button>
                </div>
              )}
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
            <TabsTrigger value="team" data-testid="tab-team">
              <Key className="w-3.5 h-3.5 mr-1.5" />
              Teams Members ({teamTypeMembers.length})
            </TabsTrigger>
            <TabsTrigger value="voucher" data-testid="tab-voucher">
              <Ticket className="w-3.5 h-3.5 mr-1.5" />
              Voucher Recipients ({voucherTypeMembers.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-3 mt-4">
            {members.map(m => <MemberCard key={m.id} member={m} providers={providers || []} onRemove={(id) => removeMutation.mutate(id)} />)}
          </TabsContent>
          <TabsContent value="team" className="space-y-3 mt-4">
            {teamTypeMembers.length > 0 ? teamTypeMembers.map(m => <MemberCard key={m.id} member={m} providers={providers || []} onRemove={(id) => removeMutation.mutate(id)} />) : (
              <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No team members" description="Add members with monthly resetting budgets" />
            )}
          </TabsContent>
          <TabsContent value="voucher" className="space-y-3 mt-4">
            {voucherTypeMembers.length > 0 ? voucherTypeMembers.map(m => <MemberCard key={m.id} member={m} providers={providers || []} onRemove={(id) => removeMutation.mutate(id)} />) : (
              <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No voucher recipients" description="Create vouchers to distribute fixed-budget access" />
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
