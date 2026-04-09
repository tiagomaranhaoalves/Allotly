import { describe, it, expect } from "vitest";
import { redact, maskVoucherKey } from "../server/lib/proxy/redactor";

describe("redact", () => {
  it("redacts Azure subscription keys passed as providerKeys", () => {
    const azureKey = "abc123def456ghi789jkl012mno345pq";
    const input = `Unauthorized: key ${azureKey} is invalid`;
    const result = redact(input, [azureKey]);
    expect(result).not.toContain(azureKey);
    expect(result).toContain("***PROVIDER_KEY***");
  });

  it("redacts Bearer tokens", () => {
    const input = 'Authorization: Bearer sk-proj-abc123XYZ456789012345678';
    const result = redact(input);
    expect(result).toContain("Bearer ***");
    expect(result).not.toContain("sk-proj-abc123");
  });

  it("redacts api-key header values", () => {
    const input = 'api-key: abc123def456ghi789jkl012';
    const result = redact(input);
    expect(result).toBe("api-key: ***");
  });

  it("redacts sk-ant- Anthropic keys", () => {
    const input = 'Key was sk-ant-api03-abcdefghijklmnopqr in the response';
    const result = redact(input);
    expect(result).not.toContain("sk-ant-api03");
    expect(result).toContain("***");
  });

  it("redacts sk- OpenAI keys", () => {
    const input = 'Invalid key: sk-1234567890abcdefghij';
    const result = redact(input);
    expect(result).not.toContain("sk-1234567890");
  });

  it("redacts allotly_sk_ voucher keys", () => {
    const input = 'Voucher allotly_sk_test_abc123def456 is expired';
    const result = redact(input);
    expect(result).not.toContain("allotly_sk_test_abc123def456");
    expect(result).toContain("***");
  });

  it("redacts URL query params with key= or api-key=", () => {
    const input = 'https://api.example.com/v1?api-key=secret123&other=ok';
    const result = redact(input);
    expect(result).not.toContain("secret123");
    expect(result).toContain("api-key=***");
  });

  it("redacts multiple secret types in a single string", () => {
    const azureKey = "myAzureKeyValue1234567890abcdef";
    const input = `key=${azureKey}, Bearer sk-test1234567890abcdef, voucher allotly_sk_hello_world`;
    const result = redact(input, [azureKey]);
    expect(result).not.toContain(azureKey);
    expect(result).not.toContain("sk-test1234567890");
    expect(result).not.toContain("allotly_sk_hello_world");
  });

  it("leaves safe text unchanged", () => {
    const input = "DeploymentNotFound: The API deployment does not exist.";
    const result = redact(input);
    expect(result).toBe(input);
  });
});

describe("maskVoucherKey", () => {
  it("masks a Bearer allotly key to last 4 chars", () => {
    const result = maskVoucherKey("Bearer allotly_sk_abcdef1234");
    expect(result).toBe("allotly_sk_***1234");
  });

  it("returns unknown for undefined", () => {
    expect(maskVoucherKey(undefined)).toBe("unknown");
  });

  it("returns *** for very short tokens", () => {
    expect(maskVoucherKey("ab")).toBe("***");
  });
});
