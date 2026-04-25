import crypto from "crypto";
import { listTools } from "./registry";

import "./consumption/list-available-models";
import "./consumption/chat";
import "./consumption/compare-models";
import "./consumption/recommend-model";

import "./recipient/voucher-info";
import "./recipient/my-budget";
import "./recipient/my-status";
import "./recipient/my-recent-usage";
import "./recipient/diagnose";
import "./recipient/quickstart";
import "./recipient/redeem-voucher";
import "./recipient/redeem-and-chat";
import "./recipient/request-topup";

export const PINNED_DESCRIPTION_HASHES: Record<string, string> = {
  "list_available_models": "",
  "chat": "",
  "compare_models": "",
  "recommend_model": "",
  "voucher_info": "",
  "my_budget": "",
  "my_status": "",
  "my_recent_usage": "",
  "diagnose": "",
  "quickstart": "",
  "redeem_voucher": "",
  "redeem_and_chat": "",
  "request_topup": "",
};

export function computeDescriptionHashes(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of listTools()) {
    out[t.name] = crypto.createHash("sha256").update(t.description).digest("hex");
  }
  return out;
}

export function pinDescriptionsAtStartup(): void {
  const computed = computeDescriptionHashes();
  for (const [name, expected] of Object.entries(PINNED_DESCRIPTION_HASHES)) {
    const actual = computed[name];
    if (!actual) {
      console.warn(`[mcp] tool ${name} is pinned but not registered`);
      continue;
    }
    if (expected && expected !== actual) {
      console.warn(`[mcp] description hash mismatch for ${name}: pinned=${expected.slice(0, 8)}, actual=${actual.slice(0, 8)} — update PINNED_DESCRIPTION_HASHES intentionally if this change is reviewed`);
    }
    PINNED_DESCRIPTION_HASHES[name] = actual;
  }
}

export { listTools, getTool } from "./registry";
