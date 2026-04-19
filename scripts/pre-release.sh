#!/bin/bash
# Pre-release verification script.
#
# Runs the same checks the release checklist requires:
#   1. Vitest unit + reducer + backend test suite (the same suite that
#      `npm run build` now runs automatically before producing a deploy
#      artifact — see script/build.ts).
#   2. The Playwright arena setup → round → vote → results e2e walk
#      (tests/e2e/arena-flow.spec.ts).
#
# The Playwright project boots its own dev server via playwright.config.ts
# (`reuseExistingServer: true`), so this script can be run either against a
# fresh checkout or against an already-running `npm run dev`.
#
# Usage:
#   bash scripts/pre-release.sh           # run vitest + e2e
#   VITEST_ONLY=1 bash scripts/pre-release.sh
#   E2E_ONLY=1 bash scripts/pre-release.sh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${E2E_ONLY:-0}" != "1" ]]; then
  echo "==> Running vitest (tests/**/*.test.ts)"
  node node_modules/vitest/vitest.mjs run
fi

if [[ "${VITEST_ONLY:-0}" != "1" ]]; then
  echo "==> Running Playwright e2e (tests/e2e/arena-flow.spec.ts)"
  npx playwright test
fi

echo "==> Pre-release checks passed."
