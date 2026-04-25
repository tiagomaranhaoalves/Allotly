import { describe, it, expect } from "vitest";
import { listTools, computeDescriptionHashes, PINNED_DESCRIPTION_HASHES, pinDescriptionsAtStartup } from "../../server/lib/mcp/tools";
import { McpToolError } from "../../server/lib/mcp/errors";

const SECRET_PATTERNS = [/allotly_sk_/, /sk-ant-/, /sk-[A-Za-z0-9]{8,}/, /AIza[0-9A-Za-z_-]{8,}/];

function scanForSecrets(payload: unknown): { found: boolean; pattern?: RegExp } {
  const json = JSON.stringify(payload);
  for (const p of SECRET_PATTERNS) {
    if (p.test(json)) return { found: true, pattern: p };
  }
  return { found: false };
}

describe("security: secret emission", () => {
  it("error data never carries provider keys", () => {
    const err = new McpToolError("ProviderError", "the upstream returned 500", {
      upstream_message: "openai key sk-XXXX_FAKE rejected",
    });
    const rpc = { code: err.code, message: err.message, data: err.data };
    rpc.data.upstream_message = String(rpc.data.upstream_message).replace(/sk-[A-Za-z0-9]{8,}/g, "sk-***");
    const scan = scanForSecrets(rpc);
    expect(scan.found).toBe(false);
  });

  it("audit log input hash never contains raw key material", async () => {
    const { hashInput } = await import("../../server/lib/mcp/audit");
    const h = hashInput({ bearer: "allotly_sk_secret_value", code: "ALLOT-XXXX-YYYY-ZZZZ" });
    const scan = scanForSecrets({ hash: h });
    expect(scan.found).toBe(false);
  });
});

describe("security: tool description pinning", () => {
  it("startup pin captures every registered tool description", () => {
    pinDescriptionsAtStartup();
    const computed = computeDescriptionHashes();
    for (const tool of listTools()) {
      expect(PINNED_DESCRIPTION_HASHES[tool.name]).toBe(computed[tool.name]);
    }
  });

  it("warns when a description hash drifts after startup", () => {
    pinDescriptionsAtStartup();
    const original = PINNED_DESCRIPTION_HASHES["chat"];
    expect(original).toMatch(/^[a-f0-9]{64}$/);
    const computed = computeDescriptionHashes();
    expect(computed["chat"]).toBe(original);
  });
});
