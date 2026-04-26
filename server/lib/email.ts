import { Resend } from "resend";

const DEFAULT_FROM_EMAIL = "Allotly <onboarding@resend.dev>";

let connectionSettings: any;

async function getResendCredentials(): Promise<{ apiKey: string; fromEmail: string } | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

    if (!hostname || !xReplitToken) {
      return null;
    }

    connectionSettings = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=resend",
      {
        headers: {
          "Accept": "application/json",
          "X-Replit-Token": xReplitToken,
        },
      }
    ).then((res) => res.json()).then((data) => data.items?.[0]);

    if (!connectionSettings || !connectionSettings.settings.api_key) {
      return null;
    }

    return {
      apiKey: connectionSettings.settings.api_key,
      fromEmail: connectionSettings.settings.from_email || DEFAULT_FROM_EMAIL,
    };
  } catch {
    return null;
  }
}

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const credentials = await getResendCredentials();

  if (!credentials) {
    console.log(`[email] (Resend not connected) To: ${to} | Subject: ${subject}`);
    return;
  }

  try {
    const resend = new Resend(credentials.apiKey);
    let fromEmail = credentials.fromEmail;
    const { error } = await resend.emails.send({
      from: fromEmail,
      to,
      subject,
      html,
    });
    if (error) {
      if (error.message?.includes("domain is not verified") && fromEmail !== DEFAULT_FROM_EMAIL) {
        console.log(`[email] Domain not verified, retrying with default sender`);
        const { error: retryError } = await resend.emails.send({
          from: DEFAULT_FROM_EMAIL,
          to,
          subject,
          html,
        });
        if (retryError) {
          console.error(`[email] Retry failed for ${to}: ${JSON.stringify(retryError)}`);
        } else {
          console.log(`[email] Sent to ${to} (via default sender): ${subject}`);
        }
      } else {
        console.error(`[email] Failed to send to ${to}: ${JSON.stringify(error)}`);
      }
    } else {
      console.log(`[email] Sent to ${to}: ${subject}`);
    }
  } catch (e: any) {
    console.error(`[email] Error sending to ${to}: ${e.message}`);
  }
}

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:40px 20px">
<div style="text-align:center;margin-bottom:32px">
<div style="display:inline-block;background:#6366F1;color:#fff;font-weight:700;font-size:20px;padding:8px 18px;border-radius:8px;letter-spacing:-0.5px">allotly</div>
</div>
<div style="background:#fff;border-radius:12px;padding:32px;border:1px solid #e2e8f0">
<h2 style="margin:0 0 16px;color:#1e293b;font-size:18px">${title}</h2>
${body}
</div>
<div style="text-align:center;margin-top:24px;color:#94a3b8;font-size:12px">
<p>Allotly — The AI Spend Control Plane</p>
</div>
</div>
</body>
</html>`;
}

function btn(text: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0">
<a href="${url}" style="display:inline-block;background:#6366F1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px">${text}</a>
</div>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px;color:#475569;font-size:14px;line-height:1.6">${text}</p>`;
}

function kv(label: string, value: string): string {
  return `<div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #f1f5f9">
<span style="color:#64748b;font-size:13px">${label}</span>
<span style="color:#1e293b;font-size:13px;font-weight:500">${value}</span>
</div>`;
}

function alert(text: string, color: string): string {
  return `<div style="background:${color}10;border:1px solid ${color}30;border-radius:8px;padding:12px 16px;margin:16px 0">
<p style="margin:0;color:${color};font-size:14px;font-weight:500">${text}</p>
</div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function snippetBlock(label: string, fileHint: string, code: string): string {
  return `<div style="margin:12px 0">
<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">
<span style="color:#1e293b;font-size:13px;font-weight:600">${label}</span>
<span style="color:#94a3b8;font-size:11px;font-family:monospace">${fileHint}</span>
</div>
<pre style="margin:0;background:#0f172a;color:#e2e8f0;border-radius:6px;padding:12px;font-family:monospace;font-size:11px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;word-break:break-all">${escapeHtml(code)}</pre>
</div>`;
}

/**
 * Build the Quick Setup HTML block for the welcome email.
 * Uses the voucher CODE as the bearer token — the Allotly MCP server
 * auto-redeems voucher codes on first use, so the recipient can wire up
 * their AI tool straight from the email without ever needing to redeem
 * in the dashboard first.
 */
function quickSetupBlock(voucherCode: string, dashboardUrl: string): string {
  const cursorSnippet = JSON.stringify(
    {
      mcpServers: {
        allotly: {
          url: "https://allotly.ai/mcp",
          headers: { Authorization: `Bearer ${voucherCode}` },
        },
      },
    },
    null,
    2,
  );
  const claudeDesktopSnippet = JSON.stringify(
    {
      mcpServers: {
        allotly: {
          command: "npx",
          args: ["-y", "@allotly/mcp@latest"],
          env: { ALLOTLY_KEY: voucherCode },
        },
      },
    },
    null,
    2,
  );
  return `<div style="margin-top:24px;padding-top:24px;border-top:1px solid #e2e8f0">
<h3 style="margin:0 0 8px;color:#1e293b;font-size:15px">⚡ Quick setup — paste &amp; go</h3>
<p style="margin:0 0 12px;color:#475569;font-size:13px;line-height:1.6">Skip the redemption page entirely. Paste one of these snippets into your AI tool and the voucher will auto-redeem on first use.</p>
${snippetBlock("Cursor", "~/.cursor/mcp.json", cursorSnippet)}
${snippetBlock("Claude Desktop", "claude_desktop_config.json", claudeDesktopSnippet)}
<p style="margin:12px 0 0;color:#64748b;font-size:12px;line-height:1.5">Using a different tool? Visit <a href="${dashboardUrl}" style="color:#6366F1;text-decoration:none">your Allotly dashboard</a> for VS Code, Claude Code, and OpenAI Codex setup snippets, plus a one-click connection test.</p>
</div>`;
}

export const emailTemplates = {
  welcome(orgName: string, userName: string, loginUrl: string) {
    return {
      subject: `Welcome to Allotly, ${userName}!`,
      html: layout("Welcome to Allotly! 🎉", [
        p(`Hi ${userName},`),
        p(`Your organization <strong>${orgName}</strong> has been created. You're the Root Admin with full control over AI spend management.`),
        p("Here's what you can do next:"),
        `<ul style="color:#475569;font-size:14px;line-height:1.8;padding-left:20px;margin:12px 0">
<li>Connect your AI providers (OpenAI, Anthropic, Google, Azure OpenAI)</li>
<li>Create teams and add members</li>
<li>Set budgets and monitor spend</li>
<li>Create vouchers for external access</li>
</ul>`,
        btn("Go to Dashboard", loginUrl),
      ].join("")),
    };
  },

  teamAdminInvite(adminName: string, orgName: string, inviterName: string, acceptUrl: string) {
    return {
      subject: `You've been invited as Team Admin — ${orgName}`,
      html: layout("Team Admin Invitation", [
        p(`Hi ${adminName},`),
        p(`<strong>${inviterName}</strong> has invited you to join <strong>${orgName}</strong> as a Team Admin on Allotly.`),
        p("As a Team Admin, you can manage team members, set budgets, and create voucher codes for external AI access."),
        btn("Accept Invitation", acceptUrl),
        p("This invitation does not expire, but can be revoked by the Root Admin."),
      ].join("")),
    };
  },

  memberInvite(memberName: string, teamName: string, inviterName: string, setupUrl: string) {
    return {
      subject: `You've been invited to ${teamName} on Allotly`,
      html: layout("You've Been Invited to a Team", [
        p(`Hi ${memberName},`),
        p(`<strong>${inviterName}</strong> has added you to the <strong>${teamName}</strong> team on Allotly.`),
        p("To get started, set your password using the link below. This link expires in 7 days."),
        btn("Set Your Password", setupUrl),
        p("Once your password is set, you can sign in and start using your allocated AI budget."),
      ].join("")),
    };
  },

  memberTransferred(memberName: string, newTeamName: string, newOrgName: string | null, isNewOrg: boolean) {
    const orgLine = isNewOrg ? ` in <strong>${newOrgName}</strong>` : "";
    return {
      subject: `You've been transferred to ${newTeamName} on Allotly`,
      html: layout("Team Transfer", [
        p(`Hi ${memberName},`),
        p(`You've been transferred to the <strong>${newTeamName}</strong> team${orgLine} on Allotly.`),
        p("Your previous API key has been revoked and a new one has been generated. You can find your new key by signing in to your Allotly dashboard."),
        p("Your login credentials (email and password) remain the same."),
      ].join("")),
    };
  },

  voucherNotification(recipientName: string, code: string, budgetDollars: string, expiresAt: string, redeemUrl: string) {
    // Derive the dashboard/connect URL from the redeem URL's origin so it
    // works in dev, staging, and production without a separate config knob.
    let connectUrl = "https://allotly.ai/dashboard/connect";
    try {
      const u = new URL(redeemUrl);
      connectUrl = `${u.origin}/dashboard/connect`;
    } catch {
      // fall back to default
    }
    return {
      subject: `Your Allotly AI Access Voucher`,
      html: layout("You've Received an AI Access Voucher", [
        p(`Hi ${recipientName || "there"},`),
        p("You've been given a voucher for AI API access through Allotly's proxy service."),
        `<div style="background:#f8fafc;border-radius:8px;padding:20px;margin:16px 0;text-align:center">
<div style="font-size:24px;font-weight:700;color:#6366F1;letter-spacing:2px;font-family:monospace">${code}</div>
</div>`,
        kv("Budget", `$${budgetDollars}`),
        kv("Expires", expiresAt),
        btn("Redeem Voucher", redeemUrl),
        p("Once redeemed, you'll receive an API key to use with Allotly's AI proxy."),
        quickSetupBlock(code, connectUrl),
      ].join("")),
    };
  },

  voucherRedeemed(adminName: string, code: string, recipientEmail: string, teamName: string) {
    return {
      subject: `Voucher ${code} was redeemed`,
      html: layout("Voucher Redeemed", [
        p(`Hi ${adminName},`),
        p(`The voucher code <strong>${code}</strong> has been redeemed.`),
        kv("Redeemed by", recipientEmail),
        kv("Team", teamName),
        kv("Code", code),
        p("The recipient now has AI proxy access with the configured budget."),
      ].join("")),
    };
  },


  budgetWarning80(memberName: string, spentPercent: number, budgetDollars: string, dashboardUrl: string) {
    return {
      subject: `Budget 80% used — ${memberName}`,
      html: layout("Budget Warning — 80%", [
        p(`Hi ${memberName},`),
        alert(`You've used ${spentPercent}% of your AI budget ($${budgetDollars}).`, "#f59e0b"),
        p("Consider reducing usage or contacting your team admin to increase your budget."),
        btn("View Usage", dashboardUrl),
      ].join("")),
    };
  },

  budgetWarning90(memberName: string, spentPercent: number, budgetDollars: string, dashboardUrl: string) {
    return {
      subject: `⚠️ Budget 90% used — ${memberName}`,
      html: layout("Budget Warning — 90%", [
        p(`Hi ${memberName},`),
        alert(`You've used ${spentPercent}% of your AI budget ($${budgetDollars}). API keys will be revoked at 100%.`, "#ef4444"),
        p("Contact your team admin immediately if you need a budget increase."),
        btn("View Usage", dashboardUrl),
      ].join("")),
    };
  },

  budgetExhausted(memberName: string, budgetDollars: string, adminEmail: string) {
    return {
      subject: `🚫 Budget exhausted — API keys revoked`,
      html: layout("Budget Exhausted", [
        p(`Hi ${memberName},`),
        alert(`Your AI budget of $${budgetDollars} has been fully consumed. Your API keys have been automatically revoked.`, "#dc2626"),
        p(`Contact your team admin at <strong>${adminEmail}</strong> to request a budget increase or wait for the next billing period.`),
      ].join("")),
    };
  },

  budgetReset(memberName: string, newBudgetDollars: string, dashboardUrl: string) {
    return {
      subject: `Budget reset — new period started`,
      html: layout("Budget Reset", [
        p(`Hi ${memberName},`),
        p(`Your AI budget has been reset to <strong>$${newBudgetDollars}</strong> for the new billing period.`),
        p("Your API keys have been reactivated. You can continue using AI services."),
        btn("View Dashboard", dashboardUrl),
      ].join("")),
    };
  },

  voucherExpiring(recipientName: string, code: string, hoursRemaining: number, dashboardUrl: string) {
    return {
      subject: `Your voucher expires in ${hoursRemaining} hours`,
      html: layout("Voucher Expiring Soon", [
        p(`Hi ${recipientName || "there"},`),
        alert(`Your voucher <strong>${code}</strong> expires in approximately ${hoursRemaining} hours.`, "#f59e0b"),
        p("After expiry, your API key will be revoked and you'll lose access to the AI proxy."),
        btn("Use Your Access", dashboardUrl),
      ].join("")),
    };
  },

  bundlePurchased(buyerName: string, redemptions: number, expiresAt: string, dashboardUrl: string) {
    return {
      subject: `Voucher Bundle purchased — ${redemptions} redemptions`,
      html: layout("Bundle Purchase Confirmed", [
        p(`Hi ${buyerName},`),
        p("Your Voucher Bundle has been purchased and is ready to use."),
        kv("Total Redemptions", String(redemptions)),
        kv("Expires", expiresAt),
        p("You can now create voucher codes from this bundle and distribute them."),
        btn("Create Vouchers", dashboardUrl),
      ].join("")),
    };
  },

  providerKeyInvalid(adminName: string, provider: string, connectionId: string) {
    return {
      subject: `⚠️ ${provider} API key validation failed`,
      html: layout("Provider Key Invalid", [
        p(`Hi ${adminName},`),
        alert(`Your <strong>${provider}</strong> API key failed validation. The connection has been marked as invalid.`, "#ef4444"),
        kv("Provider", provider),
        kv("Connection ID", connectionId),
        p("Please update the API key in your provider settings to restore access for your team members."),
      ].join("")),
    };
  },

  spendAnomaly(adminName: string, memberName: string, memberEmail: string, currentSpend: string, averageSpend: string, multiplier: string) {
    return {
      subject: `🔔 Spend anomaly detected — ${memberName}`,
      html: layout("Spend Anomaly Detected", [
        p(`Hi ${adminName},`),
        alert(`Unusual spending detected for <strong>${memberName}</strong>.`, "#f59e0b"),
        kv("Member", `${memberName} (${memberEmail})`),
        kv("Current Period Spend", `$${currentSpend}`),
        kv("7-Day Average", `$${averageSpend}`),
        kv("Multiplier", `${multiplier}x above average`),
        p("Review this member's usage to ensure it's expected."),
      ].join("")),
    };
  },

  topupRequest(adminName: string, voucherLabel: string, voucherCode: string, principalLabel: string, amountRequestedDollars: string | null, reason: string | null, dashboardUrl: string) {
    const amountLine = amountRequestedDollars
      ? kv("Amount requested", `$${amountRequestedDollars}`)
      : kv("Amount requested", "Not specified");
    const reasonBlock = reason
      ? `<div style="background:#f8fafc;border-radius:8px;padding:16px;margin:16px 0">
<div style="color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Reason</div>
<div style="color:#1e293b;font-size:14px;line-height:1.6">${reason.replace(/[<>]/g, "")}</div>
</div>`
      : "";
    return {
      subject: `Top-up request for voucher ${voucherCode}`,
      html: layout("Voucher Top-up Request", [
        p(`Hi ${adminName},`),
        p(`A recipient of voucher <strong>${voucherLabel || voucherCode}</strong> has requested additional budget through the Allotly MCP.`),
        kv("Voucher", voucherCode),
        kv("Requested by", principalLabel),
        amountLine,
        reasonBlock,
        btn("Review in Dashboard", dashboardUrl),
        p("You can grant a top-up from the voucher's detail page or ignore this request."),
      ].join("")),
    };
  },

  passwordReset(userName: string, resetUrl: string) {
    return {
      subject: "Reset your Allotly password",
      html: layout("Password Reset", [
        p(`Hi ${userName},`),
        p("We received a request to reset the password for your Allotly account."),
        btn("Reset Password", resetUrl),
        p("This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email."),
        p("For security, this link can only be used once."),
      ].join("")),
    };
  },
};

export { sendEmail };
