import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { validateAllotlyKey } from "../engine/live";
import { useArenaSession, formatUSD } from "../session";

interface Props {
  onValidated: () => void;
  onFallbackToCached: () => void;
  onCancel: () => void;
}

export function KeyEntry({ onValidated, onFallbackToCached, onCancel }: Props) {
  const { setLiveKey } = useArenaSession();
  const [key, setKey] = useState("");
  const [remember, setRemember] = useState(false);
  const [status, setStatus] = useState<"idle" | "validating" | "verified" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifiedInfo, setVerifiedInfo] = useState<{
    balance: number;
    type: string;
    expires: string | null;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setStatus("validating");
    setErrorMsg(null);
    const res = await validateAllotlyKey(key.trim());
    if (!res.valid) {
      setStatus("error");
      setErrorMsg(res.message);
      return;
    }
    setVerifiedInfo({
      balance: res.budgetRemainingUSD,
      type: res.keyType === "VOUCHER" ? "Voucher" : res.keyType === "TEAM" ? "Teams" : "Key",
      expires: res.expiresAt,
    });
    setStatus("verified");
    await new Promise((r) => setTimeout(r, 800));
    setLiveKey({
      keyValue: key.trim(),
      keyType: res.keyType,
      totalBudgetUSD: res.budgetRemainingUSD,
      expiresAt: res.expiresAt,
      remember,
    });
    onValidated();
  }

  const isBusy = status === "validating" || status === "verified";

  return (
    <div className="min-h-[calc(100vh-60px)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-neutral-900/70 p-8">
        <h2 className="text-2xl font-semibold text-white">Enter your Allotly key</h2>
        <p className="mt-2 text-white/70">
          We&rsquo;ll verify it against the proxy and show your current balance before you start.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="allotly-key" className="text-white/80">
              Key
            </Label>
            <Input
              id="allotly-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="allotly_sk_..."
              className="mt-1.5 bg-neutral-950 border-white/10 text-white"
              disabled={isBusy}
              data-testid="input-allotly-key"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-white/70">
            <Checkbox
              checked={remember}
              onCheckedChange={(v) => setRemember(Boolean(v))}
              data-testid="checkbox-remember-key"
            />
            Remember this key on this device
          </label>

          {status === "verified" && verifiedInfo && (
            <div
              className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
              data-testid="key-verified-banner"
            >
              Key verified &middot; ${formatUSD(verifiedInfo.balance)} available &middot; {verifiedInfo.type}
              {verifiedInfo.expires ? ` · expires ${new Date(verifiedInfo.expires).toLocaleDateString()}` : ""}
            </div>
          )}

          {status === "error" && (
            <div
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              data-testid="key-error-banner"
            >
              We couldn&rsquo;t verify that key. {errorMsg ? `(${errorMsg})` : "Double-check it"}, or{" "}
              <button
                type="button"
                onClick={onFallbackToCached}
                className="underline underline-offset-4 hover:text-rose-100"
                data-testid="link-fallback-cached"
              >
                start with a cached demo instead
              </button>
              .
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              className="text-white/70 hover:text-white"
              onClick={onCancel}
              disabled={isBusy}
              data-testid="button-key-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-indigo-500 hover:bg-indigo-400 text-white"
              disabled={!key.trim() || isBusy}
              data-testid="button-key-verify"
            >
              {status === "validating" ? "Verifying…" : status === "verified" ? "Verified" : "Verify key"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
