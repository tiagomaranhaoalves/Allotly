import { describe, it, expect } from "vitest";
import { hashInput } from "../../server/lib/mcp/audit";

describe("audit hashInput", () => {
  it("produces a 64-char hex sha256", () => {
    expect(hashInput({ foo: "bar" })).toMatch(/^[a-f0-9]{64}$/);
  });

  it("is deterministic regardless of key order", () => {
    const a = hashInput({ a: 1, b: 2, c: { d: 3, e: 4 } });
    const b = hashInput({ c: { e: 4, d: 3 }, b: 2, a: 1 });
    expect(a).toBe(b);
  });

  it("differs when content differs", () => {
    expect(hashInput({ a: 1 })).not.toBe(hashInput({ a: 2 }));
  });

  it("never echoes the raw input in the hash", () => {
    const secret = "allotly_sk_supersecret";
    const h = hashInput({ token: secret });
    expect(h).not.toContain("allotly_sk_");
    expect(h).not.toContain(secret);
  });
});
