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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, UserMinus, UserCheck } from "lucide-react";
import { useState } from "react";

export default function MembersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [budgetCents, setBudgetCents] = useState("5000");
  const [accessMode, setAccessMode] = useState("DIRECT");

  const { data: teams } = useQuery<any[]>({ queryKey: ["/api/teams"] });
  const { data: members, isLoading } = useQuery<any[]>({ queryKey: ["/api/members"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const teamId = teams?.[0]?.id;
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

  const suspendMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/members/${id}/suspend`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member suspended" });
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("PATCH", `/api/members/${id}/reactivate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/members"] });
      toast({ title: "Member reactivated" });
    },
  });

  const directMembers = members?.filter(m => m.accessMode === "DIRECT") || [];
  const proxyMembers = members?.filter(m => m.accessMode === "PROXY") || [];

  const STATUS_STYLES: Record<string, string> = {
    ACTIVE: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    SUSPENDED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
    BUDGET_EXHAUSTED: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    EXPIRED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  };

  function MemberRow({ member }: { member: any }) {
    return (
      <Card className="p-4" data-testid={`member-card-${member.id}`}>
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
            <FeatureBadge type={member.accessMode === "DIRECT" ? "TEAMS" : "VOUCHERS"} />
            <Badge variant="secondary" className={`${STATUS_STYLES[member.status] || ""} no-default-hover-elevate no-default-active-elevate`}>
              {member.status}
            </Badge>
          </div>
        </div>
        <BudgetBar spent={member.currentPeriodSpendCents} budget={member.monthlyBudgetCents} />
        <div className="flex items-center justify-end gap-2 mt-3">
          {member.status === "ACTIVE" ? (
            <Button size="sm" variant="secondary" onClick={() => suspendMutation.mutate(member.id)} data-testid={`button-suspend-${member.id}`}>
              <UserMinus className="w-3.5 h-3.5 mr-1" />
              Suspend
            </Button>
          ) : member.status === "SUSPENDED" ? (
            <Button size="sm" variant="secondary" onClick={() => reactivateMutation.mutate(member.id)} data-testid={`button-reactivate-${member.id}`}>
              <UserCheck className="w-3.5 h-3.5 mr-1" />
              Reactivate
            </Button>
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Members</h1>
          <p className="text-muted-foreground mt-1">Manage team members and their budgets</p>
        </div>
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
            </DialogHeader>
            <div className="space-y-4 pt-2">
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
                    <SelectItem value="DIRECT">Direct (Teams)</SelectItem>
                    <SelectItem value="PROXY">Proxy (Vouchers)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!email || createMutation.isPending} data-testid="button-submit-member">
                {createMutation.isPending ? "Adding..." : "Add Member"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : members && members.length > 0 ? (
        <Tabs defaultValue="all">
          <TabsList data-testid="tabs-members">
            <TabsTrigger value="all" data-testid="tab-all">All ({members.length})</TabsTrigger>
            <TabsTrigger value="direct" data-testid="tab-direct">Direct ({directMembers.length})</TabsTrigger>
            <TabsTrigger value="proxy" data-testid="tab-proxy">Voucher ({proxyMembers.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="space-y-3 mt-4">
            {members.map(m => <MemberRow key={m.id} member={m} />)}
          </TabsContent>
          <TabsContent value="direct" className="space-y-3 mt-4">
            {directMembers.length > 0 ? directMembers.map(m => <MemberRow key={m.id} member={m} />) : (
              <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No direct members" description="Add members with direct provider access" />
            )}
          </TabsContent>
          <TabsContent value="proxy" className="space-y-3 mt-4">
            {proxyMembers.length > 0 ? proxyMembers.map(m => <MemberRow key={m.id} member={m} />) : (
              <EmptyState icon={<Users className="w-8 h-8 text-muted-foreground" />} title="No voucher recipients" description="Create vouchers to distribute proxy access" />
            )}
          </TabsContent>
        </Tabs>
      ) : (
        <EmptyState
          icon={<Users className="w-10 h-10 text-muted-foreground" />}
          title="No members yet"
          description="Add team members to start distributing AI access"
          action={{ label: "Add Member", onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}
