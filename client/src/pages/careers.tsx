import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Rocket, Lightbulb, Handshake, Wrench } from "lucide-react";

const values = [
  {
    icon: Rocket,
    title: "Ship Fast",
    description:
      "We bias toward action. Small teams, short cycles, real feedback. We'd rather ship something imperfect and iterate than spend months planning in the dark.",
  },
  {
    icon: Lightbulb,
    title: "Think From First Principles",
    description:
      "We question assumptions and work backward from the problem. If the conventional approach doesn't serve our users, we find a better one.",
  },
  {
    icon: Handshake,
    title: "Trust by Default",
    description:
      "We hire people we trust, then give them the context and autonomy to do great work. No micro-management, no unnecessary process.",
  },
  {
    icon: Wrench,
    title: "Build for Builders",
    description:
      "Our users are developers and technical teams. We build tools we'd want to use ourselves: clean APIs, clear documentation, and no unnecessary friction.",
  },
];

export default function Careers() {
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 dark:from-indigo-500/10 dark:to-cyan-500/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">
            Careers
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight"
            data-testid="heading-careers"
          >
            Build the control plane for AI spend.
          </h1>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl font-semibold text-foreground mb-10 text-center">
          What We Value
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {values.map((v) => (
            <Card key={v.title} data-testid={`card-value-${v.title.toLowerCase().replace(/[^a-z]+/g, "-")}`}>
              <CardContent className="p-6 pt-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 mb-4">
                  <v.icon className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{v.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{v.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 dark:bg-muted/20 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-6">Open Positions</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            If you're passionate about developer tools,
            infrastructure, or the future of AI access, we'd love to hear from you.
          </p>
          <a
            href="mailto:careers@allotly.com"
            className="text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
            data-testid="link-careers-email"
          >
            careers@allotly.com
          </a>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl font-semibold text-foreground mb-4">
          Know someone who'd be great here?
        </h2>
        <p className="text-muted-foreground">
          Share this page with them. The best teams are built through great referrals.
        </p>
      </section>
    </PublicLayout>
  );
}
