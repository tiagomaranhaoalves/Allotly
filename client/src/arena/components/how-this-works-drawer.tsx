import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function HowThisWorksDrawer({ open, onOpenChange }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="bg-neutral-950 border-white/10 text-white w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-white">Under the hood</SheetTitle>
          <SheetDescription className="text-white/70">
            What&rsquo;s actually happening as you play.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm text-white/80">
          <section>
            <h3 className="font-semibold text-white">Two roles, one key</h3>
            <p className="mt-1 text-white/65">
              An <strong>admin</strong> picks which models a key is allowed to call (and the budget).
              A <strong>developer</strong> then picks one of those allowed models in each request via{" "}
              <code className="font-mono text-[12px] text-white/85">model: "..."</code>. Allotly enforces the allowlist at the proxy.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-white">One endpoint, three providers</h3>
            <p className="mt-1 text-white/65">
              Each round fires three parallel calls to one OpenAI-compatible
              endpoint. Allotly routes them to OpenAI, Anthropic, and Google
              based on the model id in each call.
            </p>
            <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-white/80 overflow-x-auto">
{`POST https://allotly.ai/api/v1/chat/completions
Authorization: Bearer allotly_sk_...
Content-Type: application/json

{ "model": "gpt-4o-mini", "messages": [...], "stream": true }`}
            </pre>
          </section>

          <section>
            <h3 className="font-semibold text-white">Every call is scoped to a budget</h3>
            <p className="mt-1 text-white/65">
              The admin allocation you just made is a hard cap. When it&rsquo;s
              spent, the proxy stops accepting calls on that scope. The ticker
              is the product, not a UI flourish.
            </p>
          </section>

          <section>
            <h3 className="font-semibold text-white">Response headers carry state</h3>
            <p className="mt-1 text-white/65">
              Every response includes budget and key-type headers that Allotly&rsquo;s
              own dashboard uses to reconcile spend in real time.
            </p>
            <pre className="mt-3 rounded-lg border border-white/10 bg-black/40 p-3 text-[11px] text-white/80 overflow-x-auto">
{`X-Allotly-Budget-Remaining: 182
X-Allotly-Budget-Total: 2000
X-Allotly-Key-Type: VOUCHER
X-Allotly-Expires: 2026-05-18T00:00:00Z`}
            </pre>
          </section>

          <section>
            <h3 className="font-semibold text-white">Cached Mode = zero cost</h3>
            <p className="mt-1 text-white/65">
              Cached Mode replays pre-recorded streams with accurate timing and
              pricing. Switch to Live to run real model calls against your own key.
            </p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
