import { db } from "../db";
import { storage } from "../storage";
import {
  teams, teamMemberships, proxyRequestLogs,
  modelPricing, users, auditLogs,
} from "@shared/schema";
import { eq, and, gte, sql, desc, inArray } from "drizzle-orm";

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getTeamIdsFilter(orgId: string, teamId?: string) {
  return teamId ? [teamId] : null;
}

async function getTeamIdsForOrg(orgId: string): Promise<string[]> {
  const orgTeams = await db.select({ id: teams.id }).from(teams).where(eq(teams.orgId, orgId));
  return orgTeams.map(t => t.id);
}

async function getMembershipIds(teamIds: string[]): Promise<string[]> {
  if (teamIds.length === 0) return [];
  const memberships = await db.select({ id: teamMemberships.id })
    .from(teamMemberships)
    .where(inArray(teamMemberships.teamId, teamIds));
  return memberships.map(m => m.id);
}

export async function getCostPerModel(orgId: string, teamId?: string, days = 30) {
  const teamIds = teamId ? [teamId] : await getTeamIdsForOrg(orgId);
  const membershipIds = await getMembershipIds(teamIds);
  if (membershipIds.length === 0) return [];

  const since = daysAgo(days);

  const proxyData = await db.select({
    model: proxyRequestLogs.model,
    provider: proxyRequestLogs.provider,
    costCents: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
    requests: sql<number>`COUNT(*)`,
    inputTokens: sql<number>`COALESCE(SUM(${proxyRequestLogs.inputTokens}), 0)`,
    outputTokens: sql<number>`COALESCE(SUM(${proxyRequestLogs.outputTokens}), 0)`,
  }).from(proxyRequestLogs)
    .where(and(
      inArray(proxyRequestLogs.membershipId, membershipIds),
      gte(proxyRequestLogs.createdAt, since)
    ))
    .groupBy(proxyRequestLogs.model, proxyRequestLogs.provider);

  return proxyData.map(row => ({
    model: row.model,
    provider: row.provider,
    costCents: Number(row.costCents),
    requests: Number(row.requests),
    inputTokens: Number(row.inputTokens),
    outputTokens: Number(row.outputTokens),
  })).sort((a, b) => b.costCents - a.costCents);
}

export async function getTopSpenders(orgId: string, teamId?: string) {
  const teamIds = teamId ? [teamId] : await getTeamIdsForOrg(orgId);
  if (teamIds.length === 0) return [];

  const allTeams = await db.select().from(teams).where(inArray(teams.id, teamIds));
  const teamNameMap: Record<string, string> = {};
  for (const t of allTeams) teamNameMap[t.id] = t.name;

  const memberships = await db.select().from(teamMemberships).where(inArray(teamMemberships.teamId, teamIds));
  const results: any[] = [];

  for (const m of memberships) {
    const user = await storage.getUser(m.userId);
    if (!user) continue;

    results.push({
      membershipId: m.id,
      userId: user.id,
      name: user.name || user.email.split("@")[0],
      email: user.email,
      team: teamNameMap[m.teamId] || "Unknown",
      teamId: m.teamId,
      spendCents: m.currentPeriodSpendCents,
      budgetCents: m.monthlyBudgetCents,
      utilization: m.monthlyBudgetCents > 0 ? Math.round((m.currentPeriodSpendCents / m.monthlyBudgetCents) * 100) : 0,
      accessType: m.accessType,
      isVoucherUser: user.isVoucherUser,
    });
  }

  return results.sort((a, b) => b.spendCents - a.spendCents);
}

export async function getSpendForecast(orgId: string, teamId?: string) {
  const teamIds = teamId ? [teamId] : await getTeamIdsForOrg(orgId);
  const membershipIds = await getMembershipIds(teamIds);
  if (membershipIds.length === 0) {
    return { dailySpend: [], projectedMonthEnd: 0, daysRemaining: 0, dailyAvg: 0, totalBudget: 0, warningExceeds: false };
  }

  const thirtyDaysAgo = daysAgo(30);

  const proxyDaily = await db.select({
    day: sql<string>`DATE(${proxyRequestLogs.createdAt})`,
    costCents: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
  }).from(proxyRequestLogs)
    .where(and(
      inArray(proxyRequestLogs.membershipId, membershipIds),
      gte(proxyRequestLogs.createdAt, thirtyDaysAgo)
    ))
    .groupBy(sql`DATE(${proxyRequestLogs.createdAt})`)
    .orderBy(sql`DATE(${proxyRequestLogs.createdAt})`);

  const dayMap: Record<string, number> = {};
  for (const r of proxyDaily) {
    const d = String(r.day).split("T")[0];
    dayMap[d] = (dayMap[d] || 0) + Number(r.costCents);
  }

  const dailySpend = Object.entries(dayMap)
    .map(([date, costCents]) => ({ date, costCents }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const totalSpent = dailySpend.reduce((s, d) => s + d.costCents, 0);
  const activeDays = dailySpend.length || 1;
  const dailyAvg = Math.round(totalSpent / activeDays);

  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.max(0, Math.ceil((endOfMonth.getTime() - now.getTime()) / 86400000));
  const dayOfMonth = now.getDate();

  const currentMonthSpend = dailySpend
    .filter(d => {
      const dd = new Date(d.date);
      return dd.getMonth() === now.getMonth() && dd.getFullYear() === now.getFullYear();
    })
    .reduce((s, d) => s + d.costCents, 0);

  let slope = 0;
  let intercept = dailyAvg;
  if (dailySpend.length >= 2) {
    const n = dailySpend.length;
    const xs = dailySpend.map((_, i) => i);
    const ys = dailySpend.map(d => d.costCents);
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumXX = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sumXX - sumX * sumX;
    if (denom !== 0) {
      slope = (n * sumXY - sumX * sumY) / denom;
      intercept = (sumY - slope * sumX) / n;
    }
  }

  let projectedMonthEnd = currentMonthSpend;
  for (let i = 0; i < daysRemaining; i++) {
    const dayIndex = activeDays + i;
    projectedMonthEnd += Math.max(0, Math.round(intercept + slope * dayIndex));
  }

  let totalBudget = 0;
  const memberships = await db.select().from(teamMemberships).where(inArray(teamMemberships.id, membershipIds));
  totalBudget = memberships.reduce((s, m) => s + m.monthlyBudgetCents, 0);

  if (teamId) {
    const teamData = await db.select().from(teams).where(eq(teams.id, teamId));
    const teamBudget = teamData[0]?.monthlyBudgetCeilingCents;
    if (teamBudget && teamBudget > 0) totalBudget = teamBudget;
  } else {
    const org = await storage.getOrganization(orgId);
    const orgBudget = org?.orgBudgetCeilingCents || 0;
    if (orgBudget > 0) totalBudget = orgBudget;
  }

  return {
    dailySpend,
    projectedMonthEnd,
    currentMonthSpend,
    daysRemaining,
    dayOfMonth,
    dailyAvg,
    totalBudget,
    slope,
    intercept,
    warningExceeds: totalBudget > 0 ? projectedMonthEnd > totalBudget : false,
  };
}

export async function getAnomalies(orgId: string, teamId?: string) {
  const teamIds = teamId ? [teamId] : await getTeamIdsForOrg(orgId);
  const membershipIds = await getMembershipIds(teamIds);
  if (membershipIds.length === 0) return [];

  const anomalyLogs = await db.select().from(auditLogs)
    .where(and(
      eq(auditLogs.orgId, orgId),
      eq(auditLogs.action, "spend.anomaly_detected"),
      gte(auditLogs.createdAt, daysAgo(30))
    ))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50);

  const results: any[] = [];
  for (const log of anomalyLogs) {
    const meta = log.metadata as any;
    if (!meta) continue;
    if (log.targetId && !membershipIds.includes(log.targetId)) continue;

    results.push({
      id: log.id,
      memberEmail: meta.memberEmail || "Unknown",
      memberName: meta.memberEmail?.split("@")[0] || "Unknown",
      todaySpendCents: meta.todaySpendCents || 0,
      avgDailyCents: meta.avgDailyCents || 0,
      multiplier: meta.multiplier || "0",
      detectedAt: log.createdAt,
    });
  }

  return results;
}

export async function getOptimizationRecommendations(orgId: string, teamId?: string) {
  const teamIds = teamId ? [teamId] : await getTeamIdsForOrg(orgId);
  const membershipIds = await getMembershipIds(teamIds);
  if (membershipIds.length === 0) return [];

  const pricing = await storage.getModelPricing();
  const recommendations: any[] = [];

  const since = daysAgo(30);
  const modelUsage = await db.select({
    model: proxyRequestLogs.model,
    provider: proxyRequestLogs.provider,
    totalCost: sql<number>`COALESCE(SUM(${proxyRequestLogs.costCents}), 0)`,
    totalRequests: sql<number>`COUNT(*)`,
    uniqueMembers: sql<number>`COUNT(DISTINCT ${proxyRequestLogs.membershipId})`,
  }).from(proxyRequestLogs)
    .where(and(
      inArray(proxyRequestLogs.membershipId, membershipIds),
      gte(proxyRequestLogs.createdAt, since)
    ))
    .groupBy(proxyRequestLogs.model, proxyRequestLogs.provider);

  const modelAlternatives: Record<string, { cheaperModel: string; pricingRatio: number }> = {
    "gpt-4o": { cheaperModel: "gpt-4o-mini", pricingRatio: 0.033 },
    "gpt-4-turbo": { cheaperModel: "gpt-4o-mini", pricingRatio: 0.01 },
    "claude-sonnet-4-20250514": { cheaperModel: "claude-haiku-3-5-20241022", pricingRatio: 0.08 },
    "claude-3-5-sonnet-20241022": { cheaperModel: "claude-haiku-3-5-20241022", pricingRatio: 0.08 },
    "gemini-2.5-pro": { cheaperModel: "gemini-2.5-flash", pricingRatio: 0.1 },
  };

  for (const usage of modelUsage) {
    const alt = modelAlternatives[usage.model];
    if (!alt) continue;

    const totalCost = Number(usage.totalCost);
    if (totalCost < 100) continue;

    const estimatedSavings = Math.round(totalCost * (1 - alt.pricingRatio));
    const members = Number(usage.uniqueMembers);
    const cheaperDisplay = pricing.find(p => p.modelId === alt.cheaperModel)?.displayName || alt.cheaperModel;

    recommendations.push({
      type: "model_downgrade",
      title: "Model downgrade opportunity",
      description: `${members} member${members !== 1 ? "s" : ""} using ${usage.model} for tasks ${cheaperDisplay} could handle`,
      estimatedSavingsCents: estimatedSavings,
      currentModel: usage.model,
      suggestedModel: alt.cheaperModel,
      suggestedModelDisplay: cheaperDisplay,
      memberCount: members,
      currentCostCents: totalCost,
    });
  }

  const memberships = await db.select().from(teamMemberships).where(inArray(teamMemberships.id, membershipIds));
  const underutilized = memberships.filter(m =>
    m.monthlyBudgetCents > 0 && m.currentPeriodSpendCents < m.monthlyBudgetCents * 0.1
  );
  if (underutilized.length > 0) {
    const totalUnused = underutilized.reduce((s, m) => s + (m.monthlyBudgetCents - m.currentPeriodSpendCents), 0);
    recommendations.push({
      type: "budget_reallocation",
      title: "Budget utilization",
      description: `${underutilized.length} member${underutilized.length !== 1 ? "s" : ""} have used less than 10% of their budget this period`,
      estimatedSavingsCents: totalUnused,
      memberCount: underutilized.length,
    });
  }

  return recommendations.sort((a, b) => b.estimatedSavingsCents - a.estimatedSavingsCents);
}
