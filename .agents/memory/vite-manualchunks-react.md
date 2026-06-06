---
name: Vite manualChunks React white-screen
description: Why hand-rolled vendor manualChunks splitting React white-screens the production build (dev hides it), and how to verify.
---

# Hand-rolled vendor `manualChunks` can white-screen production

A `build.rollupOptions.output.manualChunks` config that puts React core in one
vendor chunk (e.g. `vendor-react`) and other deps in others (`vendor-misc`, etc.)
can crash the production bundle with:

`TypeError: Cannot set properties of undefined (setting 'Children')`

thrown from the misc vendor chunk calling into the react vendor chunk.

**Cause:** Rollup's injected CommonJS interop helper / React's exports object ends
up split across chunks, creating a circular chunk dependency. The dependent chunk
executes first and references React's exports before they're initialized → the
whole React namespace is `undefined` → any top-level `<Suspense fallback={null}>`
with no error boundary above it blanks the entire page (`#root` empty).

**Why it hides in dev:** `vite dev` (esbuild, native ESM) does NOT apply rollup
`manualChunks`. The bug only appears in the built/minified/chunked artifact, so
the dev preview looks perfectly fine while production is down.

**Fix / decision:** Prefer NOT hand-rolling React vendor chunking. Removing the
`manualChunks` block and letting Rollup auto-chunk co-locates the CJS interop
helpers with their consumers and avoids the circular-chunk class of bug. Route-level
`React.lazy` code-splitting is independent and still works; lazy-only libs (e.g.
recharts) stay in their own auto chunks. A "single vendor chunk" is NOT guaranteed
safe either — the interop helper can still land in the entry and re-create an
entry↔vendor cycle. Correctness > the micro-optimization; the larger entry chunk
(gzip ~166KB) is an acceptable tradeoff and the chunk-size warning is cosmetic.

**How to verify a production build before publishing:** build (`npx vite build`),
`npx vite preview --port 4173`, then load it with Playwright (`@playwright/test`'s
`chromium`) capturing `pageerror`/`console` and asserting `#root` innerHTML is
non-empty. A clean server log + 200s + all assets 200 does NOT prove the SPA
mounts — a runtime chunk-init throw still serves valid HTML/JS but renders blank.
