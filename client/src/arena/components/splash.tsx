import { Button } from "@/components/ui/button";

interface Props {
  onStartCached: () => void;
  onEnterKey: () => void;
  hasRememberedKey: boolean;
  onResumeRemembered?: () => void;
}

export function Splash({ onStartCached, onEnterKey, hasRememberedKey, onResumeRemembered }: Props) {
  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center px-4 py-16">
      <div className="max-w-2xl text-center">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
          Interactive demo
        </div>
        <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white">
          Try Allotly.
          <br />
          <span className="bg-gradient-to-r from-indigo-400 to-cyan-300 bg-clip-text text-transparent">
            Three models, one budget, five minutes.
          </span>
        </h1>
        <p className="mt-5 text-lg text-white/70">
          You&rsquo;re the admin. Allocate a budget. Watch it get spent across
          OpenAI, Anthropic, and Google. See what real enforcement looks like.
        </p>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 text-left">
          <div
            className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-5 flex flex-col"
            data-testid="card-cached-path"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-white/10 text-white/80">
                No key needed
              </span>
              <span className="text-xs text-white/60">~5 min</span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">Try with cached responses</h3>
            <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
              Instant. Walk the full flow in your browser with prerecorded outputs from the
              eight catalog models — same UX, no API charges, no signup.
            </p>
            <Button
              size="lg"
              className="mt-4 bg-indigo-500 hover:bg-indigo-400 text-white"
              onClick={onStartCached}
              data-testid="button-start-cached"
            >
              Start cached demo
            </Button>
          </div>

          <div
            className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col"
            data-testid="card-live-path"
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5 bg-emerald-500/15 text-emerald-300">
                Real cost · real budget
              </span>
            </div>
            <h3 className="mt-3 text-base font-semibold text-white">Use your Allotly key</h3>
            <p className="mt-1.5 text-sm text-white/70 leading-relaxed">
              Bring a real key and race <strong className="text-white">any model your key
              allows</strong> — including ones outside our demo catalog. Charges hit your real
              budget; results stream from real providers.
            </p>
            <Button
              size="lg"
              variant="outline"
              className="mt-4 border-white/15 bg-transparent text-white hover:bg-white/5"
              onClick={onEnterKey}
              data-testid="button-enter-key"
            >
              I have an Allotly key
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
            Resume with the key on this device
          </button>
        )}

        <p className="mt-6 text-xs text-white/50">
          You can switch from cached to live anytime once a round is over.
        </p>
      </div>
    </div>
  );
}
