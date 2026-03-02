import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/brand/empty-state";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Package, DollarSign, ExternalLink, Ticket, Clock, Zap } from "lucide-react";
import { useEffect } from "react";

export default function BundlesPage() {
  const { toast } = useToast();

  const { data: bundles, isLoading } = useQuery<any[]>({ queryKey: ["/api/bundles"] });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("purchase") === "success") {
      handlePurchaseSuccess();
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const handlePurchaseSuccess = async () => {
    try {
      await apiRequest("POST", "/api/stripe/handle-success", { type: "voucher_bundle" });
      queryClient.invalidateQueries({ queryKey: ["/api/bundles"] });
      toast({ title: "Bundle purchased!", description: "Your $10 Voucher Bundle is ready. Create voucher codes from it now." });
    } catch (e) {
      toast({ title: "Verifying purchase...", description: "Please refresh the page in a moment." });
    }
  };

  const purchaseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-checkout", { type: "voucher_bundle" });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (err: any) => {
      toast({ title: "Purchase failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-bundles-heading">Voucher Bundles</h1>
          <p className="text-muted-foreground mt-1">Purchase Voucher Bundles for expanded voucher capacity</p>
        </div>
        <Button
          onClick={() => purchaseMutation.mutate()}
          disabled={purchaseMutation.isPending}
          data-testid="button-buy-bundle"
          className="gap-2"
        >
          <DollarSign className="w-4 h-4" />
          {purchaseMutation.isPending ? "Redirecting..." : "Buy Bundle — $10"}
          <ExternalLink className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Card className="p-6">
        <h2 className="text-base font-semibold mb-4">$10 Voucher Bundle</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="text-lg font-bold">$10</p>
            <p className="text-xs text-muted-foreground">one-time</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Redemptions</p>
            <p className="text-lg font-bold">50</p>
            <p className="text-xs text-muted-foreground">pooled across up to 10 codes</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Proxy Requests</p>
            <p className="text-lg font-bold">25,000</p>
            <p className="text-xs text-muted-foreground">shared across all recipients</p>
          </div>
          <div className="p-3 rounded-lg bg-muted/50">
            <p className="text-xs text-muted-foreground">Validity</p>
            <p className="text-lg font-bold">30 days</p>
            <p className="text-xs text-muted-foreground">from purchase</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-3 gap-3 mb-4">
          <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-sm">
            <span className="font-medium text-indigo-700 dark:text-indigo-300">Max budget/recipient:</span>
            <span className="ml-1">$50</span>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-sm">
            <span className="font-medium text-indigo-700 dark:text-indigo-300">Rate limit:</span>
            <span className="ml-1">30 req/min</span>
          </div>
          <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-sm">
            <span className="font-medium text-indigo-700 dark:text-indigo-300">Concurrent:</span>
            <span className="ml-1">2 per recipient</span>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Each bundle gives you a pool of voucher redemptions and proxy requests distributed across up to 10 voucher codes. Available on all plans. The budget for AI usage comes from your connected AI Provider accounts.
        </p>
      </Card>

      {isLoading ? (
        <div className="space-y-4">{[1, 2].map(i => <Skeleton key={i} className="h-32" />)}</div>
      ) : bundles && bundles.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Your Bundles</h2>
          {bundles.map((b: any) => (
            <Card key={b.id} className="p-5" data-testid={`card-bundle-${b.id}`}>
              <div className="flex items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/50 dark:to-indigo-800/30">
                    <Package className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <p className="font-semibold">Voucher Bundle</p>
                    <p className="text-xs text-muted-foreground">
                      Purchased {new Date(b.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Badge
                  variant="secondary"
                  className={`no-default-hover-elevate no-default-active-elevate ${
                    b.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : b.status === "EXHAUSTED"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                  }`}
                >
                  {b.status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-2 rounded bg-muted/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Ticket className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Redemptions</span>
                  </div>
                  <p className="text-sm font-semibold">{b.usedRedemptions}/{b.totalRedemptions}</p>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Proxy Requests</span>
                  </div>
                  <p className="text-sm font-semibold">{b.usedProxyRequests.toLocaleString()}/{b.totalProxyRequests.toLocaleString()}</p>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Package className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Voucher Codes</span>
                  </div>
                  <p className="text-sm font-semibold">{b.voucherCount || 0}/10</p>
                </div>
                <div className="p-2 rounded bg-muted/40">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Expires</span>
                  </div>
                  <p className="text-sm font-semibold">{new Date(b.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Package className="w-10 h-10 text-muted-foreground" />}
          title="No bundles purchased"
          description="Purchase a $10 Voucher Bundle to create vouchers with higher limits, more redemptions, and longer expiry. Available on all plans."
          action={{ label: "Buy Bundle — $10", onClick: () => purchaseMutation.mutate() }}
        />
      )}
    </div>
  );
}
