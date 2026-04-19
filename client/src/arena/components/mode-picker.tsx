import { useArenaSession, formatUSD, hasPlayed } from "../session";
import { recommendedSpendUSD } from "../content";
import type { PersonaOrSecretKeeper } from "../types";

interface Props {
  onPick: (mode: PersonaOrSecretKeeper) => void;
}

const PERSONA_CARDS: Array<{
  id: PersonaOrSecretKeeper;
  title: string;
  oneLiner: string;
  icon: string;
}> = [
  { id: "marketing", title: "Marketing", oneLiner: "Race three models on a marketing brief.", icon: "✉️" },
  { id: "research", title: "Research", oneLiner: "Summarise and critique with rigour.", icon: "📚" },
  { id: "creative", title: "Creative", oneLiner: "Short, shareable, sometimes funny.", icon: "✨" },
];

const SECRET_KEEPER_CARD: {
  id: PersonaOrSecretKeeper;
  title: string;
  oneLiner: string;
  icon: string;
} = { id: "secret-keeper", title: "Secret Keeper", oneLiner: "Attacker vs. Defender. One password.", icon: "🕵️" };

export function ModePicker({ onPick }: Props) {
  const { state } = useArenaSession();
  const lineup = state.lineup;

  return (
    <div className="min-h-[calc(100vh-60px)] px-4 py-10">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-white">Pick a mode</h2>
            <p className="mt-1 text-sm text-white/60">Your budget carries over. No re-allocation.</p>
          </div>
          <div className="text-sm text-white/70 tabular-nums">
            <span className="text-white/50">Remaining </span>
            <span className="font-semibold text-white" data-testid="text-remaining-budget">
              ${formatUSD(state.remainingUSD, 3)}
            </span>
          </div>
        </div>

        <section
          className="mb-6 rounded-xl border border-white/10 bg-neutral-900/50 p-5"
          data-testid="section-demo-intro"
        >
          <h3 className="text-base font-semibold text-white">How this demo works</h3>
          <p className="mt-2 text-sm text-white/70 leading-relaxed">
            One Allotly key. One budget. Three frontier models running the same prompt
            in parallel. You pick a mode below — you see the answers stream in side by
            side, you pick the winner, and you see what each one actually cost.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Step n="1" title="One key, three models">
              The key you set up routes to all three providers. No SDK swaps, no
              juggling. {lineup.length === 3 ? "Your lineup is locked in." : "You picked your lineup on the previous screen."}
            </Step>
            <Step n="2" title="Same prompt, parallel race">
              Every model gets the identical brief at the same instant. You watch the
              tokens stream and the running cost tick up live.
            </Step>
            <Step n="3" title="You vote, we reveal cost">
              Pick the answer you liked best. Then see which one was actually the
              cheapest, the most expensive, and the gap between perceived quality
              and price.
            </Step>
          </div>

          <p className="mt-4 text-xs text-white/50">
            Why this matters: the &ldquo;best&rdquo; answer often isn&rsquo;t the most expensive one. The
            point of the demo is to feel that mismatch in your gut, not read about it on a slide.
          </p>
        </section>

        <h3 className="text-sm font-semibold uppercase tracking-wide text-white/50 mb-2">
          Persona modes
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {PERSONA_CARDS.map((card) => (
            <ModeCard key={card.id} card={card} state={state} onPick={onPick} />
          ))}
        </div>

        <section
          className="mt-8 rounded-xl border border-amber-400/20 bg-amber-500/[0.04] p-5"
          data-testid="section-secret-keeper-intro"
        >
          <div className="flex items-start gap-3">
            <span className="text-2xl" aria-hidden>🕵️</span>
            <div>
              <h3 className="text-base font-semibold text-white">Secret Keeper — a different kind of round</h3>
              <p className="mt-2 text-sm text-white/70 leading-relaxed">
                One model is given a password and a system prompt instructing it not to
                reveal it. You play the attacker — you have a few attempts to coax,
                trick, or jailbreak it into spilling. The model on defense is one of
                your three, picked at random.
              </p>
              <p className="mt-3 text-sm text-white/70 leading-relaxed">
                <strong className="text-white">What it measures:</strong> instruction
                adherence under adversarial pressure — i.e. how reliably a model holds
                a rule when a user is actively trying to break it. This is a different
                axis from the persona rounds (which measure quality + cost on a
                friendly task).
              </p>
              <p className="mt-3 text-sm text-white/70 leading-relaxed">
                <strong className="text-white">Why it&rsquo;s relevant:</strong> if you&rsquo;re
                shipping AI features to real users, prompt injection and policy bypass
                are the bugs that make the news. Different models hold the line very
                differently — and the cheapest model is sometimes the most stubborn.
              </p>

              <div className="mt-4">
                <ModeCard card={SECRET_KEEPER_CARD} state={state} onPick={onPick} />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-semibold text-indigo-200">
          {n}
        </span>
        <span className="text-sm font-medium text-white">{title}</span>
      </div>
      <p className="mt-1.5 text-xs text-white/60 leading-relaxed">{children}</p>
    </div>
  );
}

function ModeCard({
  card,
  state,
  onPick,
}: {
  card: { id: PersonaOrSecretKeeper; title: string; oneLiner: string; icon: string };
  state: ReturnType<typeof useArenaSession>["state"];
  onPick: (mode: PersonaOrSecretKeeper) => void;
}) {
  const tried = hasPlayed(state, card.id);
  return (
    <button
      type="button"
      onClick={() => onPick(card.id)}
      className="w-full rounded-xl border border-white/10 bg-white/[0.03] p-5 text-left hover:border-indigo-400/40 hover:bg-indigo-500/10 transition"
      data-testid={`mode-picker-${card.id}`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl" aria-hidden>{card.icon}</span>
          <span className="font-semibold text-white">{card.title}</span>
        </div>
        {tried && (
          <span className="text-[10px] uppercase tracking-wide text-emerald-300 bg-emerald-500/10 rounded px-1.5 py-0.5">
            ✓ tried
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-white/70">{card.oneLiner}</p>
      <p className="mt-3 text-xs text-white/50">
        Recommended spend: ~${recommendedSpendUSD(card.id).toFixed(2)}
      </p>
    </button>
  );
}
