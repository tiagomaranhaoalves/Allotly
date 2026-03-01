import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { BudgetBar } from "./budget-bar";

interface VoucherCardProps {
  code: string;
  status: string;
  budgetCents: number;
  spentCents?: number;
  label?: string;
  expiresAt?: string;
  redemptions?: number;
  maxRedemptions?: number;
  className?: string;
}

const STATUS_CONFIG: Record<string, { className: string }> = {
  ACTIVE: { className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  EXPIRED: { className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  FULLY_REDEEMED: { className: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  REVOKED: { className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
};

export function VoucherCard({ code, status, budgetCents, spentCents = 0, label, expiresAt, redemptions, maxRedemptions, className = "" }: VoucherCardProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusConfig = STATUS_CONFIG[status] || STATUS_CONFIG.ACTIVE;

  return (
    <Card className={`p-4 ${className}`} data-testid={`voucher-card-${code}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          {label && <p className="text-sm font-medium mb-1">{label}</p>}
          <button onClick={copy} className="inline-flex items-center gap-1.5 group" data-testid="button-copy-voucher">
            <code className="font-mono text-sm font-medium text-primary tracking-wide">{code}</code>
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
          </button>
        </div>
        <Badge variant="secondary" className={`${statusConfig.className} no-default-hover-elevate no-default-active-elevate`}>
          {status.replace("_", " ")}
        </Badge>
      </div>
      <BudgetBar spent={spentCents} budget={budgetCents} className="mb-2" />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {redemptions !== undefined && maxRedemptions !== undefined && (
          <span>{redemptions}/{maxRedemptions} redeemed</span>
        )}
        {expiresAt && (
          <span>Expires {new Date(expiresAt).toLocaleDateString()}</span>
        )}
      </div>
    </Card>
  );
}
