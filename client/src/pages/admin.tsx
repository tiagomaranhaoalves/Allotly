import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import {
  Building2, Users, Ticket, DollarSign, LogOut, Sun, Moon,
  ChevronRight, Pencil,
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
}

interface OrgDetail extends AdminOrg {
  users: AdminUser[];
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
          <TabsList data-testid="tabs-admin">
            <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
            <TabsTrigger value="organizations" data-testid="tab-organizations">Organizations</TabsTrigger>
            <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>
          <TabsContent value="organizations">
            <OrganizationsTab />
          </TabsContent>
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function OverviewTab() {
  const statsQuery = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
  });

  if (statsQuery.isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const stats = statsQuery.data;

  const cards = [
    { label: "Total Organizations", value: stats?.totalOrgs ?? 0, icon: Building2 },
    { label: "Total Users", value: stats?.totalUsers ?? 0, icon: Users },
    { label: "Total Vouchers", value: stats?.totalVouchers ?? 0, icon: Ticket },
    { label: "Total Spend", value: `$${((stats?.totalSpend ?? 0) / 100).toFixed(2)}`, icon: DollarSign },
  ];

  return (
    <div className="space-y-6 mt-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className="w-4 h-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid={`stat-${c.label.toLowerCase().replace(/\s+/g, "-")}`}>
                {c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6 flex-wrap text-sm">
              <div>
                <span className="text-muted-foreground">Active Vouchers: </span>
                <span className="font-semibold" data-testid="stat-active-vouchers">{stats.activeVouchers}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OrganizationsTab() {
  const [editOrg, setEditOrg] = useState<AdminOrg | null>(null);

  const orgsQuery = useQuery<AdminOrg[]>({
    queryKey: ["/api/admin/organizations"],
  });

  if (orgsQuery.isLoading) {
    return (
      <div className="mt-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const orgs = orgsQuery.data ?? [];

  return (
    <div className="mt-6">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Max Admins</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {orgs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No organizations found
                </TableCell>
              </TableRow>
            ) : (
              orgs.map((org) => (
                <TableRow key={org.id} data-testid={`row-org-${org.id}`}>
                  <TableCell className="font-medium" data-testid={`text-org-name-${org.id}`}>{org.name}</TableCell>
                  <TableCell>
                    <PlanBadge plan={org.plan} />
                  </TableCell>
                  <TableCell data-testid={`text-org-members-${org.id}`}>{org.memberCount}</TableCell>
                  <TableCell>{org.maxTeamAdmins}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(org.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setEditOrg(org)}
                      data-testid={`button-edit-org-${org.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {editOrg && (
        <EditOrgDialog org={editOrg} onClose={() => setEditOrg(null)} />
      )}
    </div>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  const variant = plan === "TEAM" ? "default" : plan === "ENTERPRISE" ? "secondary" : "outline";
  return <Badge variant={variant} data-testid={`badge-plan-${plan}`}>{plan}</Badge>;
}

function EditOrgDialog({ org, onClose }: { org: AdminOrg; onClose: () => void }) {
  const [plan, setPlan] = useState(org.plan);
  const [maxTeamAdmins, setMaxTeamAdmins] = useState(String(org.maxTeamAdmins));
  const [name, setName] = useState(org.name);
  const { toast } = useToast();

  const mutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/admin/organizations/${org.id}`, {
        plan,
        maxTeamAdmins: parseInt(maxTeamAdmins, 10),
        name,
      });
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
        <DialogHeader>
          <DialogTitle>Edit Organization</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="org-name">Name</Label>
            <Input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-org-name"
            />
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger data-testid="select-org-plan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FREE">FREE</SelectItem>
                <SelectItem value="TEAM">TEAM</SelectItem>
                <SelectItem value="ENTERPRISE">ENTERPRISE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="max-admins">Max Team Admins</Label>
            <Input
              id="max-admins"
              type="number"
              min="1"
              value={maxTeamAdmins}
              onChange={(e) => setMaxTeamAdmins(e.target.value)}
              data-testid="input-max-admins"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} data-testid="button-cancel-edit">Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-org">
            {mutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const { toast } = useToast();

  const usersQuery = useQuery<AdminUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const deactivateMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/stats"] });
      toast({ title: "User deactivated" });
    },
    onError: (err: any) => {
      toast({ title: "Action failed", description: err.message, variant: "destructive" });
    },
  });

  if (usersQuery.isLoading) {
    return (
      <div className="mt-6 space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="mt-6">
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              users.map((user) => {
                const isActive = user.status !== "SUSPENDED";
                return (
                  <TableRow key={user.id} data-testid={`row-user-${user.id}`}>
                    <TableCell className="font-medium" data-testid={`text-user-email-${user.id}`}>{user.email}</TableCell>
                    <TableCell data-testid={`text-user-name-${user.id}`}>{user.name || "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{user.orgName || "-"}</TableCell>
                    <TableCell>
                      {user.orgRole ? <Badge variant="outline">{user.orgRole}</Badge> : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={isActive ? "secondary" : "destructive"} data-testid={`badge-status-${user.id}`}>
                        {isActive ? "Active" : "Suspended"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {isActive && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deactivateMutation.mutate(user.id)}
                          disabled={deactivateMutation.isPending}
                          data-testid={`button-deactivate-${user.id}`}
                        >
                          Deactivate
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
