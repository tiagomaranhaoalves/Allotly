---
name: Flaky tests under full-suite load
description: Tests that pass in isolation but fail during the full vitest/build run, with the cause.
---

# Flaky tests (pass isolated, fail under full-suite parallel load)

## tests/oauth/voucher-key-display.test.ts
- The `interstitial honours Accept-Language for en / es / pt-BR` case is DB-heavy
  (redeems several vouchers, renders the interstitial per locale) and runs ~3.9s.
  Under the full `npm run build` vitest run it intermittently exceeds the 5000ms
  `testTimeout` and/or hits a `teams`/`team_memberships` FK violation during
  teardown. Runs green in isolation (`npx vitest run <file>`).
- **Why:** shared Postgres + parallel suites add latency and teardown ordering
  contention; the timeout is per-test, not load-aware.
- **How to apply:** if the build's only failure is this file, it's environment
  flake, not a regression — re-run it in isolation to confirm before chasing it.
  A durable fix would raise this test's timeout and harden its teardown order
  (delete memberships before teams), but that's OAuth-test scope, not budget work.
