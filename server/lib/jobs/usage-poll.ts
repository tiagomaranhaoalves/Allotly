import { storage } from "../../storage";
import { decryptProviderKey } from "../encryption";
import type { Organization, ProviderConnection, ProviderMemberLink, TeamMembership } from "@shared/schema";

const POLLING_INTERVALS: Record<string, number> = {
  FREE: 60 * 60 * 1000,
  TEAM: 15 * 60 * 1000,
  ENTERPRISE: 5 * 60 * 1000,
};

let isPolling = false;

interface UsageResult {
  inputTokens: number;
  outputTokens: number;
  totalCostCents: number;
  model?: string;
  rawData?: any;
}

async function pollOpenAIUsage(
  adminKey: string,
  link: ProviderMemberLink,
  periodStart: Date
): Promise<UsageResult[]> {
  if (!link.providerProjectId) return [];

  const startTime = Math.floor(periodStart.getTime() / 1000);
  const url = `https://api.openai.com/v1/organization/usage/completions?project_ids[]=${link.providerProjectId}&start_time=${startTime}&group_by=model&limit=31`;

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}` },
    });
    if (!res.ok) {
      console.error(`OpenAI usage poll failed (${res.status}): ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    const results: UsageResult[] = [];

    if (data.data && Array.isArray(data.data)) {
      for (const bucket of data.data) {
        const inputTokens = bucket.results?.[0]?.input_tokens || 0;
        const outputTokens = bucket.results?.[0]?.output_tokens || 0;
        const inputCachedTokens = bucket.results?.[0]?.input_cached_tokens || 0;
        const model = bucket.results?.[0]?.model || "unknown";
        const inputCost = (inputTokens - inputCachedTokens) * 0.0000025 + inputCachedTokens * 0.00000125;
        const outputCost = outputTokens * 0.00001;
        const totalCostCents = Math.round((inputCost + outputCost) * 100);

        if (inputTokens > 0 || outputTokens > 0) {
          results.push({ inputTokens, outputTokens, totalCostCents, model, rawData: bucket });
        }
      }
    }

    return results;
  } catch (e: any) {
    console.error("OpenAI usage poll error:", e.message);
    return [];
  }
}

async function pollAnthropicUsage(
  adminKey: string,
  link: ProviderMemberLink,
  periodStart: Date
): Promise<UsageResult[]> {
  if (!link.providerWorkspaceId) return [];

  try {
    const startDate = periodStart.toISOString().split("T")[0];
    const endDate = new Date().toISOString().split("T")[0];

    const url = `https://api.anthropic.com/v1/organizations/usage?start_date=${startDate}&end_date=${endDate}&workspace_ids[]=${link.providerWorkspaceId}`;

    const res = await fetch(url, {
      headers: {
        "x-api-key": adminKey,
        "anthropic-version": "2023-06-01",
      },
    });

    if (!res.ok) {
      console.error(`Anthropic usage poll failed (${res.status}): ${await res.text()}`);
      return [];
    }

    const data = await res.json();
    const results: UsageResult[] = [];

    if (data.data && Array.isArray(data.data)) {
      for (const entry of data.data) {
        const inputTokens = entry.input_tokens || 0;
        const outputTokens = entry.output_tokens || 0;
        const totalCostCents = entry.cost_usd ? Math.round(entry.cost_usd * 100) : 0;
        const model = entry.model || "unknown";

        if (inputTokens > 0 || outputTokens > 0) {
          results.push({ inputTokens, outputTokens, totalCostCents, model, rawData: entry });
        }
      }
    }

    return results;
  } catch (e: any) {
    console.error("Anthropic usage poll error:", e.message);
    return [];
  }
}

async function revokeAllProviderKeys(membership: TeamMembership, org: Organization) {
  const links = await storage.getProviderMemberLinksByMembership(membership.id);
  for (const link of links) {
    if (link.status !== "ACTIVE") continue;

    const conn = await storage.getProviderConnection(link.providerConnectionId);
    if (!conn) continue;

    if (conn.provider === "OPENAI" && link.providerProjectId && link.providerSvcAcctId) {
      try {
        const adminKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);
        await fetch(
          `https://api.openai.com/v1/organization/projects/${link.providerProjectId}/service_accounts/${link.providerSvcAcctId}`,
          { method: "DELETE", headers: { Authorization: `Bearer ${adminKey}` } }
        );
      } catch (e: any) {
        console.error(`Failed to revoke OpenAI key for link=${link.id}:`, e.message);
      }
    }

    await storage.updateProviderMemberLink(link.id, { status: "REVOKED" as any });
  }
}

async function checkBudgetThresholds(
  membership: TeamMembership,
  org: Organization
) {
  const percentUsed = membership.monthlyBudgetCents > 0
    ? (membership.currentPeriodSpendCents / membership.monthlyBudgetCents) * 100
    : 0;

  if (percentUsed >= 100) {
    const existingAlert = await storage.getBudgetAlert(membership.id, 100);
    if (!existingAlert) {
      await revokeAllProviderKeys(membership, org);

      await storage.updateMembership(membership.id, { status: "BUDGET_EXHAUSTED" });

      await storage.createBudgetAlert({
        membershipId: membership.id,
        thresholdPercent: 100,
        triggeredAt: new Date(),
        actionTaken: "all_keys_revoked_budget_exhausted",
      });

      await storage.createAuditLog({
        orgId: org.id,
        actorId: "system",
        action: "budget.exhausted",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: {
          spendCents: membership.currentPeriodSpendCents,
          budgetCents: membership.monthlyBudgetCents,
          percentUsed: Math.round(percentUsed),
        },
      });

      console.log(`[budget] EXHAUSTED: membership=${membership.id} spend=${membership.currentPeriodSpendCents} budget=${membership.monthlyBudgetCents}`);
    }
  } else if (percentUsed >= 90) {
    const existingAlert = await storage.getBudgetAlert(membership.id, 90);
    if (!existingAlert) {
      await storage.createBudgetAlert({
        membershipId: membership.id,
        thresholdPercent: 90,
        triggeredAt: new Date(),
        actionTaken: "warning_90_queued",
      });

      await storage.createAuditLog({
        orgId: org.id,
        actorId: "system",
        action: "budget.warning_90",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { percentUsed: Math.round(percentUsed) },
      });

      console.log(`[budget] WARNING 90%: membership=${membership.id}`);
    }
  } else if (percentUsed >= 80) {
    const existingAlert = await storage.getBudgetAlert(membership.id, 80);
    if (!existingAlert) {
      await storage.createBudgetAlert({
        membershipId: membership.id,
        thresholdPercent: 80,
        triggeredAt: new Date(),
        actionTaken: "warning_80_queued",
      });

      await storage.createAuditLog({
        orgId: org.id,
        actorId: "system",
        action: "budget.warning_80",
        targetType: "team_membership",
        targetId: membership.id,
        metadata: { percentUsed: Math.round(percentUsed) },
      });

      console.log(`[budget] WARNING 80%: membership=${membership.id}`);
    }
  }
}

export async function runUsagePoll(): Promise<{ orgsPolled: number; membersPolled: number; snapshotsCreated: number; errors: number }> {
  if (isPolling) {
    console.log("[usage-poll] Skipping — previous poll still running");
    return { orgsPolled: 0, membersPolled: 0, snapshotsCreated: 0, errors: 0 };
  }

  isPolling = true;
  const stats = { orgsPolled: 0, membersPolled: 0, snapshotsCreated: 0, errors: 0 };
  const now = new Date();

  try {
    const allOrgs = await storage.getAllOrganizations();

    for (const org of allOrgs) {
      const interval = POLLING_INTERVALS[org.plan] || POLLING_INTERVALS.FREE;
      const lastPolled = org.lastPolledAt ? new Date(org.lastPolledAt).getTime() : 0;

      if (now.getTime() - lastPolled < interval) {
        continue;
      }

      stats.orgsPolled++;
      const connections = await storage.getProviderConnectionsByOrg(org.id);
      const activeConnections = connections.filter(c => c.status === "ACTIVE");

      if (activeConnections.length === 0) {
        await storage.updateOrganization(org.id, { lastPolledAt: now });
        continue;
      }

      const orgTeams = await storage.getTeamsByOrg(org.id);

      for (const team of orgTeams) {
        const memberships = await storage.getMembershipsByTeam(team.id);
        const directActive = memberships.filter(m => m.accessMode === "DIRECT" && m.status === "ACTIVE");

        for (const membership of directActive) {
          const links = await storage.getProviderMemberLinksByMembership(membership.id);
          const activeLinks = links.filter(l => l.status === "ACTIVE" && l.setupStatus === "COMPLETE");

          let memberTotalCostCents = 0;

          for (const link of activeLinks) {
            const conn = activeConnections.find(c => c.id === link.providerConnectionId);
            if (!conn) continue;

            try {
              stats.membersPolled++;
              const adminKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);

              let usageResults: UsageResult[] = [];

              if (conn.provider === "OPENAI") {
                usageResults = await pollOpenAIUsage(adminKey, link, membership.periodStart);
              } else if (conn.provider === "ANTHROPIC") {
                usageResults = await pollAnthropicUsage(adminKey, link, membership.periodStart);
              }

              let linkTotalCost = 0;
              let linkTotalInput = 0;
              let linkTotalOutput = 0;

              for (const usage of usageResults) {
                linkTotalCost += usage.totalCostCents;
                linkTotalInput += usage.inputTokens;
                linkTotalOutput += usage.outputTokens;
              }

              memberTotalCostCents += linkTotalCost;

              if (usageResults.length > 0) {
                await storage.createUsageSnapshot({
                  providerMemberLinkId: link.id,
                  membershipId: membership.id,
                  snapshotAt: now,
                  inputTokens: linkTotalInput,
                  outputTokens: linkTotalOutput,
                  totalCostCents: linkTotalCost,
                  periodCostCents: linkTotalCost,
                  model: usageResults.map(u => u.model).filter(Boolean).join(","),
                  source: "POLL",
                  rawData: usageResults.length === 1 ? usageResults[0].rawData : usageResults.map(u => u.rawData),
                });
                stats.snapshotsCreated++;
              }
            } catch (e: any) {
              stats.errors++;
              console.error(`[usage-poll] Error polling member=${membership.id} provider=${conn.provider}: ${e.message}`);
            }
          }

          if (memberTotalCostCents > 0 || activeLinks.length > 0) {
            const updatedMembership = await storage.updateMembership(membership.id, {
              currentPeriodSpendCents: memberTotalCostCents,
            });

            if (updatedMembership) {
              await checkBudgetThresholds(updatedMembership, org);
            }
          }
        }
      }

      await storage.updateOrganization(org.id, { lastPolledAt: now });
    }
  } catch (e: any) {
    console.error("[usage-poll] Fatal error:", e.message);
    stats.errors++;
  } finally {
    isPolling = false;
  }

  console.log(`[usage-poll] Complete: orgs=${stats.orgsPolled} members=${stats.membersPolled} snapshots=${stats.snapshotsCreated} errors=${stats.errors}`);
  return stats;
}
