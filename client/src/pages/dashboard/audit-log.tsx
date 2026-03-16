import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Shield, Download, ChevronLeft, ChevronRight, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

const ACTION_COLORS: Record<string, string> = {
  "org.created": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "provider.connected": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "provider.disconnected": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "provider.validated": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "provider.validation_failed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "provider.key_rotated": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "provider.test_connection": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "team.created": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "team.removed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "member.created": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "member.updated": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "member.suspended": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "member.reactivated": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "member.removed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "member.transferred": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "member.role_changed": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "key.provisioned": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "key.revoked": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "key.regenerated": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "key.bulk_revoked": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "voucher.created": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "voucher.redeemed": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "voucher.revoked": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "voucher.expired": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "voucher.extended": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "voucher.topped_up": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "voucher.bulk_created": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "voucher.bulk_revoked": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "bundle.purchased": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bundle.expired": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "budget.period_reset": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "budget.manual_reset": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  "budget.credit": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "budget.reset_reactivated": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "budget.exhausted": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "plan.upgraded": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "plan.downgraded": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "settings.updated": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "spend.anomaly_detected": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "billing.payment_failed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const ACTION_LABELS: Record<string, string> = {
  "org.created": "Organization Created",
  "provider.connected": "Provider Connected",
  "provider.disconnected": "Provider Disconnected",
  "provider.validated": "Provider Validated",
  "provider.validation_failed": "Provider Validation Failed",
  "provider.key_rotated": "Provider Key Rotated",
  "provider.test_connection": "Provider Test Connection",
  "team.created": "Team Created",
  "team.removed": "Team Removed",
  "member.created": "Member Added",
  "member.updated": "Member Updated",
  "member.suspended": "Member Suspended",
  "member.reactivated": "Member Reactivated",
  "member.removed": "Member Removed",
  "member.transferred": "Member Transferred",
  "member.role_changed": "Role Changed",
  "key.provisioned": "API Key Provisioned",
  "key.revoked": "API Key Revoked",
  "key.regenerated": "API Key Regenerated",
  "key.bulk_revoked": "Keys Bulk Revoked",
  "voucher.created": "Voucher Created",
  "voucher.redeemed": "Voucher Redeemed",
  "voucher.revoked": "Voucher Revoked",
  "voucher.expired": "Voucher Expired",
  "voucher.extended": "Voucher Extended",
  "voucher.topped_up": "Voucher Topped Up",
  "voucher.bulk_created": "Vouchers Bulk Created",
  "voucher.bulk_revoked": "Vouchers Bulk Revoked",
  "bundle.purchased": "Bundle Purchased",
  "bundle.expired": "Bundle Expired",
  "budget.period_reset": "Budget Period Reset",
  "budget.manual_reset": "Budget Manual Reset",
  "budget.credit": "Budget Credit Applied",
  "budget.reset_reactivated": "Budget Reset & Reactivated",
  "budget.exhausted": "Budget Exhausted",
  "plan.upgraded": "Plan Upgraded",
  "plan.downgraded": "Plan Downgraded",
  "settings.updated": "Settings Updated",
  "spend.anomaly_detected": "Spend Anomaly Detected",
  "billing.payment_failed": "Payment Failed",
};

const ACTION_CATEGORIES: Record<string, string[]> = {
  "Organization": ["org.created", "settings.updated"],
  "Providers": ["provider.connected", "provider.disconnected", "provider.validated", "provider.validation_failed", "provider.key_rotated", "provider.test_connection"],
  "Teams": ["team.created", "team.removed"],
  "Members": ["member.created", "member.updated", "member.suspended", "member.reactivated", "member.removed", "member.transferred", "member.role_changed"],
  "API Keys": ["key.provisioned", "key.revoked", "key.regenerated", "key.bulk_revoked"],
  "Vouchers": ["voucher.created", "voucher.redeemed", "voucher.revoked", "voucher.expired", "voucher.extended", "voucher.topped_up", "voucher.bulk_created", "voucher.bulk_revoked"],
  "Bundles": ["bundle.purchased", "bundle.expired"],
  "Budget": ["budget.period_reset", "budget.manual_reset", "budget.credit", "budget.reset_reactivated", "budget.exhausted"],
  "Billing": ["plan.upgraded", "plan.downgraded", "billing.payment_failed", "spend.anomaly_detected"],
};

const ALL_ACTIONS = Object.values(ACTION_CATEGORIES).flat();
const TARGET_TYPES = ["organization", "team", "team_membership", "provider_connection", "voucher", "voucher_bundle", "allotly_api_key"];

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function MetadataDetail({ label, value }: { label: string; value: any }) {
  if (value === undefined || value === null) return null;
  let display = value;
  if (typeof value === "boolean") display = value ? "Yes" : "No";
  else if (typeof value === "number" && (label.toLowerCase().includes("cent") || label.toLowerCase().includes("spend") || label.toLowerCase().includes("budget") || label.toLowerCase().includes("amount")))
    display = formatCents(value);
  else if (typeof value === "object") display = JSON.stringify(value, null, 2);
  else display = String(value);

  return (
    <div className="flex justify-between items-start gap-4 py-1">
      <span className="text-xs text-muted-foreground shrink-0">{label.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase()).trim()}</span>
      <span className="text-xs font-mono text-right break-all">{display}</span>
    </div>
  );
}

function ExpandedMetadata({ metadata, action }: { metadata: Record<string, any>; action: string }) {
  if (action === "member.updated" && metadata.changes) {
    const changes = metadata.changes as Record<string, { from: any; to: any }>;
    return (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Changes</p>
        {Object.entries(changes).map(([field, change]) => (
          <div key={field} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground min-w-[120px]">{field.replace(/([A-Z])/g, " $1").trim()}</span>
            <span className="font-mono text-red-500 dark:text-red-400 line-through">
              {typeof change.from === "object" ? JSON.stringify(change.from) : String(change.from ?? "—")}
            </span>
            <span className="text-muted-foreground">→</span>
            <span className="font-mono text-emerald-600 dark:text-emerald-400">
              {typeof change.to === "object" ? JSON.stringify(change.to) : String(change.to ?? "—")}
            </span>
          </div>
        ))}
      </div>
    );
  }

  const entries = Object.entries(metadata).filter(([_, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return null;

  return (
    <div className="space-y-0.5 divide-y divide-border/50">
      {entries.map(([key, val]) => (
        <MetadataDetail key={key} label={key} value={val} />
      ))}
    </div>
  );
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const limit = 50;

  const queryParams = new URLSearchParams();
  queryParams.set("page", String(page));
  queryParams.set("limit", String(limit));
  if (actionFilter) queryParams.set("action", actionFilter);
  if (targetTypeFilter) queryParams.set("targetType", targetTypeFilter);
  if (actorFilter) queryParams.set("actorId", actorFilter);
  if (startDate) queryParams.set("startDate", startDate);
  if (endDate) queryParams.set("endDate", endDate);

  const { data, isLoading } = useQuery<{ logs: any[]; total: number }>({
    queryKey: ["/api/audit-log", actionFilter, targetTypeFilter, actorFilter, startDate, endDate, page],
    queryFn: async () => {
      const res = await fetch(`/api/audit-log?${queryParams.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    enabled: user?.orgRole === "ROOT_ADMIN",
  });

  const { data: actors } = useQuery<any[]>({
    queryKey: ["/api/audit-log/actors"],
    enabled: user?.orgRole === "ROOT_ADMIN",
  });

  const actorMap = new Map((actors || []).map((a: any) => [a.id, a]));
  const logs = data?.logs || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    const params = new URLSearchParams();
    if (actionFilter) params.set("action", actionFilter);
    if (targetTypeFilter) params.set("targetType", targetTypeFilter);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    window.open(`/api/audit-log/export?${params.toString()}`, "_blank");
  };

  const clearFilters = () => {
    setActionFilter("");
    setTargetTypeFilter("");
    setActorFilter("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasFilters = !!(actionFilter || targetTypeFilter || actorFilter || startDate || endDate);

  if (user?.orgRole !== "ROOT_ADMIN") {
    return (
      <EmptyState
        icon={<Shield className="w-8 h-8 text-muted-foreground" />}
        title="Access Restricted"
        description="Only Root Admins can view the audit log"
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-audit-log-title">Audit Log</h1>
          <p className="text-muted-foreground mt-1">Complete history of organization actions ({total} entries)</p>
        </div>
        <Button variant="outline" onClick={handleExport} className="gap-2" data-testid="button-export-csv">
          <Download className="w-4 h-4" />
          Export CSV
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filters</span>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs ml-auto" data-testid="button-clear-filters">
              Clear all
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger data-testid="select-action-filter">
              <SelectValue placeholder="Action type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              {Object.entries(ACTION_CATEGORIES).map(([category, actions]) => (
                <div key={category}>
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{category}</div>
                  {actions.map(a => (
                    <SelectItem key={a} value={a}>{ACTION_LABELS[a] || a}</SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>
          <Select value={targetTypeFilter} onValueChange={(v) => { setTargetTypeFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger data-testid="select-target-filter">
              <SelectValue placeholder="Target type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All targets</SelectItem>
              {TARGET_TYPES.map(t => (
                <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={actorFilter} onValueChange={(v) => { setActorFilter(v === "all" ? "" : v); setPage(1); }}>
            <SelectTrigger data-testid="select-actor-filter">
              <SelectValue placeholder="Actor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actors</SelectItem>
              <SelectItem value="system">System</SelectItem>
              {(actors || []).filter((a: any) => a.id !== "system").map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name || a.id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="date"
            value={startDate}
            onChange={e => { setStartDate(e.target.value); setPage(1); }}
            placeholder="Start date"
            data-testid="input-start-date"
          />
          <Input
            type="date"
            value={endDate}
            onChange={e => { setEndDate(e.target.value); setPage(1); }}
            placeholder="End date"
            data-testid="input-end-date"
          />
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : logs.length > 0 ? (
        <Card className="divide-y divide-border">
          {logs.map((log: any) => {
            const actor = actorMap.get(log.actorId);
            const actorName = log.actorId === "system" ? "System" : (actor?.name || log.actorId);
            const actorRole = log.actorId === "system" ? "SYSTEM" : (actor?.role || "");
            const metadata = log.metadata as Record<string, any> | null;
            const isExpanded = expandedIds.has(log.id);
            const hasMetadata = metadata && Object.keys(metadata).length > 0;

            return (
              <div
                key={log.id}
                className={`p-4 transition-colors ${hasMetadata ? "cursor-pointer hover:bg-muted/30" : ""}`}
                onClick={() => hasMetadata && toggleExpand(log.id)}
                data-testid={`row-audit-${log.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Badge
                      variant="secondary"
                      className={`${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"} no-default-hover-elevate no-default-active-elevate text-xs shrink-0`}
                    >
                      {ACTION_LABELS[log.action] || log.action}
                    </Badge>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{actorName}</span>
                        {actorRole && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">
                            {actorRole}
                          </Badge>
                        )}
                      </div>
                      {log.targetType && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {log.targetType.replace(/_/g, " ")}
                          {log.targetId && ` · ${log.targetId.slice(0, 8)}...`}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <time className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </time>
                    {hasMetadata && (
                      isExpanded
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
                {isExpanded && hasMetadata && (
                  <div className="mt-3 ml-0 p-3 bg-muted/30 rounded-md border border-border/50" onClick={e => e.stopPropagation()}>
                    <ExpandedMetadata metadata={metadata} action={log.action} />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          icon={<FileText className="w-10 h-10 text-muted-foreground" />}
          title="No audit entries found"
          description={hasFilters ? "Try adjusting your filters" : "Admin actions will be logged here"}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages} ({total} total entries)
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              data-testid="button-prev-page"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              data-testid="button-next-page"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
