# Allotly — Contributor Guidelines

This document covers critical patterns, conventions, and guardrails for anyone reviewing or modifying the Allotly codebase. Read it before making changes.

---

## Architecture Overview

Allotly is a SaaS AI spend control plane with a unified proxy that meters every request. The stack:

- **Frontend**: React 18, Vite, Wouter (routing), TanStack Query v5, Shadcn/ui, Tailwind CSS
- **Backend**: Express.js, session-based auth (scrypt hashing)
- **Database**: PostgreSQL via Drizzle ORM
- **Cache/Realtime**: Redis (Upstash) for budget counters, rate limits, concurrency — with in-memory fallback
- **Payments**: Stripe via Replit connector (`stripe-replit-sync`)
- **Email**: Resend via Replit connector, sender `hello@allotly.ai`
- **AI Providers**: OpenAI, Anthropic, Google, Azure OpenAI
- **Production domain**: `allotly.ai`

---

## Critical Files — Handle With Care

These files have complex interdependencies. Changes can silently break billing, API forwarding, or data integrity.

### Proxy Core (`server/lib/proxy/`)

| File | Purpose | Risk |
|------|---------|------|
| `handler.ts` (766 lines) | Main proxy request flow: auth → budget → routing → streaming → cost tracking | Breaking billing or API forwarding |
| `translate.ts` (531 lines) | Provider detection, request/response translation, parameter sanitization | Breaking provider routing |
| `streaming.ts` | SSE streaming handler with token counting | Silent data loss |
| `safeguards.ts` | Auth, budget, rate limits, concurrency | Breaking access control |

### Other Critical Files

| File | Purpose | Risk |
|------|---------|------|
| `shared/schema.ts` (345 lines) | All database tables, enums, Zod schemas | Breaking production data |
| `server/routes.ts` (5995 lines) | All API endpoints | Breaking any feature |
| `server/storage.ts` (882 lines) | All database CRUD operations | Data corruption |
| `server/lib/encryption.ts` | AES-256-GCM encryption for provider API keys | Losing access to all encrypted keys |
| `server/lib/keys.ts` | Allotly API key generation (`allotly_sk_`) | Breaking key issuance |
| `server/lib/redis.ts` | Redis wrapper with in-memory fallback | Breaking budget enforcement |
| `server/lib/plan-limits.ts` | Plan tier enforcement (FREE/TEAM/ENTERPRISE) | Bypassing plan limits |
| `server/stripeClient.ts` | Stripe connector via Replit integration | Breaking payments |
| `server/lib/email.ts` | Resend connector via Replit integration | Breaking all email |

---

## Absolute Do-Nots

### 1. Never change database column types or remove columns

Changing a `varchar` primary key to `serial` (or vice versa) generates destructive `ALTER TABLE` statements that destroy production data. Adding new columns is safe. Renaming or removing existing columns is not.

```typescript
// CORRECT — preserve existing types
id: varchar("id").primaryKey().default(sql`gen_random_uuid()`)

// WRONG — never switch ID types
id: serial("id").primaryKey()  // if it was varchar before
```

To sync schema changes, run `npm run db:push --force`. Never write manual SQL migrations.

### 2. Never rotate the ENCRYPTION_KEY

The `ENCRYPTION_KEY` environment variable is used for AES-256-GCM encryption of all provider API keys stored in the database. Rotating it without re-encrypting every stored key will make all provider connections unrecoverable.

### 3. Never re-introduce Azure auto-routing

Azure routing was deliberately simplified after extensive debugging. The `azure/` prefix is the ONLY mechanism for routing to Azure APIM. Do not:
- Re-add `Ocp-Apim-Subscription-Key` header (only `api-key` is sent)
- Re-introduce `hasActiveAzureConnection` or unprefixed auto-routing for `gpt-*` models
- Bypass the `detectProvider` function for Azure

### 4. Never change the `generateAllotlyKey()` return shape

Always destructure as `{ key, hash, prefix }`. It is used across multiple files (`routes.ts`, `safeguards.ts`, `keys.ts`).

```typescript
// CORRECT
const { key, hash, prefix } = generateAllotlyKey();

// WRONG — will cause silent failures
const key = generateAllotlyKey();
```

### 5. Never use floats for money

All monetary values are stored and computed as **integer cents**. The pricing formula:
```
costCents = ceil(tokens * pricePerMTok / 1_000_000)
```

### 6. Never hardcode Redis keys

Always use the `REDIS_KEYS` helpers from `server/lib/redis.ts`:
```typescript
REDIS_KEYS.budget(membershipId)
REDIS_KEYS.concurrent(membershipId)
REDIS_KEYS.ratelimit(membershipId)
REDIS_KEYS.apiKeyCache(keyHash)
// etc.
```

### 7. Never register middleware before the Stripe webhook route

The webhook route at `POST /api/stripe/webhook` must be registered BEFORE `express.json()` middleware. It uses `express.raw({ type: 'application/json' })` for Stripe signature verification. If `express.json()` parses the body first, signature verification fails silently.

---

## Important Patterns & Conventions

### PostgreSQL Aggregates Return Strings

PostgreSQL `SUM()`, `AVG()`, and similar return string types. Always wrap with `Number()`:

```typescript
// CORRECT
const total = Number(result.totalSpend) || 0;

// WRONG — will concatenate instead of adding
const total = result.totalSpend + otherValue;
```

### Email Uses Positional Arguments

The `sendEmail` function signature is `(to, subject, html)`, NOT an object:

```typescript
// CORRECT
await sendEmail(user.email, "Welcome to Allotly", emailTemplates.welcome(user.name));

// WRONG
await sendEmail({ to: user.email, subject: "...", html: "..." });
```

### Foreign Key Deletion Policies

These FK relationships use `ON DELETE SET NULL` in production but are NOT yet declared in `schema.ts` (set via direct SQL). **These should be added to schema.ts** to prevent `db:push` drift:

```typescript
// RECOMMENDED — add { onDelete: "set null" } to these three references:
apiKeyId: varchar("api_key_id").references(() => allotlyApiKeys.id, { onDelete: "set null" }),
projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
```

Until fixed, verify FK policies after any `db:push` with:
```sql
SELECT tc.constraint_name, tc.table_name, kcu.column_name, rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND kcu.column_name IN ('api_key_id', 'project_id', 'created_by_id');
```

### The `effectiveModel` Variable

In `handler.ts`, after provider detection:
```typescript
const effectiveModel = detectResult.strippedModel || parsed.model;
```

This variable is used by ALL downstream operations: pricing lookup, error messages, streaming, response translation, cost calculation. Do not rename it or introduce alternative model name variables.

### Provider Routing Rules

`detectProvider()` in `translate.ts` determines routing:
- `azure/` prefix → Azure APIM (strips prefix, uses deployment name)
- Regex match for OpenAI-compatible models → OpenAI
- `claude-*` → Anthropic
- `gemini-*` → Google
- No match → returns `null` (rejected by proxy)

### Azure Pricing Fallback

Azure pricing lookup cascades through all 4 provider catalogs:
OPENAI → AZURE_OPENAI → ANTHROPIC → GOOGLE, trying both `effectiveModel` and `azureDeployment.modelId`.

### Parameter Sanitization

Each provider has a whitelist of allowed parameters (`OPENAI_ALLOWED_PARAMS`, `ANTHROPIC_ALLOWED_PARAMS`, `GOOGLE_ALLOWED_PARAMS`). Unknown parameters are silently stripped before forwarding. This is intentional — do not switch to a passthrough approach.

### Rate & Concurrency Limits

Tiered by access type:
- FREE: 20 rpm / 2 concurrent
- TEAM: 60 rpm / 5 concurrent
- VOUCHER: 30 rpm / 2 concurrent
- ENTERPRISE: 120 rpm / 10 concurrent

Rate limit checks happen early (DDoS protection). Bundle pool checks are deferred until after full validation.

---

## Proxy Error Response Format

All proxy errors follow a consistent JSON structure returned by `sendProxyError()` in `handler.ts`:

```json
{
  "error": {
    "code": "rate_limit",
    "message": "Rate limit exceeded (60 requests per minute)",
    "suggestion": "Slow down your request rate.",
    "type": "allotly_error"
  }
}
```

**Fields:**
- `code` — Machine-readable error identifier (e.g., `invalid_auth`, `insufficient_budget`, `provider_error`)
- `message` — Human-readable description of what went wrong
- `suggestion` — Optional actionable advice for the API consumer
- `type` — Always `"allotly_error"` to distinguish from upstream provider errors

**HTTP Status Codes:**

| Status | Codes | Meaning |
|--------|-------|---------|
| 400 | `invalid_request`, `unsupported_model`, `model_not_found` | Bad request or unsupported model |
| 401 | `invalid_auth`, `invalid_key_format`, `invalid_key`, `key_revoked`, `membership_not_found` | Authentication failure |
| 402 | `budget_exhausted`, `insufficient_budget`, `requests_exhausted` | Budget or request pool depleted |
| 403 | `account_suspended`, `account_expired`, `period_expired`, `provider_not_allowed`, `model_not_allowed` | Access forbidden |
| 429 | `rate_limit`, `concurrency_limit`, `provider_rate_limited` | Rate or concurrency limit hit |
| 502 | `provider_error`, `provider_not_configured`, `empty_response` | Upstream provider failure |
| 503 | `provider_unavailable` | Provider temporarily unreachable |
| 500 | `internal_error` | Unexpected server error |

**Budget Headers:** Error responses include when available:
- `X-Allotly-Budget-Remaining` — Remaining budget in cents
- `X-Allotly-Budget-Total` — Total budget in cents
- `X-Allotly-Expires` — ISO 8601 period end date
- `X-Allotly-Requests-Remaining` — Remaining requests in current window

**Convention:** All error codes use `snake_case`. Never introduce `camelCase` or `kebab-case` codes.

---

## Upstream Provider Error Handling

When an upstream provider returns a non-OK response, the proxy sanitizes and wraps it — raw errors are never forwarded to users.

**Azure OpenAI:** Status codes are mapped to clean messages:
- 401/403 → `upstream_auth_failed`
- 404 → `deployment_not_available`
- 429 → `provider_rate_limited` (forwards `Retry-After` header if present)
- Other → `provider_error`

Raw Azure error bodies are logged server-side (truncated to 500 chars) but never sent to the client.

**OpenAI / Anthropic / Google:** The proxy extracts a meaningful message from the provider's JSON error body, prefixed with `"{PROVIDER} returned {status}: "`. Falls back to first 200 chars of raw body if parsing fails.

**Status Mapping:** Upstream codes are remapped:
- 429 from provider → 429 to client
- 4xx from provider → 400 to client (`invalid_request`)
- 5xx from provider → 502 to client (`provider_error`)

**Budget cleanup:** On any provider error, the proxy refunds reserved budget, releases the rate limit counter, and releases the concurrency slot before returning.

---

## CORS Configuration

**No CORS middleware is configured.** The application does not use `cors()` or set any `Access-Control-*` headers.

This works because:
- Frontend and backend are served from the same origin (Vite proxies in dev, Express serves static files in prod)
- The proxy endpoint is called by backend API consumers (SDKs, curl, server-side code), not from browsers

If CORS is ever needed (e.g., for a browser-based API playground), add it with a restrictive `Access-Control-Allow-Origin` — not a wildcard. Exclude credentials since the proxy uses Bearer token auth, not cookies.

---

## Session Security

Session management is configured in `server/auth.ts`:

| Setting | Value | Notes |
|---------|-------|-------|
| Store | PostgreSQL (`connect-pg-simple`), table `session` | Auto-created |
| Cookie maxAge | 30 days | |
| httpOnly | `true` | XSS protection — cookie not accessible via JavaScript |
| secure | `false` | See note below |
| sameSite | `"lax"` | CSRF mitigation |
| CSRF | No dedicated middleware | Relies on `sameSite: "lax"` + session-based auth on all mutating endpoints |
| Session data | `userId`, `orgId`, `orgRole`, `isAdmin` | |

**`secure: false` note:** Replit's reverse proxy terminates TLS, and `app.set("trust proxy", 1)` is set in `index.ts`. Setting `secure: true` would be more correct for production — test that login still works in the Replit deployment environment before changing.

---

## Background Jobs

All jobs run via `setInterval` in `server/lib/jobs/scheduler.ts`, started at server boot. No persistence — if the server restarts, timers restart from zero.

| Job | Interval | Purpose | If it stops... |
|-----|----------|---------|----------------|
| Budget Reset | 1 hour | Resets monthly budgets, reactivates exhausted members, re-enables revoked keys | Members stay locked out permanently after period expiry |
| Concurrency Self-Heal | 30 seconds | Resets stale concurrency counters after crashes | Users get permanently stuck at "Too many concurrent requests" |
| Voucher Expiry | 1 hour | Marks expired vouchers, revokes associated keys | Expired vouchers keep working indefinitely |
| Bundle Expiry | 1 hour | Marks expired bundles, cascades to child vouchers | Expired bundles keep working indefinitely |
| Redis Reconciliation | 1 minute | Corrects Redis/PG budget drift >$1.00, restores missing keys | Budget drift grows unbounded |
| Provider Validation | 24 hours | Tests provider API keys, marks invalid ones, emails admins | Broken keys stay marked ACTIVE, causing proxy errors |
| Snapshot Cleanup | 7 days | Deletes old usage snapshots and proxy logs per retention tier | Database grows unbounded |
| Spend Anomaly | 1 hour | Alerts if daily spend >3x the 7-day average | Spend spikes go unnoticed |
| Model Sync | 6 hours (+10s after boot) | Queries provider APIs for available models, upserts pricing | Stale model catalog, wrong pricing |

**Reentrancy:** Budget reset, voucher expiry, bundle expiry, redis reconciliation, and snapshot cleanup have `running` flags to prevent overlapping executions.

---

## Webhook Security

### Stripe Webhook — `POST /api/stripe/webhook`

**Signature validation:** When `STRIPE_WEBHOOK_SECRET` is set, the handler uses `stripe.webhooks.constructEvent()` to verify the `stripe-signature` header against the raw payload. When the secret is NOT set, it falls back to parsing JSON without verification (dev-only behavior — **must set `STRIPE_WEBHOOK_SECRET` in production**).

**Events handled:**
- `checkout.session.completed` — Plan upgrades
- `customer.subscription.updated` — Subscription changes
- `customer.subscription.deleted` — Cancellations (triggers grace period)
- `invoice.payment_failed` — Payment failure notifications

**Dual processing:** Events pass through `stripe-replit-sync` first (data sync), then through custom handlers.

**Webhook URL:** Auto-registered via `stripeSync.findOrCreateManagedWebhook()` using the first domain from `REPLIT_DOMAINS`.

---

## Logging

### What Gets Logged

- **API requests** (`server/index.ts`): Method, path, status, duration, and full JSON response body for every `/api/*` request. Response body logging may expose PII — review for production if regulations apply.
- **Proxy errors** (`handler.ts`): Azure errors logged at `console.error` (body truncated to 500 chars). Handler errors at `console.error`.
- **Background jobs**: Each job logs at start/completion with bracketed prefixes: `[scheduler]`, `[budget-reset]`, `[voucher-expiry]`, etc.
- **Webhooks**: `[webhook]` prefix for Stripe events.

### Log Format

Plain `console.log`/`console.warn`/`console.error` with bracketed prefixes. No structured logging library.

### What Must NOT Be Logged

- Full API keys or provider keys (partial prefix/suffix is acceptable)
- Full request bodies to the proxy (may contain user prompts/data)
- Full provider error bodies in user-facing responses (log server-side only, truncated)

### Known Issue

`[proxy-azure-debug]` lines in `handler.ts` log API key length, prefix (8 chars), and suffix (4 chars). These were added during Azure APIM debugging and should be removed or gated behind `process.env.DEBUG_PROXY` in production.

---

## Frontend Conventions

### Routing

Uses `wouter`, not `react-router`. Pages live in `client/src/pages/`. Dashboard pages are in `client/src/pages/dashboard/`.

### Data Fetching

TanStack Query v5 — always use object form:
```typescript
// CORRECT
useQuery({ queryKey: ["/api/teams"] })
useQuery({ queryKey: ["/api/teams", teamId, "stats"] })

// WRONG — v4 syntax
useQuery(["/api/teams"])
```

For cache invalidation with variable keys, use arrays:
```typescript
// CORRECT — invalidates properly
queryKey: ["/api/teams", id, "stats"]

// WRONG — won't invalidate correctly
queryKey: [`/api/teams/${id}/stats`]
```

### Mutations

Use `apiRequest` from `@/lib/queryClient` for POST/PATCH/DELETE. Always invalidate relevant cache keys after mutations.

### Forms

Use `react-hook-form` via Shadcn's `useForm` and `Form` components with `zodResolver`.

### Test IDs

Every interactive element and meaningful display element must have a `data-testid` attribute:
- Interactive: `{action}-{target}` (e.g., `button-submit`, `input-email`)
- Display: `{type}-{content}` (e.g., `text-username`, `status-payment`)
- Dynamic: append unique ID (e.g., `card-team-${team.id}`)

### Design System

| Token | Value | Usage |
|-------|-------|-------|
| Primary | Indigo #6366F1 | Teams, main actions |
| Secondary | Cyan #06B6D4 | Vouchers, secondary actions |
| OpenAI | Green #10A37F | Provider badge/icon |
| Anthropic | Amber #D4A574 | Provider badge/icon |
| Google | Blue #4285F4 | Provider badge/icon |
| Azure | Blue #0078D4 | Provider badge/icon |

### Dark Mode

CSS variables are defined in `:root` and `.dark` classes. Use `dark:` Tailwind variants for all visual properties when not using utility classes from `tailwind.config.ts`.

### Imports

- Do NOT explicitly import React (Vite JSX transform handles it)
- Use `@/` path alias for client imports
- Use `@shared/` for shared schema imports
- Use `@assets/` for attached assets
- Use `import.meta.env.VITE_*` for frontend env vars (not `process.env`)

---

## Environment Variables & Secrets

| Variable | Purpose | Sensitivity |
|----------|---------|-------------|
| `DATABASE_URL` | PostgreSQL connection | Runtime-managed by Replit |
| `REDIS_URL` | Upstash Redis connection | Secret (shared env) |
| `ENCRYPTION_KEY` | AES-256-GCM key for provider API keys | Secret (shared env) — NEVER rotate |
| `SESSION_SECRET` | Express session signing | Secret |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature verification | Secret — **must be set in production** |
| Stripe credentials | Payment processing | Managed by Replit connector |
| Resend API key | Email delivery | Managed by Replit connector |

Stripe and Resend are managed through Replit's integration system, not raw API keys. Do not try to replace them with manual setups.

---

## Safe Areas to Change Freely

These areas have minimal dependencies and can be modified without risk:

- **Public pages**: Landing (`landing.tsx`), About, Careers, Contact, Privacy, Terms, Security — purely presentational
- **Dashboard UI styling**: Layout tweaks, color changes — as long as `data-testid` attributes are preserved
- **Adding new API routes**: Follow the existing pattern in `routes.ts` — thin routes that delegate to `storage`
- **Adding new dashboard pages**: Add to `client/src/pages/dashboard/`, register in `App.tsx`, add to sidebar nav in `dashboard-shell.tsx`
- **Email templates**: HTML templates in `server/lib/email.ts` — just maintain the `(to, subject, html)` signature

---

## Testing

- Use Playwright-based e2e tests for frontend features
- The app requires session-based login — test plans need to account for authentication
- For proxy changes, test with actual API calls (not just UI) — streaming responses and cost tracking have subtle edge cases
- Budget/cost calculations should be verified with known token counts and pricing

---

## Deployment

- Production is deployed via Replit's deployment system
- The app auto-detects production via `REPLIT_DEPLOYMENT === '1'`
- Stripe uses the `production` connection in prod, `development` in dev (dev connection is intentionally absent)
- Schema changes require `npm run db:push --force` — back up the database first, and verify FK policies after (see Foreign Key Deletion Policies above)
- Never write manual SQL migrations

---

## File Structure

```
client/src/
  pages/           — Route pages (landing, login, dashboard/*)
  components/      — Reusable UI (dashboard-shell, brand/*, ui/*)
  lib/             — Auth, query client, utilities
  hooks/           — Custom React hooks

server/
  routes.ts        — All API endpoints
  storage.ts       — Database CRUD (IStorage interface)
  auth.ts          — Session config, login/register, scrypt hashing
  db.ts            — Drizzle DB instance
  stripeClient.ts  — Stripe connector
  webhookHandlers.ts — Stripe webhook handlers
  lib/
    proxy/         — AI proxy core (handler, translate, streaming, safeguards)
    providers/     — Provider-specific adapters (openai, anthropic, google, azure)
    encryption.ts  — AES-256-GCM for provider keys
    email.ts       — Resend email service
    keys.ts        — Allotly API key generation
    redis.ts       — Redis wrapper with fallback
    plan-limits.ts — Plan tier enforcement
    seed-models.ts — Model catalog seeding
    jobs/          — Background scheduler jobs
      scheduler.ts       — Job orchestrator (setInterval-based)
      budget-reset.ts    — Monthly budget reset + member reactivation
      voucher-expiry.ts  — Voucher expiration + key revocation
      bundle-expiry.ts   — Bundle expiration cascade
      redis-reconciliation.ts — Redis/PG budget drift correction
      provider-validation.ts  — Provider key health checks
      snapshot-cleanup.ts     — Usage data retention enforcement
      spend-anomaly.ts        — Spend spike detection + alerts
      model-sync.ts           — Live model catalog sync from providers

shared/
  schema.ts        — Database schema, enums, Zod schemas, types
```
