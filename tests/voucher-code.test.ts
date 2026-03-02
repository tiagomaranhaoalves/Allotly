import { describe, it, expect } from "vitest";
import { generateVoucherCode } from "../server/lib/voucher-codes";

describe("Voucher code generation", () => {
  it("generates code in ALLOT-XXXX-XXXX-XXXX format", () => {
    const code = generateVoucherCode();
    expect(code).toMatch(/^ALLOT-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  });

  it("does not contain ambiguous characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateVoucherCode();
      const segments = code.replace("ALLOT-", "").replace(/-/g, "");
      expect(segments).not.toMatch(/[0OoIiLl1]/);
    }
  });

  it("starts with ALLOT- prefix", () => {
    const code = generateVoucherCode();
    expect(code.startsWith("ALLOT-")).toBe(true);
  });

  it("has exactly 20 characters total", () => {
    const code = generateVoucherCode();
    expect(code.length).toBe(20);
  });

  it("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateVoucherCode());
    }
    expect(codes.size).toBe(100);
  });

  it("only uses allowed charset (2-9, A-Z minus O/I/L)", () => {
    const allowedChars = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    for (let i = 0; i < 50; i++) {
      const code = generateVoucherCode();
      const segments = code.replace("ALLOT-", "").replace(/-/g, "");
      for (const char of segments) {
        expect(allowedChars).toContain(char);
      }
    }
  });

  it("has 3 segments of 4 characters each", () => {
    const code = generateVoucherCode();
    const parts = code.split("-");
    expect(parts.length).toBe(4);
    expect(parts[0]).toBe("ALLOT");
    expect(parts[1].length).toBe(4);
    expect(parts[2].length).toBe(4);
    expect(parts[3].length).toBe(4);
  });
});
