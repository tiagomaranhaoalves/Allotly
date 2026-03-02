import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  BookOpen, Key, Ticket, Shield, Zap, BarChart3, Code,
  ChevronRight, ChevronDown, ArrowRight, Sun, Moon, Terminal, Users,
  Settings, AlertTriangle, HelpCircle, Globe, Copy, Check, Menu, X,
  Plug, Sliders, Activity, Share2, Lock, Eye,
} from "lucide-react";

interface SidebarSection {
  id: string;
  label: string;
  icon: React.ElementType;
  items: { id: string; title: string }[];
}

const SIDEBAR_SECTIONS: SidebarSection[] = [
  {
    id: "getting-started",
    label: "GETTING STARTED",
    icon: Zap,
    items: [
      { id: "what-is-allotly", title: "What is Allotly" },
      { id: "quick-start", title: "Quick Start" },
      { id: "key-concepts", title: "Key Concepts" },
    ],
  },
  {
    id: "allotly-teams",
    label: "ALLOTLY TEAMS",
    icon: Key,
    items: [
      { id: "connecting-providers", title: "Connecting Providers" },
      { id: "openai-setup", title: "OpenAI Setup" },
      { id: "anthropic-setup", title: "Anthropic Setup" },
      { id: "google-gemini-setup", title: "Google Gemini Setup" },
      { id: "setting-budgets", title: "Setting Budgets" },
      { id: "model-access-restrictions", title: "Model Access Restrictions" },
    ],
  },
  {
    id: "allotly-vouchers",
    label: "ALLOTLY VOUCHERS",
    icon: Ticket,
    items: [
      { id: "creating-vouchers", title: "Creating Vouchers" },
      { id: "distributing-vouchers", title: "Distributing" },
      { id: "how-redemption-works", title: "How Redemption Works" },
      { id: "bundle-purchases", title: "Bundle Purchases" },
      { id: "proxy-api-reference", title: "Proxy API Reference" },
    ],
  },
  {
    id: "budget-enforcement",
    label: "BUDGET ENFORCEMENT",
    icon: BarChart3,
    items: [
      { id: "teams-budgets", title: "How Teams Budgets Work" },
      { id: "voucher-budgets", title: "How Voucher Budgets Work" },
      { id: "alert-thresholds", title: "Alert Thresholds" },
      { id: "budget-reset-cycles", title: "Budget Reset Cycles" },
    ],
  },
  {
    id: "api-reference",
    label: "API REFERENCE",
    icon: Code,
    items: [
      { id: "proxy-endpoint", title: "Proxy Endpoint" },
      { id: "models-endpoint", title: "Models Endpoint" },
      { id: "request-format", title: "Request Format" },
      { id: "response-format", title: "Response Format" },
      { id: "response-headers", title: "Response Headers" },
      { id: "error-codes", title: "Error Codes" },
      { id: "rate-limits", title: "Rate Limits" },
      { id: "streaming", title: "Streaming" },
    ],
  },
  {
    id: "faq",
    label: "FAQ",
    icon: HelpCircle,
    items: [
      { id: "faq-allotly-down", title: "What if Allotly goes down?" },
      { id: "faq-store-prompts", title: "Do you store prompts?" },
      { id: "faq-budget-accuracy", title: "How accurate are budgets?" },
      { id: "faq-langchain-cursor", title: "Can I use with LangChain/Cursor?" },
      { id: "faq-teams-vs-vouchers", title: "Teams vs Vouchers difference?" },
      { id: "faq-voucher-tiers", title: "What are the different voucher tiers?" },
    ],
  },
];

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-4">
      <pre className="p-4 rounded-md bg-[#1e1e2e] text-[#cdd6f4] font-mono text-sm overflow-x-auto leading-relaxed">
        {children}
      </pre>
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 text-[#cdd6f4]/60 no-default-hover-elevate no-default-active-elevate"
        onClick={handleCopy}
        data-testid="button-code-copy"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
      </Button>
    </div>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2
      id={id}
      className="text-2xl font-bold tracking-tight pt-10 pb-3 scroll-mt-20 border-b mb-4"
      data-testid={`heading-${id}`}
    >
      {title}
    </h2>
  );
}

function SubHeading({ id, title }: { id: string; title: string }) {
  return (
    <h3
      id={id}
      className="text-lg font-semibold mt-8 mb-3 scroll-mt-20"
      data-testid={`heading-${id}`}
    >
      {title}
    </h3>
  );
}

function Sidebar({
  activeId,
  expandedSections,
  onToggleSection,
  onNavigate,
}: {
  activeId: string;
  expandedSections: Record<string, boolean>;
  onToggleSection: (id: string) => void;
  onNavigate: (id: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {SIDEBAR_SECTIONS.map((section) => {
        const isExpanded = expandedSections[section.id] !== false;
        const Icon = section.icon;
        const hasActiveItem = section.items.some((item) => item.id === activeId);

        return (
          <div key={section.id} className="mb-1">
            <button
              onClick={() => onToggleSection(section.id)}
              className={`flex items-center gap-2 w-full px-3 py-2 text-xs font-semibold uppercase tracking-widest rounded-md transition-colors ${
                hasActiveItem
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-muted-foreground"
              }`}
              data-testid={`sidebar-section-${section.id}`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 text-left">{section.label}</span>
              {isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 shrink-0" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              )}
            </button>
            {isExpanded && (
              <ul className="ml-5 mt-0.5 space-y-0.5 border-l border-border pl-3">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        onNavigate(item.id);
                      }}
                      className={`block px-2 py-1.5 text-sm rounded-md transition-colors ${
                        activeId === item.id
                          ? "bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium"
                          : "text-muted-foreground"
                      }`}
                      data-testid={`sidebar-item-${item.id}`}
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export default function DocsPage() {
  const { theme, toggleTheme } = useTheme();
  const [activeId, setActiveId] = useState("what-is-allotly");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    SIDEBAR_SECTIONS.forEach((s) => (initial[s.id] = true));
    return initial;
  });
  const mainRef = useRef<HTMLDivElement>(null);

  const allItemIds = SIDEBAR_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length > 0) {
          const topEntry = visible.reduce((a, b) =>
            a.boundingClientRect.top < b.boundingClientRect.top ? a : b
          );
          setActiveId(topEntry.target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    allItemIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const handleToggleSection = (id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleNavigate = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
      setActiveId(id);
      setMobileMenuOpen(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/" data-testid="link-docs-logo">
              <LogoFull size={28} />
            </Link>
            <span className="hidden sm:inline text-sm font-medium text-muted-foreground border-l border-border pl-4">
              Documentation
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={toggleTheme}
              data-testid="button-theme-toggle-docs"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              data-testid="button-mobile-menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 top-16 z-40 bg-background/95 backdrop-blur-sm overflow-y-auto p-4">
          <Sidebar
            activeId={activeId}
            expandedSections={expandedSections}
            onToggleSection={handleToggleSection}
            onNavigate={handleNavigate}
          />
        </div>
      )}

      <div className="max-w-7xl mx-auto flex">
        <aside className="hidden lg:block w-64 shrink-0 border-r border-border sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto p-4">
          <Sidebar
            activeId={activeId}
            expandedSections={expandedSections}
            onToggleSection={handleToggleSection}
            onNavigate={handleNavigate}
          />
        </aside>

        <main ref={mainRef} className="flex-1 min-w-0 max-w-3xl px-6 lg:px-12 py-8 leading-relaxed">

          <SectionHeading id="what-is-allotly" title="What is Allotly" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Allotly is the AI Spend Control Plane. It sits between your organization and AI providers like OpenAI,
            Anthropic, and Google Gemini, giving you complete visibility and control over who can access which models
            and how much they can spend.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Allotly offers two distinct access models, each optimized for different use cases:
          </p>
          <div className="grid sm:grid-cols-2 gap-4 my-6">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Key className="w-4 h-4 text-indigo-500" />
                <h4 className="font-semibold text-sm">Allotly Teams</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Direct-access model. Members receive scoped API keys from their AI provider and call OpenAI, Anthropic,
                or Google directly. Allotly monitors usage via polling and enforces budgets by revoking keys when limits are hit.
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Ticket className="w-4 h-4 text-cyan-500" />
                <h4 className="font-semibold text-sm">Allotly Vouchers</h4>
              </div>
              <p className="text-sm text-muted-foreground">
                Proxy-access model. Create voucher codes with budgets. Recipients get an Allotly API key and route
                requests through our OpenAI-compatible proxy, which enforces limits in real-time per request.
              </p>
            </Card>
          </div>
          <p className="text-muted-foreground leading-relaxed mb-4">
            Allotly uses a three-level role system to organize access:
          </p>
          <div className="space-y-2 my-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 shrink-0">
                Root Admin
              </span>
              <span className="text-muted-foreground">
                Full organizational control. Connects AI providers, creates Team Admins, manages billing and plan settings.
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 shrink-0">
                Team Admin
              </span>
              <span className="text-muted-foreground">
                Manages one team. Adds members, sets per-member budgets, creates vouchers, views team analytics.
              </span>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-700/40 dark:text-neutral-300 shrink-0">
                Member
              </span>
              <span className="text-muted-foreground">
                End user. Receives API keys, tracks their own usage, operates within assigned budget limits.
              </span>
            </div>
          </div>

          <SubHeading id="quick-start" title="Quick Start (5-Minute Setup)" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Get your team up and running with AI access in under five minutes:
          </p>
          <ol className="space-y-4 text-sm mb-6">
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0">1</span>
              <div>
                <strong className="block mb-0.5">Sign Up</strong>
                <span className="text-muted-foreground">Create your organization at <code className="px-1.5 py-0.5 rounded-md bg-muted text-sm font-mono">/signup</code>. You become the Root Admin automatically.</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0">2</span>
              <div>
                <strong className="block mb-0.5">Connect an AI Provider</strong>
                <span className="text-muted-foreground">Navigate to AI Providers in your dashboard and add your OpenAI, Anthropic, or Google API key. Keys are encrypted with AES-256-GCM.</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0">3</span>
              <div>
                <strong className="block mb-0.5">Create a Team</strong>
                <span className="text-muted-foreground">Go to Teams and create your first team. Assign a Team Admin or manage it yourself as Root Admin.</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0">4</span>
              <div>
                <strong className="block mb-0.5">Add Members</strong>
                <span className="text-muted-foreground">Invite team members by email. Each member gets scoped API keys for the providers you've connected.</span>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 font-bold text-xs shrink-0">5</span>
              <div>
                <strong className="block mb-0.5">Set Budgets</strong>
                <span className="text-muted-foreground">Assign per-member monthly budgets. Allotly will alert at 80% and 90%, and revoke keys at 100%.</span>
              </div>
            </li>
          </ol>

          <SubHeading id="key-concepts" title="Key Concepts" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Understanding the difference between Teams and Vouchers is fundamental to using Allotly effectively.
          </p>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border border-border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-semibold">Feature</th>
                  <th className="px-4 py-2.5 font-semibold">Teams (Direct Access)</th>
                  <th className="px-4 py-2.5 font-semibold">Vouchers (Proxy Access)</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t border-border"><td className="px-4 py-2">Access Model</td><td className="px-4 py-2">Direct to provider</td><td className="px-4 py-2">Through Allotly proxy</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Key Type</td><td className="px-4 py-2">Scoped provider key</td><td className="px-4 py-2">Allotly API key</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Budget Enforcement</td><td className="px-4 py-2">Polling-based (15-60 min)</td><td className="px-4 py-2">Real-time per-request</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Account Required</td><td className="px-4 py-2">Yes (member account)</td><td className="px-4 py-2">Optional</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Best For</td><td className="px-4 py-2">Internal teams, developers</td><td className="px-4 py-2">External users, workshops, contractors</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Latency</td><td className="px-4 py-2">None (direct calls)</td><td className="px-4 py-2">Minimal (proxy hop)</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Privacy</td><td className="px-4 py-2">Prompts never touch Allotly</td><td className="px-4 py-2">Prompts transit proxy (not stored)</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mt-2 mb-6">
            <strong>Roles:</strong> Root Admins have full control over the organization. Team Admins manage individual teams and their members.
            Members are end users who consume AI access within their assigned budgets.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            <strong>Budget types:</strong> Monthly budgets reset on a configurable cycle (weekly, monthly, or quarterly). One-time budgets are fixed amounts
            that do not reset, commonly used with vouchers.
          </p>

          <SectionHeading id="connecting-providers" title="Connecting AI Providers" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Allotly integrates with three major AI providers. Each provider has a different level of automation for
            key provisioning and budget enforcement. Navigate to <strong>AI Providers</strong> in your dashboard and click
            "Connect AI Provider" to get started.
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            Your admin API key is encrypted at rest using AES-256-GCM encryption. The encryption key is stored as an
            environment variable, completely separate from the database. Admin keys are never stored in plaintext.
          </p>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border border-border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-semibold">Provider</th>
                  <th className="px-4 py-2.5 font-semibold">Automation Level</th>
                  <th className="px-4 py-2.5 font-semibold">Key Provisioning</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t border-border"><td className="px-4 py-2">OpenAI</td><td className="px-4 py-2">Fully Automated</td><td className="px-4 py-2">Automatic scoped keys via Projects API</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Anthropic</td><td className="px-4 py-2">Semi-Automated</td><td className="px-4 py-2">Workspace invite + budget cap via Admin API</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2">Google Gemini</td><td className="px-4 py-2">Guided (Manual)</td><td className="px-4 py-2">Step-by-step instructions for manual setup</td></tr>
              </tbody>
            </table>
          </div>

          <SubHeading id="openai-setup" title="OpenAI Setup (Instant)" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            OpenAI offers the most seamless integration. Allotly uses OpenAI's Projects API to automatically create
            scoped API keys for each team member.
          </p>
          <ol className="space-y-2 text-sm text-muted-foreground mb-4">
            <li><strong>1.</strong> Go to <a href="https://platform.openai.com/api-keys" className="text-indigo-500 underline" target="_blank" rel="noreferrer">platform.openai.com/api-keys</a> and generate an admin-level API key.</li>
            <li><strong>2.</strong> In Allotly, navigate to AI Providers and click "Connect AI Provider".</li>
            <li><strong>3.</strong> Select OpenAI, paste your admin key, and click Connect.</li>
            <li><strong>4.</strong> Allotly validates your key and confirms the connection instantly.</li>
          </ol>
          <p className="text-sm text-muted-foreground mb-4">
            When you add a member to a team, Allotly automatically creates an OpenAI Project for that member with the
            appropriate budget limits and model access restrictions. The scoped key is delivered to the member through
            the Allotly dashboard.
          </p>

          <SubHeading id="anthropic-setup" title="Anthropic Setup (Quick)" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Anthropic integration uses the Anthropic Admin API for workspace creation and budget management.
          </p>
          <ol className="space-y-2 text-sm text-muted-foreground mb-4">
            <li><strong>1.</strong> Log into your Anthropic Console at <a href="https://console.anthropic.com" className="text-indigo-500 underline" target="_blank" rel="noreferrer">console.anthropic.com</a>.</li>
            <li><strong>2.</strong> Navigate to Settings and note your Workspace ID.</li>
            <li><strong>3.</strong> Generate an admin API key with workspace management permissions.</li>
            <li><strong>4.</strong> In Allotly, connect Anthropic by providing your admin key and Workspace ID.</li>
          </ol>
          <p className="text-sm text-muted-foreground mb-4">
            Allotly creates dedicated workspaces for team members and sets spend limits via the Anthropic Admin API.
            Members receive workspace invitations and can generate their own keys within the budget constraints set by
            Allotly.
          </p>

          <SubHeading id="google-gemini-setup" title="Google Gemini Setup (Guided)" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Google Gemini requires manual API key creation through Google AI Studio, but Allotly provides step-by-step
            guidance throughout the process.
          </p>
          <ol className="space-y-2 text-sm text-muted-foreground mb-4">
            <li><strong>1.</strong> Visit <a href="https://aistudio.google.com/apikey" className="text-indigo-500 underline" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.</li>
            <li><strong>2.</strong> Click "Create API Key" and select your Google Cloud project.</li>
            <li><strong>3.</strong> Copy the generated API key.</li>
            <li><strong>4.</strong> In Allotly, connect Google Gemini by pasting your API key.</li>
            <li><strong>5.</strong> For each member, follow the guided instructions to create individual API keys with appropriate restrictions.</li>
          </ol>
          <p className="text-sm text-muted-foreground mb-4">
            Since Google's API does not support programmatic key scoping, Allotly guides administrators through creating
            individual keys manually. Budget enforcement relies on usage polling.
          </p>

          <SubHeading id="setting-budgets" title="Setting Budgets" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Budgets can be set at multiple levels to give you granular control over AI spend:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Per-member budgets:</strong> Set individual spending limits for each team member. This is the most common configuration.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Per-team budgets:</strong> Set a shared budget pool for the entire team. Individual members draw from the shared pool.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Per-voucher budgets:</strong> Each voucher code has its own fixed budget that does not reset.</span></li>
          </ul>
          <p className="text-sm text-muted-foreground mb-4">
            Budget amounts are specified in US dollars. Allotly tracks token usage and converts to dollar amounts using
            each provider's published pricing rates.
          </p>

          <SubHeading id="model-access-restrictions" title="Model Access Restrictions" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            In addition to budgets, you can restrict which AI models team members are allowed to use. This is configured
            per team or per voucher through an allowlist:
          </p>
          <CodeBlock>{`{
  "allowed_models": [
    "gpt-4o-mini",
    "gpt-4o",
    "claude-sonnet-4-20250514",
    "gemini-2.5-flash"
  ]
}`}</CodeBlock>
          <p className="text-sm text-muted-foreground mb-4">
            If no allowlist is specified, members can access all models available through the connected providers.
            When a member attempts to use a model not on the allowlist, the request is rejected with a 403 error.
          </p>

          <SectionHeading id="creating-vouchers" title="Creating Vouchers" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Root Admins and Team Admins can create voucher codes for external AI access. Each voucher is a self-contained
            access token with its own budget, model restrictions, and expiration.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            When creating a voucher, you specify:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Budget per recipient:</strong> Dollar amount each redeemer gets (e.g., $5, $10, $50).</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Allowed providers/models:</strong> Which AI models recipients can access.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Max redemptions:</strong> How many people can redeem this code (1 for individual, higher for groups).</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Expiration date:</strong> When the voucher code can no longer be redeemed.</span></li>
          </ul>

          <h4 className="text-base font-semibold mt-6 mb-2">Voucher Code Format</h4>
          <CodeBlock>{`ALLOT-XXXX-XXXX-XXXX

Characters: A-Z, 2-9 (excluding 0, O, 1, I, L for readability)
Example:    ALLOT-7K3M-N9WT-4HVX`}</CodeBlock>

          <SubHeading id="distributing-vouchers" title="Distributing Vouchers" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Vouchers can be distributed through three channels:
          </p>
          <div className="space-y-3 my-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <Code className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">Share the Code</strong>
                <span className="text-muted-foreground">Copy the voucher code and share it directly via chat, email, or any messaging platform. Recipients enter the code at <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">/redeem</code>.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <Share2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">QR Code</strong>
                <span className="text-muted-foreground">Each voucher has a generated QR code that links directly to the redemption page with the code pre-filled. Print or display for in-person distribution.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <Globe className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">Email Notification</strong>
                <span className="text-muted-foreground">Send an email directly from Allotly with the voucher code, redemption link, and instructions. Recipients click the link to redeem.</span>
              </div>
            </div>
          </div>

          <SubHeading id="how-redemption-works" title="How Redemption Works" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            When a recipient has a voucher code, the redemption flow is straightforward:
          </p>
          <ol className="space-y-3 text-sm text-muted-foreground mb-4">
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0">1</span>
              <span>Recipient visits <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">/redeem</code> and enters their voucher code.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0">2</span>
              <span>Allotly validates the code, checks remaining redemptions and expiration.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0">3</span>
              <span>Recipient chooses: <strong>Instant Key</strong> (no sign-up, key shown once) or <strong>Create Account</strong> (sign up to track usage in the dashboard).</span>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0">4</span>
              <span>An Allotly API key (<code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">allotly_sk_...</code>) is generated with the voucher's budget and model restrictions.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-600 dark:text-cyan-400 font-bold text-xs shrink-0">5</span>
              <span>Recipient uses the key to call the Allotly proxy endpoint, which routes requests to the appropriate provider.</span>
            </li>
          </ol>

          <SubHeading id="bundle-purchases" title="Bundle Purchases" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Voucher Bundles are $10 one-time purchases available on all plans, including Free. Each bundle includes:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>50 voucher redemptions</strong> — pooled across all your vouchers</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>25,000 proxy requests</strong> — shared across all voucher recipients</span></li>
          </ul>
          <p className="text-sm text-muted-foreground mb-4">
            Bundles do not expire. Unused capacity carries over. You can purchase multiple bundles, and their capacities
            stack. Bundle purchases are processed via Stripe and appear on your billing dashboard.
          </p>

          <SubHeading id="proxy-api-reference" title="Proxy API Reference (Vouchers)" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            The Allotly proxy is fully OpenAI-compatible. You can use it with any OpenAI SDK or HTTP client by simply
            changing the base URL and API key.
          </p>
          <CodeBlock>{`Base URL: https://your-app.replit.app/api/v1

POST /api/v1/chat/completions   →  Chat completions (all providers)
GET  /api/v1/models             →  List available models

Authentication:
  Authorization: Bearer allotly_sk_...`}</CodeBlock>
          <p className="text-sm text-muted-foreground mb-4">
            The proxy automatically routes requests to the correct provider based on the model name. For example,
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">gpt-4o</code> routes to OpenAI,
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">claude-sonnet-4-20250514</code> routes to Anthropic, and
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">gemini-2.5-flash</code> routes to Google.
          </p>

          <SectionHeading id="teams-budgets" title="How Teams Budgets Work" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            For Teams (direct access), budget enforcement is polling-based. Allotly periodically queries each provider's
            usage API to check member spend against their budget limits.
          </p>
          <div className="space-y-3 my-4">
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <Activity className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">Polling Frequency</strong>
                <span className="text-muted-foreground">Usage is polled every 15 to 60 minutes depending on how close a member is to their budget limit. As usage approaches the limit, polling frequency increases.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">Alert Notifications</strong>
                <span className="text-muted-foreground">Email alerts are sent at 80% and 90% of budget utilization. Team Admins and the member are both notified.</span>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50 text-sm">
              <Lock className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <div>
                <strong className="block mb-0.5">Key Revocation at 100%</strong>
                <span className="text-muted-foreground">When spend reaches 100% of budget, the member's scoped API key is automatically revoked at the provider level. The member can no longer make API calls until budget is reset or increased.</span>
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Because enforcement is polling-based, there may be a small window where a member's actual spend slightly
            exceeds their budget before the next poll detects it. This overshoot is typically minimal (a few cents).
          </p>

          <SubHeading id="voucher-budgets" title="How Voucher Budgets Work" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            For Vouchers (proxy access), budget enforcement is real-time and per-request. Every API call through the
            proxy is checked against the remaining budget before being forwarded to the provider.
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Pre-flight check:</strong> Before forwarding a request, the proxy verifies the voucher has sufficient remaining budget.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Reservation model:</strong> Budget is temporarily reserved for the request based on estimated token usage, then adjusted after the actual response.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Token clamping:</strong> If the remaining budget is less than the estimated cost, the proxy may reduce <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">max_tokens</code> to fit within budget.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Auto-expiry:</strong> When budget is fully exhausted, the Allotly API key is automatically deactivated.</span></li>
          </ul>

          <SubHeading id="alert-thresholds" title="Alert Thresholds" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Allotly sends alerts at three budget thresholds:
          </p>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border border-border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-semibold">Threshold</th>
                  <th className="px-4 py-2.5 font-semibold">Action (Teams)</th>
                  <th className="px-4 py-2.5 font-semibold">Action (Vouchers)</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">80%</td><td className="px-4 py-2">Warning email to member + admin</td><td className="px-4 py-2">Warning in response headers</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">90%</td><td className="px-4 py-2">Urgent email, increased polling</td><td className="px-4 py-2">Token clamping begins</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">100%</td><td className="px-4 py-2">Key revoked at provider</td><td className="px-4 py-2">Requests rejected (402)</td></tr>
              </tbody>
            </table>
          </div>

          <SubHeading id="budget-reset-cycles" title="Budget Reset Cycles" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Team budgets can be configured with different reset cycles:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Weekly:</strong> Budget resets every Monday at midnight UTC.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Monthly:</strong> Budget resets on the 1st of each month at midnight UTC. This is the default.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Quarterly:</strong> Budget resets every three months (Jan 1, Apr 1, Jul 1, Oct 1).</span></li>
          </ul>
          <p className="text-sm text-muted-foreground mb-4">
            When a budget resets, previously revoked keys are automatically re-enabled, and usage counters return to zero.
            Voucher budgets do not reset — they are one-time allocations.
          </p>

          <SectionHeading id="proxy-endpoint" title="Proxy Endpoint" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            The primary proxy endpoint accepts chat completion requests in OpenAI-compatible format and routes them
            to the appropriate provider based on the model name.
          </p>
          <CodeBlock>{`POST /api/v1/chat/completions

Authorization: Bearer allotly_sk_...
Content-Type: application/json`}</CodeBlock>

          <SubHeading id="models-endpoint" title="Models Endpoint" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            List all models available to your API key. The response includes models from all providers your key has access to.
          </p>
          <CodeBlock>{`GET /api/v1/models

Authorization: Bearer allotly_sk_...`}</CodeBlock>
          <p className="text-sm text-muted-foreground mb-4">Response:</p>
          <CodeBlock>{`{
  "object": "list",
  "data": [
    { "id": "gpt-4o", "object": "model", "owned_by": "openai" },
    { "id": "gpt-4o-mini", "object": "model", "owned_by": "openai" },
    { "id": "claude-sonnet-4-20250514", "object": "model", "owned_by": "anthropic" },
    { "id": "gemini-2.5-flash", "object": "model", "owned_by": "google" }
  ]
}`}</CodeBlock>

          <SubHeading id="request-format" title="Request Format" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Requests follow the OpenAI Chat Completions API format. The proxy translates the request to the appropriate
            provider format automatically.
          </p>
          <CodeBlock>{`{
  "model": "gpt-4o-mini",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is the capital of France?" }
  ],
  "temperature": 0.7,
  "max_tokens": 500,
  "stream": false
}`}</CodeBlock>
          <p className="text-sm text-muted-foreground mb-4">
            Supported parameters: <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">model</code> (required),
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">messages</code> (required),
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">temperature</code>,
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">max_tokens</code>,
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">stream</code>,
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">top_p</code>,
            <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">stop</code>.
          </p>

          <SubHeading id="response-format" title="Response Format" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Responses are returned in OpenAI-compatible format, regardless of which underlying provider handled the request.
          </p>
          <CodeBlock>{`{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1719000000,
  "model": "gpt-4o-mini",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "The capital of France is Paris."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 8,
    "total_tokens": 33
  }
}`}</CodeBlock>

          <SubHeading id="response-headers" title="Response Headers" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            The proxy includes additional headers in every response to help you track budget usage:
          </p>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border border-border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-semibold">Header</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                  <th className="px-4 py-2.5 font-semibold">Example</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">X-Allotly-Budget-Remaining</td><td className="px-4 py-2">Remaining budget in dollars</td><td className="px-4 py-2 font-mono">4.27</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">X-Allotly-Budget-Total</td><td className="px-4 py-2">Total budget allocation</td><td className="px-4 py-2 font-mono">10.00</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">X-Allotly-Request-Cost</td><td className="px-4 py-2">Cost of this request</td><td className="px-4 py-2 font-mono">0.0034</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">X-Allotly-Provider</td><td className="px-4 py-2">Provider that handled the request</td><td className="px-4 py-2 font-mono">openai</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono text-xs">X-Allotly-Budget-Warning</td><td className="px-4 py-2">Warning when budget is low</td><td className="px-4 py-2 font-mono">80% used</td></tr>
              </tbody>
            </table>
          </div>

          <SubHeading id="error-codes" title="Error Codes" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            The proxy returns standard HTTP status codes with JSON error bodies:
          </p>
          <div className="overflow-x-auto my-4">
            <table className="w-full text-sm border border-border rounded-md overflow-hidden">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 font-semibold">Code</th>
                  <th className="px-4 py-2.5 font-semibold">Description</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">401</td><td className="px-4 py-2">invalid_api_key</td><td className="px-4 py-2">The API key is missing, invalid, or has been revoked</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">402</td><td className="px-4 py-2">budget_exceeded</td><td className="px-4 py-2">Budget has been fully consumed. No further requests allowed</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">403</td><td className="px-4 py-2">model_not_allowed</td><td className="px-4 py-2">The requested model is not on the allowlist for this key</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">429</td><td className="px-4 py-2">rate_limited</td><td className="px-4 py-2">Too many concurrent requests or provider rate limit hit</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">502</td><td className="px-4 py-2">provider_error</td><td className="px-4 py-2">The upstream AI provider returned an error</td></tr>
                <tr className="border-t border-border"><td className="px-4 py-2 font-mono">504</td><td className="px-4 py-2">provider_timeout</td><td className="px-4 py-2">The upstream AI provider did not respond in time</td></tr>
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground mb-2">Error response format:</p>
          <CodeBlock>{`{
  "error": {
    "type": "budget_exceeded",
    "message": "Your budget of $10.00 has been fully consumed. Remaining: $0.00",
    "code": 402
  }
}`}</CodeBlock>

          <SubHeading id="rate-limits" title="Rate Limits" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            The Allotly proxy enforces per-key rate limits to prevent abuse and ensure fair usage:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Concurrency limit:</strong> Maximum number of simultaneous in-flight requests per key (default: 5).</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Requests per minute:</strong> Maximum requests per minute per key (default: 60).</span></li>
          </ul>
          <p className="text-sm text-muted-foreground mb-4">
            When a rate limit is hit, the proxy returns a 429 status with a <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">Retry-After</code> header
            indicating how many seconds to wait before retrying.
          </p>

          <SubHeading id="streaming" title="Streaming" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            The proxy supports Server-Sent Events (SSE) streaming for all providers. Set <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">"stream": true</code> in your request:
          </p>
          <CodeBlock>{`curl https://your-app.replit.app/api/v1/chat/completions \\
  -H "Authorization: Bearer allotly_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'`}</CodeBlock>
          <p className="text-sm text-muted-foreground mb-4">
            Streaming responses return chunks in OpenAI's SSE format. Budget tracking for streaming requests uses
            the actual token count from the final chunk's usage data. Budget headers are included in the final SSE message.
          </p>

          <h4 className="text-base font-semibold mt-6 mb-3">Python Streaming Example</h4>
          <CodeBlock>{`from openai import OpenAI

client = OpenAI(
    api_key="allotly_sk_...",
    base_url="https://your-app.replit.app/api/v1"
)

stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Tell me a story"}],
    stream=True
)

for chunk in stream:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
print()`}</CodeBlock>

          <h4 className="text-base font-semibold mt-6 mb-3">cURL Example</h4>
          <CodeBlock>{`curl https://your-app.replit.app/api/v1/chat/completions \\
  -H "Authorization: Bearer allotly_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</CodeBlock>

          <SectionHeading id="faq-allotly-down" title="What if Allotly goes down?" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            It depends on which access model you use:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Key className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" /><span><strong>Teams (Direct Access):</strong> Your members' API keys are issued directly by the provider (OpenAI, Anthropic, Google). If Allotly is unavailable, those keys continue to work — members can still call the provider's API directly. Budget enforcement pauses until Allotly recovers, but access is uninterrupted.</span></li>
            <li className="flex gap-2"><Ticket className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" /><span><strong>Vouchers (Proxy Access):</strong> Since requests route through Allotly's proxy, they will fail if the proxy is unavailable. Service resumes when the proxy recovers. We monitor uptime 24/7 and target 99.9% availability.</span></li>
          </ul>

          <SubHeading id="faq-store-prompts" title="Do you store prompts?" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Never. The proxy processes requests in-flight and only logs metadata: token counts, estimated costs, timestamps,
            model names, and status codes. Your prompts and AI responses are never written to disk, logged, or stored
            in any database. They pass through memory only and are discarded after the response is delivered.
          </p>

          <SubHeading id="faq-budget-accuracy" title="How accurate are budgets?" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Accuracy depends on the access model:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Key className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" /><span><strong>Teams:</strong> Budget accuracy depends on polling frequency. At 15-minute intervals, there may be a small overshoot window. In practice, overages are typically less than $0.50 before the next poll catches it.</span></li>
            <li className="flex gap-2"><Ticket className="w-4 h-4 text-cyan-500 shrink-0 mt-0.5" /><span><strong>Vouchers:</strong> Budget enforcement is real-time per-request. The proxy tracks actual token usage from provider responses. Accuracy is within a fraction of a cent.</span></li>
          </ul>

          <SubHeading id="faq-langchain-cursor" title="Can I use Allotly with LangChain, Cursor, or other tools?" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Yes. The Allotly proxy is fully OpenAI-compatible, so any tool that supports custom OpenAI base URLs will work.
            This includes:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground mb-4">
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>LangChain:</strong> Set the <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">openai_api_base</code> parameter to your Allotly proxy URL.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Cursor:</strong> Configure a custom API endpoint in Cursor's settings with your Allotly key.</span></li>
            <li className="flex gap-2"><Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /><span><strong>Any OpenAI SDK:</strong> Set <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">base_url</code> and <code className="px-1 py-0.5 rounded-md bg-muted text-xs font-mono">api_key</code> in the client constructor.</span></li>
          </ul>
          <p className="text-sm text-muted-foreground mb-2">LangChain example:</p>
          <CodeBlock>{`from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o-mini",
    openai_api_key="allotly_sk_...",
    openai_api_base="https://your-app.replit.app/api/v1"
)

response = llm.invoke("What is quantum computing?")
print(response.content)`}</CodeBlock>

          <SubHeading id="faq-teams-vs-vouchers" title="When should I use Teams vs Vouchers?" />
          <p className="text-muted-foreground leading-relaxed mb-6">
            Use <strong>Teams</strong> when you want to give ongoing AI access to internal team members who need direct
            provider API keys (developers, data scientists, engineers). Members call providers directly with zero latency overhead.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Use <strong>Vouchers</strong> when you want to distribute temporary, budget-capped AI access to people outside
            your organization — workshop attendees, hackathon participants, external contractors, students, or beta testers.
            Vouchers don't require recipients to have accounts, and real-time budget enforcement means you'll never overspend.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Many organizations use both: Teams for their internal engineering team and Vouchers for external distribution.
            Both models work from the same dashboard, same connected providers, and same billing.
          </p>

          <SubHeading id="faq-voucher-tiers" title="What are the different voucher tiers?" />
          <p className="text-muted-foreground leading-relaxed mb-4">
            Allotly offers vouchers on every plan, but the limits differ depending on whether you're on the Free plan, Team plan, or using a purchased Bundle. Here's how they compare:
          </p>
          <div className="overflow-x-auto my-6">
            <table className="w-full text-sm border border-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 font-semibold border-b border-border"></th>
                  <th className="text-left px-4 py-3 font-semibold border-b border-border">Free Plan</th>
                  <th className="text-left px-4 py-3 font-semibold border-b border-border">Team Plan</th>
                  <th className="text-left px-4 py-3 font-semibold border-b border-border">Bundle ($10)</th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">Active codes</td>
                  <td className="px-4 py-2.5">1</td>
                  <td className="px-4 py-2.5">5 per admin</td>
                  <td className="px-4 py-2.5">10</td>
                </tr>
                <tr className="border-b border-border bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Redemptions per code</td>
                  <td className="px-4 py-2.5">2</td>
                  <td className="px-4 py-2.5">5</td>
                  <td className="px-4 py-2.5">50 (pooled)</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">Budget per recipient</td>
                  <td className="px-4 py-2.5">Up to $5</td>
                  <td className="px-4 py-2.5">Up to $20</td>
                  <td className="px-4 py-2.5">Up to $25</td>
                </tr>
                <tr className="border-b border-border bg-muted/20">
                  <td className="px-4 py-2.5 font-medium text-foreground">Max expiry</td>
                  <td className="px-4 py-2.5">1 day</td>
                  <td className="px-4 py-2.5">30 days</td>
                  <td className="px-4 py-2.5">30 days</td>
                </tr>
                <tr className="border-b border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">Proxy requests</td>
                  <td className="px-4 py-2.5">500</td>
                  <td className="px-4 py-2.5">5,000</td>
                  <td className="px-4 py-2.5">25,000 (pooled)</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-foreground">Availability</td>
                  <td className="px-4 py-2.5">Included</td>
                  <td className="px-4 py-2.5">Included</td>
                  <td className="px-4 py-2.5">$10 one-time, all plans</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-muted-foreground leading-relaxed mb-4">
            <strong>Free plan vouchers</strong> are designed for quick experiments — share a single code with up to 2 people, each getting a small budget for one day. Great for trying out the voucher workflow before committing.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-4">
            <strong>Team plan vouchers</strong> are included with your subscription and offer significantly more capacity. Each Team Admin can maintain up to 5 active voucher codes, each redeemable by 5 people with higher budgets and longer expiry. Ideal for recurring workshops, onboarding flows, or contractor access.
          </p>
          <p className="text-muted-foreground leading-relaxed mb-12">
            <strong>Bundle vouchers ($10)</strong> are one-time purchases available on any plan — including Free. They unlock the most capacity: 10 codes, 50 pooled redemptions, 25,000 proxy requests, and up to $25 per recipient. Bundles are perfect for hackathons, large training sessions, or any scenario where you need to distribute AI access to many people at once. Redemptions and proxy requests are pooled across all codes in the bundle, so you have flexibility in how you distribute them.
          </p>

        </main>
      </div>
    </div>
  );
}
