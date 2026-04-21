import { Trans, useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HowThisWorksDrawer({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-neutral-950 border-white/10 text-white w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">{t("arena.howItWorks.title")}</SheetTitle>
          <SheetDescription className="text-white/70">
            {t("arena.howItWorks.subtitle")}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm text-white/80">
          <section>
            <h3 className="font-semibold text-white">{t("arena.howItWorks.rolesTitle")}</h3>
            <p className="mt-1 text-white/65">
              <Trans
                i18nKey="arena.howItWorks.rolesBody"
                components={{
                  strong: <strong />,
                  code: <code className="font-mono text-[12px] text-white/85" />,
                }}
              />
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-white">{t("arena.howItWorks.endpointTitle")}</h3>
            <p className="mt-1 text-white/65">
              {t("arena.howItWorks.endpointBody")}
            </p>
            <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-white/80 overflow-x-auto">
{`POST https://allotly.ai/api/v1/chat/completions
Authorization: Bearer allotly_sk_...
Content-Type: application/json

{ "model": "gpt-4o-mini", "messages": [...], "stream": true }`}
            </pre>
          </section>

          <section>
            <h3 className="font-semibold text-white">{t("arena.howItWorks.budgetTitle")}</h3>
            <p className="mt-1 text-white/65">
              {t("arena.howItWorks.budgetBody")}
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-white">{t("arena.howItWorks.headersTitle")}</h3>
            <p className="mt-1 text-white/65">
              {t("arena.howItWorks.headersBody")}
            </p>
            <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-white/80 overflow-x-auto">
{`X-Allotly-Budget-Remaining: 182
X-Allotly-Budget-Total: 2000
X-Allotly-Key-Type: VOUCHER
X-Allotly-Expires: 2026-05-18T00:00:00Z`}
            </pre>
          </section>

          <section>
            <h3 className="font-semibold text-white">{t("arena.howItWorks.cachedTitle")}</h3>
            <p className="mt-1 text-white/65">
              {t("arena.howItWorks.cachedBody")}
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
