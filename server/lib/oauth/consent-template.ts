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
<form method="POST" action="${escape(p.approvePath)}" style="display:flex;gap:8px;margin:0">
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
</body>
</html>`;
}
