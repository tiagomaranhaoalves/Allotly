---
name: Diagnosing raw i18n keys in the UI
description: Why a button/label shows a literal dotted key, and how to find ALL such bugs without false positives.
---

# Raw i18n key showing in the UI (e.g. "dashboard.teams.saveChanges")

When a control renders a literal dotted key instead of text, the exact dotted
path is missing from the active locale file. i18next returns the key verbatim
when the full path resolves to undefined in the current language AND the
fallback (`en`, always statically loaded).

**Why the obvious check misleads:** leaf names like `saveChanges` / `saving` are
duplicated under MANY parent objects in the locale JSON (dashboard.settings,
dashboard.teams, dashboard.providers, …). Grepping the leaf name finds dozens of
hits and gives false confidence. You must resolve the FULL dotted path under the
exact parent (e.g. `dashboard.teams.saveChanges`), not just the leaf.

**How to apply — scan correctly.** A regex scan for `t("…")` over `client/src`
has two false-positive classes that must be filtered or you'll chase ghosts:
1. i18next **plurals**: a call `t("x.activeTokens", {count})` resolves via
   `activeTokens_one` / `activeTokens_other`. Treat a key as present if any of
   `_one/_other/_zero/_two/_few/_many` variants exist.
2. inline **defaultValue**: `t("x.label", {defaultValue:"Viewing"})` renders the
   fallback, never a raw key — exclude calls whose options contain defaultValue.
   Also exclude non-dotted matches (the regex catches `apiReques`**t**`("PATCH")`).

**Fix:** add the missing key to ALL THREE locales (en/es/pt-BR), matching the
wording/casing of sibling keys; for user-facing security/compliance labels use a
truthful capability the app actually has (e.g. trust badge → "Audit Trail",
since the app has a full admin audit trail) — never invent a compliance claim.
