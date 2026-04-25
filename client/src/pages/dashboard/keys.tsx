import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Key, Copy, Shield, Clock, Search, Trash2, AlertTriangle, Settings2, Swords, ExternalLink, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

const PROVIDERS = [
  { id: "OPENAI", label: "OpenAI", color: "#10A37F" },
  { id: "ANTHROPIC", label: "Anthropic", color: "#D4A574" },
  { id: "GOOGLE", label: "Google", color: "#4285F4" },
  { id: "AZURE_OPENAI", label: "Azure", color: "#0078D4" },
];

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
  allowedProviders: string[] | null;
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
  const { t } = useTranslation();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkRevoke, setConfirmBulkRevoke] = useState(false);

  const [editProvidersKey, setEditProvidersKey] = useState<ApiKeyAudit | null>(null);
  const [editProviders, setEditProviders] = useState<string[]>([]);

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
      toast({ title: t("dashboard.keys.toastBulkRevokedTitle", { count: succeeded }) });
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.keys.toastBulkRevokeFailed"), description: err.message, variant: "destructive" });
    },
  });

  const updateProvidersMutation = useMutation({
    mutationFn: async ({ membershipId, providers }: { membershipId: string; providers: string[] }) => {
      await apiRequest("PATCH", `/api/members/${membershipId}/budget`, {
        allowedProviders: providers.length > 0 ? providers : null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      toast({ title: t("dashboard.keys.toastProvidersUpdated") });
      setEditProvidersKey(null);
    },
    onError: (err: any) => {
      toast({ title: t("dashboard.keys.toastUpdateProvidersFailed"), description: err.message, variant: "destructive" });
    },
  });

  const openEditProviders = (k: ApiKeyAudit) => {
    setEditProvidersKey(k);
    setEditProviders(k.allowedProviders || []);
  };

  const toggleEditProvider = (p: string) => {
    setEditProviders(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
  };

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
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-keys-heading">{t("dashboard.keys.auditHeading")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.keys.auditSubheading")}</p>
      </div>

      <ArenaTestKeyCallout />

      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4" data-testid="card-total-keys">
          <p className="text-sm text-muted-foreground">{t("dashboard.keys.cardTotal")}</p>
          <p className="text-2xl font-bold mt-1">{keys?.length || 0}</p>
        </Card>
        <Card className="p-4" data-testid="card-active-keys">
          <p className="text-sm text-muted-foreground">{t("dashboard.keys.cardActive")}</p>
          <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">{activeCount}</p>
        </Card>
        <Card className="p-4" data-testid="card-revoked-keys">
          <p className="text-sm text-muted-foreground">{t("dashboard.keys.cardRevoked")}</p>
          <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">{revokedCount}</p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t("dashboard.keys.searchPlaceholder")}
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-key-search"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-key-status">
            <SelectValue placeholder={t("dashboard.keys.statusPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dashboard.keys.statusAll")}</SelectItem>
            <SelectItem value="ACTIVE">{t("dashboard.keys.statusActive")}</SelectItem>
            <SelectItem value="REVOKED">{t("dashboard.keys.statusRevoked")}</SelectItem>
            <SelectItem value="EXPIRED">{t("dashboard.keys.statusExpired")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[140px]" data-testid="select-key-type">
            <SelectValue placeholder={t("dashboard.keys.typePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dashboard.keys.typeAll")}</SelectItem>
            <SelectItem value="team">{t("dashboard.keys.typeTeam")}</SelectItem>
            <SelectItem value="voucher">{t("dashboard.keys.typeVoucher")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={teamFilter} onValueChange={setTeamFilter}>
          <SelectTrigger className="w-[160px]" data-testid="select-key-team">
            <SelectValue placeholder={t("dashboard.keys.teamPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("dashboard.keys.teamAll")}</SelectItem>
            {teams?.map(team => (
              <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800" data-testid="bulk-revoke-toolbar">
          <AlertTriangle className="w-4 h-4 text-red-600 dark:text-red-400" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">{t("dashboard.keys.selectedCount", { count: selected.size })}</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setConfirmBulkRevoke(true)}
            disabled={bulkRevokeMutation.isPending}
            data-testid="button-bulk-revoke-keys"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1.5" />
            {bulkRevokeMutation.isPending ? t("dashboard.keys.revoking") : t("dashboard.keys.revokeSelected")}
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
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableKeyPrefix")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableOwner")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableType")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableTeam")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableProject")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableProviders")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableStatus")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableCreated")}</th>
                  <th className="p-3 text-left font-medium">{t("dashboard.keys.tableLastUsed")}</th>
                  <th className="p-3 text-left font-medium w-10"></th>
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
                    <td className="p-3" data-testid={`cell-key-providers-${k.id}`}>
                      <div className="flex flex-wrap gap-1">
                        {k.allowedProviders && k.allowedProviders.length > 0 ? (
                          k.allowedProviders.map(p => {
                            const provider = PROVIDERS.find(pr => pr.id === p);
                            return (
                              <span
                                key={p}
                                className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-muted"
                                data-testid={`badge-provider-${p}-${k.id}`}
                              >
                                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: provider?.color || "#888" }} />
                                {provider?.label || p}
                              </span>
                            );
                          })
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50">{t("dashboard.keys.providersAll")}</span>
                        )}
                      </div>
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
                      {k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : t("dashboard.keys.lastUsedNever")}
                    </td>
                    <td className="p-3">
                      {k.status === "ACTIVE" && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openEditProviders(k)}
                            title={t("dashboard.keys.titleEditProviders")}
                            data-testid={`button-edit-providers-${k.id}`}
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </Button>
                          {currentUser?.email && k.ownerEmail.trim().toLowerCase() === currentUser.email.trim().toLowerCase() && (
                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              data-testid={`link-setup-tool-${k.id}`}
                              title={t("connect.keysPageLink")}
                            >
                              <a href={`/dashboard/connect?key=${encodeURIComponent(k.id)}`}>
                                <PlugZap className="w-3.5 h-3.5" />
                              </a>
                            </Button>
                          )}
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            data-testid={`button-test-key-arena-${k.id}`}
                          >
                            <a
                              href="/arena"
                              target="_blank"
                              rel="noopener"
                              title={t("dashboard.keys.titleTestArenaCompact")}
                            >
                              <Swords className="w-3.5 h-3.5" />
                            </a>
                          </Button>
                        </div>
                      )}
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
          title={t("dashboard.keys.emptyTitle")}
          description={t("dashboard.keys.emptyDescription")}
        />
      )}

      <AlertDialog open={confirmBulkRevoke} onOpenChange={setConfirmBulkRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("dashboard.keys.bulkRevokeTitle", { count: selected.size })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("dashboard.keys.bulkRevokeDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-revoke">{t("dashboard.keys.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkRevokeMutation.mutate(Array.from(selected))}
              data-testid="button-confirm-bulk-revoke"
            >
              {t("dashboard.keys.revokeKeys")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!editProvidersKey} onOpenChange={(open) => { if (!open) setEditProvidersKey(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dashboard.keys.editProvidersTitle")}</DialogTitle>
            <DialogDescription>
              {t("dashboard.keys.editProvidersDescription", { prefix: editProvidersKey?.keyPrefix ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>{t("dashboard.keys.allowedProviders")}</Label>
              <div className="space-y-2">
                {PROVIDERS.map(p => (
                  <label key={p.id} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-muted/50" data-testid={`label-provider-${p.id.toLowerCase()}`}>
                    <Checkbox
                      checked={editProviders.includes(p.id)}
                      onCheckedChange={() => toggleEditProvider(p.id)}
                      data-testid={`checkbox-provider-${p.id.toLowerCase()}`}
                    />
                    <span className="flex items-center gap-2 text-sm">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                      {p.label}
                    </span>
                  </label>
                ))}
              </div>
              {editProviders.length === 0 && (
                <p className="text-xs text-muted-foreground">{t("dashboard.keys.noProvidersHelper")}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProvidersKey(null)} data-testid="button-cancel-edit-providers">
              {t("dashboard.keys.cancel")}
            </Button>
            <Button
              onClick={() => {
                if (editProvidersKey) {
                  updateProvidersMutation.mutate({
                    membershipId: editProvidersKey.membershipId,
                    providers: editProviders,
                  });
                }
              }}
              disabled={updateProvidersMutation.isPending}
              data-testid="button-save-providers"
            >
              {updateProvidersMutation.isPending ? t("dashboard.keys.saving") : t("dashboard.keys.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PersonalKeysView() {
  const { toast } = useToast();
  const { t } = useTranslation();

  const { data: keys, isLoading } = useQuery<any[]>({
    queryKey: ["/api/my-keys"],
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("dashboard.keys.toastKeyCopied") });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-keys-heading">{t("dashboard.keys.auditHeading")}</h1>
        <p className="text-muted-foreground mt-1">{t("dashboard.keys.personalSubheading")}</p>
      </div>

      <ArenaTestKeyCallout />

      <Card className="p-6" data-testid="card-api-access">
        <h2 className="text-base font-semibold mb-4">{t("dashboard.keys.apiAccessHeading")}</h2>
        <div className="p-4 rounded-lg bg-muted/50 flex items-center justify-between gap-2">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{t("dashboard.keys.baseUrlLabel")}</p>
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
          {t("dashboard.keys.apiKeysOnceHelper")}
        </p>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : keys && keys.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t("dashboard.keys.yourKeysHeading")}</h2>
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
                        {t("dashboard.keys.createdOn", { date: new Date(k.createdAt).toLocaleDateString() })}
                      </span>
                      {k.lastUsedAt && (
                        <span className="text-xs text-muted-foreground">
                          {t("dashboard.keys.lastUsedOn", { date: new Date(k.lastUsedAt).toLocaleDateString() })}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
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
                  {k.status === "ACTIVE" && (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      data-testid={`link-setup-tool-${k.id}`}
                    >
                      <a
                        href={`/dashboard/connect?key=${encodeURIComponent(k.id)}`}
                      >
                        <PlugZap className="w-3.5 h-3.5" />
                        {t("connect.keysPageLink")}
                      </a>
                    </Button>
                  )}
                  {k.status === "ACTIVE" && (
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="gap-1.5"
                      data-testid={`button-test-key-arena-${k.id}`}
                    >
                      <a
                        href="/arena"
                        target="_blank"
                        rel="noopener"
                        title={t("dashboard.keys.titleTestArena")}
                      >
                        <Swords className="w-3.5 h-3.5" />
                        {t("dashboard.keys.testInArena")}
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Key className="w-10 h-10 text-muted-foreground" />}
          title={t("dashboard.keys.personalEmptyTitle")}
          description={t("dashboard.keys.personalEmptyDescription")}
        />
      )}

      <Card className="p-5" data-testid="card-security-info">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold">{t("dashboard.keys.securityHeading")}</h3>
        </div>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>{t("dashboard.keys.securityItem1")}</li>
          <li>{t("dashboard.keys.securityItem2")}</li>
          <li>{t("dashboard.keys.securityItem3")}</li>
        </ul>
      </Card>
    </div>
  );
}

function ArenaTestKeyCallout() {
  const { t } = useTranslation();
  return (
    <Card
      className="p-4 flex items-center gap-4 border-l-4 border-l-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20"
      data-testid="card-keys-arena-callout"
    >
      <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 shrink-0">
        <Swords className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-semibold">{t("dashboard.keys.arenaCalloutLead")}</span>{" "}
          <span className="text-muted-foreground">
            {t("dashboard.keys.arenaCalloutBody")}
          </span>
        </p>
      </div>
      <Button
        asChild
        size="sm"
        variant="outline"
        className="shrink-0 gap-1.5 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40"
      >
        <a
          href="/arena"
          target="_blank"
          rel="noopener"
          data-testid="link-keys-arena-callout"
        >
          {t("dashboard.keys.openArena")}
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </Button>
    </Card>
  );
}
