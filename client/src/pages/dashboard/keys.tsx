import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Key, Copy, Shield, Clock, Search, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

interface ApiKeyAudit {
  id: string;
  keyPrefix: string;
  ownerName: string;
  ownerEmail: string;
  ownerType: "team" | "voucher";
  teamName: string;
  teamId: string;
  createdAt: string;
  lastUsed: string | null;
  status: string;
  membershipId: string;
  projectId: string | null;
  projectName: string | null;
}

interface Team {
  id: string;
  name: string;
}

export default function KeysPage() {
  const { user } = useAuth();

  if (user?.orgRole === "ROOT_ADMIN") {
    return <KeyAuditView />;
  }

  return <PersonalKeysView />;
}

function KeyAuditView() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkRevoke, setConfirmBulkRevoke] = useState(false);

  const { data: teams } = useQuery<Team[]>({ queryKey: ["/api/teams"] });

  const { data: keys, isLoading } = useQuery<ApiKeyAudit[]>({
    queryKey: ["/api/keys", statusFilter, typeFilter, teamFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (teamFilter !== "all") params.set("teamId", teamFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/keys?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch keys");
      return res.json();
    },
  });

  const bulkRevokeMutation = useMutation({
    mutationFn: async (keyIds: string[]) => {
      const res = await apiRequest("POST", "/api/keys/bulk-revoke", { keyIds });
      return res.json();
    },
    onSuccess: (data: any) => {
      const succeeded = data.results.filter((r: any) => r.success).length;
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      setSelected(new Set());
      toast({ title: `${succeeded} key${succeeded !== 1 ? 's' : ''} revoked` });
    },
    onError: (err: any) => {
      toast({ title: "Bulk revoke failed", description: err.message, variant: "destructive" });
    },
  });

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (!keys) return;
    const activeKeys = keys.filter(k => k.status === "ACTIVE");
    if (selected.size === activeKeys.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(activeKeys.map(k => k.id)));
    }
  };

  const activeCount = keys?.filter(k => k.status === "ACTIVE").length || 0;
  const revokedCount = keys?.filter(k => k.status === "REVOKED").length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-keys-heading">API Keys</h1>
        <p className="text-muted-foreground mt-1">Audit and manage all API keys across your organization</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4" data-testid="card-total-keys">
          <p className="text-sm text-muted-foreground">Total Keys</p>
          <p className="text-2xl font-bold mt-1">{keys?.length || 0}</p>
        </Card>
        <Card className="p-4" data-testid="card-active-keys">
          <p className="text-sm text-muted-foreground">Active</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{activeCount}</p>
        </Card>
        <Card className="p-4" data-testid="card-revoked-keys">
          <p className="text-sm text-muted-foreground">Revoked</p>
          <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{revokedCount}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-key-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-key-status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="ACTIVE">Active</SelectItem>
            <SelectItem value="REVOKED">Revoked</SelectItem>
            <SelectItem value="EXPIRED">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-key-type">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="team">Team</SelectItem>
            <SelectItem value="voucher">Voucher</SelectItem>
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-key-team">
            <SelectValue placeholder="Team" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teams</SelectItem>
            {teams?.map(t => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid="bulk-revoke-toolbar">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">{selected.size} key{selected.size !== 1 ? 's' : ''} selected</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulkRevoke(true)}
            disabled={bulkRevokeMutation.isPending}
            data-testid="button-bulk-revoke-keys"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {bulkRevokeMutation.isPending ? "Revoking..." : "Revoke Selected"}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-16" />)}
        </div>
      ) : keys && keys.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="table-keys">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-3 text-left w-10">
                    <input
                      type="checkbox"
                      checked={selected.size > 0 && selected.size === activeCount}
                      onChange={toggleAll}
                      data-testid="checkbox-select-all-keys"
                    />
                  </th>
                  <th className="p-3 text-left font-medium">Key Prefix</th>
                  <th className="p-3 text-left font-medium">Owner</th>
                  <th className="p-3 text-left font-medium">Type</th>
                  <th className="p-3 text-left font-medium">Team</th>
                  <th className="p-3 text-left font-medium">Project</th>
                  <th className="p-3 text-left font-medium">Status</th>
                  <th className="p-3 text-left font-medium">Created</th>
                  <th className="p-3 text-left font-medium">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.id} className="border-b last:border-0 hover:bg-muted/30" data-testid={`row-key-${k.id}`}>
                    <td className="p-3">
                      {k.status === "ACTIVE" ? (
                        <input
                          type="checkbox"
                          checked={selected.has(k.id)}
                          onChange={() => toggleSelect(k.id)}
                          data-testid={`checkbox-key-${k.id}`}
                        />
                      ) : (
                        <span className="w-4 h-4 block" />
                      )}
                    </td>
                    <td className="p-3">
                      <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" data-testid={`text-key-prefix-${k.id}`}>
                        {k.keyPrefix}
                      </code>
                    </td>
                    <td className="p-3">
                      <div>
                        <p className="font-medium text-xs" data-testid={`text-key-owner-${k.id}`}>{k.ownerName}</p>
                        <p className="text-xs text-muted-foreground">{k.ownerEmail}</p>
                      </div>
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={`no-default-hover-elevate no-default-active-elevate text-[10px] ${
                          k.ownerType === "team"
                            ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                            : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"
                        }`}
                        data-testid={`badge-key-type-${k.id}`}
                      >
                        {k.ownerType}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">{k.teamName}</td>
                    <td className="p-3 text-xs text-muted-foreground" data-testid={`text-key-project-${k.id}`}>
                      {k.projectName || <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={`no-default-hover-elevate no-default-active-elevate text-[10px] ${
                          k.status === "ACTIVE"
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                        }`}
                        data-testid={`badge-key-status-${k.id}`}
                      >
                        {k.status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(k.createdAt).toLocaleDateString()}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : "Never"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <EmptyState
          icon={<Key className="w-10 h-10 text-muted-foreground" />}
          title="No keys found"
          description="No API keys match your current filters. Try adjusting the search or filters."
        />
      )}

      <AlertDialog open={confirmBulkRevoke} onOpenChange={setConfirmBulkRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke {selected.size} API Key{selected.size !== 1 ? 's' : ''}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will immediately revoke the selected keys. Users will no longer be able to make API requests with these keys. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkRevokeMutation.mutate(Array.from(selected))}
              data-testid="button-confirm-bulk-revoke"
            >
              Revoke Keys
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PersonalKeysView() {
  const { toast } = useToast();

  const { data: keys, isLoading } = useQuery<any[]>({
    queryKey: ["/api/my-keys"],
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "API key copied to clipboard" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-keys-heading">API Keys</h1>
        <p className="text-muted-foreground mt-1">Manage your API keys</p>
      </div>

      <Card className="p-6" data-testid="card-api-access">
        <h2 className="text-base font-semibold mb-4">Your API Access</h2>
        <div className="p-4 rounded-lg bg-muted/50 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">Base URL</p>
            <code className="font-mono text-sm" data-testid="text-base-url">{window.location.origin}/api/v1</code>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => copyToClipboard(`${window.location.origin}/api/v1`)}
            data-testid="button-copy-base-url"
          >
            <Copy className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          API keys are shown once during provisioning. Contact your team admin if you need a new key.
        </p>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : keys && keys.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Keys</h2>
          {keys.map((k: any) => (
            <Card key={k.id} className="p-5" data-testid={`card-key-${k.id}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Key className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <code className="font-mono text-sm font-medium" data-testid={`text-key-prefix-${k.id}`}>
                      {k.keyPrefix}...
                    </code>
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        Created {new Date(k.createdAt).toLocaleDateString()}
                      </span>
                      {k.lastUsedAt && (
                        <span className="text-xs text-muted-foreground">
                          · Last used {new Date(k.lastUsedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`no-default-hover-elevate no-default-active-elevate ${
                    k.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  }`}
                  data-testid={`badge-key-status-${k.id}`}
                >
                  {k.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Key className="w-10 h-10 text-muted-foreground" />}
          title="No active keys"
          description="Your team admin will provision API keys for you. Keys will appear here once they're created."
        />
      )}

      <Card className="p-5" data-testid="card-security-info">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">Security</h3>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>API keys are encrypted at rest with AES-256-GCM</li>
          <li>Keys are only shown once during provisioning</li>
          <li>Contact your team admin to revoke or regenerate keys</li>
        </ul>
      </Card>
    </div>
  );
}
