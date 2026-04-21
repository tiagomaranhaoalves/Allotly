import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { EmptyState } from "@/components/brand/empty-state";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { Users, Plus, Shield, DollarSign, Trash2, User, ChevronRight, CreditCard, Pencil } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";

function TeamCard({ team, onDelete }: { team: any; onDelete: (id: string, confirmName: string) => void }) {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { data: stats } = useQuery<any>({
    queryKey: ["/api/teams", team.id, "stats"],
    queryFn: async () => {
      const res = await fetch(`/api/teams/${team.id}/stats`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDescription, setEditDescription] = useState(team.description || "");

  const editMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/teams/${team.id}`, {
        name: editName,
        description: editDescription || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({ title: t("dashboard.teams.teamUpdatedToast") });
      setEditOpen(false);
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.teams.failedUpdateTeam"), description: err.message, variant: "destructive" });
    },
  });

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
                  {t("dashboard.teams.adminLabel", { name: stats.adminName })}
                  {stats.adminEmail && <span className="opacity-60"> ({stats.adminEmail})</span>}
                </span>
              </div>
            )}
            {team.description && (
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1" data-testid={`text-team-description-${team.id}`}>{team.description}</p>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">{t("dashboard.teams.createdOn", { date: new Date(team.createdAt).toLocaleDateString() })}</p>
          </div>
        </div>

        <div className="flex items-center gap-6 shrink-0">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid={`member-count-${team.id}`}>
                {stats?.memberCount ?? "–"}
              </span>
              <span className="text-xs text-muted-foreground">{t("dashboard.teams.membersLabel")}</span>
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
            <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); if (o) { setEditName(team.name); setEditDescription(team.description || ""); } }}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground hover:text-foreground"
                  data-testid={`button-edit-team-${team.id}`}
                >
                  <Pencil className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t("dashboard.teams.editTeam")}</DialogTitle>
                  <DialogDescription>{t("dashboard.teams.editTeamDesc")}</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <Label>{t("dashboard.teams.teamName")}</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} data-testid="input-edit-team-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("dashboard.teams.description")}</Label>
                    <Textarea placeholder={t("dashboard.teams.descriptionPlaceholder")} value={editDescription} onChange={e => setEditDescription(e.target.value)} data-testid="input-edit-team-description" maxLength={500} rows={3} />
                    <p className="text-xs text-muted-foreground">{t("dashboard.teams.characterCount", { count: editDescription.length })}</p>
                  </div>
                  <Button className="w-full" onClick={() => editMutation.mutate()} disabled={!editName || editMutation.isPending} data-testid="button-save-team-edit">
                    {editMutation.isPending ? t("dashboard.teams.saving") : t("dashboard.teams.saveChanges")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigate(`/dashboard/members?team=${team.id}`)}
              data-testid={`button-view-members-${team.id}`}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <AlertDialog open={confirmOpen} onOpenChange={(o) => { setConfirmOpen(o); if (o) setDeleteConfirmName(""); }}>
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
                  <AlertDialogTitle>{t("dashboard.teams.deleteTeam")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("dashboard.teams.deleteTeamDesc", { name: team.name })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-3">
                  <Label className="text-sm text-muted-foreground mb-2 block">{t("dashboard.teams.typeNameToConfirm", { name: team.name })}</Label>
                  <Input
                    value={deleteConfirmName}
                    onChange={e => setDeleteConfirmName(e.target.value)}
                    placeholder={team.name}
                    data-testid="input-confirm-team-name"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-delete">{t("dashboard.common.cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { onDelete(team.id, deleteConfirmName); setConfirmOpen(false); }}
                    disabled={deleteConfirmName !== team.name}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    data-testid="button-confirm-delete"
                  >
                    {t("dashboard.teams.deleteTeam")}
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
          <p className="text-[11px] text-muted-foreground mt-1">{t("dashboard.teams.budgetUsedPct", { percent: budgetUsedPct })}</p>
        </div>
      )}
    </Card>
  );
}

export default function TeamsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [seatDialogOpen, setSeatDialogOpen] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  const { data: teams, isLoading } = useQuery<any[]>({ queryKey: ["/api/teams"] });

  const { data: capacity } = useQuery<{
    plan: string;
    currentTeams: number;
    maxTeams: number;
    currentAdmins: number;
    maxAdmins: number;
    hasSubscription: boolean;
    canCreateTeam: boolean;
    needsMoreSeats: boolean;
  }>({
    queryKey: ["/api/teams/capacity"],
    enabled: user?.orgRole === "ROOT_ADMIN",
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("upgrade") === "success") {
      toast({ title: t("dashboard.teams.subscriptionActivated"), description: t("dashboard.teams.subscriptionActivatedDesc") });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/capacity"] });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const createMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/teams", { teamName, adminEmail, adminName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/capacity"] });
      toast({ title: t("dashboard.teams.teamCreatedToast") });
      setOpen(false);
      setTeamName("");
      setAdminEmail("");
      setAdminName("");
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.teams.failedCreateTeam"), description: err.message, variant: "destructive" });
    },
  });

  const addSeatMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", {
        type: "add_seats",
        quantity: 1,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.redirect && data.url) {
        window.location.href = data.url;
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/teams/capacity"] });
        toast({ title: t("dashboard.teams.seatAddedToast"), description: t("dashboard.teams.seatAddedDesc") });
        setSeatDialogOpen(false);
      }
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.teams.failedAddSeat"), description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, confirmName }: { id: string; confirmName: string }) => {
      await apiRequest("DELETE", `/api/teams/${id}`, { confirmName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      queryClient.invalidateQueries({ queryKey: ["/api/teams/capacity"] });
      toast({ title: t("dashboard.teams.teamDeletedToast") });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.teams.failedDeleteTeam"), description: err.message, variant: "destructive" });
    },
  });

  function handleCreateTeamClick() {
    if (capacity?.needsMoreSeats) {
      setSeatDialogOpen(true);
    } else if (capacity && capacity.currentTeams >= capacity.maxTeams) {
      toast({ title: t("dashboard.teams.teamLimitReached"), description: t("dashboard.teams.teamLimitDesc", { max: capacity.maxTeams }), variant: "destructive" });
    } else {
      setOpen(true);
    }
  }

  if (user?.orgRole !== "ROOT_ADMIN") {
    return (
      <EmptyState
        icon={<Shield className="w-8 h-8 text-muted-foreground" />}
        title={t("dashboard.teams.accessRestricted")}
        description={t("dashboard.teams.accessRestrictedDesc")}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("dashboard.teams.title")}</h1>
          <p className="text-muted-foreground mt-1">
            {t("dashboard.teams.subtitle")}
            {capacity && (
              <span className="ml-1">{t("dashboard.teams.capacityInfo", { currentTeams: capacity.currentTeams, maxTeams: capacity.maxTeams, currentAdmins: capacity.currentAdmins, maxAdmins: capacity.maxAdmins })}</span>
            )}
          </p>
        </div>
        <Button onClick={handleCreateTeamClick} data-testid="button-create-team">
          <Plus className="w-4 h-4 mr-1.5" />
          {t("dashboard.teams.createTeam")}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.teams.createNewTeam")}</DialogTitle>
            <DialogDescription>{t("dashboard.teams.createNewTeamDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("dashboard.teams.teamName")}</Label>
              <Input placeholder={t("dashboard.teams.teamNamePlaceholder")} value={teamName} onChange={e => setTeamName(e.target.value)} data-testid="input-team-name" />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.teams.teamAdminEmail")}</Label>
              <Input type="email" placeholder={t("dashboard.teams.teamAdminEmailPlaceholder")} value={adminEmail} onChange={e => setAdminEmail(e.target.value)} data-testid="input-admin-email" />
            </div>
            <div className="space-y-2">
              <Label>{t("dashboard.teams.teamAdminName")}</Label>
              <Input placeholder={t("dashboard.teams.teamAdminNamePlaceholder")} value={adminName} onChange={e => setAdminName(e.target.value)} data-testid="input-admin-name" />
            </div>
            <Button className="w-full" onClick={() => createMutation.mutate()} disabled={!teamName || !adminEmail || createMutation.isPending} data-testid="button-submit-team">
              {createMutation.isPending ? t("dashboard.teams.creatingTeam") : t("dashboard.teams.createTeam")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={seatDialogOpen} onOpenChange={setSeatDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.teams.addTeamAdminSeat")}</DialogTitle>
            <DialogDescription>{t("dashboard.teams.addTeamAdminSeatDesc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("dashboard.teams.currentSeats")}</span>
                <Badge variant="secondary" data-testid="text-current-seats">{t("dashboard.teams.seatsCount", { current: capacity?.currentAdmins || 0, max: capacity?.maxAdmins || 0 })}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{t("dashboard.teams.costPerSeat")}</span>
                <span className="text-sm font-medium">{t("dashboard.teams.seatPrice")}</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              {capacity?.hasSubscription
                ? t("dashboard.teams.seatProrated")
                : t("dashboard.teams.seatCheckout")}
            </p>
            <Button
              className="w-full gap-2"
              onClick={() => addSeatMutation.mutate()}
              disabled={addSeatMutation.isPending}
              data-testid="button-buy-seat"
            >
              <CreditCard className="w-4 h-4" />
              {addSeatMutation.isPending ? t("dashboard.teams.processing") : capacity?.hasSubscription ? t("dashboard.teams.addOneSeat") : t("dashboard.teams.subscribeAddSeat")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-28" />)}</div>
      ) : teams && teams.length > 0 ? (
        <div className="space-y-4">
          {teams.map((team: any) => (
            <TeamCard key={team.id} team={team} onDelete={(id, confirmName) => deleteMutation.mutate({ id, confirmName })} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Users className="w-10 h-10 text-muted-foreground" />}
          title={t("dashboard.teams.noTeams")}
          description={t("dashboard.teams.noTeamsDesc")}
          action={{ label: t("dashboard.teams.createTeam"), onClick: handleCreateTeamClick }}
        />
      )}
    </div>
  );
}
