import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { Badge } from "@/components/ui/badge";
import { FileText, Shield } from "lucide-react";
import { useAuth } from "@/lib/auth";

const ACTION_COLORS: Record<string, string> = {
  "org.created": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  "provider.connected": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "provider.disconnected": "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  "team.created": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "member.created": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  "voucher.created": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export default function AuditLogPage() {
  const { user } = useAuth();
  const { data: logs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-log"],
    enabled: user?.orgRole === "ROOT_ADMIN",
  });

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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Log</h1>
        <p className="text-muted-foreground mt-1">Complete history of organization actions</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-16" />)}</div>
      ) : logs && logs.length > 0 ? (
        <Card className="divide-y">
          {logs.map((log: any) => (
            <div key={log.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Badge variant="secondary" className={`${ACTION_COLORS[log.action] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"} no-default-hover-elevate no-default-active-elevate text-xs`}>
                  {log.action}
                </Badge>
                <div>
                  {log.targetType && (
                    <p className="text-xs text-muted-foreground">{log.targetType}</p>
                  )}
                </div>
              </div>
              <time className="text-xs text-muted-foreground shrink-0">
                {new Date(log.createdAt).toLocaleString()}
              </time>
            </div>
          ))}
        </Card>
      ) : (
        <EmptyState
          icon={<FileText className="w-10 h-10 text-muted-foreground" />}
          title="No audit entries yet"
          description="Actions taken in your organization will appear here"
        />
      )}
    </div>
  );
}
