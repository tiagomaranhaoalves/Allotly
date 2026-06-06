import PublicLayout from "@/components/public-layout";
import { useTranslation } from "react-i18next";
import { usePageMeta } from "@/hooks/use-page-meta";

const LEGAL_ENTITY = "DivBZ Ventures Ltd";
const JURISDICTION = "England and Wales";
const REGISTERED_ADDRESS = "71-75 Shelton Street, Covent Garden, London, WC2H 9JQ";

export default function PrivacyPage() {
  const { t } = useTranslation();
  usePageMeta({
    title: "Privacy Policy | Allotly",
    description: "Allotly's privacy policy — how we collect, use, and protect your personal data.",
  });
  const sec1Bullets = ["account", "org", "usage", "billing"] as const;
  const sec2Raw = t("pages.privacy.sec2.bullets", { returnObjects: true });
  const sec2Bullets: string[] = Array.isArray(sec2Raw) ? sec2Raw : [];
  const sec4Bullets = ["stripe", "providers"] as const;
  const sec5Bullets = ["free", "team", "enterprise"] as const;
  const sec6Bullets = ["access", "correction", "deletion", "export", "objectRestrict"] as const;

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
              <h2 className="text-xl font-semibold mb-3" data-testid="section-who-we-are">{t("pages.privacy.controller.title")}</h2>
              <p className="text-muted-foreground leading-relaxed mb-3">
                {t("pages.privacy.controller.body1")}
                <strong className="text-foreground" data-testid="text-legal-entity">{LEGAL_ENTITY}</strong>
                {t("pages.privacy.controller.body2")}
                <strong className="text-foreground" data-testid="text-jurisdiction">{JURISDICTION}</strong>
                {t("pages.privacy.controller.body3")}
                <strong className="text-foreground" data-testid="text-registered-address">{REGISTERED_ADDRESS}</strong>
                {t("pages.privacy.controller.body4")}
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.controller.contactPrefix")}
                <a href="mailto:privacy@allotly.ai" className="text-indigo-500 hover:text-indigo-400 transition-colors" data-testid="link-controller-email">privacy@allotly.ai</a>
                {t("pages.privacy.controller.contactSuffix")}
              </p>
            </section>

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
              <p className="text-muted-foreground leading-relaxed mt-3" data-testid="text-legal-basis">
                <strong className="text-foreground">{t("pages.privacy.sec2.legalBasisLabel")}</strong>
                {t("pages.privacy.sec2.legalBasisText")}
              </p>
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
              <p className="text-muted-foreground leading-relaxed mt-3" data-testid="text-international-transfers">
                <strong className="text-foreground">{t("pages.privacy.sec4.internationalTransfersLabel")}</strong>
                {t("pages.privacy.sec4.internationalTransfersText")}
              </p>
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
                <a href="mailto:privacy@allotly.ai" className="text-indigo-500 hover:text-indigo-400 transition-colors" data-testid="link-rights-email">privacy@allotly.ai</a>
                {t("pages.privacy.sec6.contactSuffix")}
              </p>
              <p className="text-muted-foreground leading-relaxed mt-3" data-testid="text-supervisory-authority">
                {t("pages.privacy.sec6.supervisoryPrefix")}
                <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:text-indigo-400 transition-colors" data-testid="link-ico">ico.org.uk</a>
                {t("pages.privacy.sec6.supervisorySuffix")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-cookies">{t("pages.privacy.sec7.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec7.body")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-changes">{t("pages.privacy.sec8.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec8.body")}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-3" data-testid="section-contact-privacy">{t("pages.privacy.sec9.title")}</h2>
              <p className="text-muted-foreground leading-relaxed">
                {t("pages.privacy.sec9.bodyPrefix")}
                <a href="mailto:privacy@allotly.ai" className="text-indigo-500 hover:text-indigo-400 transition-colors" data-testid="link-contact-email">privacy@allotly.ai</a>
                {t("pages.privacy.sec9.bodySuffix")}
              </p>
            </section>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
