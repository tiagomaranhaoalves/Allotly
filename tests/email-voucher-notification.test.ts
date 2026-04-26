import { describe, it, expect } from "vitest";
import { emailTemplates } from "../server/lib/email";

const VOUCHER = "ALLOT-1234-5678-9ABC";
const REDEEM_URL = "https://allotly.example.com/redeem?code=ALLOT-1234-5678-9ABC";

describe("voucherNotification email", () => {
  const out = emailTemplates.voucherNotification(
    "Alex",
    VOUCHER,
    "25.00",
    "2026-12-31",
    REDEEM_URL,
  );

  it("includes the voucher code prominently", () => {
    expect(out.html).toContain(VOUCHER);
  });

  it("retains the original Redeem Voucher CTA", () => {
    expect(out.html).toContain(REDEEM_URL);
    expect(out.html).toContain("Redeem Voucher");
  });

  it("ships a Quick Setup block introducing the paste-and-go flow", () => {
    expect(out.html).toContain("Quick setup");
    // Mentions auto-redeem behavior for first-time users.
    expect(out.html).toMatch(/auto-redeem/i);
  });

  it("contains a Cursor JSON snippet bearing the voucher code", () => {
    // Field hint is rendered above the snippet.
    expect(out.html).toContain("~/.cursor/mcp.json");
    // The bearer line is HTML-escaped (&quot;) inside the <pre>; check both raw
    // and escaped variants.
    const expectsBearer = `Bearer ${VOUCHER}`;
    expect(out.html.includes(expectsBearer)).toBe(true);
    expect(out.html).toContain("mcpServers");
    expect(out.html).toContain("https://allotly.ai/mcp");
  });

  it("contains a Claude Desktop snippet using the @allotly/mcp bridge with voucher in env", () => {
    expect(out.html).toContain("claude_desktop_config.json");
    expect(out.html).toContain("@allotly/mcp@latest");
    expect(out.html).toContain(`ALLOTLY_KEY`);
    expect(out.html).toContain(VOUCHER);
  });

  it("links to the dashboard /dashboard/connect for the full set of connectors", () => {
    // Origin should be inferred from the redeem URL.
    expect(out.html).toContain("https://allotly.example.com/dashboard/connect");
    expect(out.html).toMatch(/VS Code/);
    expect(out.html).toMatch(/Claude Code/);
    expect(out.html).toMatch(/Codex/);
  });

  it("falls back to the default dashboard URL when redeemUrl is malformed", () => {
    const fallback = emailTemplates.voucherNotification(
      "Alex",
      VOUCHER,
      "25.00",
      "2026-12-31",
      "not-a-url",
    );
    expect(fallback.html).toContain("https://allotly.ai/dashboard/connect");
  });

  it("does not leak the API key (no allotly_sk_ token — email predates redemption)", () => {
    expect(out.html).not.toContain("allotly_sk_");
  });

  it("escapes HTML special characters in the voucher code defensively", () => {
    const xss = emailTemplates.voucherNotification(
      "Alex",
      "ALLOT-<script>-DEAD",
      "25.00",
      "2026-12-31",
      REDEEM_URL,
    );
    // The inner <pre> must escape angle brackets.
    expect(xss.html).toContain("ALLOT-&lt;script&gt;-DEAD");
  });
});
