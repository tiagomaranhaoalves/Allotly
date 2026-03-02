import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Shield, DollarSign, Trash2, User, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

function TeamCard({ team, onDelete }: { team: any; onDelete: (id: string) => void }) {
  const [, navigate] = useLocation();
  const { data: stats } = useQuery<any>({
    queryKey: ["/api/teams", team.id, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${team.id}/stats`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);

  const budgetUsedPct = stats?.totalBudgetCents
    ? Math.min(100, Math.round((stats.totalSpendCents / stats.totalBudgetCents) * 100))
    : 0;

  return (
    <Card className="p-5 hover:shadow-md transition-shadow" data-testid={`team-card-${team.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2.5 rounded-lg bg-primary/10 shrink-0">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base truncate">{team.name}</h3>
            {stats?.adminName && (
              <div className="flex items-center gap-1.5 mt-1">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground truncate">
                  Admin: {stats.adminName}
                  {stats.adminEmail && <span className="opacity-60"> ({stats.adminEmail})</span>}
                </span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Created {new Date(team.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid={`member-count-${team.id}`}>
                {stats?.memberCount ?? "–"}
              </span>
              <span className="text-xs text-muted-foreground">members</span>
            </div>
            {stats && stats.totalBudgetCents > 0 && (
              <div className="flex items-center gap-1.5 justify-end mt-1">
                <DollarSign className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-sm font-medium" data-testid={`team-spend-${team.id}`}>
                  ${(stats.totalSpendCents / 100).toFixed(2)}
                </span>
                <span className="text-xs text-muted-foreground">
                  / ${(stats.totalBudgetCents / 100).toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate("/dashboard/members")}
              data-testid={`button-view-members-${team.id}`}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-destructive"
                  data-testid={`button-delete-team-${team.id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove Team</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to remove <strong>{team.name}</strong>? All member access will be suspended. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { onDelete(team.id); setConfirmOpen(false); }}
                    className="bg-red-600 text-white hover:bg-red-700"
                    data-testid="button-confirm-delete"
                  >
                    Remove Team
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {stats && stats.totalBudgetCents > 0 && (
        <div className="mt-4">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${budgetUsedPct}%`,
                backgroundColor: budgetUsedPct >= 90 ? "#EF4444" : budgetUsedPct >= 75 ? "#F59E0B" : "#10B981",
              }}
            />
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">{budgetUsedPct}% of total team budget used</p>
        </div>
      )}
    </Card>
  );
}

export default function TeamsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const { data: teams, isLoading } = useQuery<any[]>({ queryKey: ["/api/teams"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/teams", { teamName, adminEmail, adminName, adminPassword });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team created successfully" });
      setOpen(false);
      setTeamName("");
      setAdminEmail("");
      setAdminName("");
      setAdminPassword("");
    },
    onError: (err: any) => {
      toast({ title: "Failed to create team", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/teams/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: "Team removed successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to remove team", description: err.message, variant: "destructive" });
    },
  });

  if (user?.orgRole !== "ROOT_ADMIN") {
    return (
      <EmptyState
        icon={<Shield className="w-8 h-8 text-muted-foreground" />}
        title="Access Restricted"
        description="Only Root Admins can manage teams"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground mt-1">
            Manage your organization's teams
            {teams && teams.length > 0 && (
              <span className="ml-1">· {teams.length} team{teams.length !== 1 ? "s" : ""}</span>
            )}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-team">
              <Plus className="w-4 h-4 mr-1.5" />
              Create Team
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Team</DialogTitle>
              <DialogDescription>A new team admin account will be created with the credentials you provide.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div className="space-y-2">
                <Label>Team Name</Label>
                <Input placeholder="Engineering" value={teamName} onChange={e => setTeamName(e.target.value)} data-testid="input-team-name" />
              </div>
              <div className="space-y-2">
                <Label>Team Admin Email</Label>
                <Input type="email" placeholder="admin@company.com" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} data-testid="input-admin-email" />
              </div>
              <div className="space-y-2">
                <Label>Team Admin Name</Label>
                <Input placeholder="Jane Smith" value={adminName} onChange={e => setAdminName(e.target.value)} data-testid="input-admin-name" />
              </div>
              <div className="space-y-2">
                <Label>Password</Label>
                <Input type="password" placeholder="Set initial password" value={adminPassword} onChange={e => setAdminPassword(e.target.value)} data-testid="input-admin-password" />
              </div>
              <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!teamName || !adminEmail || createMutation.isPending} data-testid="button-submit-team">
                {createMutation.isPending ? "Creating..." : "Create Team"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : teams && teams.length > 0 ? (
        <div className="space-y-4">
          {teams.map((team: any) => (
            <TeamCard key={team.id} team={team} onDelete={(id) => deleteMutation.mutate(id)} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="w-10 h-10 text-muted-foreground" />}
          title="No teams yet"
          description="Create your first team to start managing members and budgets"
          action={{ label: "Create Team", onClick: () => setOpen(true) }}
        />
      )}
    </div>
  );
}
