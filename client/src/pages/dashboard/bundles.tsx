import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/brand/empty-state";
import { Package, DollarSign } from "lucide-react";

export default function BundlesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Bundles</h1>
          <p className="text-muted-foreground mt-1">Purchase External Access Bundles for additional voucher capacity</p>
        </div>
        <Button data-testid="button-buy-bundle">
          <DollarSign className="w-4 h-4 mr-1.5" />
          Buy Bundle — $10
        </Button>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold mb-4">External Access Bundle</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="text-lg font-bold">$10</p>
            <p className="text-xs text-muted-foreground">one-time</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Redemptions</p>
            <p className="text-lg font-bold">50</p>
            <p className="text-xs text-muted-foreground">pooled</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Proxy Requests</p>
            <p className="text-lg font-bold">25,000</p>
            <p className="text-xs text-muted-foreground">pooled</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Validity</p>
            <p className="text-lg font-bold">30 days</p>
            <p className="text-xs text-muted-foreground">from purchase</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Each bundle gives you a pool of voucher redemptions and proxy requests that can be distributed across up to 10 voucher codes. The budget for AI usage comes from your connected provider accounts.
        </p>
      </Card>

      <EmptyState
        icon={<Package className="w-10 h-10 text-muted-foreground" />}
        title="No bundles purchased"
        description="Purchase an External Access Bundle to create vouchers with higher limits"
        action={{ label: "Buy Bundle — $10", onClick: () => {} }}
      />
    </div>
  );
}
