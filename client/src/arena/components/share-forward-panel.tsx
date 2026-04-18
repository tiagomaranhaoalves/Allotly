import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShareForwardPanel({ open, onOpenChange }: Props) {
  const [copied, setCopied] = useState(false);
  const url = typeof window !== "undefined" ? `${window.location.origin}/arena` : "/arena";
  const emailSubject = encodeURIComponent("Allotly demo — worth two minutes");
  const emailBody = encodeURIComponent(
    `I played with Allotly's interactive demo — three models racing against a budget, ` +
      `with a voucher exhaustion flow that actually makes the governance story click. ` +
      `Try it: ${url}`,
  );
  const slackText = encodeURIComponent(
    `Allotly demo worth a look — three models, one budget, voucher exhaustion flow. ${url}`,
  );

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
          <DialogTitle className="text-xl">Forward this demo</DialogTitle>
          <DialogDescription className="text-white/70">
            The exhaustion flow only clicks when someone hits it themselves.
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
              {copied ? "Copied" : "Copy link"}
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
                Email
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
                Copy for Slack
              </a>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" className="text-white/70 hover:text-white" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
