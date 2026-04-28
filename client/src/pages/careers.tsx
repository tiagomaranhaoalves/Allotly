import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Rocket, Lightbulb, Handshake, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";

const values = [
  { id: "shipFast", testSlug: "ship-fast", icon: Rocket },
  { id: "firstPrinciples", testSlug: "think-from-first-principles", icon: Lightbulb },
  { id: "trust", testSlug: "trust-by-default", icon: Handshake },
  { id: "buildForBuilders", testSlug: "build-for-builders", icon: Wrench },
] as const;

export default function Careers() {
  const { t } = useTranslation();
  return (
    <PublicLayout>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-cyan-500/5 dark:from-indigo-500/10 dark:to-cyan-500/10" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-24 sm:py-32 text-center">
          <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">
            {t("pages.careers.eyebrow")}
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-foreground leading-tight"
            data-testid="heading-careers"
          >
            {t("pages.careers.heading")}
          </h1>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-2xl font-semibold text-foreground mb-10 text-center">
          {t("pages.careers.valuesHeading")}
        </h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {values.map((v) => (
            <Card key={v.id} data-testid={`card-value-${v.testSlug}`}>
              <CardContent className="p-6 pt-6">
                <div className="flex items-center justify-center w-10 h-10 rounded-md bg-indigo-500/10 dark:bg-indigo-500/20 mb-4">
                  <v.icon className="w-5 h-5 text-indigo-500" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">{t(`pages.careers.values.${v.id}.title`)}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{t(`pages.careers.values.${v.id}.description`)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="bg-muted/40 dark:bg-muted/20 py-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-semibold text-foreground mb-6">{t("pages.careers.openHeading")}</h2>
          <p className="text-muted-foreground leading-relaxed mb-6">
            {t("pages.careers.openBody")}
          </p>
          <a
            href="mailto:careers@allotly.ai"
            className="text-indigo-500 hover:text-indigo-400 font-medium transition-colors"
            data-testid="link-careers-email"
          >
            careers@allotly.ai
          </a>
        </div>
      </section>

      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h2 className="text-2xl font-semibold text-foreground mb-4">
          {t("pages.careers.referralHeading")}
        </h2>
        <p className="text-muted-foreground">
          {t("pages.careers.referralBody")}
        </p>
      </section>
    </PublicLayout>
  );
}
