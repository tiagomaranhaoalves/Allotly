---
name: update-model-catalog
description: Update the AI model catalog with current models and pricing from OpenAI, Anthropic, and Google. Use when the user asks to update models, refresh the model list, sync model pricing, or says "update the models".
---

# Update Model Catalog

Update `server/lib/seed-models.ts` with the latest models and pricing from all 3 AI providers.

## Trigger Phrases

- "update the models"
- "refresh model list"
- "sync model pricing"
- "check for new models"

## Process

1. **Web search** for current models from each provider (run all 3 in parallel):
   - Search: `site:openai.com OR site:platform.openai.com current chat models pricing 2026`
   - Search: `site:anthropic.com claude models pricing 2026`
   - Search: `site:ai.google.dev gemini models pricing 2026`

2. **Cross-reference** results with the existing `DEFAULT_MODELS` array in `server/lib/seed-models.ts`

3. **For each new model found**, add it to `DEFAULT_MODELS` with:
   - `provider`: "OPENAI" | "ANTHROPIC" | "GOOGLE"
   - `modelId`: exact API model ID string
   - `displayName`: human-readable name
   - `inputPricePerMTok`: input price in **cents per million tokens** (integer)
   - `outputPricePerMTok`: output price in **cents per million tokens** (integer)

4. **For deprecated models**, move their `modelId` to the `DEPRECATED_MODELS` array

5. **Update `estimatePricing()`** in `server/lib/jobs/model-sync.ts` if new model naming patterns need pricing rules

6. **Update `detectProvider()`** in `server/lib/proxy/translate.ts` if new model prefixes are introduced (currently handles: `gpt-*`, `o3*`, `o4*`, `claude-*`, `gemini-*`)

7. **Run tests**: `npx vitest run` — all tests must pass

8. **Restart the app** to trigger the seed, then verify with SQL:
   ```sql
   SELECT model_id, provider, display_name, input_price_per_m_tok, output_price_per_m_tok 
   FROM model_pricing ORDER BY provider, model_id
   ```

## Key Files

- `server/lib/seed-models.ts` — model catalog and pricing (primary file to edit)
- `server/lib/jobs/model-sync.ts` — automated sync job with `estimatePricing()` heuristics
- `server/lib/proxy/translate.ts` — `detectProvider()` for routing requests

## Pricing Conversion

Provider docs show prices in USD per million tokens. Convert to **integer cents per million tokens**:
- $2.50 / 1M tokens → 250 cents per MTok
- $0.15 / 1M tokens → 15 cents per MTok
- $15.00 / 1M tokens → 1500 cents per MTok

## Current Model Count (as of March 2026)

- OpenAI: 10 models (GPT-5.4, GPT-4.1/mini/nano, GPT-4o/mini, o3/mini/pro, o4-mini)
- Anthropic: 7 models (Opus 4.6, Sonnet 4.6, Opus 4.5, Sonnet 4.5, Haiku 4.5, Opus 4.1, Sonnet 4)
- Google: 6 models (Gemini 3.1 Pro/Flash Lite, 3 Flash, 2.5 Pro/Flash/Flash Lite)
