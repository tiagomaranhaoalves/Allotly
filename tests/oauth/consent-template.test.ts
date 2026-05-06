import { describe, it, expect } from "vitest";
import {
  renderConsent,
  type ConsentParams,
} from "../../server/lib/oauth/consent-template";

const baseParams: ConsentParams = {
  authRequestId: "auth_req_abc",
  csrfToken: "csrf_token_xyz",
  clientName: "Claude.ai",
  scopes: ["mcp"],
  redirectUri: "https://claude.ai/api/mcp/callback",
  resource: "https://allotly.example/mcp",
  approvePath: "/oauth/consent",
  userEmail: "user@example.com",
  userName: "Real User",
  memberships: [],
};

describe("consent template — `decision` survives submit (task #61 regression)", () => {
  const html = renderConsent(baseParams);

  it("submit buttons carry `name=\"decision\"` so the no-JS / native-form path still works", () => {
    // Critical no-JS fallback. If the inline script is blocked (CSP failure,
    // disabled JS, hostile extension), the buttons themselves must still
    // post a valid `decision` value via the native form submitter mechanism.
    const approveBtn = html.match(
      /<button[^>]*data-testid="consent-approve"[^>]*>/,
    )?.[0];
    const denyBtn = html.match(
      /<button[^>]*data-testid="consent-deny"[^>]*>/,
    )?.[0];
    expect(approveBtn, "approve button must be present").toBeTruthy();
    expect(denyBtn, "deny button must be present").toBeTruthy();
    expect(approveBtn).toMatch(/name="decision"/);
    expect(approveBtn).toMatch(/value="approve"/);
    expect(denyBtn).toMatch(/name="decision"/);
    expect(denyBtn).toMatch(/value="deny"/);
  });

  it("inline script does NOT set `button.disabled = true` inside the submit handler", () => {
    // The original bug: disabling the submitter button mid-`submit` event
    // strips it from the form's entry list in Firefox/Safari, dropping
    // `decision` from the POST body. The handler must use visual-only
    // affordances (pointer-events / aria-disabled / opacity) to signal
    // submission state, never the boolean `disabled` property.
    expect(html).not.toMatch(/\.disabled\s*=\s*true/);
  });

  it("inline script blocks re-clicks via `pointer-events:none` and `aria-disabled` (visual-only)", () => {
    expect(html).toMatch(/pointerEvents\s*=\s*['"]none['"]/);
    expect(html).toMatch(/setAttribute\(['"]aria-disabled['"]/);
  });

  it("inline script keeps the double-submit guard via a `sent` flag", () => {
    // UX guarantee from the original implementation must remain so a
    // keyboard-driven re-submit (Enter pressed twice quickly) is dropped.
    expect(html).toMatch(/var sent=false/);
    expect(html).toMatch(/if\(sent\)\{e\.preventDefault\(\);return;\}/);
  });

  it("inline script reads the chosen action from `e.submitter.value`, not `name`", () => {
    // We removed any reliance on a click-time mirroring path (hidden input)
    // — the spinner label is derived directly from the submitter button's
    // `value` attribute, which is what the no-JS path also relies on.
    expect(html).toMatch(/e\.submitter/);
    expect(html).toMatch(/b\.value==='deny'/);
  });

  it("form posts to the configured approve path and includes auth_request_id + csrf inputs", () => {
    // Defensive structural assertion that the consent form keeps the
    // hidden inputs the server reads alongside `decision`. If any of these
    // ever go missing the server will 400 with MISSING_FIELDS again.
    const formMatch = html.match(
      /<form[^>]*data-consent-form[\s\S]*?<\/form>/,
    );
    expect(formMatch, "consent form must be present").toBeTruthy();
    expect(formMatch![0]).toContain('action="/oauth/consent"');
    expect(formMatch![0]).toMatch(
      /<input[^>]*type="hidden"[^>]*name="auth_request_id"[^>]*value="auth_req_abc"/,
    );
    expect(formMatch![0]).toMatch(
      /<input[^>]*type="hidden"[^>]*name="csrf"[^>]*value="csrf_token_xyz"/,
    );
  });
});
