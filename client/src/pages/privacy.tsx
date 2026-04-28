import PublicLayout from "@/components/public-layout";
import { useTranslation } from "react-i18next";

export default function PrivacyPage() {
  const { t } = useTranslation();
  const sec1Bullets = ["account", "org", "usage", "billing"] as const;
  const sec2Raw = t("pages.privacy.sec2.bullets", { returnObjects: true });
  const sec2Bullets: string[] = Array.isArray(sec2Raw) ? sec2Raw : [];
  const sec4Bullets = ["stripe", "providers"] as const;
  const sec5Bullets = ["free", "team", "enterprise"] as const;
  const sec6Bullets = ["access", "correction", "deletion", "export"] as const;

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">{t("pages.privacy.eyebrow")}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-privacy">
              {t("pages.privacy.heading")}
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">{t("pages.privacy.lastUpdated")}</p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-information-we-collect">{t("pages.privacy.sec1.title")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t("pages.privacy.sec1.intro")}
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec1Bullets.map((id) => (
                  <li key={id}>
                    <strong className="text-foreground">{t(`pages.privacy.sec1.bullets.${id}.label`)}</strong>
                    {t(`pages.privacy.sec1.bullets.${id}.text`)}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                <strong className="text-foreground">{t("pages.privacy.sec1.notCollectedLabel")}</strong>
                {t("pages.privacy.sec1.notCollectedText")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-how-we-use">{t("pages.privacy.sec2.title")}</h2>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec2Bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-data-storage">{t("pages.privacy.sec3.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec3.body")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-third-party">{t("pages.privacy.sec4.title")}</h2>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec4Bullets.map((id) => (
                  <li key={id}>
                    <strong className="text-foreground">{t(`pages.privacy.sec4.bullets.${id}.label`)}</strong>
                    {t(`pages.privacy.sec4.bullets.${id}.text`)}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-data-retention">{t("pages.privacy.sec5.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec5.intro")}
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec5Bullets.map((id) => (
                  <li key={id}>
                    <strong className="text-foreground">{t(`pages.privacy.sec5.bullets.${id}.label`)}</strong>
                    {t(`pages.privacy.sec5.bullets.${id}.text`)}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                {t("pages.privacy.sec5.account")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-your-rights">{t("pages.privacy.sec6.title")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">{t("pages.privacy.sec6.intro")}</p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec6Bullets.map((id) => (
                  <li key={id}>
                    <strong className="text-foreground">{t(`pages.privacy.sec6.bullets.${id}.label`)}</strong>
                    {t(`pages.privacy.sec6.bullets.${id}.text`)}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                {t("pages.privacy.sec6.contactPrefix")}
                <a href="mailto:privacy@allotly.ai" className="text-indigo-500 hover:text-indigo-400 transition-colors">privacy@allotly.ai</a>
                {t("pages.privacy.sec6.contactSuffix")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-cookies">{t("pages.privacy.sec7.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec7.body")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-contact-privacy">{t("pages.privacy.sec8.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec8.bodyPrefix")}
                <a href="mailto:privacy@allotly.ai" className="text-indigo-500 hover:text-indigo-400 transition-colors">privacy@allotly.ai</a>
                {t("pages.privacy.sec8.bodySuffix")}
              </p>
            </section>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
