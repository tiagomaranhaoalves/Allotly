export interface CredentialFormParams {
  csrfToken: string;
  /** The original /oauth/authorize?... URL the user was trying to reach. */
  oauthContinue: string;
  /** Display name of the OAuth client requesting access. */
  clientName: string;
  /** When set, render an error banner above the tabs. Single generic string —
   *  precise reasons are deliberately not surfaced here (no enumeration oracle). */
  errorMessage?: string;
  /** Which tab to show selected on render (re-render after a failed submit). */
  activeTab?: "password" | "voucher" | "api_key";
  /** Pre-fill the email input on re-render so the user doesn't retype it. */
  prefillEmail?: string;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Server-rendered credential form for /oauth/authorize when the visitor is
 * unauthenticated. Three CSS-only radio-driven tabs so this works under a
 * strict `script-src 'none'` CSP — no JS at all.
 *
 * Each tab is its own <form> POSTing to /oauth/authorize/credential with a
 * hidden CSRF token, the original /oauth/authorize URL (`oauth_continue`),
 * and a `credential_type` discriminator the server dispatches on.
 *
 * Visual style mirrors consent-template.ts so the user perceives the two
 * pages as a single Allotly flow.
 */
export function renderCredentialForm(p: CredentialFormParams): string {
  const csrf = escape(p.csrfToken);
  const cont = escape(p.oauthContinue);
  const clientName = escape(p.clientName);
  const errorBanner = p.errorMessage
    ? `<div data-testid="credential-error" style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:8px;padding:10px 14px;margin:0 0 16px;font-size:13px">${escape(p.errorMessage)}</div>`
    : "";
  const activePw = (p.activeTab ?? "password") === "password";
  const activeVc = p.activeTab === "voucher";
  const activeAk = p.activeTab === "api_key";
  const prefillEmail = escape(p.prefillEmail ?? "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sign in to authorize ${clientName} — Allotly</title>
<style>
.allotly-cred-tabs input[type=radio]{position:absolute;opacity:0;pointer-events:none;width:0;height:0}
.allotly-cred-tabs .tablist{display:flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:8px;margin:0 0 16px}
.allotly-cred-tabs .tablist label{flex:1;text-align:center;padding:8px 12px;font-size:13px;font-weight:500;color:#475569;border-radius:6px;cursor:pointer;user-select:none}
.allotly-cred-tabs .tablist label:hover{color:#1e293b}
.allotly-cred-tabs .panel{display:none}
.allotly-cred-tabs #t-pw:checked ~ .tablist label[for=t-pw],
.allotly-cred-tabs #t-vc:checked ~ .tablist label[for=t-vc],
.allotly-cred-tabs #t-ak:checked ~ .tablist label[for=t-ak]{background:#fff;color:#1e293b;box-shadow:0 1px 2px rgba(15,23,42,0.06)}
.allotly-cred-tabs #t-pw:checked ~ .panels .panel-pw,
.allotly-cred-tabs #t-vc:checked ~ .panels .panel-vc,
.allotly-cred-tabs #t-ak:checked ~ .panels .panel-ak{display:block}
.allotly-cred-tabs input[type=radio]:focus-visible + label{outline:2px solid #6366F1;outline-offset:2px}
.allotly-cred-input{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid #cbd5e1;border-radius:6px;font-size:14px;color:#1e293b;background:#fff;font-family:inherit;margin:0 0 10px}
.allotly-cred-input:focus{outline:none;border-color:#6366F1;box-shadow:0 0 0 3px rgba(99,102,241,0.15)}
.allotly-cred-submit{width:100%;padding:10px 16px;background:#6366F1;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;margin-top:4px}
.allotly-cred-submit:hover{background:#4F46E5}
.allotly-cred-help{color:#64748b;font-size:12px;margin:0 0 12px;line-height:1.5}
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:480px;margin:48px auto;padding:0 16px">
<div style="text-align:center;margin-bottom:24px">
<div style="display:inline-block;background:#6366F1;color:#fff;font-weight:700;font-size:18px;padding:6px 16px;border-radius:8px">allotly</div>
</div>
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
<h1 style="margin:0 0 6px;color:#1e293b;font-size:20px">Sign in to authorize <span data-testid="credential-client-name">${clientName}</span></h1>
<p style="color:#475569;font-size:14px;line-height:1.5;margin:0 0 16px">Choose how you'd like to sign in. No account required if you have a voucher or API key.</p>
${errorBanner}
<div class="allotly-cred-tabs">
<input type="radio" name="tab" id="t-pw"${activePw ? " checked" : ""}>
<input type="radio" name="tab" id="t-vc"${activeVc ? " checked" : ""}>
<input type="radio" name="tab" id="t-ak"${activeAk ? " checked" : ""}>
<div class="tablist">
<label for="t-pw" data-testid="tab-password">Account</label>
<label for="t-vc" data-testid="tab-voucher">Voucher code</label>
<label for="t-ak" data-testid="tab-api-key">API key</label>
</div>
<div class="panels">
<div class="panel panel-pw">
<form method="POST" action="/oauth/authorize/credential" data-testid="form-password">
<input type="hidden" name="csrf" value="${csrf}">
<input type="hidden" name="oauth_continue" value="${cont}">
<input type="hidden" name="credential_type" value="password">
<p class="allotly-cred-help">Sign in with your Allotly email and password.</p>
<input class="allotly-cred-input" type="email" name="email" placeholder="you@example.com" autocomplete="email" required value="${prefillEmail}" data-testid="input-email">
<input class="allotly-cred-input" type="password" name="password" placeholder="Password" autocomplete="current-password" required data-testid="input-password">
<button type="submit" class="allotly-cred-submit" data-testid="button-submit-password">Sign in</button>
</form>
</div>
<div class="panel panel-vc">
<form method="POST" action="/oauth/authorize/credential" data-testid="form-voucher">
<input type="hidden" name="csrf" value="${csrf}">
<input type="hidden" name="oauth_continue" value="${cont}">
<input type="hidden" name="credential_type" value="voucher">
<p class="allotly-cred-help">Paste the voucher code you received. We'll mint a one-shot account on the spot.</p>
<input class="allotly-cred-input" type="text" name="code" placeholder="ALLOT-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false" required data-testid="input-voucher-code">
<button type="submit" class="allotly-cred-submit" data-testid="button-submit-voucher">Continue with voucher</button>
</form>
</div>
<div class="panel panel-ak">
<form method="POST" action="/oauth/authorize/credential" data-testid="form-api-key">
<input type="hidden" name="csrf" value="${csrf}">
<input type="hidden" name="oauth_continue" value="${cont}">
<input type="hidden" name="credential_type" value="api_key">
<p class="allotly-cred-help">Use any active <code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">allotly_sk_…</code> key.</p>
<input class="allotly-cred-input" type="password" name="api_key" placeholder="allotly_sk_..." autocomplete="off" spellcheck="false" required data-testid="input-api-key">
<button type="submit" class="allotly-cred-submit" data-testid="button-submit-api-key">Continue with API key</button>
</form>
</div>
</div>
</div>
</div>
<div style="text-align:center;margin-top:16px;color:#94a3b8;font-size:11px">
<p>Allotly is asking for these credentials to authorize <strong>${clientName}</strong>. You can revoke access at any time from your dashboard.</p>
</div>
</div>
</body>
</html>`;
}
