import { describe, it, expect } from "vitest";
import { generateAllotlyKey, hashKey } from "../server/lib/keys";

describe("Allotly proxy key generation", () => {
  it("generates key with allotly_sk_ prefix", () => {
    const { key } = generateAllotlyKey();
    expect(key.startsWith("allotly_sk_")).toBe(true);
  });

  it("returns a hash that is a valid SHA-256 hex string", () => {
    const { hash } = generateAllotlyKey();
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("returns a prefix that truncates the key", () => {
    const { key, prefix } = generateAllotlyKey();
    expect(prefix).toBe(key.slice(0, 15) + "...");
    expect(prefix.startsWith("allotly_sk_")).toBe(true);
    expect(prefix.endsWith("...")).toBe(true);
  });

  it("generates unique keys each time", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 50; i++) {
      keys.add(generateAllotlyKey().key);
    }
    expect(keys.size).toBe(50);
  });

  it("generates unique hashes each time", () => {
    const hashes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      hashes.add(generateAllotlyKey().hash);
    }
    expect(hashes.size).toBe(50);
  });

  it("hashKey produces consistent output for same input", () => {
    const testKey = "allotly_sk_test123";
    const hash1 = hashKey(testKey);
    const hash2 = hashKey(testKey);
    expect(hash1).toBe(hash2);
  });

  it("hashKey matches the hash from generateAllotlyKey", () => {
    const { key, hash } = generateAllotlyKey();
    const recomputed = hashKey(key);
    expect(recomputed).toBe(hash);
  });

  it("key has sufficient length for security", () => {
    const { key } = generateAllotlyKey();
    expect(key.length).toBeGreaterThan(40);
  });
});
