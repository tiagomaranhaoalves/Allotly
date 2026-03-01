import { LogoFull, LogoMono } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import {
  Key, Ticket, Shield, Zap, BarChart3, Users, ChevronRight, Check,
  Sun, Moon, ArrowRight, Lock, Eye, Globe, Gauge, Code, Layers,
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
            <a href="#features" className="text-sm font-medium text-muted-foreground transition-colors" data-testid="link-features">Features</a>
            <a href="#how-it-works" className="text-sm font-medium text-muted-foreground transition-colors" data-testid="link-how-it-works">How It Works</a>
            <a href="#pricing" className="text-sm font-medium text-muted-foreground transition-colors" data-testid="link-pricing">Pricing</a>
            <Link href="/docs" className="text-sm font-medium text-muted-foreground transition-colors" data-testid="link-docs">Docs</Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login">
            <Button variant="secondary" size="sm" data-testid="button-login">Log in</Button>
          </Link>
          <Link href="/signup">
            <Button size="sm" data-testid="button-get-started">Get Started Free</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-cyan-50/30 dark:from-indigo-950/20 dark:via-transparent dark:to-cyan-950/10" />
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-28 lg:pb-32">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="space-y-8">
            <div>
              <Badge variant="secondary" className="mb-6 no-default-hover-elevate no-default-active-elevate">
                <Zap className="w-3 h-3 mr-1" />
                Now supporting OpenAI, Anthropic & Google
              </Badge>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
                The AI Spend{" "}
                <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">
                  Control Plane
                </span>
              </h1>
              <p className="mt-5 text-lg sm:text-xl text-muted-foreground max-w-xl leading-relaxed">
                Give your team AI access. Keep your budget intact. Two powerful features, one dashboard.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/signup">
                <Button size="lg" className="gap-2" data-testid="button-hero-start">
                  Start Free <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="outline" size="lg" data-testid="button-hero-learn">
                  See How It Works
                </Button>
              </a>
            </div>
            <div className="flex items-center gap-6 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> No credit card required</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> 5 members free</span>
              <span className="flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" /> AES-256 encryption</span>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="relative rounded-xl border bg-card p-1 shadow-xl">
              <div className="rounded-lg bg-background p-4 space-y-4">
                <div className="flex items-center justify-between gap-2 pb-3 border-b">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BarChart3 className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">Organization Spend</p>
                      <p className="text-xs text-muted-foreground">Current period</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold">$1,247</p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "OpenAI", amount: "$823", color: "#10A37F", percent: 65 },
                    { label: "Anthropic", amount: "$312", color: "#D4A574", percent: 25 },
                    { label: "Google", amount: "$112", color: "#4285F4", percent: 10 },
                  ].map(p => (
                    <div key={p.label} className="p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-1.5 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="text-xs font-medium">{p.label}</span>
                      </div>
                      <p className="text-lg font-bold">{p.amount}</p>
                      <div className="h-1 bg-muted rounded-full mt-1.5 overflow-hidden">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${p.percent}%` }} />
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
                    <div key={m.name} className="flex items-center gap-3 p-2 rounded-md bg-muted/30">
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {m.name[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium truncate">{m.name}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${m.role === "Direct" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" : "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300"}`}>
                            {m.role}
                          </span>
                        </div>
                        <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(m.spent / m.budget) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-xs font-medium text-muted-foreground">${m.spent}/${m.budget}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -z-10 -top-4 -right-4 w-72 h-72 bg-gradient-to-br from-indigo-400/20 to-cyan-400/20 rounded-full blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section id="features" className="py-20 lg:py-28 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Two Features, One Dashboard</h2>
          <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
            Choose the right approach for each use case. Use both from the same platform.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-6 lg:gap-8">
          <Card className="p-8 relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-900/40">
                <Key className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Allotly Teams</h3>
                <p className="text-sm text-muted-foreground">No-Proxy · Direct Provider Access</p>
              </div>
            </div>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Provision scoped API keys for your team directly at the provider level. Members call OpenAI, Anthropic, and Gemini directly — zero latency, zero proxy, zero single point of failure.
            </p>
            <ul className="space-y-3 mb-6">
              {[
                "Zero added latency",
                "Members talk to providers directly",
                "Budget monitoring via usage polling",
                "If Allotly goes down, keys still work",
                "Model access restrictions",
              ].map(item => (
                <li key={item} className="flex items-start gap-2.5 text-sm">
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Ideal for:</p>
              <p className="text-sm">Engineering teams · R&D · Internal governance · Development workflows</p>
            </div>
          </Card>

          <Card className="p-8 relative">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 rounded-xl bg-cyan-100 dark:bg-cyan-900/40">
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
                  <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="pt-4 border-t">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Ideal for:</p>
              <p className="text-sm">Hackathons · Workshops · Contractors · Agencies · Partners · Onboarding</p>
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
      { icon: <Layers className="w-6 h-6" />, title: "Connect", description: "Link your AI provider accounts. Keys encrypted with AES-256-GCM. Supports OpenAI, Anthropic, and Google." },
      { icon: <Users className="w-6 h-6" />, title: "Allocate", description: "Create teams, set per-member budgets, choose allowed models. Members get scoped provider keys automatically." },
      { icon: <BarChart3 className="w-6 h-6" />, title: "Monitor", description: "Unified dashboard with real-time spend tracking. Alerts at 80%. Automatic key revocation at 100%." },
    ],
    vouchers: [
      { icon: <Ticket className="w-6 h-6" />, title: "Create", description: "Generate voucher codes with budget limits and model restrictions. Share via link, QR code, or email." },
      { icon: <Code className="w-6 h-6" />, title: "Redeem", description: "Recipients scan the code and get an API key instantly. No provider account needed. Works with any OpenAI SDK." },
      { icon: <Gauge className="w-6 h-6" />, title: "Control", description: "Real-time per-request spend tracking. Hard budget enforcement with automatic token clamping. Auto-expiry." },
    ],
  };

  return (
    <section id="how-it-works" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How It Works</h2>
          <p className="mt-4 text-lg text-muted-foreground">Three steps to AI spend control.</p>
        </div>
        <div className="flex justify-center mb-12">
          <div className="inline-flex rounded-lg bg-muted p-1">
            <button
              onClick={() => setActiveTab("teams")}
              className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === "teams" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-tab-teams"
            >
              <Key className="w-4 h-4 inline mr-1.5" />
              Teams
            </button>
            <button
              onClick={() => setActiveTab("vouchers")}
              className={`px-5 py-2.5 rounded-md text-sm font-medium transition-all ${activeTab === "vouchers" ? "bg-background shadow-sm" : "text-muted-foreground"}`}
              data-testid="button-tab-vouchers"
            >
              <Ticket className="w-4 h-4 inline mr-1.5" />
              Vouchers
            </button>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-8">
          {steps[activeTab].map((step, i) => (
            <div key={step.title} className="text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary mb-5">
                {step.icon}
              </div>
              <div className="flex items-center justify-center gap-2 mb-3">
                <span className="text-xs font-bold text-primary bg-primary/10 w-5 h-5 rounded-full flex items-center justify-center">{i + 1}</span>
                <h3 className="text-lg font-semibold">{step.title}</h3>
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
    <section className="py-20 lg:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold tracking-tight">Your Data Stays Private</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Your prompts and responses stay between you and the AI provider. Always.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6">
          {[
            { icon: <Shield className="w-6 h-6" />, title: "AES-256-GCM Encryption", desc: "Provider API keys encrypted at rest with military-grade encryption" },
            { icon: <Eye className="w-6 h-6" />, title: "Zero Data Retention", desc: "Proxy processes requests in-flight — never stored, never logged, never persisted" },
            { icon: <Lock className="w-6 h-6" />, title: "GDPR-Compliant", desc: "Designed for data protection compliance from day one" },
          ].map(item => (
            <Card key={item.title} className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 text-primary mb-4">
                {item.icon}
              </div>
              <h3 className="font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.desc}</p>
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
    <section id="pricing" className="py-20 lg:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
          <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you need more.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map(plan => (
            <Card key={plan.name} className={`p-6 lg:p-8 relative flex flex-col ${plan.popular ? "ring-2 ring-primary" : ""}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="no-default-hover-elevate no-default-active-elevate">Most Popular</Badge>
                </div>
              )}
              <div className="mb-6">
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="text-sm text-muted-foreground">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{plan.description}</p>
              </div>
              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link href="/signup">
                <Button className="w-full" variant={plan.popular ? "default" : "outline"} data-testid={`button-pricing-${plan.name.toLowerCase()}`}>
                  {plan.cta}
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
    <section className="py-20 lg:py-24 bg-gradient-to-br from-indigo-600 to-indigo-800 dark:from-indigo-900 dark:to-indigo-950">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">Ready to Take Control?</h2>
        <p className="mt-4 text-lg text-indigo-100">
          Start managing your AI spend in minutes. No credit card required.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/signup">
            <Button size="lg" variant="secondary" className="gap-2" data-testid="button-cta-start">
              Start Free <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-[#111827] py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <LogoMono size={24} />
          <div className="flex items-center gap-6 text-sm text-gray-400">
            <Link href="/docs" className="transition-colors" data-testid="link-footer-docs">Docs</Link>
            <a href="#pricing" className="transition-colors">Pricing</a>
            <a href="#features" className="transition-colors">Features</a>
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
