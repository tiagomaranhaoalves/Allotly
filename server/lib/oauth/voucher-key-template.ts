import type { Request } from "express";

export type VoucherKeyLocale = "en" | "es" | "pt-BR";

interface LocaleStrings {
  pageTitle: string;
  heading: string;
  intro: string;
  warning: string;
  copyHint: string;
  continueLabel: string;
  hostFallback: string;
  keyLabel: string;
}

const STRINGS: Record<VoucherKeyLocale, LocaleStrings> = {
  en: {
    pageTitle: "Save your Allotly key",
    heading: "Save your Allotly key",
    intro: "Your voucher was redeemed and a new Allotly key was created so {host} can call AI on your behalf.",
    warning: "This is the only time we'll show this key. Copy it somewhere safe before continuing — if you lose it, you cannot recover it by re-redeeming your voucher.",
    copyHint: "Select the key below to copy it.",
    continueLabel: "Continue to {host}",
    hostFallback: "your AI tool",
    keyLabel: "Your Allotly API key",
  },
  es: {
    pageTitle: "Guarda tu clave de Allotly",
    heading: "Guarda tu clave de Allotly",
    intro: "Tu voucher fue canjeado y se creó una nueva clave de Allotly para que {host} pueda llamar a la IA en tu nombre.",
    warning: "Esta es la única vez que mostraremos esta clave. Cópiala en un lugar seguro antes de continuar — si la pierdes, no podrás recuperarla volviendo a canjear tu voucher.",
    copyHint: "Selecciona la clave abajo para copiarla.",
    continueLabel: "Continuar a {host}",
    hostFallback: "tu herramienta de IA",
    keyLabel: "Tu clave de API de Allotly",
  },
  "pt-BR": {
    pageTitle: "Salve sua chave da Allotly",
    heading: "Salve sua chave da Allotly",
    intro: "Seu voucher foi resgatado e uma nova chave da Allotly foi criada para que {host} possa chamar a IA em seu nome.",
    warning: "Esta é a única vez que mostraremos esta chave. Copie em um lugar seguro antes de continuar — se você perdê-la, não poderá recuperá-la resgatando o voucher novamente.",
    copyHint: "Selecione a chave abaixo para copiá-la.",
    continueLabel: "Continuar para {host}",
    hostFallback: "sua ferramenta de IA",
    keyLabel: "Sua chave de API da Allotly",
  },
};

export function pickVoucherKeyLocale(req: Pick<Request, "headers">): VoucherKeyLocale {
  const raw = (req.headers["accept-language"] as string | undefined) || "";
  const tags = raw.split(",").map((s) => s.trim().split(";")[0].toLowerCase()).filter(Boolean);
  for (const t of tags) {
    if (t === "pt-br" || t.startsWith("pt-br") || t === "pt" || t.startsWith("pt-")) return "pt-BR";
    if (t === "es" || t.startsWith("es-") || t.startsWith("es")) return "es";
    if (t === "en" || t.startsWith("en-") || t.startsWith("en")) return "en";
  }
  return "en";
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface VoucherKeyParams {
  apiKey: string;
  /** Continue URL — the same /oauth/authorize?... value the credential POST
   *  would have redirected to. Already validated by isSafeContinue. */
  continueUrl: string;
  /** OAuth client display name for the host the user is authorizing.
   *  Falls back to a generic "your AI tool" string when unknown. */
  hostName?: string | null;
  locale: VoucherKeyLocale;
}

/**
 * Server-rendered, single-shot interstitial that surfaces the freshly-minted
 * Allotly API key to a voucher recipient who just completed the in-flow
 * OAuth credential form. Strict CSP-safe (no JS); the user copies the key
 * via plain text selection.
 *
 * The "Continue" button is a plain GET form so it works under
 * `script-src 'none'` and the post-redirect lands on the same /oauth/authorize
 * URL the credential POST would have hit.
 */
export function renderVoucherKeyPage(p: VoucherKeyParams): string {
  const t = STRINGS[p.locale] ?? STRINGS.en;
  const host = (p.hostName && p.hostName.trim()) || t.hostFallback;
  const intro = t.intro.replace("{host}", escape(host));
  const continueLabel = t.continueLabel.replace("{host}", escape(host));
  return `<!DOCTYPE html>
<html lang="${escape(p.locale)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escape(t.pageTitle)} — Allotly</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:48px auto;padding:0 16px">
<div style="text-align:center;margin-bottom:24px">
<div style="display:inline-block;background:#6366F1;color:#fff;font-weight:700;font-size:18px;padding:6px 16px;border-radius:8px">allotly</div>
</div>
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
<h1 style="margin:0 0 12px;color:#1e293b;font-size:20px" data-testid="voucher-key-heading">${escape(t.heading)}</h1>
<p style="color:#475569;font-size:14px;line-height:1.5;margin:0 0 16px" data-testid="voucher-key-intro">${intro}</p>
<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;border-radius:8px;padding:12px 14px;margin:0 0 16px;font-size:13px;line-height:1.5" data-testid="voucher-key-warning">${escape(t.warning)}</div>
<div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">${escape(t.keyLabel)}</div>
<div style="background:#0f172a;color:#e2e8f0;border-radius:8px;padding:14px 16px;margin:0 0 8px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:13px;word-break:break-all;user-select:all" data-testid="voucher-key-value">${escape(p.apiKey)}</div>
<p style="color:#94a3b8;font-size:12px;margin:0 0 24px" data-testid="voucher-key-copy-hint">${escape(t.copyHint)}</p>
<a href="${escape(p.continueUrl)}" style="display:block;width:100%;box-sizing:border-box;padding:10px 16px;background:#6366F1;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none" data-testid="voucher-key-continue">${escape(continueLabel)}</a>
</div>
</div>
</body>
</html>`;
}
