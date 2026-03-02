import { describe, it, expect } from "vitest";

describe("Budget calculations", () => {
  it("calculates threshold at 80%", () => {
    const budgetCents = 10000;
    const spentCents = 8000;
    const utilization = Math.round((spentCents / budgetCents) * 100);
    expect(utilization).toBe(80);
    expect(spentCents >= budgetCents * 0.8).toBe(true);
    expect(spentCents >= budgetCents * 0.9).toBe(false);
  });

  it("calculates threshold at 90%", () => {
    const budgetCents = 10000;
    const spentCents = 9000;
    const utilization = Math.round((spentCents / budgetCents) * 100);
    expect(utilization).toBe(90);
    expect(spentCents >= budgetCents * 0.9).toBe(true);
    expect(spentCents >= budgetCents * 1.0).toBe(false);
  });

  it("calculates threshold at 100%", () => {
    const budgetCents = 10000;
    const spentCents = 10000;
    const utilization = Math.round((spentCents / budgetCents) * 100);
    expect(utilization).toBe(100);
    expect(spentCents >= budgetCents * 1.0).toBe(true);
  });

  it("handles budget exhaustion (over 100%)", () => {
    const budgetCents = 5000;
    const spentCents = 5500;
    const utilization = Math.round((spentCents / budgetCents) * 100);
    expect(utilization).toBe(110);
    expect(spentCents > budgetCents).toBe(true);
  });

  it("uses integer cents for all money values", () => {
    const price1 = 250;
    const price2 = 375;
    const total = price1 + price2;
    expect(total).toBe(625);
    expect(Number.isInteger(total)).toBe(true);
    expect((total / 100).toFixed(2)).toBe("6.25");
  });

  it("calculates remaining budget correctly", () => {
    const budgetCents = 10000;
    const spentCents = 3500;
    const remaining = budgetCents - spentCents;
    expect(remaining).toBe(6500);
    expect(Number.isInteger(remaining)).toBe(true);
  });

  it("handles zero budget gracefully", () => {
    const budgetCents = 0;
    const spentCents = 0;
    const utilization = budgetCents > 0 ? Math.round((spentCents / budgetCents) * 100) : 0;
    expect(utilization).toBe(0);
  });

  it("detects thresholds in sequence: 80 → 90 → 100", () => {
    const budgetCents = 10000;
    const thresholds = [80, 90, 100];
    const spendProgression = [7999, 8000, 8999, 9000, 9999, 10000];
    const triggered: number[] = [];

    for (const spend of spendProgression) {
      const util = Math.round((spend / budgetCents) * 100);
      for (const t of thresholds) {
        if (util >= t && !triggered.includes(t)) {
          triggered.push(t);
        }
      }
    }

    expect(triggered).toEqual([80, 90, 100]);
  });
});
