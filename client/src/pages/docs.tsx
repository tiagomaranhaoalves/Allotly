import { LogoFull } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useTheme } from "@/components/theme-provider";
import { Link } from "wouter";
import { useState } from "react";
import {
  BookOpen, Key, Ticket, Shield, Zap, BarChart3, Code,
  ChevronRight, ArrowRight, Sun, Moon, Terminal, Users,
  Settings, AlertTriangle, HelpCircle, Globe,
} from "lucide-react";

const SECTIONS = [
  { id: "getting-started", title: "Getting Started", icon: Zap },
  { id: "teams", title: "Teams Setup", icon: Key },
  { id: "vouchers", title: "Vouchers Guide", icon: Ticket },
  { id: "budget", title: "Budget Enforcement", icon: BarChart3 },
  { id: "api", title: "API Reference", icon: Code },
  { id: "faq", title: "FAQ", icon: HelpCircle },
];

function CodeBlock({ lang, children }: { lang?: string; children: string }) {
  return (
    <pre className="p-4 rounded-lg bg-[#1e1e2e] text-[#cdd6f4] font-mono text-sm overflow-x-auto leading-relaxed my-4">
      {children}
    </pre>
  );
}

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <h2 id={id} className="text-2xl font-bold tracking-tight pt-8 pb-3 scroll-mt-20 border-b mb-4">
      {title}
    </h2>
  );
}

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("getting-started");
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Link href="/" data-testid="link-docs-logo">
              <LogoFull size={28} />
            </Link>
            <span className="text-sm font-medium text-muted-foreground">Documentation</span>
          </div>
          <div className="flex items-center gap-3">
            <Button size="icon" variant="secondary" onClick={toggleTheme} data-testid="button-theme-toggle-docs">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Link href="/login">
              <Button variant="secondary" size="sm" data-testid="button-docs-login">Log in</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          <nav className="hidden lg:block w-56 shrink-0 sticky top-24 self-start">
            <ul className="space-y-1">
              {SECTIONS.map(section => (
                <li key={section.id}>
                  <a
                    href={`#${section.id}`}
                    onClick={() => setActiveSection(section.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${activeSection === section.id ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    data-testid={`link-docs-${section.id}`}
                  >
                    <section.icon className="w-4 h-4" />
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <main className="flex-1 min-w-0 max-w-3xl prose prose-slate dark:prose-invert">
            <SectionHeading id="getting-started" title="Getting Started" />

            <p className="text-muted-foreground leading-relaxed">
              Allotly is the AI Spend Control Plane. It helps you distribute AI access to your team
              while keeping your budget intact. There are two main features:
            </p>

            <div className="grid sm:grid-cols-2 gap-4 not-prose my-6">
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Key className="w-4 h-4 text-indigo-500" />
                  <h3 className="font-semibold text-sm">Allotly Teams</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  No-proxy approach. Members get scoped provider keys and call OpenAI, Anthropic, or Google directly.
                  Allotly monitors usage via polling.
                </p>
              </Card>
              <Card className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Ticket className="w-4 h-4 text-cyan-500" />
                  <h3 className="font-semibold text-sm">Allotly Vouchers</h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  Thin-proxy approach. Create voucher codes with budgets. Recipients get an Allotly API key
                  and call our proxy, which enforces limits per-request.
                </p>
              </Card>
            </div>

            <h3 className="text-lg font-semibold mt-6">Quick Start Steps</h3>
            <ol className="space-y-2 text-sm">
              <li><strong>1. Sign up</strong> — Create your organization at <code>/signup</code></li>
              <li><strong>2. Connect a provider</strong> — Add your OpenAI, Anthropic, or Google API key</li>
              <li><strong>3. Add members</strong> — Create teams and add members with budgets</li>
              <li><strong>4. Or create vouchers</strong> — Generate codes for external access</li>
            </ol>

            <SectionHeading id="teams" title="Teams Setup" />

            <h3 className="text-lg font-semibold">Role Hierarchy</h3>
            <p className="text-muted-foreground text-sm">
              Allotly uses a three-level role system:
            </p>

            <div className="not-prose my-4 space-y-2">
              {[
                { role: "Root Admin", desc: "Full org control. Connects providers, creates Team Admins, manages billing.", color: "indigo" },
                { role: "Team Admin", desc: "Manages one team. Adds members, sets budgets, creates vouchers.", color: "cyan" },
                { role: "Member", desc: "End user. Gets API keys, tracks usage, stays within budget.", color: "gray" },
              ].map(r => (
                <div key={r.role} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 text-sm">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full bg-${r.color}-100 text-${r.color}-700 dark:bg-${r.color}-900/40 dark:text-${r.color}-300 shrink-0`}>
                    {r.role}
                  </span>
                  <span className="text-muted-foreground">{r.desc}</span>
                </div>
              ))}
            </div>

            <h3 className="text-lg font-semibold">Connecting Providers</h3>
            <p className="text-sm text-muted-foreground">
              Navigate to <strong>Providers</strong> in the dashboard and click "Connect Provider".
              Enter your admin API key — it's encrypted with AES-256-GCM and never stored in plaintext.
            </p>

            <div className="not-prose my-4 p-4 rounded-lg bg-muted/50 text-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2">Provider</th>
                    <th className="pb-2">Automation</th>
                    <th className="pb-2">Key Provisioning</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr><td className="py-1.5">OpenAI</td><td>Full Auto</td><td>Automatic scoped keys via Projects API</td></tr>
                  <tr><td className="py-1.5">Anthropic</td><td>Semi Auto</td><td>Workspace invite + budget cap via Admin API</td></tr>
                  <tr><td className="py-1.5">Google</td><td>Guided</td><td>Step-by-step manual setup with instructions</td></tr>
                </tbody>
              </table>
            </div>

            <SectionHeading id="vouchers" title="Vouchers Guide" />

            <h3 className="text-lg font-semibold">Creating Vouchers</h3>
            <p className="text-sm text-muted-foreground">
              Root Admins and Team Admins can create voucher codes. Each voucher specifies:
            </p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>Budget per recipient (in dollars)</li>
              <li>Allowed providers (OpenAI, Anthropic, Google)</li>
              <li>Maximum number of redemptions</li>
              <li>Expiration date</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6">Voucher Code Format</h3>
            <CodeBlock lang="text">{`ALLOT-XXXX-XXXX-XXXX

Characters: A-Z, 2-9 (excluding 0, O, 1, I, L for readability)
Example: ALLOT-7K3M-N9WT-4HVX`}</CodeBlock>

            <h3 className="text-lg font-semibold">Redemption Flow</h3>
            <p className="text-sm text-muted-foreground">
              Recipients visit <code>/redeem</code> and enter their code. They can choose:
            </p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li><strong>Instant Key</strong> — No sign-up needed. Key shown once.</li>
              <li><strong>Create Account</strong> — Sign up to track usage in the dashboard.</li>
            </ul>

            <SectionHeading id="budget" title="Budget Enforcement" />

            <h3 className="text-lg font-semibold">Teams (Direct Access)</h3>
            <p className="text-sm text-muted-foreground">
              For Direct access members, Allotly monitors spend via usage polling. When a member hits
              their budget threshold:
            </p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li><strong>80% threshold</strong> — Warning notification sent</li>
              <li><strong>100% threshold</strong> — Key automatically revoked at the provider level</li>
            </ul>

            <h3 className="text-lg font-semibold mt-6">Vouchers (Proxy Access)</h3>
            <p className="text-sm text-muted-foreground">
              For Proxy access, budget enforcement is real-time and per-request:
            </p>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>Each request checks remaining budget before forwarding</li>
              <li>Token count is estimated and cost calculated in real-time</li>
              <li>If budget would be exceeded, request is rejected with a clear error</li>
              <li>Max tokens may be clamped to fit within remaining budget</li>
            </ul>

            <SectionHeading id="api" title="API Reference" />

            <h3 className="text-lg font-semibold">Proxy Endpoint</h3>
            <p className="text-sm text-muted-foreground">
              The Allotly proxy is OpenAI-compatible. Use it with any OpenAI SDK by changing the base URL.
            </p>

            <CodeBlock lang="text">{`Base URL: https://your-app.replit.app/api/v1

Endpoints:
  POST /api/v1/chat/completions    - Chat completions (all providers)
  GET  /api/v1/models              - List available models

Authentication:
  Authorization: Bearer allotly_sk_...`}</CodeBlock>

            <h3 className="text-lg font-semibold mt-6">Python Example</h3>
            <CodeBlock lang="python">{`from openai import OpenAI

client = OpenAI(
    api_key="allotly_sk_...",
    base_url="https://your-app.replit.app/api/v1"
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.choices[0].message.content)`}</CodeBlock>

            <h3 className="text-lg font-semibold">cURL Example</h3>
            <CodeBlock lang="bash">{`curl https://your-app.replit.app/api/v1/chat/completions \\
  -H "Authorization: Bearer allotly_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`}</CodeBlock>

            <h3 className="text-lg font-semibold">Error Responses</h3>
            <div className="not-prose my-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted-foreground border-b">
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b"><td className="py-2"><code>401</code></td><td>Invalid or missing API key</td></tr>
                  <tr className="border-b"><td className="py-2"><code>402</code></td><td>Budget exhausted</td></tr>
                  <tr className="border-b"><td className="py-2"><code>403</code></td><td>Model not allowed for this key</td></tr>
                  <tr className="border-b"><td className="py-2"><code>429</code></td><td>Rate limited by provider</td></tr>
                  <tr><td className="py-2"><code>502</code></td><td>Provider API error</td></tr>
                </tbody>
              </table>
            </div>

            <SectionHeading id="faq" title="FAQ" />

            <div className="not-prose space-y-4 mb-12">
              {[
                {
                  q: "Can I use Allotly with any AI model?",
                  a: "Allotly supports the latest models from all three major labs: OpenAI (GPT-5.2, GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano, GPT-4o, GPT-4o Mini, o3, o3 Mini, o4 Mini), Anthropic (Claude Opus 4.6, Claude Sonnet 4.6, Claude Sonnet 4.5, Claude Opus 4.5, Claude Haiku 4.5), and Google (Gemini 3.1, Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash). We update our model list as new releases come out."
                },
                {
                  q: "What happens if Allotly goes down?",
                  a: "For Teams (Direct access), your members' provider keys continue to work — they call providers directly. For Vouchers (Proxy access), proxy requests will fail until the service recovers."
                },
                {
                  q: "Are my prompts logged or stored?",
                  a: "Never. The proxy processes requests in-flight and only logs metadata (token counts, costs, timestamps). Your prompts and responses are never stored."
                },
                {
                  q: "How is my provider API key secured?",
                  a: "Provider keys are encrypted at rest using AES-256-GCM. The encryption key is stored as an environment variable, separate from the database."
                },
                {
                  q: "Can I use both Teams and Vouchers?",
                  a: "Yes! Many organizations use Teams for their internal engineering team (direct provider access) and Vouchers for workshops, hackathons, or external contractors."
                },
                {
                  q: "What's an External Access Bundle?",
                  a: "Bundles are $10 one-time purchases that give you a pool of 50 voucher redemptions and 25,000 proxy requests. They're available on the Team plan and above."
                },
              ].map((item, i) => (
                <Card key={i} className="p-4">
                  <h4 className="font-semibold text-sm mb-1.5">{item.q}</h4>
                  <p className="text-sm text-muted-foreground">{item.a}</p>
                </Card>
              ))}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
