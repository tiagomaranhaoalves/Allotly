import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPasteKey: () => void;
  onCreateAccount: () => void;
}

export function LiveToggleModal({ open, onOpenChange, onPasteKey, onCreateAccount }: Props) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neutral-900 border-white/10 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("arena.liveToggle.title")}</DialogTitle>
          <DialogDescription className="text-white/70">
            {t("arena.liveToggle.desc")}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onPasteKey}
            className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-indigo-400/40 hover:bg-indigo-500/10 transition"
            data-testid="button-live-paste"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <span className="inline-block h-2 w-2 rounded-full bg-indigo-400" />
              {t("arena.liveToggle.pasteTitle")}
            </div>
            <p className="mt-2 text-sm text-white/60">
              {t("arena.liveToggle.pasteDesc")}
            </p>
          </button>

          <button
            type="button"
            onClick={onCreateAccount}
            className="group rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-cyan-400/40 hover:bg-cyan-500/10 transition"
            data-testid="button-live-signup"
          >
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" />
              {t("arena.liveToggle.signupTitle")}
            </div>
            <p className="mt-2 text-sm text-white/60">
              {t("arena.liveToggle.signupDesc")}
            </p>
          </button>
        </div>

        <div className="mt-4 flex justify-end">
          <Button variant="ghost" className="text-white/70 hover:text-white" onClick={() => onOpenChange(false)}>
            {t("arena.liveToggle.notYet")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
