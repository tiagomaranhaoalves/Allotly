import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Shield, Unlock, Layers, ArrowRight } from "lucide-react";

const principles = [
  {
    icon: Shield,
    title: "Your Data Path, Not Ours",
    description:
      "With Teams, API calls go directly from your infrastructure to the provider. We never see your prompts, completions, or conversation history. We only track usage metadata for billing and budgets.",
  },
  {
    icon: Unlock,
    title: "Budgets, Not Barriers",
    description:
      "Set spending limits that protect your organization without slowing anyone down. Teams get the AI access they need, and finance gets the visibility they require.",
  },
  {
    icon: Layers,
    title: "Provider-Native, Not Lock-In",
    description:
      "Use OpenAI, Anthropic, Google, or any combination. Allotly works with your existing provider accounts and API keys. Switch providers anytime without changing your workflow.",
  },
];

export default function About() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 dark:from-indigo-500/10 dark:to-cyan-500/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">
            About Allotly
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight"
            data-testid="heading-about"
          >
            We believe AI access shouldn't come with a spreadsheet.
          </h1>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-semibold text-foreground mb-8">Our Story</h2>
        <div className="space-y-5 text-muted-foreground leading-relaxed">
          <p>
            Every team we talked to had the same problem. They wanted their people to use AI, but
            had no way to manage the cost. Some handed out a single shared API key and hoped for the
            best. Others locked everything behind approval workflows that killed momentum. A few
            just put it on a corporate card and winced at the end of the month.
          </p>
          <p>
            We started Allotly because we believed there was a better way. Not another AI platform
            or wrapper, but a control plane that sits alongside the tools teams already use. One
            that gives finance real-time visibility into spend, gives managers per-team budgets, and
            gives individual contributors frictionless access to whichever AI provider they need.
          </p>
          <p>
            The result is a system that works for organizations of every size, whether you're a
            five-person startup handing out API keys for the first time or an enterprise managing
            hundreds of teams across multiple providers and regions.
          </p>
        </div>
      </section>

      <section className="bg-muted/40 dark:bg-muted/20 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6">What Allotly Does</h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed">
            <p>
              <span className="font-medium text-foreground">Teams</span> let organizations connect
              their own AI provider accounts, set budgets per team or department, and track usage in
              real time. API calls go directly to the provider, so your data never passes through
              our servers. You get spending controls and analytics without sacrificing privacy.
            </p>
            <p>
              <span className="font-medium text-foreground">Vouchers</span> give individuals or
              small groups pre-paid AI access without needing their own provider account. Buy a
              bundle of credits, generate a voucher code, and share it. The recipient redeems the
              code and gets an API key that works instantly, with a built-in spending cap.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl font-semibold text-foreground mb-10 text-center">
          Our Principles
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {principles.map((p) => (
            <Card key={p.title} data-testid={`card-principle-${p.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <CardContent className="p-6 pt-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 mb-4">
                  <p.icon className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{p.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl font-semibold text-foreground mb-4">
          Ready to take control of your AI spend?
        </h2>
        <p className="text-muted-foreground mb-8">
          Get started for free. No credit card required.
        </p>
        <Link href="/signup">
          <Button
            className="gap-1.5 bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25 rounded-full px-6"
            data-testid="button-cta-start-free"
          >
            Start Free <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </section>
    </PublicLayout>
  );
}
