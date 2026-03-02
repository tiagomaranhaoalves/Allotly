import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Headphones, Building2, Send, CheckCircle2 } from "lucide-react";
import { useState } from "react";

const contacts = [
  {
    icon: Mail,
    title: "General Inquiries",
    email: "hello@allotly.com",
    description: "Questions about Allotly, partnerships, or anything else.",
  },
  {
    icon: Building2,
    title: "Sales",
    email: "sales@allotly.com",
    description: "Enterprise plans, volume pricing, and custom deployments.",
  },
  {
    icon: Headphones,
    title: "Support",
    email: "support@allotly.com",
    description: "Technical help, bug reports, and account assistance.",
  },
];

export default function ContactPage() {
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitted(true);
  }

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">CONTACT</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-contact">
              We'd love to hear from you.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Whether you have a question, want to explore enterprise options, or need help with your account, we're here.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {contacts.map((c) => (
              <Card key={c.title} className="p-6" data-testid={`card-contact-${c.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <CardContent className="p-0 flex flex-col items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-indigo-500/10 flex items-center justify-center">
                    <c.icon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{c.title}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{c.description}</p>
                    <a
                      href={`mailto:${c.email}`}
                      className="text-sm font-medium text-indigo-500 hover:text-indigo-400 transition-colors"
                      data-testid={`link-email-${c.email.split("@")[0]}`}
                    >
                      {c.email}
                    </a>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="max-w-xl mx-auto">
            <Card className="p-6 sm:p-8">
              <CardContent className="p-0">
                <h2 className="text-xl font-semibold mb-1">Send us a message</h2>
                <p className="text-sm text-muted-foreground mb-6">We'll get back to you as soon as we can.</p>

                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-4" data-testid="text-form-success">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    <div>
                      <p className="font-semibold text-lg">Message sent!</p>
                      <p className="text-sm text-muted-foreground mt-1">Thanks for reaching out. We'll be in touch soon.</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contact">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name</Label>
                        <Input id="name" placeholder="Your name" required data-testid="input-name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input id="email" type="email" placeholder="you@example.com" required data-testid="input-email" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message">Message</Label>
                      <Textarea id="message" placeholder="How can we help?" className="resize-none min-h-[120px]" required data-testid="input-message" />
                    </div>
                    <Button type="submit" className="w-full gap-2 bg-indigo-600 border-indigo-700 text-white" data-testid="button-send-message">
                      <Send className="w-4 h-4" />
                      Send Message
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}