import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Users, Activity, Clock } from "lucide-react";

interface BundleCardProps {
  id: string;
  totalRedemptions: number;
  usedRedemptions: number;
  totalProxyRequests: number;
  usedProxyRequests: number;
  maxBudgetPerRecipientCents: number;
  expiresAt: string;
  status: string;
  className?: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: "Active", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  EXHAUSTED: { label: "Exhausted", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  EXPIRED: { label: "Expired", className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
};

function ProgressBar({ used, total, label }: { used: number; total: number; label: string }) {
  const percent = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = percent >= 90 ? "bg-red-500" : percent >= 60 ? "bg-amber-500" : "bg-emerald-500";

  return (
    <div data-testid={`bundle-progress-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className="text-xs font-semibold">{used.toLocaleString()} / {total.toLocaleString()}</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function BundleCard({ id, totalRedemptions, usedRedemptions, totalProxyRequests, usedProxyRequests, maxBudgetPerRecipientCents, expiresAt, status, className = "" }: BundleCardProps) {
  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;
  const daysLeft = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
  const isExpired = new Date(expiresAt) < new Date();

  return (
    <Card className={`p-5 ${className}`} data-testid={`bundle-card-${id}`}>
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/40 dark:to-indigo-800/20">
            <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <p className="text-sm font-bold">Voucher Bundle</p>
            <p className="text-xs text-muted-foreground">${(maxBudgetPerRecipientCents / 100).toFixed(0)} max per recipient</p>
          </div>
        </div>
        <Badge variant="secondary" className={`${statusConfig.className} no-default-hover-elevate no-default-active-elevate`}>
          {statusConfig.label}
        </Badge>
      </div>

      <div className="space-y-3 mb-4">
        <ProgressBar used={usedRedemptions} total={totalRedemptions} label="Redemptions" />
        <ProgressBar used={usedProxyRequests} total={totalProxyRequests} label="Proxy Requests" />
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground pt-3 border-t">
        <span className="flex items-center gap-1">
          <Users className="w-3.5 h-3.5" />
          {totalRedemptions - usedRedemptions} remaining
        </span>
        <span className="flex items-center gap-1">
          <Activity className="w-3.5 h-3.5" />
          {(totalProxyRequests - usedProxyRequests).toLocaleString()} req left
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3.5 h-3.5" />
          {isExpired ? "Expired" : `${daysLeft}d left`}
        </span>
      </div>
    </Card>
  );
}
