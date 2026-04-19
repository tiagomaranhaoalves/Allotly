import { describe, it, expect } from "vitest";
import {
  reducer,
  initialState,
  deserialize,
} from "../client/src/arena/session";
import { DEFAULT_ALLOWED, DEFAULT_LINEUP } from "../client/src/arena/data/model-catalog";
import type { LineupSlots, ModelId, SessionState } from "../client/src/arena/types";

describe("arena session reducer", () => {
  describe("SET_ALLOWLIST", () => {
    it("repairs lineup slots that reference a now-blocked model", () => {
      const startLineup: LineupSlots = ["gpt-4o-mini", "claude-sonnet-4-20250514", "gemini-2.5-flash"];
      const start: SessionState = { ...initialState, lineup: startLineup };

      // Block claude-sonnet-4 by leaving it out of the new allowlist.
      const next = reducer(start, {
        type: "SET_ALLOWLIST",
        allowedModels: ["gpt-4o-mini", "gemini-2.5-flash"],
      });

      expect(next.allowedModels).toEqual(["gpt-4o-mini", "gemini-2.5-flash"]);
      // Slot 0 and slot 2 were already allowed → unchanged.
      expect(next.lineup[0]).toBe("gpt-4o-mini");
      expect(next.lineup[2]).toBe("gemini-2.5-flash");
      // Slot 1 was blocked → repaired to the first allowed model.
      expect(next.lineup[1]).toBe("gpt-4o-mini");
      // Every slot must remain in the allowlist.
      for (const m of next.lineup) {
        expect(next.allowedModels).toContain(m);
      }
    });

    it("falls back to existing slot 0 when the new allowlist is empty", () => {
      const start: SessionState = {
        ...initialState,
        lineup: ["gpt-4o-mini", "claude-sonnet-4-20250514", "gemini-2.5-flash"],
      };
      const next = reducer(start, { type: "SET_ALLOWLIST", allowedModels: [] });
      expect(next.allowedModels).toEqual([]);
      // With no allowed models, fallback is the original slot-0 model.
      expect(next.lineup).toEqual(["gpt-4o-mini", "gpt-4o-mini", "gpt-4o-mini"]);
    });

    it("leaves the lineup untouched when every slot is still allowed", () => {
      const start: SessionState = {
        ...initialState,
        lineup: ["gpt-4o-mini", "gemini-2.5-flash", "claude-sonnet-4-20250514"],
      };
      const next = reducer(start, {
        type: "SET_ALLOWLIST",
        allowedModels: ["gpt-4o-mini", "gemini-2.5-flash", "claude-sonnet-4-20250514", "claude-haiku-4-5"],
      });
      expect(next.lineup).toEqual(start.lineup);
    });
  });

  describe("CONFIRM_SETUP", () => {
    it("flips setupConfirmed from false to true", () => {
      expect(initialState.setupConfirmed).toBe(false);
      const next = reducer(initialState, { type: "CONFIRM_SETUP" });
      expect(next.setupConfirmed).toBe(true);
    });

    it("preserves allowedModels and lineup across the transition", () => {
      const customLineup: LineupSlots = ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.5-flash"];
      const customAllowed: ModelId[] = ["claude-haiku-4-5", "gpt-4o-mini", "gemini-2.5-flash"];
      const start: SessionState = {
        ...initialState,
        lineup: customLineup,
        allowedModels: customAllowed,
      };
      const next = reducer(start, { type: "CONFIRM_SETUP" });
      expect(next.setupConfirmed).toBe(true);
      expect(next.lineup).toEqual(customLineup);
      expect(next.allowedModels).toEqual(customAllowed);
    });

    it("is idempotent when called twice", () => {
      const once = reducer(initialState, { type: "CONFIRM_SETUP" });
      const twice = reducer(once, { type: "CONFIRM_SETUP" });
      expect(twice.setupConfirmed).toBe(true);
    });
  });
});

describe("arena session deserialize / hydrate backfill", () => {
  it("backfills allowedModels and lineup for older sessions missing those fields", () => {
    const legacy = {
      mode: "cached",
      keyType: null,
      keyValue: null,
      totalBudgetUSD: 20,
      allocatedUSD: 0,
      remainingUSD: 0,
      currentMode: null,
      modesPlayed: [],
      roundsPlayed: { marketing: 0, research: 0, creative: 0, "secret-keeper": 0 },
      voteHistory: [],
      sessionStartTime: null,
      isExhausted: false,
      allocationConfirmed: false,
      keyExpiresAt: null,
      // No allowedModels, no lineup, no setupConfirmed.
    };

    const restored = deserialize(legacy);
    expect(restored).not.toBeNull();
    expect(restored!.allowedModels).toEqual(DEFAULT_ALLOWED);
    expect(restored!.lineup).toEqual(DEFAULT_LINEUP);
    expect(restored!.setupConfirmed).toBe(false);
  });

  it("preserves a saved allowlist and lineup when present", () => {
    const saved = {
      ...initialState,
      allowedModels: ["gpt-4o-mini", "gemini-2.5-flash"] as ModelId[],
      lineup: ["gemini-2.5-flash", "gpt-4o-mini", "gemini-2.5-flash"] as LineupSlots,
      setupConfirmed: true,
    };
    const restored = deserialize(saved);
    expect(restored).not.toBeNull();
    expect(restored!.allowedModels).toEqual(["gpt-4o-mini", "gemini-2.5-flash"]);
    expect(restored!.lineup).toEqual(["gemini-2.5-flash", "gpt-4o-mini", "gemini-2.5-flash"]);
    expect(restored!.setupConfirmed).toBe(true);
  });

  it("falls back to defaults when lineup is the wrong length", () => {
    const corrupted = {
      ...initialState,
      lineup: ["gpt-4o-mini"],
    };
    const restored = deserialize(corrupted);
    expect(restored).not.toBeNull();
    expect(restored!.lineup).toEqual(DEFAULT_LINEUP);
  });

  it("falls back to defaults when allowedModels is empty", () => {
    const corrupted = {
      ...initialState,
      allowedModels: [],
    };
    const restored = deserialize(corrupted);
    expect(restored).not.toBeNull();
    expect(restored!.allowedModels).toEqual(DEFAULT_ALLOWED);
  });

  it("returns null for sessions older than the TTL", () => {
    const ancient = {
      ...initialState,
      sessionStartTime: Date.now() - 48 * 60 * 60 * 1000, // 48h ago
    };
    expect(deserialize(ancient)).toBeNull();
  });

  it("returns null for non-object input", () => {
    expect(deserialize(null)).toBeNull();
    expect(deserialize(undefined)).toBeNull();
    expect(deserialize("oops")).toBeNull();
  });
});
