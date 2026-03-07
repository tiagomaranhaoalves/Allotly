# Fix: Replit CDN Intercepting All Requests (publicDir Issue)

## Problem Summary

The Express server works perfectly in dev and local production builds, but `https://allotly.replit.app` returns plain-text "Not Found" for ALL routes. The 404 comes from Google's CDN layer (confirmed by `via: 1.1 google` header), not from Express. Zero requests reach the Express server logs.

Root cause: `.replit` has `publicDir = "dist/public"` in `[deployment]`, which activates a static-file CDN that intercepts all traffic and never proxies unmatched routes to Express.

---

## Solution 1: Remove publicDir entirely (PREFERRED)

The `.replit` file must have NO `publicDir` line in the `[deployment]` section. This forces Replit to treat the deployment as a pure server app where Express handles all routing.

**Step 1:** Open `.replit` and find the `[deployment]` section. Remove the entire `publicDir` line. The section should look like this:

```toml
[deployment]
deploymentTarget = "autoscale"
run = ["sh", "-c", "npm run start"]
```

There must be NO `publicDir` key at all — not empty string, not `/dev/null`, not commented out. The key must be completely absent.

**Step 2:** Verify the file was actually modified:

```bash
cat .replit | grep -n "publicDir"
```

This should return NO output. If it still shows `publicDir`, manually edit the file:

```bash
sed -i '/publicDir/d' .replit
cat .replit
```

**Step 3:** Re-deploy (new publish, not just restart):

```bash
# Verify .replit is clean
cat .replit

# Rebuild
npm run build

# The deployment must be a fresh publish, not a restart of the existing one
```

After publishing, test:

```bash
curl -v https://allotly.replit.app/api/health
curl -v https://allotly.replit.app/api/v1/models -H "Authorization: Bearer test"
```

---

## Solution 2: If publicDir cannot be removed (config tool limitation)

If the Replit config tool keeps re-adding `publicDir` or cannot remove it, try these approaches in order:

### 2a: Set publicDir to an empty, non-existent directory

```toml
[deployment]
deploymentTarget = "autoscale"
publicDir = ".no-static"
run = ["sh", "-c", "npm run start"]
```

Make sure `.no-static` does NOT exist:

```bash
rm -rf .no-static
# Do NOT create this directory — it must not exist
```

The theory: if the CDN finds no directory to serve from, it should fall through to the app server.

### 2b: Use build command to delete the static dir before deploy

If Replit requires `publicDir` to point to something, point it at an empty directory that gets wiped on each build:

```toml
[deployment]
deploymentTarget = "autoscale"
publicDir = "dist/static-placeholder"
build = ["sh", "-c", "npm run build && rm -rf dist/static-placeholder && mkdir -p dist/static-placeholder"]
run = ["sh", "-c", "npm run start"]
```

This ensures the CDN layer has zero files to match, forcing all requests to Express.

### 2c: Switch to reserved VM deployment (no CDN layer)

Autoscale deployments are more likely to use a CDN front layer. Reserved VM deployments may route traffic directly to the process:

```toml
[deployment]
deploymentTarget = "reserved_vm"
run = ["sh", "-c", "npm run start"]
```

Remove `publicDir` entirely when switching. Republish.

---

## Solution 3: Serve static files FROM Express (eliminate need for publicDir)

If Replit's infrastructure insists on a CDN layer regardless of config, make Express serve the static files itself so you don't need `publicDir` at all.

**Step 1:** In your Express app, add static file serving:

```javascript
import path from 'path';
import express from 'express';

// Serve Vite's built client assets from Express directly
app.use(express.static(path.join(__dirname, '../dist/client')));

// API routes (must come before the catch-all)
app.use('/api', apiRouter);

// SPA catch-all: serve index.html for any non-API, non-asset route
app.get('*', (req, res) => {
  // Don't catch API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '../dist/client/index.html'));
});
```

**Step 2:** Move Vite's output away from the publicDir path:

In `vite.config.ts`:

```typescript
export default defineConfig({
  build: {
    outDir: 'dist/client',  // NOT dist/public
  },
});
```

**Step 3:** Remove `publicDir` from `.replit`:

```toml
[deployment]
deploymentTarget = "autoscale"
run = ["sh", "-c", "npm run build && npm run start"]
```

Now Express handles everything — static files, API routes, SPA routing — and there's no need for Replit's CDN layer.

---

## Solution 4: Nuclear option — fresh .replit file

If the file is corrupted or the config tool has left hidden state:

```bash
# Backup current
cp .replit .replit.backup

# Write a completely clean .replit
cat > .replit << 'EOF'
run = "npm run dev"
entrypoint = "server/index.ts"
modules = ["nodejs-20:v8-20230920-bd784b9"]

[nix]
channel = "stable-24_05"

[deployment]
deploymentTarget = "autoscale"
run = ["sh", "-c", "npm run build && npm run start"]
EOF

# Verify — no publicDir anywhere
cat .replit
grep publicDir .replit  # should return nothing
```

Then do a fresh publish.

---

## Diagnostic Commands

Run these after each attempt to verify the fix:

```bash
# 1. Confirm .replit has no publicDir
grep -c "publicDir" .replit
# Expected: 0

# 2. Check what's in the build output
ls -la dist/
ls -la dist/public/ 2>/dev/null || echo "dist/public does not exist (good)"
ls -la dist/client/ 2>/dev/null || echo "dist/client does not exist"

# 3. Test locally before deploying
npm run build && npm run start
# In another terminal:
curl http://localhost:3000/api/health
curl http://localhost:3000/api/v1/models -H "Authorization: Bearer test"

# 4. After deploy — test externally
curl -v https://allotly.replit.app/ 2>&1 | grep -E "< HTTP|< content-type|< via|< server"
curl -v https://allotly.replit.app/api/health 2>&1 | grep -E "< HTTP|< content-type|< via|< server"
curl -v https://allotly.replit.app/api/v1/chat/completions \
  -H "Authorization: Bearer fake_key" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o-mini","messages":[{"role":"user","content":"test"}]}' \
  2>&1 | grep -E "< HTTP|< content-type|< via|< server"

# If "via: 1.1 google" appears AND Express headers are absent → CDN is still intercepting
# If Express headers appear (x-powered-by, custom headers) → fix worked

# 5. Check deployment logs for incoming requests
# After curling, you should see request logs in the Replit console
```

---

## Priority Order

Try these in order, republishing after each:

1. **Remove `publicDir` line entirely** from `.replit` → republish
2. If that fails: **Set `publicDir` to non-existent directory** → republish
3. If that fails: **Serve static files from Express** + remove `publicDir` → republish
4. If that fails: **Nuclear rewrite of `.replit`** → republish
5. If all fail: **Contact Replit support** — the deployment metadata may be cached server-side and require manual reset
