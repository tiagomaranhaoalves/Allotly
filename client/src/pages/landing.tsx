import { LogoFull, LogoMono } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import {
  Key, Ticket, Shield, Zap, BarChart3, Users, Check,
  Sun, Moon, ArrowRight, ArrowDown, Lock, Eye, Gauge, Code,
  ChevronDown, ChevronRight, Menu, X, Plug, Sliders, Activity,
  Share2, Sparkles, Globe, QrCode,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

function useScrolled(threshold = 10) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

function useInView(options?: IntersectionObserverInit) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        obs.disconnect();
      }
    }, { threshold: 0.15, ...options });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, inView };
}

function FadeIn({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const { ref, inView } = useInView();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "translateY(0)" : "translateY(24px)",
        transition: `opacity 0.6s ease ${delay}ms, transform 0.6s ease ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <Button size="icon" variant="ghost" onClick={toggleTheme} data-testid="button-theme-toggle">
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  );
}

function Header() {
  const scrolled = useScrolled();
  const [mobileOpen, setMobileOpen] = useState(false);

  const smoothScroll = useCallback((e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    setMobileOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <header
      className={`fixed top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-sm"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-8">
          <Link href="/" data-testid="link-logo">
            <LogoFull size={28} />
          </Link>
          <nav className="hidden md:flex items-center gap-6">
            <a href="#how-it-works" onClick={(e) => smoothScroll(e, "how-it-works")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">How It Works</a>
            <a href="#pricing" onClick={(e) => smoothScroll(e, "pricing")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">Pricing</a>
            <Link href="/docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-docs">Docs</Link>
          </nav>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          <Link href="/login">
            <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="button-login">Log In</span>
          </Link>
          <Link href="/signup">
            <Button className="gap-1.5 bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25 rounded-full px-5" data-testid="button-start-free">
              Start Free
            </Button>
          </Link>
        </div>
        <div className="flex md:hidden items-center gap-2">
          <ThemeToggle />
          <Button size="icon" variant="ghost" onClick={() => setMobileOpen(!mobileOpen)} data-testid="button-mobile-menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>
      <div
        className={`md:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl ${mobileOpen ? "block" : "hidden"}`}
      >
        <div className="px-4 py-4 space-y-3">
          <a href="#how-it-works" onClick={(e) => smoothScroll(e, "how-it-works")} className="block text-sm font-medium text-muted-foreground" data-testid="link-how-it-works-mobile">How It Works</a>
          <a href="#pricing" onClick={(e) => smoothScroll(e, "pricing")} className="block text-sm font-medium text-muted-foreground" data-testid="link-pricing-mobile">Pricing</a>
          <Link href="/docs" className="block text-sm font-medium text-muted-foreground" data-testid="link-docs-mobile">Docs</Link>
          <hr className="border-border/50" />
          <Link href="/login">
            <span className="block text-sm font-medium text-muted-foreground" data-testid="button-login-mobile">Log In</span>
          </Link>
          <Link href="/signup">
            <Button className="w-full gap-1.5 bg-indigo-600 border-indigo-700 text-white rounded-full" data-testid="button-start-free-mobile">
              Start Free
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const smoothScroll = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
  }, []);

  return (
    <section className="relative pt-16">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white to-cyan-50/60 dark:from-indigo-950/40 dark:via-background dark:to-cyan-950/20" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-indigo-400/10 to-transparent dark:from-indigo-500/5 rounded-full blur-3xl" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-24 lg:pt-32 lg:pb-36">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-20 items-center">
          <FadeIn>
            <div className="space-y-8">
              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                  You want your team on AI.{" "}
                  <span className="text-muted-foreground">They want every model.</span>
                  <br />
                  <span className="bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 bg-clip-text text-transparent">
                    Give them access.
                  </span>{" "}
                  Keep the control.
                </h1>
                <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-[600px] leading-relaxed">
                  Allotly connects to your OpenAI, Anthropic, and Gemini accounts and puts you in control — per person, per model, per dollar.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup">
                  <Button size="lg" className="gap-2 px-8 text-[15px] font-semibold bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25" data-testid="button-hero-start">
                    Start Free <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <a href="#how-it-works" onClick={smoothScroll}>
                  <Button variant="ghost" size="lg" className="gap-1.5 text-[15px] text-muted-foreground" data-testid="button-hero-how">
                    See How It Works <ChevronDown className="w-4 h-4" />
                  </Button>
                </a>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200} className="relative hidden lg:block">
            <div className="relative transform rotate-2">
              <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-1.5 shadow-2xl">
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
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { label: "OpenAI", color: "#10A37F" },
                      { label: "Anthropic", color: "#D4A574" },
                      { label: "Google", color: "#4285F4" },
                    ].map(p => (
                      <span key={p.label} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted/50 border border-border/40">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Budget Used</span>
                      <span className="text-muted-foreground font-mono">73%</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-indigo-400" style={{ width: "73%" }} />
                    </div>
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
                          <div className="flex items-center gap-2 flex-wrap">
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
            </div>
            <div className="absolute -z-10 -top-6 -right-6 w-80 h-80 bg-gradient-to-br from-indigo-400/15 to-cyan-400/15 rounded-full blur-3xl" />
            <div className="absolute -z-10 -bottom-4 -left-4 w-60 h-60 bg-gradient-to-tr from-indigo-500/10 to-purple-400/10 rounded-full blur-3xl" />
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function ProblemStrip() {
  return (
    <section className="relative bg-neutral-950 text-white py-20 lg:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.04)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="grid sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800">
            {[
              {
                stat: "$8.4B",
                desc: "spent on enterprise LLM APIs in just the first half of 2025",
                source: "Menlo Ventures",
                accent: "from-indigo-400 to-indigo-500",
              },
              {
                stat: "67%",
                desc: "of companies have no responsive AI controls in place",
                source: "EY, 2025",
                accent: "from-cyan-400 to-cyan-500",
              },
              {
                stat: "62%",
                desc: "of executives say over a quarter of their spend delivers no value",
                source: "Sweep, 2025",
                accent: "from-violet-400 to-violet-500",
              },
            ].map(item => (
              <div key={item.stat} className="text-center py-8 sm:py-0 sm:px-10 lg:px-14">
                <p
                  className={`font-mono text-5xl lg:text-6xl font-extrabold tracking-tighter bg-gradient-to-r ${item.accent} bg-clip-text text-transparent`}
                  data-testid={`stat-${item.stat.replace(/[^a-zA-Z0-9]/g, "")}`}
                >
                  {item.stat}
                </p>
                <p className="mt-4 text-[15px] text-neutral-300 leading-relaxed">{item.desc}</p>
                <p className="mt-3 text-xs font-medium uppercase tracking-wider text-neutral-500">{item.source}</p>
              </div>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function SolutionIntro() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <FadeIn>
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4" data-testid="text-solution-label">THE SOLUTION</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight max-w-3xl mx-auto">
            One control plane. Every AI provider. Total spend visibility.
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Whether your team uses OpenAI for code generation, Anthropic for analysis, or Gemini for research — Allotly gives you a single pane of glass to manage budgets, distribute access, and track every dollar.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function TwoFeaturesSection() {
  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">TWO ACCESS MODELS</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Internal Teams. External Users. One Dashboard.</h2>
          </div>
        </FadeIn>
        <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
          <FadeIn>
            <Card className="p-8 lg:p-10 relative border-l-4 border-l-indigo-500 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-indigo-100 to-indigo-50 dark:from-indigo-900/50 dark:to-indigo-800/30 shadow-sm">
                  <Key className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Allotly Teams</h3>
                  <p className="text-sm text-muted-foreground">Direct Provider Access</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-2">Direct API keys with guardrails</p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Your team calls OpenAI, Anthropic, and Gemini directly — no proxy sitting between them and the model. Allotly provisions scoped API keys at the provider level, so you get full control without adding latency or a single point of failure.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "Zero added latency — direct provider calls",
                  "Keys work even if Allotly is offline",
                  "Budget tracking via provider usage polling",
                  "Model-level access restrictions",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-5 border-t">
                <p className="text-xs italic text-muted-foreground mb-2">Built for: engineering teams, R&D groups, and internal governance workflows.</p>
                <p className="text-xs text-muted-foreground/70">Uses provider-level API key scoping. Budget checks run via polling (15-60 min).</p>
              </div>
            </Card>
          </FadeIn>

          <FadeIn delay={150}>
            <Card className="p-8 lg:p-10 relative border-l-4 border-l-cyan-500 hover:shadow-lg transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-100 to-cyan-50 dark:from-cyan-900/50 dark:to-cyan-800/30 shadow-sm">
                  <Ticket className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Allotly Vouchers</h3>
                  <p className="text-sm text-muted-foreground">Instant Access Codes</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 mb-2">Pre-paid AI access for anyone</p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Create voucher codes that give anyone instant AI access with hard budget limits. Recipients call one unified API that works with all providers. Real-time per-request metering ensures nobody goes over budget.
              </p>
              <ul className="space-y-3 mb-6">
                {[
                  "One API key, all providers",
                  "Hard per-request budget enforcement",
                  "No provider accounts needed for recipients",
                  "Shareable codes with QR",
                  "Works with any OpenAI-compatible SDK",
                ].map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-5 border-t">
                <p className="text-xs italic text-muted-foreground mb-2">Built for: hackathons, workshops, contractors, agencies, and partner programs.</p>
                <p className="text-xs text-muted-foreground/70">Uses Allotly thin proxy with real-time spend tracking. Budget enforced per-request.</p>
              </div>
            </Card>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function VoucherCallout() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="bg-cyan-50/50 dark:bg-cyan-950/20 border border-border/50 rounded-2xl p-8 lg:p-14">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">Think Gift Card. But for AI.</h2>
                <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                  Allotly Vouchers let you give anyone a pre-loaded AI budget — a code they redeem for instant API access. 
                  No accounts to create, no provider credentials to share. Just scan, redeem, and start prompting.
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href="/signup">
                    <Button className="gap-1.5 bg-cyan-600 border-cyan-700 text-white" data-testid="button-voucher-cta">
                      Create Your First Voucher <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-background rounded-xl border border-border/60 p-6 shadow-sm">
                  <p className="text-sm font-bold text-foreground mb-1">Allotly Voucher</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Voucher Code</p>
                  <p className="font-mono text-lg font-bold tracking-wider text-foreground" data-testid="text-voucher-code">ALLOT-7K3M-X9PQ-2BWL</p>
                  <div className="mt-4 flex items-center gap-4 flex-wrap">
                    <div className="w-16 h-16 rounded-lg bg-muted/60 border border-border/40 flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-muted-foreground/60" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">Budget</span>
                        <span className="text-muted-foreground font-mono">$15 / $25</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-400" style={{ width: "60%" }} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function HowItWorks() {
  const [activeTab, setActiveTab] = useState<"team" | "voucher">("team");

  const steps = {
    team: [
      { icon: <Plug className="w-6 h-6" />, title: "Connect Providers", desc: "Link your OpenAI, Anthropic, and Google accounts. API keys encrypted with AES-256-GCM at rest." },
      { icon: <Users className="w-6 h-6" />, title: "Create Teams & Set Budgets", desc: "Add members, assign per-person budgets, restrict models. Members get scoped provider keys automatically." },
      { icon: <BarChart3 className="w-6 h-6" />, title: "Monitor & Control", desc: "Unified dashboard with spend tracking. Automatic alerts at 80%, key revocation at 100% budget." },
    ],
    voucher: [
      { icon: <Ticket className="w-6 h-6" />, title: "Create Voucher Codes", desc: "Generate voucher codes with budget limits and model restrictions. Attach to bundles for purchase." },
      { icon: <Share2 className="w-6 h-6" />, title: "Distribute", desc: "Share via code, QR, or email. Recipients redeem and get an API key instantly — no provider accounts needed." },
      { icon: <Gauge className="w-6 h-6" />, title: "Real-Time Enforcement", desc: "Per-request budget metering. Token clamping near limits. Auto-expiry when budget hits zero." },
    ],
  };

  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">How It Works</h2>
            <p className="mt-4 text-lg text-muted-foreground">Three steps to AI spend control.</p>
          </div>
        </FadeIn>
        <FadeIn>
          <div className="flex justify-center mb-14">
            <div className="inline-flex rounded-xl p-1 gap-2">
              <button
                onClick={() => setActiveTab("team")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "team" ? "bg-indigo-500 text-white shadow-sm" : "border border-border text-muted-foreground"}`}
                data-testid="tab-team"
              >
                For Your Team
              </button>
              <button
                onClick={() => setActiveTab("voucher")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "voucher" ? "bg-indigo-500 text-white shadow-sm" : "border border-border text-muted-foreground"}`}
                data-testid="tab-voucher"
              >
                For External Users
              </button>
            </div>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {steps[activeTab].map((step, i) => (
            <FadeIn key={`${activeTab}-${step.title}`} delay={i * 100}>
              <div className="text-center relative">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-indigo-100 dark:bg-indigo-900/40 mb-6">
                  <span className="text-indigo-600 dark:text-indigo-400">{step.icon}</span>
                </div>
                {i < 2 && (
                  <div className="hidden md:block absolute top-7 left-[60%] w-[80%] border-t-2 border-dashed border-border/60" />
                )}
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className="text-xs font-bold text-white bg-indigo-500 w-6 h-6 rounded-full flex items-center justify-center">{i + 1}</span>
                  <h3 className="text-lg font-bold">{step.title}</h3>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">{step.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  return (
    <section className="py-24 lg:py-28 bg-neutral-900 text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-white">Your prompts are none of our business.</h2>
            <p className="mt-4 text-lg text-neutral-300 max-w-2xl mx-auto">
              Allotly is a control plane, not a data plane. We manage access and budgets — your prompts and responses flow directly between you and the AI provider.
            </p>
          </div>
        </FadeIn>
        <div className="grid sm:grid-cols-3 gap-6 lg:gap-8">
          {[
            {
              icon: <Eye className="w-6 h-6" />,
              title: "Zero Prompt Storage",
              desc: "For Teams: traffic goes direct to providers. For Vouchers: the proxy processes requests in-flight only. Nothing stored, nothing logged.",
            },
            {
              icon: <Shield className="w-6 h-6" />,
              title: "AES-256-GCM Encryption",
              desc: "Provider API keys are encrypted at rest with AES-256-GCM. Keys are decrypted only in memory at the moment of use, then discarded.",
            },
            {
              icon: <Lock className="w-6 h-6" />,
              title: "Audit & Compliance",
              desc: "Full audit trail for every admin action. GDPR-ready data practices. SOC 2 Type II on the roadmap. Your compliance team will thank you.",
            },
          ].map((item, i) => (
            <FadeIn key={item.title} delay={i * 100}>
              <div className="p-7 rounded-xl bg-neutral-800/60 border border-neutral-700/40 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-neutral-700/60 text-neutral-200 mb-5">
                  {item.icon}
                </div>
                <h3 className="font-bold text-base mb-2 text-white">{item.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={300}>
          <div className="flex flex-wrap justify-center gap-6 mt-12 pt-8 border-t border-neutral-700/40">
            {["SOC 2 (in progress)", "GDPR Ready", "AES-256-GCM", "Zero Data Retention"].map(badge => (
              <span key={badge} className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-400 px-3 py-1.5 rounded-full bg-neutral-800 border border-neutral-700/50">
                <Shield className="w-3 h-3" />
                {badge}
              </span>
            ))}
          </div>
        </FadeIn>
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
        "3 AI Provider connections",
        "Usage polling every 60 min",
        "7-day data retention",
        "1 voucher code, 25 redemptions",
        "$10 Voucher Bundles available",
      ],
      cta: "Get Started",
      popular: false,
      variant: "outline" as const,
    },
    {
      name: "Team",
      price: "$20",
      period: "/mo per admin",
      description: "For growing teams with multiple admins",
      features: [
        "1 Root Admin (free) + 10 Team Admins",
        "Up to 20 members per team",
        "3 AI Provider connections",
        "15-minute usage polling",
        "90-day retention + audit log",
        "5 voucher codes per admin, 50 redemptions",
        "AI usage analytics",
        "$10 Voucher Bundles available",
      ],
      cta: "Start Free, Upgrade Anytime",
      popular: true,
      variant: "default" as const,
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
      variant: "outline" as const,
    },
  ];

  return (
    <section id="pricing" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Simple, Transparent Pricing</h2>
            <p className="mt-4 text-lg text-muted-foreground">Start free. Upgrade when you need more.</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <FadeIn key={plan.name} delay={i * 100}>
              <Card className={`p-7 lg:p-8 relative flex flex-col h-full ${plan.popular ? "ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/5 dark:shadow-none" : ""}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="no-default-hover-elevate no-default-active-elevate shadow-sm px-3 py-0.5 text-xs font-semibold bg-indigo-500 text-white border-indigo-600">Most Popular</Badge>
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1 flex-wrap">
                    <span className="text-4xl font-extrabold tracking-tight">{plan.price}</span>
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
                <Link href={plan.name === "Enterprise" ? "/signup" : "/signup"}>
                  <Button className="w-full font-semibold" variant={plan.variant} data-testid={`button-pricing-${plan.name.toLowerCase()}`}>
                    {plan.cta}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </Card>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={300}>
          <p className="text-center text-sm text-muted-foreground mt-8 max-w-xl mx-auto">
            All plans include $10 Voucher Bundles — pre-loaded AI credit packs you can buy and distribute. Pay only for what you use.
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function SocialProof() {
  return (
    <section className="py-24 lg:py-32 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">Built for Teams Like Yours</h2>
            <p className="mt-4 text-lg text-muted-foreground">See how organizations use Allotly to govern AI spend.</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {[
            {
              quote: "We gave 200 workshop attendees AI access in under 5 minutes with voucher codes. No accounts, no credentials to manage. The budget limits meant we didn't wake up to a surprise bill.",
              author: "Head of Developer Relations",
              org: "AI Education Startup",
            },
            {
              quote: "Our engineering team was burning through $4K/month on AI APIs with zero visibility. Allotly showed us exactly who was spending what, and the per-member budgets cut waste by 40%.",
              author: "VP of Engineering",
              org: "Series B SaaS Company",
            },
            {
              quote: "The voucher system is genius for agency work. We create a scoped code for each client project — they get AI access, we keep control, and billing is crystal clear.",
              author: "Managing Partner",
              org: "Digital Agency",
            },
          ].map((item, i) => (
            <FadeIn key={i} delay={i * 100}>
              <Card className="p-7 flex flex-col h-full" data-testid={`card-testimonial-${i}`}>
                <p className="text-sm italic text-muted-foreground leading-relaxed flex-1">"{item.quote}"</p>
                <div className="mt-6 pt-4 border-t">
                  <p className="text-sm font-semibold">{item.author}</p>
                  <p className="text-xs text-muted-foreground">{item.org}</p>
                </div>
              </Card>
            </FadeIn>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <FadeIn>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            Stop guessing.{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-cyan-500 bg-clip-text text-transparent">Start governing.</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            Get full visibility and control over your organization's AI spend in minutes. No credit card required.
          </p>
          <div className="mt-10">
            <Link href="/signup">
              <Button size="lg" className="gap-2 px-8 text-[15px] font-semibold bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25" data-testid="button-final-cta">
                Start Free <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-400 py-16 border-t border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <LogoMono size={24} className="text-neutral-400" />
            <p className="mt-4 text-sm text-neutral-500 leading-relaxed max-w-xs">
              The AI spend control plane for teams and organizations.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">Product</p>
            <ul className="space-y-2.5">
              <li><a href="#how-it-works" className="text-sm hover:text-white transition-colors" data-testid="link-footer-how-it-works">How It Works</a></li>
              <li><a href="#pricing" className="text-sm hover:text-white transition-colors" data-testid="link-footer-pricing">Pricing</a></li>
              <li><Link href="/docs" className="text-sm hover:text-white transition-colors" data-testid="link-footer-docs">Documentation</Link></li>
              <li><Link href="/signup" className="text-sm hover:text-white transition-colors" data-testid="link-footer-signup">Get Started</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">Company</p>
            <ul className="space-y-2.5">
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-about">About</a></li>
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-blog">Blog</a></li>
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-careers">Careers</a></li>
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-contact">Contact</a></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">Legal</p>
            <ul className="space-y-2.5">
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-privacy">Privacy Policy</a></li>
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-terms">Terms of Service</a></li>
              <li><a href="#" className="text-sm hover:text-white transition-colors" data-testid="link-footer-security">Security</a></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-neutral-800 text-center">
          <p className="text-sm text-neutral-500">&copy; 2026 Allotly. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background" style={{ scrollBehavior: "smooth" }}>
      <Header />
      <Hero />
      <ProblemStrip />
      <SolutionIntro />
      <TwoFeaturesSection />
      <VoucherCallout />
      <HowItWorks />
      <TrustSection />
      <PricingSection />
      <SocialProof />
      <FinalCTA />
      <Footer />
    </div>
  );
}
