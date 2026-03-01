import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Users, Plus, Shield } from "lucide-react";
import { useState } from "react";

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
          <p className="text-muted-foreground mt-1">Manage your organization's teams</p>
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
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-24" />)}</div>
      ) : teams && teams.length > 0 ? (
        <div className="space-y-4">
          {teams.map((team: any) => (
            <Card key={team.id} className="p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{team.name}</h3>
                    <p className="text-xs text-muted-foreground">Created {new Date(team.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </Card>
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
