import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Shield, Download, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

const ACTION_COLORS: Record<string, string> = {
  "org.created": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "provider.connected": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "provider.disconnected": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "provider.validated": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "provider.validation_failed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "team.created": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "team.removed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "member.created": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "member.suspended": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "member.reactivated": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "member.removed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "key.provisioned": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "key.revoked": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "voucher.created": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "voucher.redeemed": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "voucher.revoked": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "voucher.expired": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "bundle.purchased": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "bundle.expired": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "budget.reset_reactivated": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "budget.exhausted": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "plan.upgraded": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "plan.downgraded": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  "settings.updated": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "spend.anomaly_detected": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "billing.payment_failed": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const ALL_ACTIONS = [
  "org.created", "provider.connected", "provider.disconnected", "provider.validated", "provider.validation_failed",
  "team.created", "team.removed", "member.created", "member.suspended", "member.reactivated", "member.removed",
  "key.provisioned", "key.revoked", "voucher.created", "voucher.redeemed", "voucher.revoked", "voucher.expired",
  "bundle.purchased", "bundle.expired", "budget.reset_reactivated", "budget.period_reset", "budget.exhausted",
  "usage.limit_reached", "usage.limit_enforced", "plan.upgraded", "plan.downgraded", "plan.seats_updated",
  "settings.updated", "spend.anomaly_detected", "billing.payment_failed",
];

const TARGET_TYPES = ["organization", "team", "team_membership", "provider_connection", "voucher", "voucher_bundle", "allotly_api_key"];

export default function AuditLogPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
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
          {(actionFilter || targetTypeFilter || actorFilter || startDate || endDate) && (
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
              {ALL_ACTIONS.map(a => (
                <SelectItem key={a} value={a}>{a}</SelectItem>
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
              {(actors || []).map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name || a.email || a.id}</SelectItem>
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

            return (
              <div key={log.id} className="p-4" data-testid={`row-audit-${log.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <Badge
                      variant="secondary"
                      className={`${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"} no-default-hover-elevate no-default-active-elevate text-xs shrink-0`}
                    >
                      {log.action}
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
                      {metadata && Object.keys(metadata).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1 font-mono truncate max-w-[400px]">
                          {Object.entries(metadata).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                  <time className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </time>
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState
          icon={<FileText className="w-10 h-10 text-muted-foreground" />}
          title="No audit entries found"
          description={actionFilter || targetTypeFilter ? "Try adjusting your filters" : "Admin actions will be logged here"}
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
