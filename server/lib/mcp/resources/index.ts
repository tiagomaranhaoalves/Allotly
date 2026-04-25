import type { McpPrincipal } from "../auth";
import { storage } from "../../../storage";
import { buildBudgetSnapshot } from "../meta-budget";

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export const RESOURCES: ResourceDescriptor[] = [
  {
    uri: "allotly://voucher/me",
    name: "voucher/me",
    description: "Current voucher state for the authenticated principal.",
    mimeType: "application/json",
  },
  {
    uri: "allotly://models/me",
    name: "models/me",
    description: "Available models for the authenticated principal.",
    mimeType: "application/json",
  },
];

export async function readResource(uri: string, principal: McpPrincipal | null): Promise<{ uri: string; mimeType: string; text: string }> {
  if (!principal) {
    return { uri, mimeType: "application/json", text: JSON.stringify({}) };
  }

  if (uri === "allotly://voucher/me") {
    const m = principal.membership;
    const snap = await buildBudgetSnapshot(m);
    let voucher: any = null;
    if (m.voucherRedemptionId) {
      const v = await storage.getVoucher(m.voucherRedemptionId);
      if (v) voucher = { code: v.code, label: v.label, budget_cents: v.budgetCents, expires_at: new Date(v.expiresAt).toISOString() };
    }
    return {
      uri,
      mimeType: "application/json",
      text: JSON.stringify({
        budget: snap,
        voucher,
        membership_status: m.status,
        access_type: m.accessType,
      }, null, 2),
    };
  }

  if (uri === "allotly://models/me") {
    const team = await storage.getTeam(principal.membership.teamId);
    if (!team) return { uri, mimeType: "application/json", text: JSON.stringify({ models: [] }) };
    const conns = await storage.getProviderConnectionsByOrg(team.orgId);
    const activeProviders = conns.filter(c => c.status === "ACTIVE").map(c => c.provider);
    const allowed = principal.membership.allowedProviders as string[] | null;
    const allowedModels = principal.membership.allowedModels as string[] | null;
    const filteredProviders = allowed && allowed.length > 0 ? activeProviders.filter(p => allowed.includes(p)) : activeProviders;
    const pricing = await storage.getModelPricing();
    const models = pricing
      .filter(p => filteredProviders.includes(p.provider))
      .filter(p => !allowedModels || allowedModels.length === 0 || allowedModels.includes(p.modelId))
      .map(p => ({ id: p.modelId, provider: p.provider.toLowerCase(), input_cents_per_mtok: p.inputPricePerMTok, output_cents_per_mtok: p.outputPricePerMTok }));
    return { uri, mimeType: "application/json", text: JSON.stringify({ models }, null, 2) };
  }

  return { uri, mimeType: "application/json", text: JSON.stringify({ error: "Unknown resource URI" }) };
}
