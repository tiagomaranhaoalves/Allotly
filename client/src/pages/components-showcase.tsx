import { LogoFull, LogoIcon, LogoMono } from "@/components/logo";
import { ProviderBadge } from "@/components/brand/provider-badge";
import { BudgetBar } from "@/components/brand/budget-bar";
import { AdminRoleBadge } from "@/components/brand/role-badge";
import { SpendCard } from "@/components/brand/spend-card";
import { KeyRevealCard } from "@/components/brand/key-reveal-card";
import { VoucherCard } from "@/components/brand/voucher-card";
import { AutomationBadge } from "@/components/brand/automation-badge";
import { FeatureBadge } from "@/components/brand/feature-badge";
import { BundleCard } from "@/components/brand/bundle-card";
import { QRCode } from "@/components/brand/qr-code";
import { EmptyState } from "@/components/brand/empty-state";
import { StatsCard } from "@/components/brand/stats-card";
import { DataTable, type DataTableColumn } from "@/components/brand/data-table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import { DollarSign, Users, Ticket, Package, Sun, Moon, ArrowLeft } from "lucide-react";

const sampleTableData = [
  { name: "Sarah Chen", email: "sarah@acme.com", role: "TEAM_ADMIN", spend: 14500, budget: 20000 },
  { name: "Alex Kim", email: "alex@acme.com", role: "MEMBER", spend: 8200, budget: 10000 },
  { name: "Jordan Lee", email: "jordan@acme.com", role: "MEMBER", spend: 3100, budget: 5000 },
  { name: "Taylor Swift", email: "taylor@acme.com", role: "MEMBER", spend: 19500, budget: 20000 },
  { name: "Morgan Blake", email: "morgan@acme.com", role: "ROOT_ADMIN", spend: 0, budget: 50000 },
];

const tableColumns: DataTableColumn<typeof sampleTableData[0]>[] = [
  { key: "name", header: "Name", sortable: true },
  { key: "email", header: "Email", sortable: true },
  { key: "role", header: "Role", render: (row) => <AdminRoleBadge role={row.role} /> },
  { key: "spend", header: "Spend", sortable: true, render: (row) => `$${(row.spend / 100).toFixed(2)}` },
  { key: "budget", header: "Budget", render: (row) => <BudgetBar spent={row.spend} budget={row.budget} /> },
];

export default function ComponentsShowcase() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="secondary" size="sm" className="gap-1.5" data-testid="button-back-home">
                <ArrowLeft className="w-3.5 h-3.5" /> Home
              </Button>
            </Link>
            <h1 className="text-sm font-bold">Component Showcase</h1>
          </div>
          <Button size="icon" variant="secondary" onClick={toggleTheme} data-testid="button-theme-toggle-showcase">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-12">

        <section data-testid="section-logos">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">Logo Variants</h2>
          <div className="flex flex-wrap items-center gap-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LogoFull (200px)</p>
              <LogoFull size={48} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LogoFull (24px)</p>
              <LogoFull size={24} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LogoIcon</p>
              <LogoIcon size={40} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">LogoIcon (24px)</p>
              <LogoIcon size={24} />
            </div>
            <div className="p-4 bg-neutral-900 rounded-xl space-y-2">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wider">LogoMono (dark bg)</p>
              <LogoMono size={32} className="text-white" />
            </div>
          </div>
        </section>

        <section data-testid="section-provider-badges">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">ProviderBadge</h2>
          <div className="flex flex-wrap items-center gap-6">
            <ProviderBadge provider="OPENAI" />
            <ProviderBadge provider="ANTHROPIC" />
            <ProviderBadge provider="GOOGLE" />
          </div>
        </section>

        <section data-testid="section-budget-bars">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">BudgetBar</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-4 space-y-2">
              <p className="text-sm font-semibold">Green (40%)</p>
              <BudgetBar spent={4000} budget={10000} />
            </Card>
            <Card className="p-4 space-y-2">
              <p className="text-sm font-semibold">Amber (75%)</p>
              <BudgetBar spent={15000} budget={20000} />
            </Card>
            <Card className="p-4 space-y-2">
              <p className="text-sm font-semibold">Red (95%)</p>
              <BudgetBar spent={19000} budget={20000} />
            </Card>
          </div>
        </section>

        <section data-testid="section-role-badges">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">AdminRoleBadge</h2>
          <div className="flex flex-wrap items-center gap-4">
            <AdminRoleBadge role="ROOT_ADMIN" />
            <AdminRoleBadge role="TEAM_ADMIN" />
            <AdminRoleBadge role="MEMBER" />
          </div>
        </section>

        <section data-testid="section-automation-badges">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">AutomationBadge</h2>
          <div className="flex flex-wrap items-center gap-4">
            <AutomationBadge level="FULL_AUTO" />
            <AutomationBadge level="SEMI_AUTO" />
            <AutomationBadge level="GUIDED" />
          </div>
        </section>

        <section data-testid="section-feature-badges">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">FeatureBadge</h2>
          <div className="flex flex-wrap items-center gap-4">
            <FeatureBadge type="TEAMS" />
            <FeatureBadge type="VOUCHERS" />
          </div>
        </section>

        <section data-testid="section-stats-cards">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">StatsCard</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatsCard title="Total Spend" value="$1,247.50" change={12} icon={<DollarSign className="w-5 h-5" />} />
            <StatsCard title="Active Members" value="23" change={-5} icon={<Users className="w-5 h-5" />} />
            <StatsCard title="Active Vouchers" value="8" icon={<Ticket className="w-5 h-5" />} />
            <StatsCard title="Bundles" value="3" change={0} icon={<Package className="w-5 h-5" />} />
          </div>
        </section>

        <section data-testid="section-spend-cards">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">SpendCard</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <SpendCard provider="OPENAI" amountCents={82300} trend={12} />
            <SpendCard provider="ANTHROPIC" amountCents={31200} trend={-8} />
            <SpendCard provider="GOOGLE" amountCents={11200} />
          </div>
        </section>

        <section data-testid="section-key-reveal">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">KeyRevealCard</h2>
          <div className="max-w-xl space-y-4">
            <p className="text-sm text-muted-foreground">Masked (click eye to reveal)</p>
            <KeyRevealCard keyValue="allotly_sk_test_abc123def456ghi789jkl012mno345pqr678stu901vwx234" masked={true} />
            <p className="text-sm text-muted-foreground">Revealed with warning</p>
            <KeyRevealCard keyValue="allotly_sk_live_abc123def456ghi789jkl012mno345pqr678stu901vwx234" masked={false} />
          </div>
        </section>

        <section data-testid="section-voucher-cards">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">VoucherCard</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <VoucherCard
              code="ALLOT-K3M7-R9P2-X4T6"
              status="ACTIVE"
              budgetCents={2500}
              spentCents={800}
              label="AI Workshop March 2026"
              expiresAt="2026-03-15T00:00:00Z"
              redemptions={12}
              maxRedemptions={20}
            />
            <VoucherCard
              code="ALLOT-H5N8-Q2W6-Y7J3"
              status="FULLY_REDEEMED"
              budgetCents={1000}
              spentCents={1000}
              label="Hackathon Pass"
              expiresAt="2026-02-28T00:00:00Z"
              redemptions={5}
              maxRedemptions={5}
            />
            <VoucherCard
              code="ALLOT-B4D9-F6G1-L8V5"
              status="EXPIRED"
              budgetCents={5000}
              spentCents={2200}
              expiresAt="2026-01-15T00:00:00Z"
              redemptions={3}
              maxRedemptions={10}
            />
            <VoucherCard
              code="ALLOT-C2E7-J3M4-P9S6"
              status="REVOKED"
              budgetCents={500}
              spentCents={150}
              label="Cancelled Trial"
              redemptions={1}
              maxRedemptions={2}
            />
          </div>
        </section>

        <section data-testid="section-bundle-cards">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">BundleCard</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <BundleCard
              id="bundle-1"
              totalRedemptions={50}
              usedRedemptions={18}
              totalProxyRequests={25000}
              usedProxyRequests={7500}
              maxBudgetPerRecipientCents={5000}
              expiresAt="2026-04-01T00:00:00Z"
              status="ACTIVE"
            />
            <BundleCard
              id="bundle-2"
              totalRedemptions={50}
              usedRedemptions={50}
              totalProxyRequests={25000}
              usedProxyRequests={24800}
              maxBudgetPerRecipientCents={5000}
              expiresAt="2026-02-15T00:00:00Z"
              status="EXHAUSTED"
            />
          </div>
        </section>

        <section data-testid="section-qr-code">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">QRCode</h2>
          <div className="flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">200px</p>
              <QRCode value="https://allotly.com/redeem?code=ALLOT-K3M7-R9P2-X4T6" size={200} />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">120px</p>
              <QRCode value="https://allotly.com/redeem?code=ALLOT-K3M7-R9P2-X4T6" size={120} />
            </div>
          </div>
        </section>

        <section data-testid="section-empty-state">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">EmptyState</h2>
          <Card>
            <EmptyState
              icon={<Ticket className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />}
              title="No vouchers yet"
              description="Create your first voucher to start distributing AI access to your team or external users."
              action={{ label: "Create Voucher", onClick: () => {} }}
            />
          </Card>
        </section>

        <section data-testid="section-data-table">
          <h2 className="text-xl font-bold mb-4 pb-2 border-b">DataTable</h2>
          <DataTable
            data={sampleTableData}
            columns={tableColumns}
            searchable
            searchPlaceholder="Search members..."
            searchKeys={["name", "email"]}
            pageSize={3}
          />
        </section>
      </main>
    </div>
  );
}
