import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { Shield, Unlock, Layers, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

const principles = [
  { id: "dataPath", testSlug: "your-data-path-not-ours-", icon: Shield },
  { id: "budgets", testSlug: "budgets-not-barriers", icon: Unlock },
  { id: "providerNative", testSlug: "provider-native-not-lock-in", icon: Layers },
] as const;

export default function About() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 dark:from-indigo-500/10 dark:to-cyan-500/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">
            {t("pages.about.eyebrow")}
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight"
            data-testid="heading-about"
          >
            {t("pages.about.heading")}
          </h1>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-semibold text-foreground mb-8">{t("pages.about.storyHeading")}</h2>
        <div className="space-y-5 text-muted-foreground leading-relaxed">
          <p>{t("pages.about.storyP1")}</p>
          <p>{t("pages.about.storyP2")}</p>
          <p>{t("pages.about.storyP3")}</p>
        </div>
      </section>

      <section className="bg-muted/40 dark:bg-muted/20 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-semibold text-foreground mb-6">{t("pages.about.whatHeading")}</h2>
          <div className="space-y-5 text-muted-foreground leading-relaxed">
            <p>
              <span className="font-medium text-foreground">{t("pages.about.whatTeamsLabel")}</span>
              {t("pages.about.whatTeamsBody")}
            </p>
            <p>
              <span className="font-medium text-foreground">{t("pages.about.whatVouchersLabel")}</span>
              {t("pages.about.whatVouchersBody")}
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl font-semibold text-foreground mb-10 text-center">
          {t("pages.about.principlesHeading")}
        </h2>
        <div className="grid sm:grid-cols-3 gap-6">
          {principles.map((p) => (
            <Card key={p.id} data-testid={`card-principle-${p.testSlug}`}>
              <CardContent className="p-6 pt-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 mb-4">
                  <p.icon className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{t(`pages.about.principles.${p.id}.title`)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(`pages.about.principles.${p.id}.description`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl font-semibold text-foreground mb-4">
          {t("pages.about.ctaHeading")}
        </h2>
        <p className="text-muted-foreground mb-8">
          {t("pages.about.ctaBody")}
        </p>
        <Link href="/signup">
          <Button
            className="gap-1.5 bg-indigo-600 border-indigo-700 text-white shadow-lg shadow-indigo-500/25 rounded-full px-6"
            data-testid="button-cta-start-free"
          >
            {t("pages.about.ctaButton")} <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </section>

      <section className="border-t border-border py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("pages.about.legalEntityPrefix")}
            <a href="https://divbz.co.uk/" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-400 underline">
              {t("pages.about.legalEntityCompany")}
            </a>
            .<br />
            {t("pages.about.legalEntityRegistration")}<br />
            {t("pages.about.legalEntityOffice")}
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
