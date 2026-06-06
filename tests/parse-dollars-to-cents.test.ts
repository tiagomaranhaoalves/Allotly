import { describe, it, expect } from "vitest";
import { parseDollarsToCents } from "../client/src/lib/currency";

describe("parseDollarsToCents", () => {
  it("maps a blank field to null (unlimited)", () => {
    expect(parseDollarsToCents("")).toBeNull();
    expect(parseDollarsToCents("   ")).toBeNull();
  });

  it("converts valid dollar amounts to whole integer cents", () => {
    expect(parseDollarsToCents("0")).toBe(0);
    expect(parseDollarsToCents("50")).toBe(5000);
    expect(parseDollarsToCents("50000")).toBe(5000000);
    expect(parseDollarsToCents("12.34")).toBe(1234);
  });

  it("rounds sub-cent dollar input to the nearest cent", () => {
    expect(parseDollarsToCents("0.005")).toBe(1);
    expect(parseDollarsToCents("0.004")).toBe(0);
  });

  it("returns undefined for non-empty invalid input so callers never serialize NaN to null", () => {
    // These would otherwise produce NaN -> JSON null -> silently "unlimited".
    expect(parseDollarsToCents("-")).toBeUndefined();
    expect(parseDollarsToCents(".")).toBeUndefined();
    expect(parseDollarsToCents("abc")).toBeUndefined();
    expect(parseDollarsToCents("1e")).toBe(100); // parseFloat("1e") === 1, a finite value
  });

  it("rejects negative amounts as invalid (undefined), not null", () => {
    expect(parseDollarsToCents("-5")).toBeUndefined();
  });
});
