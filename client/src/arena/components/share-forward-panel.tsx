import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareForwardPanel({ open, onOpenChange }: Props) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/arena` : "/arena";
  const emailSubject = encodeURIComponent(t("arena.share.emailSubject"));
  const emailBody = encodeURIComponent(t("arena.share.emailBody", { url }));
  const slackText = encodeURIComponent(t("arena.share.slackText", { url }));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("arena.share.title")}</DialogTitle>
          <DialogDescription className="text-white/70">
            {t("arena.share.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={url}
              className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white/80 font-mono"
              data-testid="share-url-input"
            />
            <Button
              className="bg-indigo-500 hover:bg-indigo-400 text-white"
              onClick={copyLink}
              data-testid="button-share-copy"
            >
              {copied ? t("arena.share.copied") : t("arena.share.copyLink")}
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              variant="outline"
              className="border-white/15 text-white hover:bg-white/5"
              asChild
            >
              <a
                href={`mailto:?subject=${emailSubject}&body=${emailBody}`}
                data-testid="button-share-email"
              >
                {t("arena.share.email")}
              </a>
            </Button>
            <Button
              variant="outline"
              className="border-white/15 text-white hover:bg-white/5"
              asChild
            >
              <a
                href={`https://slack.com/intl/en-gb/`}
                onClick={(e) => {
                  e.preventDefault();
                  navigator.clipboard
                    .writeText(decodeURIComponent(slackText))
                    .then(() => {
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 1600);
                    })
                    .catch(() => {
                      /* ignore */
                    });
                }}
                data-testid="button-share-slack"
              >
                {t("arena.share.slack")}
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" className="text-white/70 hover:text-white" onClick={() => onOpenChange(false)}>
            {t("arena.share.close")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
