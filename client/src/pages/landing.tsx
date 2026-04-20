import { LogoFull, LogoMono } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "wouter";
import { useTranslation, Trans } from "react-i18next";
import {
  Key, Ticket, Shield, Zap, BarChart3, Users, Check,
  Sun, Moon, ArrowRight, Lock, Eye, Gauge,
  ChevronDown, ChevronRight, Menu, X, Plug, Activity,
  Share2, Sparkles, Globe, QrCode, Swords, Trophy, DollarSign,
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
  const { t } = useTranslation();
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
          <nav className="hidden lg:flex items-center gap-6">
            <a href="#how-it-works" onClick={(e) => smoothScroll(e, "how-it-works")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-how-it-works">{t("nav.howItWorks")}</a>
            <a href="#pricing" onClick={(e) => smoothScroll(e, "pricing")} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-pricing">{t("nav.pricing")}</a>
            <Link href="/docs" className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors" data-testid="link-docs">{t("nav.docs")}</Link>
            <Link href="/arena" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors inline-flex items-center gap-1.5" data-testid="link-arena">
              <Swords className="w-3.5 h-3.5" /> {t("nav.arena")}
            </Link>
          </nav>
        </div>
        <div className="hidden lg:flex items-center gap-3">
          <LanguageSwitcher />
          <ThemeToggle />
          <Link href="/login">
            <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="button-login">{t("nav.logIn")}</span>
          </Link>
          <Link href="/signup">
            <Button className="gap-1.5 bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25 rounded-full px-5" data-testid="button-start-free">
              {t("nav.startFree")}
            </Button>
          </Link>
        </div>
        <div className="flex lg:hidden items-center gap-2">
          <Link href="/login">
            <span className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer" data-testid="button-login-mobile-header">{t("nav.logIn")}</span>
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          <Button size="icon" variant="ghost" onClick={() => setMobileOpen(!mobileOpen)} data-testid="button-mobile-menu">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      </div>
      <div
        className={`lg:hidden border-t border-border/50 bg-background/95 backdrop-blur-xl transition-all duration-300 ease-in-out overflow-hidden ${mobileOpen ? "max-h-80 opacity-100" : "max-h-0 opacity-0 border-t-transparent pointer-events-none"}`}
        aria-hidden={!mobileOpen}
      >
        <div className="px-4 py-4 space-y-3">
          <a href="#how-it-works" onClick={(e) => smoothScroll(e, "how-it-works")} className="block text-sm font-medium text-muted-foreground" data-testid="link-how-it-works-mobile">{t("nav.howItWorks")}</a>
          <a href="#pricing" onClick={(e) => smoothScroll(e, "pricing")} className="block text-sm font-medium text-muted-foreground" data-testid="link-pricing-mobile">{t("nav.pricing")}</a>
          <Link href="/docs" className="block text-sm font-medium text-muted-foreground" data-testid="link-docs-mobile">{t("nav.docs")}</Link>
          <Link href="/arena" className="block text-sm font-semibold text-indigo-600 dark:text-indigo-400" data-testid="link-arena-mobile">{t("nav.arena")}</Link>
          <hr className="border-border/50" />
          <Link href="/login">
            <span className="block text-sm font-medium text-muted-foreground" data-testid="button-login-mobile">{t("nav.logIn")}</span>
          </Link>
          <Link href="/signup">
            <Button className="w-full gap-1.5 bg-indigo-600 border-indigo-700 text-white rounded-full" data-testid="button-start-free-mobile">
              {t("nav.startFree")}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const { t } = useTranslation();
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
                  {t("hero.title1")}{" "}
                  <span className="text-muted-foreground">{t("hero.title2")}</span>
                  <br />
                  <span className="bg-gradient-to-r from-indigo-600 via-cyan-500 to-indigo-600 bg-clip-text text-transparent animate-gradient-text">
                    {t("hero.title3")}
                  </span>
                </h1>
                <p className="mt-6 text-lg sm:text-xl text-muted-foreground max-w-[600px] leading-relaxed">
                  {t("hero.subtitle")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/signup">
                  <Button size="lg" className="gap-2 px-8 text-[15px] font-semibold bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25" data-testid="button-hero-start">
                    {t("hero.ctaStart")} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <a href="#how-it-works" onClick={smoothScroll}>
                  <Button variant="ghost" size="lg" className="gap-1.5 text-[15px] text-muted-foreground" data-testid="button-hero-how">
                    {t("hero.ctaHow")} <ChevronDown className="w-4 h-4" />
                  </Button>
                </a>
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200} className="relative hidden lg:block">
            <div className="relative">
              <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur p-1.5 shadow-2xl">
                <div className="rounded-xl bg-background p-5 space-y-5">
                  <div className="flex items-center justify-between gap-2 pb-4 border-b">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-sm">
                        <BarChart3 className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{t("hero.preview.title")}</p>
                        <p className="text-xs text-muted-foreground">{t("hero.preview.period")}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold tracking-tight">$1,247</p>
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">{t("hero.preview.delta")}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { label: "OpenAI", color: "#10A37F" },
                      { label: "Anthropic", color: "#D4A574" },
                      { label: "Google", color: "#4285F4" },
                      { label: "Azure", color: "#0078D4" },
                    ].map(p => (
                      <span key={p.label} className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-muted/50 border border-border/40">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.label}
                      </span>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{t("hero.preview.budgetUsed")}</span>
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
  const { t } = useTranslation();
  const items = [
    { stat: "$8.4B", desc: t("problem.stat1Desc"), source: "Menlo Ventures", accent: "from-indigo-400 to-indigo-500" },
    { stat: "67%", desc: t("problem.stat2Desc"), source: "EY, 2025", accent: "from-cyan-400 to-cyan-500" },
    { stat: "62%", desc: t("problem.stat3Desc"), source: "Sweep, 2025", accent: "from-violet-400 to-violet-500" },
  ];
  return (
    <section className="relative bg-neutral-950 text-white py-20 lg:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-transparent to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.04)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="grid sm:grid-cols-3 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-neutral-800">
            {items.map(item => (
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
  const { t } = useTranslation();
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <FadeIn>
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4" data-testid="text-solution-label">{t("solution.label")}</p>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight max-w-3xl mx-auto">
            {t("solution.title")}
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            {t("solution.subtitle")}
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function TwoFeaturesSection() {
  const { t } = useTranslation();
  const teamBullets = [
    t("features.teams.bullet1"),
    t("features.teams.bullet2"),
    t("features.teams.bullet3"),
    t("features.teams.bullet4"),
  ];
  const voucherBullets = [
    t("features.vouchers.bullet1"),
    t("features.vouchers.bullet2"),
    t("features.vouchers.bullet3"),
    t("features.vouchers.bullet4"),
    t("features.vouchers.bullet5"),
  ];
  return (
    <section className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">{t("features.label")}</p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("features.title")}</h2>
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
                  <h3 className="text-xl font-bold">{t("features.teams.name")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.teams.subtitle")}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mb-2">{t("features.teams.tag")}</p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {t("features.teams.desc")}
              </p>
              <ul className="space-y-3 mb-6">
                {teamBullets.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-5 border-t">
                <p className="text-xs italic text-muted-foreground mb-2">{t("features.teams.builtFor")}</p>
                <p className="text-xs text-muted-foreground/70">{t("features.teams.footnote")}</p>
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
                  <h3 className="text-xl font-bold">{t("features.vouchers.name")}</h3>
                  <p className="text-sm text-muted-foreground">{t("features.vouchers.subtitle")}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-cyan-600 dark:text-cyan-400 mb-2">{t("features.vouchers.tag")}</p>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {t("features.vouchers.desc")}
              </p>
              <ul className="space-y-3 mb-6">
                {voucherBullets.map(item => (
                  <li key={item} className="flex items-start gap-2.5 text-sm">
                    <Check className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <div className="pt-5 border-t">
                <p className="text-xs italic text-muted-foreground mb-2">{t("features.vouchers.builtFor")}</p>
                <p className="text-xs text-muted-foreground/70">{t("features.vouchers.footnote")}</p>
              </div>
            </Card>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function VoucherCallout() {
  const { t } = useTranslation();
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="bg-cyan-50/50 dark:bg-cyan-950/20 border border-border/50 rounded-2xl p-8 lg:p-14">
            <div className="grid lg:grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-3xl lg:text-4xl font-bold tracking-tight">{t("voucherCallout.title")}</h2>
                <p className="mt-4 text-lg text-muted-foreground leading-relaxed">
                  {t("voucherCallout.desc")}
                </p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Link href="/signup">
                    <Button className="gap-1.5 bg-cyan-600 border-cyan-700 text-white" data-testid="button-voucher-cta">
                      {t("voucherCallout.cta")} <ArrowRight className="w-4 h-4" />
                    </Button>
                  </Link>
                </div>
              </div>
              <div className="space-y-6">
                <div className="bg-background rounded-xl border border-border/60 p-6 shadow-sm">
                  <p className="text-sm font-bold text-foreground mb-1">{t("voucherCallout.voucherLabel")}</p>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">{t("voucherCallout.voucherCodeLabel")}</p>
                  <p className="font-mono text-lg font-bold tracking-wider text-foreground" data-testid="text-voucher-code">ALLOT-7K3M-X9PQ-2BWL</p>
                  <div className="mt-4 flex items-center gap-4 flex-wrap">
                    <div className="w-16 h-16 rounded-lg bg-muted/60 border border-border/40 flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-muted-foreground/60" />
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{t("voucherCallout.budget")}</span>
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
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"team" | "voucher">("team");

  const steps = {
    team: [
      { icon: <Plug className="w-6 h-6" />, title: t("howItWorks.team.step1Title"), desc: t("howItWorks.team.step1Desc") },
      { icon: <Users className="w-6 h-6" />, title: t("howItWorks.team.step2Title"), desc: t("howItWorks.team.step2Desc") },
      { icon: <BarChart3 className="w-6 h-6" />, title: t("howItWorks.team.step3Title"), desc: t("howItWorks.team.step3Desc") },
    ],
    voucher: [
      { icon: <Ticket className="w-6 h-6" />, title: t("howItWorks.voucher.step1Title"), desc: t("howItWorks.voucher.step1Desc") },
      { icon: <Share2 className="w-6 h-6" />, title: t("howItWorks.voucher.step2Title"), desc: t("howItWorks.voucher.step2Desc") },
      { icon: <Gauge className="w-6 h-6" />, title: t("howItWorks.voucher.step3Title"), desc: t("howItWorks.voucher.step3Desc") },
    ],
  };

  return (
    <section id="how-it-works" className="py-24 lg:py-32 bg-muted/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("howItWorks.title")}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("howItWorks.subtitle")}</p>
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
                {t("howItWorks.tabTeam")}
              </button>
              <button
                onClick={() => setActiveTab("voucher")}
                className={`px-6 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === "voucher" ? "bg-cyan-500 text-white shadow-sm" : "border border-border text-muted-foreground"}`}
                data-testid="tab-voucher"
              >
                {t("howItWorks.tabVoucher")}
              </button>
            </div>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
          {steps[activeTab].map((step, i) => (
            <FadeIn key={`${activeTab}-${i}`} delay={i * 100}>
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
  const { t } = useTranslation();
  const cards = [
    {
      icon: <Eye className="w-5 h-5" />,
      title: t("trust.card1Title"),
      subtitle: t("trust.card1Subtitle"),
      desc: t("trust.card1Desc"),
      accent: "from-indigo-500 to-indigo-600",
      accentBorder: "border-indigo-500/20",
      accentBg: "bg-indigo-500/10",
      accentText: "text-indigo-400",
    },
    {
      icon: <Zap className="w-5 h-5" />,
      title: t("trust.card2Title"),
      subtitle: t("trust.card2Subtitle"),
      desc: t("trust.card2Desc"),
      accent: "from-cyan-500 to-cyan-600",
      accentBorder: "border-cyan-500/20",
      accentBg: "bg-cyan-500/10",
      accentText: "text-cyan-400",
    },
    {
      icon: <Lock className="w-5 h-5" />,
      title: t("trust.card3Title"),
      subtitle: t("trust.card3Subtitle"),
      desc: t("trust.card3Desc"),
      accent: "from-violet-500 to-violet-600",
      accentBorder: "border-violet-500/20",
      accentBg: "bg-violet-500/10",
      accentText: "text-violet-400",
    },
  ];
  const badges = [
    { label: t("trust.badge1"), icon: <Lock className="w-3.5 h-3.5" /> },
    { label: t("trust.badge2"), icon: <Shield className="w-3.5 h-3.5" /> },
    { label: t("trust.badge3"), icon: <Globe className="w-3.5 h-3.5" /> },
    { label: t("trust.badge4"), icon: <Eye className="w-3.5 h-3.5" /> },
  ];
  return (
    <section className="relative py-28 lg:py-36 bg-neutral-950 text-white overflow-hidden">
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-950/30 via-neutral-950 to-neutral-950" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-gradient-radial from-indigo-500/[0.07] to-transparent rounded-full blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px]" />
      </div>
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-16 lg:mb-20">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-6">
              <Shield className="w-3.5 h-3.5" />
              {t("trust.badge")}
            </div>
            <h2 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
              {t("trust.title1")}<br className="hidden sm:block" /> {t("trust.title2")}
            </h2>
            <p className="mt-5 text-lg text-neutral-400 max-w-2xl mx-auto leading-relaxed">
              {t("trust.subtitle")}
            </p>
          </div>
        </FadeIn>

        <div className="grid lg:grid-cols-3 gap-5 lg:gap-6">
          {cards.map((item, i) => (
            <FadeIn key={item.title} delay={i * 120}>
              <div className={`relative group h-full p-8 rounded-2xl bg-white/[0.03] border ${item.accentBorder} backdrop-blur-sm transition-all duration-300 hover:bg-white/[0.06] hover:border-opacity-40`}>
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-current to-transparent opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: item.accent.includes('indigo') ? '#6366f1' : item.accent.includes('cyan') ? '#06b6d4' : '#8b5cf6' }} />
                <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${item.accentBg} ${item.accentText} mb-5`}>
                  {item.icon}
                </div>
                <h3 className="font-bold text-lg mb-1 text-white">{item.title}</h3>
                <p className={`text-xs font-medium ${item.accentText} mb-3 uppercase tracking-wider`}>{item.subtitle}</p>
                <p className="text-sm text-neutral-400 leading-relaxed">{item.desc}</p>
              </div>
            </FadeIn>
          ))}
        </div>

        <FadeIn delay={400}>
          <div className="mt-16 lg:mt-20 flex flex-wrap justify-center gap-4">
            {badges.map(badge => (
              <span key={badge.label} className="inline-flex items-center gap-2 text-xs font-medium text-neutral-300 px-4 py-2 rounded-full bg-white/[0.05] border border-white/[0.08] backdrop-blur-sm">
                {badge.icon}
                {badge.label}
              </span>
            ))}
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function PricingSection() {
  const { t } = useTranslation();
  const plans = [
    {
      id: "free",
      name: t("pricing.free.name"),
      price: "$0",
      period: t("pricing.free.period"),
      description: t("pricing.free.description"),
      features: [
        t("pricing.free.feature1"),
        t("pricing.free.feature2"),
        t("pricing.free.feature3"),
        t("pricing.free.feature4"),
        t("pricing.free.feature5"),
        t("pricing.free.feature6"),
        t("pricing.free.feature7"),
      ],
      cta: t("pricing.free.cta"),
      popular: false,
      variant: "outline" as const,
    },
    {
      id: "team",
      name: t("pricing.team.name"),
      price: "$20",
      period: t("pricing.team.period"),
      description: t("pricing.team.description"),
      features: [
        t("pricing.team.feature1"),
        t("pricing.team.feature2"),
        t("pricing.team.feature3"),
        t("pricing.team.feature4"),
        t("pricing.team.feature5"),
        t("pricing.team.feature6"),
        t("pricing.team.feature7"),
        t("pricing.team.feature8"),
        t("pricing.team.feature9"),
      ],
      cta: t("pricing.team.cta"),
      popular: true,
      variant: "default" as const,
    },
    {
      id: "enterprise",
      name: t("pricing.enterprise.name"),
      price: t("pricing.enterprise.price"),
      period: "",
      description: t("pricing.enterprise.description"),
      features: [
        t("pricing.enterprise.feature1"),
        t("pricing.enterprise.feature2"),
        t("pricing.enterprise.feature3"),
        t("pricing.enterprise.feature4"),
        t("pricing.enterprise.feature5"),
        t("pricing.enterprise.feature6"),
        t("pricing.enterprise.feature7"),
      ],
      cta: t("pricing.enterprise.cta"),
      popular: false,
      variant: "outline" as const,
    },
  ];

  return (
    <section id="pricing" className="py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("pricing.title")}</h2>
            <p className="mt-4 text-lg text-muted-foreground">{t("pricing.subtitle")}</p>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8 max-w-5xl mx-auto">
          {plans.map((plan, i) => (
            <FadeIn key={plan.id} delay={i * 100}>
              <Card className={`p-7 lg:p-8 relative flex flex-col h-full transition-all duration-300 hover:-translate-y-1 ${plan.popular ? "ring-2 ring-indigo-500 shadow-xl shadow-indigo-500/5 dark:shadow-none hover:shadow-2xl hover:shadow-indigo-500/10" : "hover:shadow-lg"}`}>
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="no-default-hover-elevate no-default-active-elevate shadow-sm px-3 py-0.5 text-xs font-semibold bg-indigo-500 text-white border-indigo-600">{t("pricing.mostPopular")}</Badge>
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
                <Link href={plan.id === "enterprise" ? "/contact" : "/signup"}>
                  <Button className="w-full font-semibold" variant={plan.variant} data-testid={`button-pricing-${plan.id}`}>
                    {plan.cta}
                    <ChevronRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </Card>
            </FadeIn>
          ))}
        </div>
        <FadeIn delay={300}>
          <p className="text-center text-base font-medium text-foreground mt-10 max-w-2xl mx-auto" data-testid="text-voucher-bundles-cta">
            <Trans
              i18nKey="pricing.voucherBundlesCta"
              components={{
                link: <Link href="/signup" className="text-indigo-500 hover:text-indigo-400 underline underline-offset-2 transition-colors" data-testid="link-buy-bundle" />,
              }}
            />
          </p>
        </FadeIn>
      </div>
    </section>
  );
}

function SocialProof() {
  const { t } = useTranslation();
  const items = [
    {
      name: "Jon",
      role: t("socialProof.testimonial1.role"),
      org: t("socialProof.testimonial1.org"),
      avatar: "J",
      color: "from-cyan-500 to-cyan-600",
      challenge: t("socialProof.testimonial1.challenge"),
      solution: t("socialProof.testimonial1.solution"),
      result: t("socialProof.testimonial1.result"),
      products: ["Allotly Vouchers", "Bundles"],
    },
    {
      name: "Priya",
      role: t("socialProof.testimonial2.role"),
      org: t("socialProof.testimonial2.org"),
      avatar: "P",
      color: "from-indigo-500 to-indigo-600",
      challenge: t("socialProof.testimonial2.challenge"),
      solution: t("socialProof.testimonial2.solution"),
      result: t("socialProof.testimonial2.result"),
      products: ["Allotly Teams"],
    },
    {
      name: "Marcus",
      role: t("socialProof.testimonial3.role"),
      org: t("socialProof.testimonial3.org"),
      avatar: "M",
      color: "from-violet-500 to-violet-600",
      challenge: t("socialProof.testimonial3.challenge"),
      solution: t("socialProof.testimonial3.solution"),
      result: t("socialProof.testimonial3.result"),
      products: ["Allotly Teams", "Allotly Vouchers"],
    },
  ];
  return (
    <section className="py-24 lg:py-32 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">{t("socialProof.title")}</h2>
          </div>
        </FadeIn>
        <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
          {items.map((item, i) => (
            <FadeIn key={i} delay={i * 100}>
              <Card className="p-7 flex flex-col h-full" data-testid={`card-testimonial-${i}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${item.color} flex items-center justify-center text-white font-bold text-sm shrink-0`}>
                    {item.avatar}
                  </div>
                  <div>
                    <p className="text-sm font-bold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.role}, {item.org}</p>
                  </div>
                </div>
                <div className="space-y-3 flex-1">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">{t("socialProof.challenge")}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.challenge}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-1">{t("socialProof.solution")}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.solution}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">{t("socialProof.result")}</p>
                    <p className="text-sm font-medium text-foreground">{item.result}</p>
                  </div>
                </div>
                <div className="mt-5 pt-4 border-t flex flex-wrap gap-1.5">
                  {item.products.map(p => (
                    <span key={p} className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-muted text-muted-foreground">{p}</span>
                  ))}
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
  const { t } = useTranslation();
  return (
    <section className="py-24 lg:py-32">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <FadeIn>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight">
            {t("finalCta.title1")}{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-cyan-500 to-indigo-600 bg-clip-text text-transparent animate-gradient-text">{t("finalCta.title2")}</span>
          </h2>
          <p className="mt-6 text-lg text-muted-foreground max-w-xl mx-auto">
            {t("finalCta.subtitle")}
          </p>
          <div className="mt-10">
            <Link href="/signup">
              <Button size="lg" className="gap-2 px-8 text-[15px] font-semibold bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25" data-testid="button-final-cta">
                {t("finalCta.cta")} <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="bg-neutral-900 text-neutral-400 py-16 border-t border-neutral-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 lg:gap-12">
          <div className="col-span-2 md:col-span-1">
            <span data-testid="logo-footer"><LogoMono size={24} className="text-neutral-400" /></span>
            <p className="mt-4 text-sm text-neutral-500 leading-relaxed max-w-xs">
              {t("footer.tagline")}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">{t("footer.product")}</p>
            <ul className="space-y-2.5">
              <li><a href="#how-it-works" className="text-sm hover:text-white transition-colors" data-testid="link-footer-how-it-works">{t("footer.howItWorks")}</a></li>
              <li><a href="#pricing" className="text-sm hover:text-white transition-colors" data-testid="link-footer-pricing">{t("footer.pricing")}</a></li>
              <li><Link href="/docs" className="text-sm hover:text-white transition-colors" data-testid="link-footer-docs">{t("footer.documentation")}</Link></li>
              <li><Link href="/signup" className="text-sm hover:text-white transition-colors" data-testid="link-footer-signup">{t("footer.getStarted")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">{t("footer.company")}</p>
            <ul className="space-y-2.5">
              <li><Link href="/about" className="text-sm hover:text-white transition-colors" data-testid="link-footer-about">{t("footer.about")}</Link></li>
              <li><Link href="/careers" className="text-sm hover:text-white transition-colors" data-testid="link-footer-careers">{t("footer.careers")}</Link></li>
              <li><Link href="/contact" className="text-sm hover:text-white transition-colors" data-testid="link-footer-contact">{t("footer.contact")}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4">{t("footer.legal")}</p>
            <ul className="space-y-2.5">
              <li><Link href="/privacy" className="text-sm hover:text-white transition-colors" data-testid="link-footer-privacy">{t("footer.privacy")}</Link></li>
              <li><Link href="/terms" className="text-sm hover:text-white transition-colors" data-testid="link-footer-terms">{t("footer.terms")}</Link></li>
              <li><Link href="/security" className="text-sm hover:text-white transition-colors" data-testid="link-footer-security">{t("footer.security")}</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-neutral-800 text-center">
          <p className="text-sm text-neutral-500">{t("footer.copyright")}</p>
        </div>
      </div>
    </footer>
  );
}

function ArenaCallout() {
  const { t } = useTranslation();
  const features = [
    { icon: <Swords className="w-4 h-4" />, label: t("arenaCallout.feature1Label"), sub: t("arenaCallout.feature1Sub") },
    { icon: <DollarSign className="w-4 h-4" />, label: t("arenaCallout.feature2Label"), sub: t("arenaCallout.feature2Sub") },
    { icon: <Trophy className="w-4 h-4" />, label: t("arenaCallout.feature3Label"), sub: t("arenaCallout.feature3Sub") },
  ];
  return (
    <section className="relative py-24 lg:py-32 overflow-hidden bg-neutral-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.18),transparent_60%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(99,102,241,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.05)_1px,transparent_1px)] bg-[size:60px_60px]" />
      <div className="absolute -top-24 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 right-1/4 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <FadeIn>
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-400/30 text-indigo-300 text-xs font-semibold uppercase tracking-widest">
                <Sparkles className="w-3.5 h-3.5" /> {t("arenaCallout.badge")}
              </div>
              <h2 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
                {t("arenaCallout.title1")}{" "}
                <span className="bg-gradient-to-r from-indigo-400 via-cyan-300 to-indigo-400 bg-clip-text text-transparent">
                  {t("arenaCallout.title2")}
                </span>
              </h2>
              <p className="text-lg text-neutral-300 leading-relaxed max-w-[560px]">
                <Trans
                  i18nKey="arenaCallout.desc"
                  components={{ strong: <span className="font-semibold text-white" /> }}
                />
              </p>

              <div className="grid sm:grid-cols-3 gap-3 max-w-[560px]">
                {features.map(b => (
                  <div key={b.label} className="rounded-xl bg-white/5 border border-white/10 p-3.5 backdrop-blur">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-300 flex items-center justify-center mb-2">
                      {b.icon}
                    </div>
                    <p className="text-sm font-semibold text-white">{b.label}</p>
                    <p className="text-[11px] text-neutral-400">{b.sub}</p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link href="/arena">
                  <Button size="lg" className="gap-2 px-7 text-[15px] font-semibold bg-white text-neutral-900 hover:bg-neutral-100 shadow-xl shadow-indigo-500/20" data-testid="button-arena-enter">
                    {t("arenaCallout.ctaEnter")} <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
                <span className="text-xs text-neutral-400">
                  {t("arenaCallout.ctaSubtext")}
                </span>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent backdrop-blur-xl p-1.5 shadow-2xl">
                <div className="rounded-xl bg-neutral-900/80 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Swords className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm font-semibold">{t("arenaCallout.mock.round")}</span>
                    </div>
                    <span className="text-[10px] uppercase tracking-wider text-emerald-400 font-bold inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> {t("arenaCallout.mock.live")}
                    </span>
                  </div>

                  {[
                    { name: "GPT-4o", color: "from-emerald-400 to-emerald-500", cost: "$0.0042", time: "1.8s", winner: false },
                    { name: "Claude 3.5 Sonnet", color: "from-amber-400 to-orange-500", cost: "$0.0061", time: "2.1s", winner: true },
                    { name: "Gemini 2.5 Flash", color: "from-blue-400 to-cyan-500", cost: "$0.0008", time: "1.2s", winner: false },
                  ].map(m => (
                    <div key={m.name} className={`relative rounded-lg border p-3.5 ${m.winner ? "border-amber-400/50 bg-amber-400/5" : "border-white/10 bg-white/[0.02]"}`}>
                      {m.winner && (
                        <div className="absolute -top-2 -right-2 inline-flex items-center gap-1 bg-amber-400 text-neutral-900 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow-lg">
                          <Trophy className="w-3 h-3" /> {t("arenaCallout.mock.winner")}
                        </div>
                      )}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-6 h-6 rounded-md bg-gradient-to-br ${m.color}`} />
                          <span className="text-sm font-semibold text-white">{m.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[11px] font-mono">
                          <span className="text-neutral-400">{m.time}</span>
                          <span className="text-emerald-300 font-semibold">{m.cost}</span>
                        </div>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full bg-gradient-to-r ${m.color}`} style={{ width: m.winner ? "100%" : m.name === "GPT-4o" ? "82%" : "64%" }} />
                      </div>
                    </div>
                  ))}

                  <div className="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
                    <span className="text-neutral-400">{t("arenaCallout.mock.cheapest")} <span className="text-cyan-300 font-semibold">Gemini Flash</span></span>
                    <span className="text-neutral-400">{t("arenaCallout.mock.bestAnswer")} <span className="text-amber-300 font-semibold">Claude 3.5</span></span>
                  </div>
                </div>
              </div>
              <div className="absolute -z-10 inset-0 bg-gradient-to-br from-indigo-500/20 to-cyan-500/20 rounded-3xl blur-2xl" />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden" style={{ scrollBehavior: "smooth" }}>
      <Header />
      <Hero />
      <ProblemStrip />
      <SolutionIntro />
      <TwoFeaturesSection />
      <VoucherCallout />
      <HowItWorks />
      <ArenaCallout />
      <TrustSection />
      <PricingSection />
      <SocialProof />
      <FinalCTA />
      <Footer />
    </div>
  );
}
