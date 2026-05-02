import crypto from "crypto";

export interface ConsentParams {
  authRequestId: string;
  csrfToken: string;
  clientName: string;
  scopes: string[];
  redirectUri: string;
  resource: string;
  approvePath: string;
  /** Logged-in user's email — shown in consent so they can confirm identity. */
  userEmail: string;
  /** Logged-in user's display name (optional). */
  userName?: string | null;
}

function escape(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const SCOPE_LABELS: Record<string, string> = {
  mcp: "Use Allotly tools (run AI calls, read budget, redeem vouchers within tool limits)",
  "mcp:read": "Read-only: see your budget, status, and recent usage",
};

/**
 * Inline submit-handler that gives the user immediate visual feedback when
 * they click Authorize / Deny. The OAuth consent POST does a server round-trip
 * (mint code, 302 back to the client) that takes 1–2 seconds — without this,
 * users assume nothing happened and click again, which races the first
 * submission and produces an "invalid_grant" error in the host app.
 *
 * Behavior:
 *   - On first submit: disable both buttons, swap the clicked button's label
 *     to "Authorizing…" / "Cancelling…" with a spinner.
 *   - On any subsequent submit (double-click, Enter twice): preventDefault.
 *   - First submit is NOT preventDefaulted — the form posts normally.
 *   - If JS doesn't run, the form still submits with the original UI (the
 *     script only enhances; it never gates submission).
 *
 * IMPORTANT: any change to the script body (even whitespace) changes the
 * SHA-256 hash. The hash is computed at module load and exported as
 * `CONSENT_SCRIPT_CSP_SOURCE` so authorize.ts can pin it in the CSP
 * `script-src` directive.
 */
const CONSENT_INLINE_SCRIPT = `(function(){var f=document.querySelector('form[data-consent-form]');if(!f)return;var a=f.querySelector('[data-testid="consent-approve"]');var d=f.querySelector('[data-testid="consent-deny"]');var last=null;if(a)a.addEventListener('click',function(){last=a;});if(d)d.addEventListener('click',function(){last=d;});var sent=false;var spin='<svg class="allotly-spinner" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style="vertical-align:middle;margin-right:6px;display:inline-block"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="28" stroke-dashoffset="20"></circle></svg>';f.addEventListener('submit',function(e){if(sent){e.preventDefault();return;}sent=true;var b=e.submitter||last||a;var deny=b&&b.value==='deny';var label=deny?'Cancelling\\u2026':'Authorizing\\u2026';if(a){a.disabled=true;a.style.opacity='0.7';a.style.cursor='not-allowed';}if(d){d.disabled=true;d.style.opacity='0.7';d.style.cursor='not-allowed';}if(b){b.innerHTML=spin+label;}});})();`;

/**
 * CSP `script-src` source for the inline consent-button script. The full
 * source is `'sha256-<base64>'` (with the surrounding single quotes) — this
 * is the form CSP3 expects in the directive.
 */
export const CONSENT_SCRIPT_CSP_SOURCE: string = (() => {
  const digest = crypto
    .createHash("sha256")
    .update(CONSENT_INLINE_SCRIPT, "utf8")
    .digest("base64");
  return `'sha256-${digest}'`;
})();

export function renderConsent(p: ConsentParams): string {
  const scopeList = p.scopes
    .map((s) => `<li><strong>${escape(s)}</strong> — ${escape(SCOPE_LABELS[s] || s)}</li>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize ${escape(p.clientName)} — Allotly</title>
<style>
.allotly-spinner{animation:allotly-spin 0.8s linear infinite;transform-origin:center}
@keyframes allotly-spin{to{transform:rotate(360deg)}}
form[data-consent-form] button[disabled]{cursor:not-allowed}
</style>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:480px;margin:48px auto;padding:0 16px">
<div style="text-align:center;margin-bottom:24px">
<div style="display:inline-block;background:#6366F1;color:#fff;font-weight:700;font-size:18px;padding:6px 16px;border-radius:8px">allotly</div>
</div>
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
<h1 style="margin:0 0 12px;color:#1e293b;font-size:20px">Authorize <span data-testid="consent-client-name">${escape(p.clientName)}</span></h1>
<p style="color:#475569;font-size:14px;line-height:1.5;margin:0 0 12px">This app is requesting access to your Allotly account.</p>
<div style="background:#eef2ff;border-radius:8px;padding:10px 14px;margin:0 0 16px;display:flex;align-items:center;gap:10px">
<div style="width:32px;height:32px;border-radius:16px;background:#6366F1;color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center">${escape((p.userName || p.userEmail || "?").trim().charAt(0).toUpperCase())}</div>
<div style="flex:1;min-width:0">
<div style="color:#1e293b;font-size:13px;font-weight:600" data-testid="consent-user-name">${escape(p.userName || "")}</div>
<div style="color:#475569;font-size:12px;word-break:break-all" data-testid="consent-user-email">${escape(p.userEmail)}</div>
</div>
</div>
<div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin:0 0 16px">
<div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Will be allowed to</div>
<ul style="margin:0;padding-left:20px;color:#1e293b;font-size:13px;line-height:1.6">${scopeList}</ul>
</div>
<div style="background:#f8fafc;border-radius:8px;padding:14px 18px;margin:0 0 24px">
<div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">Will redirect to</div>
<div style="color:#1e293b;font-size:12px;font-family:monospace;word-break:break-all" data-testid="consent-redirect-uri">${escape(p.redirectUri)}</div>
</div>
<form method="POST" action="${escape(p.approvePath)}" data-consent-form style="display:flex;gap:8px;margin:0">
<input type="hidden" name="auth_request_id" value="${escape(p.authRequestId)}">
<input type="hidden" name="csrf" value="${escape(p.csrfToken)}">
<button type="submit" name="decision" value="deny" style="flex:1;padding:10px 16px;background:#fff;color:#475569;border:1px solid #cbd5e1;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer" data-testid="consent-deny">Deny</button>
<button type="submit" name="decision" value="approve" style="flex:1;padding:10px 16px;background:#6366F1;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer" data-testid="consent-approve">Authorize</button>
</form>
</div>
<div style="text-align:center;margin-top:16px;color:#94a3b8;font-size:11px">
<p>You can revoke access at any time from your Allotly dashboard.</p>
</div>
</div>
<script>${CONSENT_INLINE_SCRIPT}</script>
</body>
</html>`;
}
