# Release checklist

This project ships through Replit's autoscale deployment, which runs
`npm run build` before publishing a new version of the production
artifact (`dist/index.cjs`). The checklist below is the authoritative
list of test runs we expect for every release. The first item is now
enforced automatically; the second is an operator step.

## 1. Vitest — automatic, blocking

`script/build.ts` invokes `vitest run` as the very first step of
`npm run build`. If any test in `tests/**/*.test.ts` fails the build
exits with a non-zero status and the deployment is aborted. This means
the arena session reducer suite (`tests/arena-session.test.ts`) and
every existing backend test (proxy, budget, encryption, redactor, …) is
a hard gate on every Replit publish.

To bypass the check during local debugging only:

```
SKIP_RELEASE_TESTS=1 npm run build
```

Do **not** ship a release that was built with `SKIP_RELEASE_TESTS=1`.

## 2. Playwright e2e — required before publish

The arena setup → round → vote → results walk lives at
`tests/e2e/arena-flow.spec.ts`. It is checked into the repo and run via
the Playwright project configured in `playwright.config.ts`. Run it
before clicking *Publish* in Replit:

```
bash scripts/pre-release.sh           # vitest + playwright
E2E_ONLY=1 bash scripts/pre-release.sh # just the e2e walk
```

`scripts/pre-release.sh` boots the dev server through Playwright's
`webServer` config (or reuses one if `npm run dev` is already running),
so a fresh checkout is enough.

If Playwright cannot run in your environment (e.g. headless Chromium is
unavailable in this Replit container), re-run the same flow through the
Playwright-based testing skill described in
`.local/skills/testing/SKILL.md` and capture the result in the release
notes.

## Quick reference

| Stage                | Command                          | Enforced by      |
| -------------------- | -------------------------------- | ---------------- |
| Vitest unit/reducer  | `npm run build` (auto) or `node node_modules/vitest/vitest.mjs run` | `script/build.ts`|
| Full pre-release run | `bash scripts/pre-release.sh`    | release checklist|
| Arena e2e only       | `E2E_ONLY=1 bash scripts/pre-release.sh` | release checklist|
