import PublicLayout from "@/components/public-layout";
import { useTranslation } from "react-i18next";

export default function TermsPage() {
  const { t } = useTranslation();
  const sec3Bullets = ["teams", "vouchers"] as const;
  const sec4Bullets = ["free", "team", "enterprise"] as const;
  const sec5Raw = t("pages.terms.sec5.bullets", { returnObjects: true });
  const sec5Bullets: string[] = Array.isArray(sec5Raw) ? sec5Raw : [];

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">{t("pages.terms.eyebrow")}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-terms">
              {t("pages.terms.heading")}
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">{t("pages.terms.lastUpdated")}</p>
          </div>

          <div className="prose prose-neutral dark:prose-invert max-w-none space-y-10">
            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-acceptance">{t("pages.terms.sec1.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec1.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-account-registration">{t("pages.terms.sec2.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec2.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-service-description">{t("pages.terms.sec3.title")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t("pages.terms.sec3.intro")}
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec3Bullets.map((id) => (
                  <li key={id}>
                    <strong className="text-foreground">{t(`pages.terms.sec3.bullets.${id}.label`)}</strong>
                    {t(`pages.terms.sec3.bullets.${id}.text`)}
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-billing">{t("pages.terms.sec4.title")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t("pages.terms.sec4.intro")}
              </p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec4Bullets.map((id) => (
                  <li key={id}>
                    <strong className="text-foreground">{t(`pages.terms.sec4.bullets.${id}.label`)}</strong>
                    {t(`pages.terms.sec4.bullets.${id}.text`)}
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground leading-relaxed mt-3">
                {t("pages.terms.sec4.outro")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-acceptable-use">{t("pages.terms.sec5.title")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">{t("pages.terms.sec5.intro")}</p>
              <ul className="list-disc pl-6 space-y-1.5 text-muted-foreground">
                {sec5Bullets.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-api-usage">{t("pages.terms.sec6.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec6.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-intellectual-property">{t("pages.terms.sec7.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec7.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-limitation-liability">{t("pages.terms.sec8.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec8.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-termination">{t("pages.terms.sec9.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec9.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-changes">{t("pages.terms.sec10.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec10.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-governing-law">{t("pages.terms.sec11.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">{t("pages.terms.sec11.body")}</p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-contact-terms">{t("pages.terms.sec12.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.terms.sec12.bodyPrefix")}
                <a href="mailto:legal@allotly.ai" className="text-indigo-500 hover:text-indigo-400 transition-colors">legal@allotly.ai</a>
                {t("pages.terms.sec12.bodySuffix")}
              </p>
            </section>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
