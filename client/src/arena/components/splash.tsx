import { useTranslation, Trans } from "react-i18next";
import { Button } from "@/components/ui/button";

interface Props {
  onStartCached: () => void;
  onEnterKey: () => void;
  hasRememberedKey: boolean;
  onResumeRemembered?: () => void;
}

export function Splash({ onStartCached, onEnterKey, hasRememberedKey, onResumeRemembered }: Props) {
  const { t } = useTranslation();
  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center px-4 py-16">
      <div className="max-w-2xl text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          {t("arena.splash.badge")}
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
          {t("arena.splash.title1")}
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">
            {t("arena.splash.title2")}
          </span>
        </h1>
        <p className="mt-5 text-lg text-white/70">
          {t("arena.splash.subtitle")}
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 text-left">
          <div
            className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-5 flex flex-col"
            data-testid="card-cached-path"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/10 text-white/80">
                {t("arena.splash.cachedTag")}
              </span>
              <span className="text-xs text-white/60">{t("arena.splash.cachedDuration")}</span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">{t("arena.splash.cachedTitle")}</h3>
            <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
              {t("arena.splash.cachedDesc")}
            </p>
            <Button
              size="lg"
              className="mt-4 bg-indigo-500 hover:bg-indigo-400 text-white"
              onClick={onStartCached}
              data-testid="button-start-cached"
            >
              {t("arena.splash.cachedCta")}
            </Button>
          </div>

          <div
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col"
            data-testid="card-live-path"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                {t("arena.splash.liveTag")}
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">{t("arena.splash.liveTitle")}</h3>
            <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
              <Trans
                i18nKey="arena.splash.liveDesc"
                components={{ strong: <strong className="text-white" /> }}
              />
            </p>
            <Button
              size="lg"
              variant="outline"
              className="mt-4 border-white/15 bg-transparent text-white hover:bg-white/5"
              onClick={onEnterKey}
              data-testid="button-enter-key"
            >
              {t("arena.splash.liveCta")}
            </Button>
          </div>
        </div>

        {hasRememberedKey && onResumeRemembered && (
          <button
            type="button"
            onClick={onResumeRemembered}
            className="mt-4 text-sm text-white/60 underline-offset-4 hover:text-white hover:underline"
            data-testid="link-resume-remembered"
          >
            {t("arena.splash.resume")}
          </button>
        )}

        <p className="mt-6 text-xs text-white/50">
          {t("arena.splash.footer")}
        </p>
      </div>
    </div>
  );
}
