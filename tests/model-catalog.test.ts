import { describe, it, expect } from "vitest";
import { DEFAULT_MODELS, DEPRECATED_MODELS } from "../server/lib/seed-models";

describe("Model catalog structure", () => {
  it("has all three providers represented", () => {
    const providers = [...new Set(DEFAULT_MODELS.map(m => m.provider))];
    expect(providers).toContain("OPENAI");
    expect(providers).toContain("ANTHROPIC");
    expect(providers).toContain("GOOGLE");
  });

  it("has no duplicate model IDs", () => {
    const ids = DEFAULT_MODELS.map(m => m.modelId);
    const unique = [...new Set(ids)];
    expect(ids.length).toBe(unique.length);
  });

  it("has no deprecated models in the active list", () => {
    for (const model of DEFAULT_MODELS) {
      expect(DEPRECATED_MODELS).not.toContain(model.modelId);
    }
  });

  it("all pricing values are positive integers", () => {
    for (const model of DEFAULT_MODELS) {
      expect(model.inputPricePerMTok).toBeGreaterThan(0);
      expect(model.outputPricePerMTok).toBeGreaterThan(0);
      expect(Number.isInteger(model.inputPricePerMTok)).toBe(true);
      expect(Number.isInteger(model.outputPricePerMTok)).toBe(true);
    }
  });

  it("output price is always >= input price", () => {
    for (const model of DEFAULT_MODELS) {
      expect(model.outputPricePerMTok).toBeGreaterThanOrEqual(model.inputPricePerMTok);
    }
  });

  it("all models have non-empty displayName", () => {
    for (const model of DEFAULT_MODELS) {
      expect(model.displayName.length).toBeGreaterThan(0);
    }
  });

  it("all models have valid provider enum", () => {
    const validProviders = ["OPENAI", "ANTHROPIC", "GOOGLE"];
    for (const model of DEFAULT_MODELS) {
      expect(validProviders).toContain(model.provider);
    }
  });
});

describe("Deprecated models list", () => {
  it("contains known deprecated model families", () => {
    expect(DEPRECATED_MODELS).toContain("gpt-3.5-turbo");
    expect(DEPRECATED_MODELS).toContain("gpt-4-turbo");
    expect(DEPRECATED_MODELS).toContain("o1");
    expect(DEPRECATED_MODELS).toContain("gemini-1.5-flash");
    expect(DEPRECATED_MODELS).toContain("gemini-2.0-flash");
  });

  it("has no duplicate entries", () => {
    const unique = [...new Set(DEPRECATED_MODELS)];
    expect(DEPRECATED_MODELS.length).toBe(unique.length);
  });

  it("all entries are non-empty strings", () => {
    for (const id of DEPRECATED_MODELS) {
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(0);
    }
  });
});

describe("Model pricing sanity", () => {
  it("cheapest models cost less than most expensive", () => {
    const sortedByInput = [...DEFAULT_MODELS].sort((a, b) => a.inputPricePerMTok - b.inputPricePerMTok);
    const cheapest = sortedByInput[0];
    const mostExpensive = sortedByInput[sortedByInput.length - 1];
    expect(cheapest.inputPricePerMTok).toBeLessThan(mostExpensive.inputPricePerMTok);
  });

  it("mini/lite models are cheaper than their full counterparts", () => {
    const gpt4o = DEFAULT_MODELS.find(m => m.modelId === "gpt-4o")!;
    const gpt4oMini = DEFAULT_MODELS.find(m => m.modelId === "gpt-4o-mini")!;
    expect(gpt4oMini.inputPricePerMTok).toBeLessThan(gpt4o.inputPricePerMTok);

    const geminiFlash = DEFAULT_MODELS.find(m => m.modelId === "gemini-2.5-flash")!;
    const geminiFlashLite = DEFAULT_MODELS.find(m => m.modelId === "gemini-2.5-flash-lite")!;
    expect(geminiFlashLite.inputPricePerMTok).toBeLessThan(geminiFlash.inputPricePerMTok);
  });

  it("most expensive OpenAI model costs more than cheapest", () => {
    const openai = DEFAULT_MODELS.filter(m => m.provider === "OPENAI");
    const sorted = [...openai].sort((a, b) => b.inputPricePerMTok - a.inputPricePerMTok);
    expect(sorted[0].inputPricePerMTok).toBeGreaterThan(sorted[sorted.length - 1].inputPricePerMTok);
  });
});
