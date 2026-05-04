import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, Headphones, Building2, Send, CheckCircle2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import { TurnstileWidget, isTurnstileConfigured, type TurnstileWidgetHandle } from "@/components/turnstile-widget";

const contacts = [
  { id: "general", testSlug: "general-inquiries", icon: Mail, email: "hello@allotly.ai" },
  { id: "sales", testSlug: "sales", icon: Building2, email: "sales@allotly.ai" },
  { id: "support", testSlug: "support", icon: Headphones, email: "support@allotly.ai" },
] as const;

export default function ContactPage() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);
  const { toast } = useToast();
  const captchaRequired = isTurnstileConfigured();
  const handleTurnstileVerify = useCallback((token: string | null) => setTurnstileToken(token), []);

  const contactMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; message: string; turnstile_token?: string }) => {
      const res = await apiRequest("POST", "/api/contact", data);
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: t("pages.contact.toastSuccessTitle"), description: t("pages.contact.toastSuccessBody") });
    },
    onError: () => {
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      toast({ title: t("pages.contact.toastErrorTitle"), description: t("pages.contact.toastErrorBody"), variant: "destructive" });
    },
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const name = (form.elements.namedItem("name") as HTMLInputElement).value;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const message = (form.elements.namedItem("message") as HTMLTextAreaElement).value;
    if (captchaRequired && !turnstileToken) {
      toast({ title: t("pages.contact.toastErrorTitle"), description: "Please complete the captcha challenge.", variant: "destructive" });
      return;
    }
    contactMutation.mutate({ name, email, message, ...(turnstileToken ? { turnstile_token: turnstileToken } : {}) });
  }

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">{t("pages.contact.eyebrow")}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-contact">
              {t("pages.contact.heading")}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("pages.contact.lead")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mb-16">
            {contacts.map((c) => (
              <Card key={c.id} className="p-6" data-testid={`card-contact-${c.testSlug}`}>
                <CardContent className="p-0 flex flex-col items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-indigo-500/10 flex items-center justify-center">
                    <c.icon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg mb-1">{t(`pages.contact.cards.${c.id}.title`)}</h3>
                    <p className="text-sm text-muted-foreground mb-3">{t(`pages.contact.cards.${c.id}.description`)}</p>
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
                <h2 className="text-xl font-semibold mb-1">{t("pages.contact.formHeading")}</h2>
                <p className="text-sm text-muted-foreground mb-6">{t("pages.contact.formSubheading")}</p>

                {submitted ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center gap-4" data-testid="text-form-success">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                    <div>
                      <p className="font-semibold text-lg">{t("pages.contact.successTitle")}</p>
                      <p className="text-sm text-muted-foreground mt-1">{t("pages.contact.successBody")}</p>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4" data-testid="form-contact">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{t("pages.contact.nameLabel")}</Label>
                        <Input id="name" placeholder={t("pages.contact.namePlaceholder")} required data-testid="input-name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{t("pages.contact.emailLabel")}</Label>
                        <Input id="email" type="email" placeholder={t("pages.contact.emailPlaceholder")} required data-testid="input-email" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="message">{t("pages.contact.messageLabel")}</Label>
                      <Textarea id="message" placeholder={t("pages.contact.messagePlaceholder")} className="resize-none min-h-[120px]" required data-testid="input-message" />
                    </div>
                    {captchaRequired && (
                      <TurnstileWidget ref={turnstileRef} onVerify={handleTurnstileVerify} className="flex justify-center" />
                    )}
                    <Button
                      type="submit"
                      className="w-full gap-2 bg-indigo-600 border-indigo-700 text-white"
                      data-testid="button-send-message"
                      disabled={contactMutation.isPending || (captchaRequired && !turnstileToken)}
                    >
                      <Send className="w-4 h-4" />
                      {contactMutation.isPending ? t("pages.contact.sendingButton") : t("pages.contact.sendButton")}
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
