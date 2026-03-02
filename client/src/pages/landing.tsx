import { LogoFull, LogoMono } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import {
  Key, Ticket, Shield, Zap, BarChart3, Users, Check,
  Sun, Moon, ArrowRight, Lock, Eye, Gauge, Code, Layers,
  Sparkles, Globe, ChevronRight,
} from "lucide-react";
import { useState } from "react";

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="secondary" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" data-testid="link-logo">
            <LogoFull size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#features" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-features">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">How It Works</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">Pricing</a>
            <Link href="/docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-docs">Docs</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="secondary" size="sm" data-testid="button-login">Log in</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm" className="gap-1.5" data-testid="button-get-started">
              Get Started Free <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/60 dark:from-indigo-950/40 dark:via-background dark:to-cyan-950/20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-indigo-400/10 to-transparent dark:from-indigo-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[400px] bg-gradient-radial from-cyan-400/8 to-transparent dark:from-cyan-500/4 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-32 lg:pb-36">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <div className="space-y-8">
            <div>
              <Badge variant="secondary" className="mb-6 no-default-hover-elevate no-default-active-elevate px-3 py-1.5 text-xs font-medium">
                <Sparkles className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                Now supporting OpenAI, Anthropic & Google
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-extrabold tracking-tight leading-[1.08]">
                One Dashboard.{" "}
                <span className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                  Every Model.
                </span>
                <br />
                <span className="text-3xl sm:text-4xl lg:text-[2.75rem]">Easy Compute Vouchers.</span>
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
                Manage OpenAI, Anthropic, and Google from one place. Set budgets, distribute vouchers, and never lose control of your AI spend.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="gap-2 px-6 h-12 text-[15px] font-semibold" data-testid="button-hero-start">
                  Start Free <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="lg" className="h-12 px-6 text-[15px]" data-testid="button-hero-learn">
                  See How It Works
                </Button>
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> 5 members free</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> AES-256 encryption</span>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-1.5 shadow-2xl">
              <div className="rounded-xl bg-background p-5 space-y-5">
                <div className="flex items-center justify-between gap-2 pb-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
                      <BarChart3 className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Organization Spend</p>
                      <p className="text-xs text-muted-foreground">Current billing period</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold tracking-tight">$1,247</p>
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">-12% vs last month</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "OpenAI", amount: "$823", color: "#10A37F", percent: 66 },
                    { label: "Anthropic", amount: "$312", color: "#D4A574", percent: 25 },
                    { label: "Google", amount: "$112", color: "#4285F4", percent: 9 },
                  ].map(p => (
                    <div key={p.label} className="p-3 rounded-xl bg-muted/40 border border-border/40">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: p.color }} />
                        <span className="text-xs font-medium">{p.label}</span>
                      </div>
                      <p className="text-base font-bold">{p.amount}</p>
                      <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${p.percent}%`, backgroundColor: p.color, opacity: 0.8 }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  {[
                    { name: "Sarah Chen", role: "Direct", spent: 145, budget: 200 },
                    { name: "Workshop Attendee", role: "Voucher", spent: 18, budget: 25 },
                    { name: "Dev Team Bot", role: "Direct", spent: 89, budget: 150 },
                  ].map(m => (
                    <div key={m.name} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border border-border/30">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/60 dark:to-indigo-800/60 flex items-center justify-center text-xs font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                        {m.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold truncate">{m.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${m.role === "Direct" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300" : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300"}`}>
                            {m.role}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full mt-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${(m.spent / m.budget) > 0.8 ? "bg-amber-500" : "bg-emerald-500"}`}
                            style={{ width: `${(m.spent / m.budget) * 100}%` }}
                          />
                        </div>
                      </div>
                      <span className="text-xs font-mono font-medium text-muted-foreground">${m.spent}<span className="text-muted-foreground/60">/${m.budget}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -z-10 -top-6 -right-6 w-80 h-80 bg-gradient-to-br from-indigo-400/15 to-cyan-400/15 rounded-full blur-3xl" />
            <div className="absolute -z-10 -bottom-4 -left-4 w-60 h-60 bg-gradient-to-tr from-indigo-500/10 to-purple-400/10 rounded-full blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-24 lg:py-32 border-t bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge variant="secondary" className="mb-4 no-default-hover-elevate no-default-active-elevate text-xs font-medium">
            <Zap className="w-3 h-3 mr-1" />
            Two Approaches
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Internal Teams. External Users. One Control Plane.</h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-3xl mx-auto">
            Allotly Teams gives your people direct API access with built-in budgets. Allotly Vouchers lets you distribute AI access to anyone — no accounts, no long-term commitments.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          <Card className="p-8 lg:p-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-indigo-500/5 to-transparent rounded-full -translate-y-10 translate-x-10" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/50 dark:to-indigo-800/30 shadow-sm">
                  <Key className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Allotly Teams</h3>
                  <p className="text-sm text-muted-foreground">No-Proxy · Direct Provider Access</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-2">Direct Provider Access with Guardrails</p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Your team calls OpenAI, Anthropic, and Gemini directly — no proxy sitting between them and the model. Allotly provisions scoped API keys at the provider level, so you get full control without adding latency or a single point of failure.
              </p>
              <div className="flex flex-wrap gap-x-3 gap-y-2 mb-6">
                {[
                  "Zero added latency",
                  "Keys work even if Allotly is offline",
                  "Budget tracking via provider usage polling",
                  "Model-level access restrictions",
                ].map(item => (
                  <span key={item} className="flex items-center gap-1.5 text-sm">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    {item}
                  </span>
                ))}
              </div>
              <div className="pt-5 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ideal for</p>
                <div className="flex flex-wrap gap-2">
                  {["Engineering teams", "R&D", "Internal governance", "Dev workflows"].map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 font-medium">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-8 lg:p-10 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-40 h-40 bg-gradient-to-bl from-cyan-500/5 to-transparent rounded-full -translate-y-10 translate-x-10" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/50 dark:to-cyan-800/30 shadow-sm">
                  <Ticket className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Allotly Vouchers</h3>
                  <p className="text-sm text-muted-foreground">Thin Proxy · Instant Access Codes</p>
                </div>
              </div>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Create voucher codes that give anyone instant AI access with hard budget limits. Recipients call one unified API that works with all providers. Real-time per-request metering.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "One API key, all providers",
                  "Hard per-request budget enforcement",
                  "No provider accounts needed",
                  "Shareable codes with QR",
                  "Works with any OpenAI SDK",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mt-0.5 shrink-0">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-5 border-t">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Ideal for</p>
                <div className="flex flex-wrap gap-2">
                  {["Hackathons", "Workshops", "Contractors", "Agencies", "Partners"].map(tag => (
                    <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-cyan-50 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300 font-medium">{tag}</span>
                  ))}
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const [activeTab, setActiveTab] = useState<"teams" | "vouchers">("teams");

  const steps = {
    teams: [
      { icon: <Layers className="w-6 h-6" />, title: "Connect", description: "Link your AI provider accounts. Keys encrypted with AES-256-GCM at rest. Supports OpenAI, Anthropic, and Google.", color: "from-indigo-500 to-indigo-600" },
      { icon: <Users className="w-6 h-6" />, title: "Allocate", description: "Create teams, set per-member budgets, choose allowed models. Members get scoped provider keys automatically.", color: "from-violet-500 to-violet-600" },
      { icon: <BarChart3 className="w-6 h-6" />, title: "Monitor", description: "Unified dashboard with real-time spend tracking. Automatic alerts at 80% and key revocation at 100%.", color: "from-cyan-500 to-cyan-600" },
    ],
    vouchers: [
      { icon: <Ticket className="w-6 h-6" />, title: "Create", description: "Generate voucher codes with budget limits and model restrictions. Share via link, QR code, or email.", color: "from-cyan-500 to-cyan-600" },
      { icon: <Code className="w-6 h-6" />, title: "Redeem", description: "Recipients scan the code and get an API key instantly. No provider account needed. Works with any OpenAI SDK.", color: "from-indigo-500 to-indigo-600" },
      { icon: <Gauge className="w-6 h-6" />, title: "Control", description: "Real-time per-request spend tracking. Hard budget enforcement with automatic token clamping. Auto-expiry.", color: "from-violet-500 to-violet-600" },
    ],
  };

  return (
    <section id="how-it-works" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">How It Works</h2>
          <p className="mt-4 text-lg text-muted-foreground">Three steps to AI spend control.</p>
        </div>
        <div className="flex justify-center mb-14">
          <div className="inline-flex rounded-xl bg-muted/60 p-1 border border-border/50">
            <button
              onClick={() => setActiveTab("teams")}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "teams" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-tab-teams"
            >
              <Key className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Teams
            </button>
            <button
              onClick={() => setActiveTab("vouchers")}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "vouchers" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              data-testid="button-tab-vouchers"
            >
              <Ticket className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Vouchers
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {steps[activeTab].map((step, i) => (
            <div key={step.title} className="text-center group">
              <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br ${step.color} text-white mb-6 shadow-lg shadow-indigo-500/10 dark:shadow-none`}>
                {step.icon}
              </div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-xs font-bold text-white bg-gradient-to-br from-indigo-500 to-indigo-600 w-6 h-6 rounded-full flex items-center justify-center shadow-sm">{i + 1}</span>
                <h3 className="text-lg font-bold">{step.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="py-24 lg:py-28 border-t bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-extrabold tracking-tight">Your Data Stays Private</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto text-lg">
            Your prompts and responses stay between you and the AI provider. Always.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: <Shield className="w-6 h-6" />, title: "AES-256-GCM Encryption", desc: "Provider API keys encrypted at rest with military-grade encryption. Keys never leave our secure vault.", gradient: "from-indigo-500 to-indigo-600" },
            { icon: <Eye className="w-6 h-6" />, title: "Zero Data Retention", desc: "Proxy processes requests in-flight only. Never stored, never logged, never persisted. Your data is yours.", gradient: "from-violet-500 to-violet-600" },
            { icon: <Lock className="w-6 h-6" />, title: "GDPR-Compliant", desc: "Designed for data protection compliance from day one. Full audit trail with granular access controls.", gradient: "from-cyan-500 to-cyan-600" },
          ].map(item => (
            <Card key={item.title} className="p-7 text-center relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-gradient-to-b from-indigo-500/3 to-transparent rounded-full -translate-y-16" />
              <div className="relative">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} text-white mb-5 shadow-lg shadow-indigo-500/10 dark:shadow-none`}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-base mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function PricingSection() {
  const plans = [
    {
      name: "Free",
      price: "$0",
      period: "/month",
      description: "For individuals getting started",
      features: [
        "1 Root Admin (acts as Team Admin)",
        "Up to 5 direct members",
        "1 provider connection",
        "Usage polling every 60 min",
        "7-day data retention",
        "1 voucher code, 2 redemptions",
      ],
      cta: "Start Free",
      popular: false,
    },
    {
      name: "Team",
      price: "$20",
      period: "/mo per Team Admin",
      description: "For growing teams with multiple admins",
      features: [
        "1 Root Admin (free) + 10 Team Admins",
        "Up to 20 members per team",
        "3 provider connections",
        "15-minute usage polling",
        "90-day retention + audit log",
        "5 voucher codes per admin",
        "Phase 2 analytics",
        "$10 External Access Bundles",
      ],
      cta: "Start Free Trial",
      popular: true,
    },
    {
      name: "Enterprise",
      price: "Custom",
      period: "",
      description: "For organizations at scale",
      features: [
        "Unlimited everything",
        "5-minute polling",
        "1-year data retention",
        "SSO + dedicated support",
        "Custom voucher limits",
        "Priority API access",
        "SLA guarantee",
      ],
      cta: "Contact Sales",
      popular: false,
    },
  ];

  return (
    <section id="pricing" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Simple, Transparent Pricing</h2>
          <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you need more.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map(plan => (
            <Card key={plan.name} className={`p-7 lg:p-8 relative flex flex-col ${plan.popular ? "ring-2 ring-primary shadow-xl shadow-indigo-500/5 dark:shadow-none" : ""}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="no-default-hover-elevate no-default-active-elevate shadow-sm px-3 py-0.5 text-xs font-semibold">Most Popular</Badge>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-bold">{plan.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mt-0.5 shrink-0">
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button className={`w-full h-11 font-semibold ${plan.popular ? "" : ""}`} variant={plan.popular ? "default" : "outline"} data-testid={`button-pricing-${plan.name.toLowerCase()}`}>
                  {plan.cta}
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-24 lg:py-28 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 dark:from-indigo-900 dark:via-indigo-950 dark:to-[#0c0a1d]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(99,102,241,0.3),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,_rgba(6,182,212,0.15),transparent_60%)]" />
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">Ready to Take Control?</h2>
        <p className="mt-4 text-lg text-indigo-100/90">
          Start managing your AI spend in minutes. No credit card required.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="gap-2 h-12 px-8 text-[15px] font-semibold shadow-lg" data-testid="button-cta-start">
              Start Free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/docs">
            <Button size="lg" variant="outline" className="gap-2 h-12 px-8 text-[15px] font-semibold bg-white/5 border-white/20 text-white hover:bg-white/10 hover:text-white" data-testid="button-cta-docs">
              <Globe className="w-4 h-4" />
              Read the Docs
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#0f172a] dark:bg-[#0a0e1a] py-12 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <LogoMono size={24} />
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/docs" className="hover:text-white transition-colors" data-testid="link-footer-docs">Docs</Link>
            <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
            <a href="#features" className="hover:text-white transition-colors">Features</a>
          </div>
          <p className="text-sm text-gray-500">&copy; 2026 Allotly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Hero />
      <FeaturesSection />
      <HowItWorks />
      <TrustSection />
      <PricingSection />
      <CTASection />
      <Footer />
    </div>
  );
}
