import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Eye, EyeOff, Server, FileCheck, Database, AlertTriangle } from "lucide-react";

const architectureCards = [
  {
    icon: Shield,
    title: "Teams: Zero Data Path",
    description: "When organizations connect their own API keys, calls go directly from the client to the provider. Allotly never sees, stores, or proxies prompt or completion data.",
    badges: ["Direct Connection", "No Proxy"],
  },
  {
    icon: Lock,
    title: "Vouchers: Process-Only Proxy",
    description: "Voucher-based calls are proxied through Allotly solely for metering. Prompts and completions flow through but are never logged, cached, or stored.",
    badges: ["Metering Only", "No Storage"],
  },
];

const encryptionItems = [
  { label: "API Keys", detail: "AES-256-GCM encryption at rest" },
  { label: "Passwords", detail: "bcrypt hashing with salting" },
  { label: "In Transit", detail: "HTTPS/TLS for all connections" },
  { label: "Database", detail: "Encrypted at rest (PostgreSQL)" },
];

const dataStored = [
  "Account information (name, email)",
  "Organization and team metadata",
  "Usage metrics (token counts, costs, timestamps)",
  "Provider configurations (encrypted keys)",
];

const dataNotStored = [
  "Prompts or input content",
  "Completions or output content",
  "Conversation history",
  "Files or attachments sent to AI models",
];

const complianceItems = [
  { label: "GDPR", status: "Compliant", description: "GDPR-compliant architecture and data handling" },
  { label: "Audit Logging", status: "Active", description: "Comprehensive audit trail for all administrative actions" },
];

export default function SecurityPage() {
  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">SECURITY</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-security">
              Security is foundational, not an afterthought.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              We've designed Allotly so your sensitive data stays where it belongs — with you and your providers.
            </p>
          </div>

          <div className="space-y-12">
            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-architecture">Architecture Overview</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {architectureCards.map((card) => (
                  <Card key={card.title} className="p-6" data-testid={`card-security-${card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>
                    <CardContent className="p-0 space-y-4">
                      <div className="w-10 h-10 rounded-md bg-indigo-500/10 flex items-center justify-center">
                        <card.icon className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-2">{card.title}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{card.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {card.badges.map((b) => (
                          <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-encryption">Encryption</h2>
              <Card className="p-6">
                <CardContent className="p-0">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {encryptionItems.map((item) => (
                      <div key={item.label} className="flex items-start gap-3">
                        <Lock className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{item.label}</p>
                          <p className="text-sm text-muted-foreground">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-data-practices">Data Practices</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="p-6" data-testid="card-security-data-we-store">
                  <CardContent className="p-0 space-y-4">
                    <div className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-muted-foreground" />
                      <h3 className="font-semibold">What We Store</h3>
                    </div>
                    <ul className="space-y-2">
                      {dataStored.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <Database className="w-3.5 h-3.5 mt-0.5 shrink-0 text-indigo-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
                <Card className="p-6" data-testid="card-security-data-we-dont-store">
                  <CardContent className="p-0 space-y-4">
                    <div className="flex items-center gap-2">
                      <EyeOff className="w-5 h-5 text-muted-foreground" />
                      <h3 className="font-semibold">What We Don't Store</h3>
                    </div>
                    <ul className="space-y-2">
                      {dataNotStored.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-500" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-compliance">Compliance</h2>
              <div className="grid sm:grid-cols-3 gap-6">
                {complianceItems.map((item) => (
                  <Card key={item.label} className="p-6">
                    <CardContent className="p-0 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold">{item.label}</h3>
                        <Badge variant={item.status === "Active" || item.status === "Compliant" ? "default" : "secondary"} className="text-xs">
                          {item.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-infrastructure">Infrastructure</h2>
              <Card className="p-6">
                <CardContent className="p-0">
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="flex items-start gap-3">
                      <Server className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">PostgreSQL</p>
                        <p className="text-sm text-muted-foreground">Primary data store, encrypted at rest</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Server className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Redis</p>
                        <p className="text-sm text-muted-foreground">Rate limiting, caching, session management</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <FileCheck className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium text-sm">Audit Logging</p>
                        <p className="text-sm text-muted-foreground">Full trail of administrative actions</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-responsible-disclosure">Responsible Disclosure</h2>
              <Card className="p-6" data-testid="card-security-disclosure">
                <CardContent className="p-0 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">Found a vulnerability?</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                      We take security seriously. If you discover a security issue, please report it responsibly.
                      Do not disclose it publicly until we've had a chance to address it.
                    </p>
                    <a
                      href="mailto:security@allotly.ai"
                      className="text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
                      data-testid="link-email-security"
                    >
                      security@allotly.ai
                    </a>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}