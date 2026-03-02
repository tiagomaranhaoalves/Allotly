import { storage } from "../../storage";
import { decryptProviderKey } from "../encryption";

let isResetting = false;

export async function runBudgetReset(): Promise<{ membersReset: number; membersReactivated: number; errors: number }> {
  if (isResetting) {
    console.log("[budget-reset] Skipping — previous reset still running");
    return { membersReset: 0, membersReactivated: 0, errors: 0 };
  }

  isResetting = true;
  const stats = { membersReset: 0, membersReactivated: 0, errors: 0 };
  const now = new Date();

  try {
    const allOrgs = await storage.getAllOrganizations();

    for (const org of allOrgs) {
      const orgTeams = await storage.getTeamsByOrg(org.id);

      for (const team of orgTeams) {
        const memberships = await storage.getMembershipsByTeam(team.id);
        const directMembers = memberships.filter(m => m.accessMode === "DIRECT");

        for (const membership of directMembers) {
          try {
            if (new Date(membership.periodEnd) > now) {
              continue;
            }

            const newPeriodStart = new Date(membership.periodEnd);
            const newPeriodEnd = new Date(newPeriodStart);
            newPeriodEnd.setMonth(newPeriodEnd.getMonth() + 1);

            const updateData: any = {
              currentPeriodSpendCents: 0,
              periodStart: newPeriodStart,
              periodEnd: newPeriodEnd,
            };

            if (membership.status === "BUDGET_EXHAUSTED") {
              updateData.status = "ACTIVE";
              stats.membersReactivated++;

              const links = await storage.getProviderMemberLinksByMembership(membership.id);
              for (const link of links) {
                if (link.status === "REVOKED") {
                  const conn = await storage.getProviderConnection(link.providerConnectionId);
                  if (!conn) continue;

                  if (conn.provider === "OPENAI" && link.providerProjectId) {
                    try {
                      const adminKey = decryptProviderKey(conn.adminApiKeyEncrypted, conn.adminApiKeyIv, conn.adminApiKeyTag);
                      const svcRes = await fetch(
                        `https://api.openai.com/v1/organization/projects/${link.providerProjectId}/service_accounts`,
                        {
                          method: "POST",
                          headers: { Authorization: `Bearer ${adminKey}`, "Content-Type": "application/json" },
                          body: JSON.stringify({ name: "allotly-managed" }),
                        }
                      );
                      if (svcRes.ok) {
                        const svcAcct = await svcRes.json();
                        await storage.updateProviderMemberLink(link.id, {
                          status: "ACTIVE" as any,
                          setupStatus: "COMPLETE" as any,
                          providerSvcAcctId: svcAcct.id,
                          providerApiKeyId: svcAcct.api_key?.id,
                          keyDeliveredAt: new Date(),
                        });
                      } else {
                        await storage.updateProviderMemberLink(link.id, {
                          status: "ACTIVE" as any,
                          setupStatus: "PENDING" as any,
                          setupInstructions: "Budget reset: please re-provision OpenAI access.",
                        });
                      }
                    } catch (e: any) {
                      console.error(`[budget-reset] OpenAI re-provision error for link=${link.id}: ${e.message}`);
                      await storage.updateProviderMemberLink(link.id, {
                        status: "ACTIVE" as any,
                        setupStatus: "PENDING" as any,
                      });
                    }
                  } else {
                    await storage.updateProviderMemberLink(link.id, {
                      status: "ACTIVE" as any,
                      setupStatus: "AWAITING_MEMBER" as any,
                      setupInstructions: "Budget has been reset. Please re-provision your API key.",
                    });
                  }
                }
              }

              await storage.createAuditLog({
                orgId: org.id,
                actorId: "system",
                action: "budget.reset_reactivated",
                targetType: "team_membership",
                targetId: membership.id,
                metadata: { previousStatus: "BUDGET_EXHAUSTED" },
              });
            }

            await storage.deleteBudgetAlertsByMembership(membership.id);
            await storage.updateMembership(membership.id, updateData);
            stats.membersReset++;

            await storage.createAuditLog({
              orgId: org.id,
              actorId: "system",
              action: "budget.period_reset",
              targetType: "team_membership",
              targetId: membership.id,
              metadata: {
                previousSpend: membership.currentPeriodSpendCents,
                newPeriodStart: newPeriodStart.toISOString(),
                newPeriodEnd: newPeriodEnd.toISOString(),
              },
            });
          } catch (e: any) {
            stats.errors++;
            console.error(`[budget-reset] Error resetting member=${membership.id}: ${e.message}`);
          }
        }
      }
    }
  } catch (e: any) {
    console.error("[budget-reset] Fatal error:", e.message);
    stats.errors++;
  } finally {
    isResetting = false;
  }

  console.log(`[budget-reset] Complete: reset=${stats.membersReset} reactivated=${stats.membersReactivated} errors=${stats.errors}`);
  return stats;
}
