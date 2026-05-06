#!/bin/bash
# Pre-release verification script.
#
# Runs the same checks the release checklist requires:
#   1. Vitest unit + reducer + backend test suite (the same suite that
#      `npm run build` now runs automatically before producing a deploy
#      artifact — see script/build.ts).
#   2. The full Playwright e2e suite — including the cross-browser OAuth
#      consent regression spec (tests/e2e/oauth-consent.spec.ts), which is
#      tagged `@cross-browser` and runs in chromium + firefox + webkit to
#      catch the Task #61 class of bug (the Authorize button silently
#      dropping the `decision` field on Firefox/Safari).
#
# The Playwright project boots its own dev server via playwright.config.ts
# (`reuseExistingServer: true`), so this script can be run either against a
# fresh checkout or against an already-running `npm run dev`.
#
# CI/release hosts must have firefox + webkit system libs available. On
# Debian/Ubuntu CI this is a one-shot `npx playwright install --with-deps`
# at provisioning time. The Replit dev container can run chromium and
# firefox out of the box but cannot run webkit (the bundled webkit binary
# requires libjxl.so.0.8, which nixpkgs does not ship); set
# `PLAYWRIGHT_SKIP_WEBKIT=1` in that environment to skip just the webkit
# project.
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
  echo "==> Running Playwright e2e (all projects: chromium + firefox + webkit)"
  if [[ "${PLAYWRIGHT_SKIP_WEBKIT:-0}" == "1" ]]; then
    echo "    (skipping webkit project per PLAYWRIGHT_SKIP_WEBKIT=1)"
    npx playwright test --project=chromium --project=firefox
  else
    npx playwright test
  fi
fi

echo "==> Pre-release checks passed."
