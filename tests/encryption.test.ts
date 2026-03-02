import { describe, it, expect, beforeAll } from "vitest";
import { randomBytes } from "crypto";

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = randomBytes(32).toString("hex");
  }
});

describe("Encryption roundtrip", () => {
  it("encrypts and decrypts to the original value", async () => {
    const { encryptProviderKey, decryptProviderKey } = await import("../server/lib/encryption");
    const original = "sk-test-1234567890abcdefghijklmnopqrstuvwxyz";
    const { encrypted, iv, tag } = encryptProviderKey(original);
    const decrypted = decryptProviderKey(encrypted, iv, tag);
    expect(decrypted).toBe(original);
  });

  it("produces different ciphertext for the same input", async () => {
    const { encryptProviderKey } = await import("../server/lib/encryption");
    const original = "sk-same-key-test";
    const result1 = encryptProviderKey(original);
    const result2 = encryptProviderKey(original);
    expect(result1.encrypted.equals(result2.encrypted)).toBe(false);
    expect(result1.iv.equals(result2.iv)).toBe(false);
  });

  it("fails with wrong tag", async () => {
    const { encryptProviderKey, decryptProviderKey } = await import("../server/lib/encryption");
    const { encrypted, iv } = encryptProviderKey("test-key");
    const wrongTag = randomBytes(16);
    expect(() => decryptProviderKey(encrypted, iv, wrongTag)).toThrow();
  });

  it("handles empty string", async () => {
    const { encryptProviderKey, decryptProviderKey } = await import("../server/lib/encryption");
    const { encrypted, iv, tag } = encryptProviderKey("");
    const decrypted = decryptProviderKey(encrypted, iv, tag);
    expect(decrypted).toBe("");
  });

  it("handles long API keys", async () => {
    const { encryptProviderKey, decryptProviderKey } = await import("../server/lib/encryption");
    const longKey = "sk-" + "a".repeat(200);
    const { encrypted, iv, tag } = encryptProviderKey(longKey);
    const decrypted = decryptProviderKey(encrypted, iv, tag);
    expect(decrypted).toBe(longKey);
  });
});
