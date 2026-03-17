import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import {
  Building2, Users, Ticket, DollarSign, LogOut, Sun, Moon,
  Pencil, Trash2, UserCheck, ArrowRightLeft, Key, ScrollText,
  Activity, Plug, Eye, RotateCcw, XCircle, ChevronDown, ChevronRight,
  Search, RefreshCw,
} from "lucide-react";

interface AdminStats {
  totalOrgs: number;
  totalUsers: number;
  totalVouchers: number;
  totalSpend: number;
  activeVouchers: number;
}

interface AdminOrg {
  id: string;
  name: string;
  plan: string;
  maxTeamAdmins: number;
  createdAt: string;
  memberCount: number;
}

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  orgId: string | null;
  orgName: string | null;
  orgRole: string | null;
  orgPlan: string | null;
  status: string | null;
  isVoucherUser: boolean;
  createdAt: string | null;
  lastLoginAt?: string | null;
}

interface AdminKey {
  id: string;
  keyPrefix: string;
  status: string;
  userId: string;
  membershipId: string;
  email?: string;
  name?: string;
  orgId: string;
  orgName: string;
  createdAt: string;
}

interface ProxyStats {
  totalRequests: number;
  totalErrors: number;
  last24hRequests: number;
  byProvider: { provider: string; requests: number; totalCostCents: number; avgDurationMs: number }[];
  byModel: { model: string; provider: string; requests: number; totalCostCents: number }[];
}

interface AdminProvider {
  id: string;
  provider: string;
  status: string;
  orgId: string;
  orgName: string;
  createdAt: string;
}

interface AdminVoucher {
  id: string;
  code: string;
  status: string;
  maxRedemptions: number;
  currentRedemptions: number;
  budgetCents: number;
  expiresAt: string | null;
  orgId: string;
  orgName: string;
  teamId: string;
  createdAt: string;
}

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  const sessionQuery = useQuery<{ isAdmin: boolean } | null>({
    queryKey: ["/api/admin/session"],
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (sessionQuery.isError || (sessionQuery.data !== undefined && !sessionQuery.data?.isAdmin)) {
      setLocation("/admin/login");
    }
  }, [sessionQuery.isError, sessionQuery.data, setLocation]);

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/admin/logout");
      queryClient.removeQueries({ queryKey: ["/api/admin/session"] });
      setLocation("/admin/login");
    } catch {
      toast({ title: "Logout failed", variant: "destructive" });
    }
  };

  if (sessionQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="space-y-4 w-full max-w-md p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!sessionQuery.data?.isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3 flex-wrap">
            <LogoFull size={24} />
            <Badge variant="secondary" data-testid="badge-control-center">Control Center</Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-admin-theme">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" onClick={handleLogout} data-testid="button-admin-logout" className="gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <Tabs defaultValue="overview">
          <TabsList data-testid="tabs-admin" className="flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
            <TabsTrigger value="keys" data-testid="tab-keys">API Keys</TabsTrigger>
            <TabsTrigger value="proxy" data-testid="tab-proxy">Proxy Stats</TabsTrigger>
            <TabsTrigger value="providers" data-testid="tab-providers">Providers</TabsTrigger>
            <TabsTrigger value="vouchers" data-testid="tab-vouchers">Vouchers</TabsTrigger>
            <TabsTrigger value="audit" data-testid="tab-audit">Audit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="overview"><OverviewTab /></TabsContent>
          <TabsContent value="organizations"><OrganizationsTab /></TabsContent>
          <TabsContent value="users"><UsersTab /></TabsContent>
          <TabsContent value="keys"><KeysTab /></TabsContent>
          <TabsContent value="proxy"><ProxyStatsTab /></TabsContent>
          <TabsContent value="providers"><ProvidersTab /></TabsContent>
          <TabsContent value="vouchers"><VouchersTab /></TabsContent>
          <TabsContent value="audit"><AuditLogsTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function OverviewTab() {
  const statsQuery = useQuery<AdminStats>({ queryKey: ["/api/admin/stats"] });

  if (statsQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>
        ))}
      </div>
    );
  }

  const stats = statsQuery.data;
  const cards = [
    { label: "Total Organizations", value: stats?.totalOrgs ?? 0, icon: Building2, color: "text-blue-500" },
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users, color: "text-green-500" },
    { label: "Total Vouchers", value: stats?.totalVouchers ?? 0, icon: Ticket, color: "text-purple-500" },
    { label: "Total Spend", value: `$${((stats?.totalSpend ?? 0) / 100).toFixed(2)}`, icon: DollarSign, color: "text-amber-500" },
  ];

  return (
    <div className="space-y-6 mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`w-4 h-4 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>{c.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      {stats && (
        <Card>
          <CardHeader><CardTitle className="text-base">Quick Stats</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap text-sm">
              <div><span className="text-muted-foreground">Active Vouchers: </span><span className="font-semibold" data-testid="stat-active-vouchers">{stats.activeVouchers}</span></div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrganizationsTab() {
  const [editOrg, setEditOrg] = useState<AdminOrg | null>(null);
  const [detailOrgId, setDetailOrgId] = useState<string | null>(null);
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const { toast } = useToast();

  const orgsQuery = useQuery<AdminOrg[]>({ queryKey: ["/api/admin/organizations"] });

  const deleteMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/organizations/${orgId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "Organization deleted", description: `Removed: ${JSON.stringify(data.deletedCounts)}` });
      setDeleteOrgId(null);
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  if (orgsQuery.isLoading) return <TableSkeleton />;

  const orgs = orgsQuery.data ?? [];

  return (
    <div className="mt-6 space-y-4">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Max Admins</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[140px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No organizations found</TableCell></TableRow>
            ) : (
              orgs.map((org) => (
                <TableRow key={org.id} data-testid={`row-org-${org.id}`}>
                  <TableCell className="font-medium" data-testid={`text-org-name-${org.id}`}>{org.name}</TableCell>
                  <TableCell><PlanBadge plan={org.plan} /></TableCell>
                  <TableCell data-testid={`text-org-members-${org.id}`}>{org.memberCount}</TableCell>
                  <TableCell>{org.maxTeamAdmins}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(org.createdAt).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => setDetailOrgId(org.id)} data-testid={`button-detail-org-${org.id}`} title="View details">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditOrg(org)} data-testid={`button-edit-org-${org.id}`} title="Edit">
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteOrgId(org.id)} data-testid={`button-delete-org-${org.id}`} title="Delete" className="text-destructive hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {editOrg && <EditOrgDialog org={editOrg} onClose={() => setEditOrg(null)} />}
      {detailOrgId && <OrgDetailDialog orgId={detailOrgId} onClose={() => setDetailOrgId(null)} />}

      <AlertDialog open={!!deleteOrgId} onOpenChange={(open) => { if (!open) setDeleteOrgId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the organization and all its teams, members, API keys, vouchers, provider connections, and logs. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-org">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteOrgId && deleteMutation.mutate(deleteOrgId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-org"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OrgDetailDialog({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const detailQuery = useQuery<any>({
    queryKey: ["/api/admin/organizations", orgId, "details"],
    queryFn: async () => {
      const res = await fetch(`/api/admin/organizations/${orgId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
  });

  const data = detailQuery.data;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.name || "Organization Details"}</DialogTitle>
          <DialogDescription>Plan: {data?.plan} | Created: {data?.createdAt ? new Date(data.createdAt).toLocaleDateString() : "-"}</DialogDescription>
        </DialogHeader>
        {detailQuery.isLoading ? (
          <div className="space-y-3 py-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
        ) : data ? (
          <div className="space-y-6 py-2">
            <div>
              <h4 className="font-semibold text-sm mb-2">Teams ({data.teams?.length || 0})</h4>
              {data.teams?.map((team: any) => (
                <div key={team.id} className="border rounded p-3 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm">{team.name}</span>
                    <Badge variant="outline">{team.memberCount} members</Badge>
                  </div>
                  {team.members?.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs">Email</TableHead>
                          <TableHead className="text-xs">Status</TableHead>
                          <TableHead className="text-xs">Budget</TableHead>
                          <TableHead className="text-xs">Spend</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {team.members.map((m: any) => (
                          <TableRow key={m.membershipId}>
                            <TableCell className="text-xs">{m.email}</TableCell>
                            <TableCell><StatusBadge status={m.status} /></TableCell>
                            <TableCell className="text-xs">${(m.monthlyBudgetCents / 100).toFixed(2)}</TableCell>
                            <TableCell className="text-xs">${(m.currentPeriodSpendCents / 100).toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ))}
            </div>
            <div>
              <h4 className="font-semibold text-sm mb-2">Provider Connections ({data.providerConnections?.length || 0})</h4>
              <div className="flex flex-wrap gap-2">
                {data.providerConnections?.map((p: any) => (
                  <Badge key={p.id} variant={p.status === "ACTIVE" ? "default" : "destructive"}>{p.provider} - {p.status}</Badge>
                ))}
                {(!data.providerConnections || data.providerConnections.length === 0) && <span className="text-sm text-muted-foreground">None configured</span>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-sm mb-2">Spend by Team</h4>
                {data.spendByTeam?.map((s: any) => (
                  <div key={s.teamId} className="flex justify-between text-sm"><span>{s.teamName}</span><span className="font-mono">${(s.spendCents / 100).toFixed(2)}</span></div>
                ))}
              </div>
              <div>
                <h4 className="font-semibold text-sm mb-2">Spend by Provider</h4>
                {data.spendByProvider?.map((s: any) => (
                  <div key={s.provider} className="flex justify-between text-sm"><span>{s.provider}</span><span className="font-mono">${(s.spendCents / 100).toFixed(2)}</span></div>
                ))}
              </div>
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>API Keys: {data.keys?.length || 0}</span>
              <span>Vouchers: {data.vouchers || 0}</span>
              <span>Bundles: {data.bundles || 0}</span>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const variant = plan === "TEAM" ? "default" : plan === "ENTERPRISE" ? "secondary" : "outline";
  return <Badge variant={variant} data-testid={`badge-plan-${plan}`}>{plan}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === "ACTIVE" ? "secondary" : status === "SUSPENDED" ? "destructive" : "outline";
  return <Badge variant={variant} className="text-xs">{status}</Badge>;
}

function EditOrgDialog({ org, onClose }: { org: AdminOrg; onClose: () => void }) {
  const [plan, setPlan] = useState(org.plan);
  const [maxTeamAdmins, setMaxTeamAdmins] = useState(String(org.maxTeamAdmins));
  const [name, setName] = useState(org.name);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/organizations/${org.id}`, { plan, maxTeamAdmins: parseInt(maxTeamAdmins, 10), name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      toast({ title: "Organization updated" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-testid="dialog-edit-org">
        <DialogHeader><DialogTitle>Edit Organization</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} data-testid="input-org-name" />
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger data-testid="select-org-plan"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FREE">FREE</SelectItem>
                <SelectItem value="TEAM">TEAM</SelectItem>
                <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-admins">Team Admin Seats</Label>
            <Input id="max-admins" type="number" min="0" max="999" value={maxTeamAdmins} onChange={(e) => setMaxTeamAdmins(e.target.value)} className="w-24" data-testid="input-max-admins" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-org">{mutation.isPending ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [deleteUser, setDeleteUser] = useState<{ user: AdminUser; mode: "hard" | "soft" } | null>(null);
  const [transferUser, setTransferUser] = useState<AdminUser | null>(null);

  const usersQuery = useQuery<AdminUser[]>({ queryKey: ["/api/admin/users"] });
  const orgsQuery = useQuery<AdminOrg[]>({ queryKey: ["/api/admin/organizations"] });

  const suspendMutation = useMutation({
    mutationFn: async (userId: string) => { await apiRequest("DELETE", `/api/admin/users/${userId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User suspended" });
    },
    onError: (err: any) => { toast({ title: "Action failed", description: err.message, variant: "destructive" }); },
  });

  const reactivateMutation = useMutation({
    mutationFn: async (userId: string) => { await apiRequest("POST", `/api/admin/users/${userId}/reactivate`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User reactivated" });
    },
    onError: (err: any) => { toast({ title: "Action failed", description: err.message, variant: "destructive" }); },
  });

  const hardDeleteMutation = useMutation({
    mutationFn: async (userId: string) => { await apiRequest("DELETE", `/api/admin/users/${userId}/hard`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "User permanently deleted" });
      setDeleteUser(null);
    },
    onError: (err: any) => { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); },
  });

  const softDeleteMutation = useMutation({
    mutationFn: async (userId: string) => { await apiRequest("DELETE", `/api/admin/users/${userId}/soft`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "User soft-deleted, email freed" });
      setDeleteUser(null);
    },
    onError: (err: any) => { toast({ title: "Delete failed", description: err.message, variant: "destructive" }); },
  });

  if (usersQuery.isLoading) return <TableSkeleton />;

  const users = usersQuery.data ?? [];
  const filtered = search
    ? users.filter(u => u.email.toLowerCase().includes(search.toLowerCase()) || u.name?.toLowerCase().includes(search.toLowerCase()) || u.orgName?.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-users" />
        </div>
        <Badge variant="outline">{filtered.length} users</Badge>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[200px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No users found</TableCell></TableRow>
            ) : (
              filtered.map((user) => {
                const isActive = user.status !== "SUSPENDED";
                return (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium text-sm" data-testid={`text-user-email-${user.id}`}>{user.email}</TableCell>
                    <TableCell className="text-sm" data-testid={`text-user-name-${user.id}`}>{user.name || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{user.orgName || "-"}</TableCell>
                    <TableCell>{user.orgRole ? <Badge variant="outline" className="text-xs">{user.orgRole}</Badge> : "-"}</TableCell>
                    <TableCell><Badge variant={isActive ? "secondary" : "destructive"} data-testid={`badge-status-${user.id}`} className="text-xs">{isActive ? "Active" : "Suspended"}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isActive ? (
                          <Button size="sm" variant="outline" onClick={() => suspendMutation.mutate(user.id)} disabled={suspendMutation.isPending} data-testid={`button-suspend-${user.id}`} className="h-7 text-xs">
                            <XCircle className="w-3 h-3 mr-1" />Suspend
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => reactivateMutation.mutate(user.id)} disabled={reactivateMutation.isPending} data-testid={`button-reactivate-${user.id}`} className="h-7 text-xs">
                            <UserCheck className="w-3 h-3 mr-1" />Reactivate
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setTransferUser(user)} data-testid={`button-transfer-${user.id}`} className="h-7 text-xs">
                          <ArrowRightLeft className="w-3 h-3 mr-1" />Transfer
                        </Button>
                        <Select onValueChange={(mode) => setDeleteUser({ user, mode: mode as "hard" | "soft" })}>
                          <SelectTrigger className="h-7 w-[90px] text-xs text-destructive border-destructive/30" data-testid={`select-delete-${user.id}`}>
                            <Trash2 className="w-3 h-3 mr-1" /><span>Delete</span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="hard">Hard Delete</SelectItem>
                            <SelectItem value="soft">Soft Delete</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <AlertDialog open={!!deleteUser} onOpenChange={(open) => { if (!open) setDeleteUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteUser?.mode === "hard" ? "Permanently Delete User" : "Soft Delete User"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteUser?.mode === "hard"
                ? `This will permanently remove ${deleteUser?.user.email} and all their data (memberships, API keys, logs). This cannot be undone.`
                : `This will suspend ${deleteUser?.user.email} and free their email address for reuse. Historical data is preserved.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-user">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleteUser) return;
                if (deleteUser.mode === "hard") hardDeleteMutation.mutate(deleteUser.user.id);
                else softDeleteMutation.mutate(deleteUser.user.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-user"
            >
              {(hardDeleteMutation.isPending || softDeleteMutation.isPending) ? "Deleting..." : deleteUser?.mode === "hard" ? "Permanently Delete" : "Soft Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {transferUser && <TransferUserDialog user={transferUser} orgs={orgsQuery.data ?? []} onClose={() => setTransferUser(null)} />}
    </div>
  );
}

function TransferUserDialog({ user, orgs, onClose }: { user: AdminUser; orgs: AdminOrg[]; onClose: () => void }) {
  const [targetOrgId, setTargetOrgId] = useState("");
  const [targetTeamId, setTargetTeamId] = useState("");
  const [targetOrgRole, setTargetOrgRole] = useState(user.orgRole);
  const [moveHistory, setMoveHistory] = useState(false);
  const [budget, setBudget] = useState("5.00");
  const { toast } = useToast();

  const teamsQuery = useQuery<any>({
    queryKey: ["/api/admin/organizations", targetOrgId, "details"],
    queryFn: async () => {
      if (!targetOrgId) return null;
      const res = await fetch(`/api/admin/organizations/${targetOrgId}/details`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!targetOrgId,
  });

  const transferMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", `/api/admin/users/${user.id}/transfer`, {
        targetOrgId,
        targetTeamId,
        moveHistory,
        monthlyBudgetCents: Math.round(parseFloat(budget) * 100),
        targetOrgRole,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      toast({ title: "User transferred successfully" });
      onClose();
    },
    onError: (err: any) => {
      toast({ title: "Transfer failed", description: err.message, variant: "destructive" });
    },
  });

  const availableOrgs = orgs.filter(o => o.id !== user.orgId);
  const teams = teamsQuery.data?.teams ?? [];

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-testid="dialog-transfer-user">
        <DialogHeader>
          <DialogTitle>Transfer User</DialogTitle>
          <DialogDescription>Move {user.email} to a different organization</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Target Organization</Label>
            <Select value={targetOrgId} onValueChange={(v) => { setTargetOrgId(v); setTargetTeamId(""); }}>
              <SelectTrigger data-testid="select-target-org"><SelectValue placeholder="Select organization" /></SelectTrigger>
              <SelectContent>
                {availableOrgs.map(o => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {targetOrgId && (
            <div className="space-y-2">
              <Label>Target Team</Label>
              {teamsQuery.isLoading ? <Skeleton className="h-10 w-full" /> : (
                <Select value={targetTeamId} onValueChange={setTargetTeamId}>
                  <SelectTrigger data-testid="select-target-team"><SelectValue placeholder="Select team" /></SelectTrigger>
                  <SelectContent>
                    {teams.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name} ({t.memberCount} members)</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label>Role in New Organization</Label>
            <Select value={targetOrgRole} onValueChange={setTargetOrgRole}>
              <SelectTrigger data-testid="select-target-role"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ROOT_ADMIN">Root Admin</SelectItem>
                <SelectItem value="TEAM_ADMIN">Team Admin</SelectItem>
                <SelectItem value="MEMBER">Member</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="transfer-budget">Monthly Budget ($)</Label>
            <Input id="transfer-budget" type="number" step="0.01" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} className="w-32" data-testid="input-transfer-budget" />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="move-history" checked={moveHistory} onCheckedChange={(v) => setMoveHistory(!!v)} data-testid="checkbox-move-history" />
            <Label htmlFor="move-history" className="text-sm">Move usage history and proxy logs to new org</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => transferMutation.mutate()} disabled={!targetOrgId || !targetTeamId || transferMutation.isPending} data-testid="button-confirm-transfer">
            {transferMutation.isPending ? "Transferring..." : "Transfer User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KeysTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const keysQuery = useQuery<AdminKey[]>({ queryKey: ["/api/admin/keys"] });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => { await apiRequest("DELETE", `/api/admin/keys/${keyId}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/keys"] });
      toast({ title: "Key revoked" });
    },
    onError: (err: any) => { toast({ title: "Revoke failed", description: err.message, variant: "destructive" }); },
  });

  if (keysQuery.isLoading) return <TableSkeleton />;

  const keys = keysQuery.data ?? [];
  const filtered = search
    ? keys.filter(k => k.keyPrefix?.toLowerCase().includes(search.toLowerCase()) || k.email?.toLowerCase().includes(search.toLowerCase()) || k.orgName?.toLowerCase().includes(search.toLowerCase()))
    : keys;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search keys..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-keys" />
        </div>
        <Badge variant="outline">{filtered.length} keys</Badge>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Key Prefix</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No keys found</TableCell></TableRow>
            ) : (
              filtered.map((k) => (
                <TableRow key={k.id} data-testid={`row-key-${k.id}`}>
                  <TableCell className="font-mono text-sm">{k.keyPrefix}...</TableCell>
                  <TableCell><Badge variant={k.status === "ACTIVE" ? "secondary" : "destructive"} className="text-xs">{k.status}</Badge></TableCell>
                  <TableCell className="text-sm">{k.email || k.name || "-"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{k.orgName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{k.createdAt ? new Date(k.createdAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    {k.status === "ACTIVE" && (
                      <Button size="sm" variant="destructive" onClick={() => revokeMutation.mutate(k.id)} disabled={revokeMutation.isPending} data-testid={`button-revoke-key-${k.id}`} className="h-7 text-xs">
                        Revoke
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ProxyStatsTab() {
  const statsQuery = useQuery<ProxyStats>({ queryKey: ["/api/admin/proxy-stats"] });

  if (statsQuery.isLoading) return <TableSkeleton />;

  const stats = statsQuery.data;
  if (!stats) return null;

  const errorRate = stats.totalRequests > 0 ? ((stats.totalErrors / stats.totalRequests) * 100).toFixed(1) : "0.0";

  return (
    <div className="mt-6 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Requests</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="stat-total-requests">{stats.totalRequests.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Last 24h</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="stat-24h-requests">{stats.last24hRequests.toLocaleString()}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Error Rate</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-bold" data-testid="stat-error-rate">{errorRate}%</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Cost</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-proxy-cost">
              ${stats.byProvider.reduce((sum, p) => sum + p.totalCostCents, 0) / 100}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-base">By Provider</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Avg Duration</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byProvider.map((p) => (
                  <TableRow key={p.provider}>
                    <TableCell className="font-medium">{p.provider}</TableCell>
                    <TableCell>{p.requests.toLocaleString()}</TableCell>
                    <TableCell className="font-mono">${(p.totalCostCents / 100).toFixed(2)}</TableCell>
                    <TableCell>{Math.round(p.avgDurationMs)}ms</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Top Models</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Requests</TableHead>
                  <TableHead>Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.byModel.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell className="font-mono text-sm">{m.model}</TableCell>
                    <TableCell>{m.requests.toLocaleString()}</TableCell>
                    <TableCell className="font-mono">${(m.totalCostCents / 100).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                {stats.byModel.length === 0 && (
                  <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-4">No proxy requests yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProvidersTab() {
  const providersQuery = useQuery<AdminProvider[]>({ queryKey: ["/api/admin/providers"] });

  if (providersQuery.isLoading) return <TableSkeleton />;

  const providers = providersQuery.data ?? [];

  return (
    <div className="mt-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Provider Connections Across Organizations</CardTitle>
          <CardDescription>{providers.length} connections total</CardDescription>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Connected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.length === 0 ? (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No provider connections</TableCell></TableRow>
            ) : (
              providers.map((p) => (
                <TableRow key={p.id} data-testid={`row-provider-${p.id}`}>
                  <TableCell className="font-medium">{p.provider}</TableCell>
                  <TableCell><Badge variant={p.status === "ACTIVE" ? "secondary" : "destructive"} className="text-xs">{p.status}</Badge></TableCell>
                  <TableCell className="text-sm">{p.orgName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function VouchersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");

  const vouchersQuery = useQuery<AdminVoucher[]>({ queryKey: ["/api/admin/vouchers"] });

  const voidMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      await apiRequest("PATCH", `/api/admin/vouchers/${id}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/vouchers"] });
      toast({ title: "Voucher status updated" });
    },
    onError: (err: any) => { toast({ title: "Action failed", description: err.message, variant: "destructive" }); },
  });

  if (vouchersQuery.isLoading) return <TableSkeleton />;

  const allVouchers = vouchersQuery.data ?? [];
  const filtered = search
    ? allVouchers.filter(v => v.code.toLowerCase().includes(search.toLowerCase()) || v.orgName.toLowerCase().includes(search.toLowerCase()))
    : allVouchers;

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search vouchers..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-vouchers" />
        </div>
        <Badge variant="outline">{filtered.length} vouchers</Badge>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Redemptions</TableHead>
              <TableHead>Budget</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No vouchers found</TableCell></TableRow>
            ) : (
              filtered.map((v) => (
                <TableRow key={v.id} data-testid={`row-voucher-${v.id}`}>
                  <TableCell className="font-mono text-sm">{v.code}</TableCell>
                  <TableCell>
                    <Badge variant={v.status === "ACTIVE" ? "secondary" : v.status === "REVOKED" ? "destructive" : "outline"} className="text-xs">{v.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{v.currentRedemptions}/{v.maxRedemptions}</TableCell>
                  <TableCell className="font-mono text-sm">${(v.budgetCents / 100).toFixed(2)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.orgName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.expiresAt ? new Date(v.expiresAt).toLocaleDateString() : "-"}</TableCell>
                  <TableCell>
                    {v.status === "ACTIVE" && (
                      <Button size="sm" variant="destructive" onClick={() => voidMutation.mutate({ id: v.id, status: "REVOKED" })} disabled={voidMutation.isPending} data-testid={`button-void-voucher-${v.id}`} className="h-7 text-xs">
                        Void
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function AuditLogsTab() {
  const [tab, setTab] = useState<"org" | "platform">("platform");
  const [actionFilter, setActionFilter] = useState("");

  const logsQuery = useQuery<any>({
    queryKey: ["/api/admin/audit-logs", actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "200" });
      if (actionFilter) params.set("action", actionFilter);
      const res = await fetch(`/api/admin/audit-logs?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  if (logsQuery.isLoading) return <TableSkeleton />;

  const data = logsQuery.data;
  const logs = tab === "platform" ? (data?.platformLogs ?? []) : (data?.orgLogs ?? []);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1">
          <Button size="sm" variant={tab === "platform" ? "default" : "outline"} onClick={() => setTab("platform")} data-testid="button-platform-logs" className="h-8">
            Platform Logs
          </Button>
          <Button size="sm" variant={tab === "org" ? "default" : "outline"} onClick={() => setTab("org")} data-testid="button-org-logs" className="h-8">
            Org Logs
          </Button>
        </div>
        <Input placeholder="Filter by action..." value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="max-w-xs h-8 text-sm" data-testid="input-filter-audit" />
        <Badge variant="outline">{logs.length} entries</Badge>
      </div>
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              {tab === "org" && <TableHead>Actor</TableHead>}
              <TableHead>Entity</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.length === 0 ? (
              <TableRow><TableCell colSpan={tab === "org" ? 5 : 4} className="text-center text-muted-foreground py-8">No audit logs found</TableCell></TableRow>
            ) : (
              logs.map((log: any) => (
                <TableRow key={log.id} data-testid={`row-audit-${log.id}`}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(log.createdAt || log.timestamp).toLocaleString()}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs font-mono">{log.action}</Badge></TableCell>
                  {tab === "org" && <TableCell className="text-xs">{log.actorId?.slice(0, 8) || "-"}</TableCell>}
                  <TableCell className="text-xs">{log.entityType || log.targetType || "-"}: {(log.entityId || log.targetId || "-").slice(0, 8)}</TableCell>
                  <TableCell className="text-xs max-w-[300px] truncate">{log.metadata ? JSON.stringify(log.metadata) : "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="mt-6 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
    </div>
  );
}
