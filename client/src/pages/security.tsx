import PublicLayout from "@/components/public-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Shield, Lock, Eye, EyeOff, Server, FileCheck, Database, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

const architectureCards = [
  { id: "teamsZero", testSlug: "teams-zero-data-path", icon: Shield },
  { id: "vouchersProxy", testSlug: "vouchers-process-only-proxy", icon: Lock },
] as const;

const encryptionItems = ["apiKeys", "passwords", "transit", "database"] as const;
const complianceItems = [
  { id: "gdpr", statusKey: "statusCompliant" as const },
  { id: "audit", statusKey: "statusActive" as const },
] as const;
const infrastructureItems = [
  { id: "postgres", icon: Server },
  { id: "redis", icon: Server },
  { id: "audit", icon: FileCheck },
] as const;

export default function SecurityPage() {
  const { t } = useTranslation();
  const dataStoredRaw = t("pages.security.dataStored", { returnObjects: true });
  const dataNotStoredRaw = t("pages.security.dataNotStored", { returnObjects: true });
  const dataStored: string[] = Array.isArray(dataStoredRaw) ? dataStoredRaw : [];
  const dataNotStored: string[] = Array.isArray(dataNotStoredRaw) ? dataNotStoredRaw : [];

  return (
    <PublicLayout>
      <section className="py-20 sm:py-28">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <p className="text-xs uppercase tracking-widest text-indigo-500 font-semibold mb-4">{t("pages.security.eyebrow")}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight" data-testid="heading-security">
              {t("pages.security.heading")}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {t("pages.security.lead")}
            </p>
          </div>

          <div className="space-y-12">
            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-architecture">{t("pages.security.archHeading")}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {architectureCards.map((card) => (
                  <Card key={card.id} className="p-6" data-testid={`card-security-${card.testSlug}`}>
                    <CardContent className="p-0 space-y-4">
                      <div className="w-10 h-10 rounded-md bg-indigo-500/10 flex items-center justify-center">
                        <card.icon className="w-5 h-5 text-indigo-500" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg mb-2">{t(`pages.security.architecture.${card.id}.title`)}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{t(`pages.security.architecture.${card.id}.description`)}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="secondary" className="text-xs">{t(`pages.security.architecture.${card.id}.badge1`)}</Badge>
                        <Badge variant="secondary" className="text-xs">{t(`pages.security.architecture.${card.id}.badge2`)}</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-encryption">{t("pages.security.encryptionHeading")}</h2>
              <Card className="p-6">
                <CardContent className="p-0">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {encryptionItems.map((id) => (
                      <div key={id} className="flex items-start gap-3">
                        <Lock className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{t(`pages.security.encryption.${id}.label`)}</p>
                          <p className="text-sm text-muted-foreground">{t(`pages.security.encryption.${id}.detail`)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-data-practices">{t("pages.security.dataPracticesHeading")}</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="p-6" data-testid="card-security-data-we-store">
                  <CardContent className="p-0 space-y-4">
                    <div className="flex items-center gap-2">
                      <Eye className="w-5 h-5 text-muted-foreground" />
                      <h3 className="font-semibold">{t("pages.security.whatStoreTitle")}</h3>
                    </div>
                    <ul className="space-y-2">
                      {dataStored.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
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
                      <h3 className="font-semibold">{t("pages.security.whatNotStoreTitle")}</h3>
                    </div>
                    <ul className="space-y-2">
                      {dataNotStored.map((item, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
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
              <h2 className="text-xl font-semibold mb-6" data-testid="section-compliance">{t("pages.security.complianceHeading")}</h2>
              <div className="grid sm:grid-cols-3 gap-6">
                {complianceItems.map((item) => (
                  <Card key={item.id} className="p-6">
                    <CardContent className="p-0 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <h3 className="font-semibold">{t(`pages.security.compliance.${item.id}.label`)}</h3>
                        <Badge variant="default" className="text-xs">
                          {t(`pages.security.${item.statusKey}`)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{t(`pages.security.compliance.${item.id}.description`)}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-infrastructure">{t("pages.security.infrastructureHeading")}</h2>
              <Card className="p-6">
                <CardContent className="p-0">
                  <div className="grid sm:grid-cols-3 gap-4">
                    {infrastructureItems.map((item) => (
                      <div key={item.id} className="flex items-start gap-3">
                        <item.icon className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{t(`pages.security.infrastructure.${item.id}.label`)}</p>
                          <p className="text-sm text-muted-foreground">{t(`pages.security.infrastructure.${item.id}.detail`)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h2 className="text-xl font-semibold mb-6" data-testid="section-responsible-disclosure">{t("pages.security.disclosureHeading")}</h2>
              <Card className="p-6" data-testid="card-security-disclosure">
                <CardContent className="p-0 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-md bg-amber-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{t("pages.security.disclosureTitle")}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed mb-2">
                      {t("pages.security.disclosureBody")}
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
