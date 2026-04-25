import { describe, it, expect } from "vitest";
import { listTools, computeDescriptionHashes } from "../../server/lib/mcp/tools";
import { listPrompts } from "../../server/lib/mcp/prompts";
import { RESOURCES } from "../../server/lib/mcp/resources";

describe("mcp registry", () => {
  it("registers all 13 V1 tools", () => {
    const names = listTools().map(t => t.name).sort();
    expect(names).toEqual([
      "chat",
      "compare_models",
      "diagnose",
      "list_available_models",
      "my_budget",
      "my_recent_usage",
      "my_status",
      "quickstart",
      "recommend_model",
      "redeem_and_chat",
      "redeem_voucher",
      "request_topup",
      "voucher_info",
    ]);
  });

  it("voucher_info is the only tool callable without auth", () => {
    const tools = listTools();
    const noAuth = tools.filter(t => !t.requiresAuth).map(t => t.name);
    expect(noAuth).toEqual(["voucher_info"]);
  });

  it("registers 3 prompts", () => {
    const names = listPrompts().map(p => p.name).sort();
    expect(names).toEqual(["compare", "debate-pattern", "quickstart-me"]);
  });

  it("registers 2 resources", () => {
    const uris = RESOURCES.map(r => r.uri).sort();
    expect(uris).toEqual(["allotly://models/me", "allotly://voucher/me"]);
  });

  it("description hashes are stable", () => {
    const hashes = computeDescriptionHashes();
    for (const t of listTools()) {
      expect(hashes[t.name]).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
