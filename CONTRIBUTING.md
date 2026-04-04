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

These specific FK relationships use `ON DELETE SET NULL` in production (even though schema.ts doesn't declare it explicitly — they were set via direct SQL). Do not change this behavior:
- `proxy_request_logs.api_key_id` → SET NULL (so logs survive key deletion)
- `allotly_api_keys.project_id` → SET NULL (so keys survive project deletion)
- `projects.created_by_id` → SET NULL (so projects survive user deletion)

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
| Stripe credentials | Payment processing | Managed by Replit connector |
| Resend API key | Email delivery | Managed by Replit connector |

Stripe and Resend are managed through Replit's integration system, not raw API keys. Do not try to replace them with manual setups.

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
- `type` — Always `"allotly_error"` to distinguish Allotly errors from upstream provider errors

**HTTP Status Codes Used:**

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

**Budget Headers:** When available, error responses include these custom headers:
- `X-Allotly-Budget-Remaining` — Remaining budget in cents
- `X-Allotly-Budget-Total` — Total budget in cents
- `X-Allotly-Expires` — ISO 8601 period end date
- `X-Allotly-Requests-Remaining` — Remaining requests in current window

**Convention:** All error codes use `snake_case`. Never introduce `camelCase` or `kebab-case` codes. The `type` field must always be `"allotly_error"`.

---

## Proxy Error Handling — Upstream Provider Errors

When an upstream provider (OpenAI, Anthropic, Google, Azure) returns a non-OK response, the proxy does NOT pass through the raw error. It sanitizes and wraps it:

**Azure OpenAI** — Raw error bodies are NEVER forwarded to users. The proxy maps status codes to clean, generic messages:
- 401/403 → `"The provider rejected the request due to authentication or permissions."` (code: `upstream_auth_failed`)
- 404 → `"Deployment "{model}" is not available on this provider."` (code: `deployment_not_available`)
- 429 → `"The provider is rate-limiting requests."` (code: `provider_rate_limited`) — forwards `Retry-After` header if present
- Other → `"The provider returned an error ({status})."` (code: `provider_error`)

The raw Azure error body is logged server-side (truncated to 500 chars) but never sent to the client.

**OpenAI / Anthropic / Google** — The proxy tries to extract a meaningful message from the provider's JSON error body (`error.message`, `message`, or `error.status_message`). If parsing fails, it falls back to the first 200 chars of the raw body. The message is prefixed with `"{PROVIDER} returned {status}: "`.

**HTTP Status Mapping:** The proxy remaps upstream status codes before returning to the client:
- 429 from provider → 429 to client (preserves rate limit semantics)
- 4xx from provider → 400 to client (code: `invalid_request`)
- 5xx from provider → 502 to client (code: `provider_error`)

**Suggestions:** `getProviderErrorSuggestion()` adds context-aware suggestions based on error content — detecting deprecated models, rate limits, auth issues, and 404s.

**Budget cleanup:** On any provider error, the proxy refunds the reserved budget, releases the rate limit counter, and releases the concurrency slot before returning the error.

---

## Rate Limit & Concurrency Response Format

When a user hits the rate limit:

```
HTTP/1.1 429 Too Many Requests
X-Allotly-Budget-Remaining: 4500
X-Allotly-Budget-Total: 10000
X-Allotly-Expires: 2025-02-01T00:00:00.000Z
X-Allotly-Requests-Remaining: 0

{
  "error": {
    "code": "rate_limit",
    "message": "Rate limit exceeded (60 requests per minute)",
    "suggestion": "Slow down your request rate.",
    "type": "allotly_error"
  }
}
```

When a user hits the concurrency limit:

```
HTTP/1.1 429 Too Many Requests

{
  "error": {
    "code": "concurrency_limit",
    "message": "Too many concurrent requests (max 5)",
    "suggestion": "Wait for your current requests to complete before sending new ones.",
    "type": "allotly_error"
  }
}
```

There is no `Retry-After` header for Allotly's own rate/concurrency limits. The only case where `Retry-After` appears is when the upstream provider sends one (Azure 429 responses), which the proxy forwards.

---

## CORS Configuration

There is **no CORS middleware configured**. The application does not use `cors()` or set any `Access-Control-*` headers.

This works because:
- The frontend and backend are served from the same origin (Vite proxies API requests in dev, and in production Express serves the static frontend files directly)
- The proxy endpoint (`/api/v1/chat/completions`) is called by backend API consumers (SDKs, curl, server-side code), not from browsers

If CORS is ever needed (e.g., for a browser-based API playground), it should be added explicitly with a restrictive `Access-Control-Allow-Origin` rather than a wildcard. Credentials should be excluded since the proxy uses Bearer token auth, not cookies.

---

## Session Security

Session management is configured in `server/auth.ts`:

```typescript
session({
  store: new PgSession({
    pool: pool,
    createTableIfMissing: true,
    tableName: "session",
  }),
  secret: process.env.SESSION_SECRET || "allotly-dev-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 30 * 24 * 60 * 60 * 1000,  // 30 days
    httpOnly: true,
    secure: false,
    sameSite: "lax",
  },
})
```

**Key settings:**
- **Store**: PostgreSQL-backed (`connect-pg-simple`), table `session` auto-created
- **Cookie maxAge**: 30 days
- **httpOnly**: `true` — cookie not accessible via JavaScript (XSS protection)
- **secure**: `false` — NOTE: this means cookies are sent over HTTP too. This works because Replit's reverse proxy terminates TLS, but `app.set("trust proxy", 1)` is set in `index.ts` to trust the proxy's `X-Forwarded-Proto` header
- **sameSite**: `"lax"` — cookies sent on same-site requests and top-level navigations (CSRF mitigation)
- **CSRF**: No dedicated CSRF token middleware. Protection relies on `sameSite: "lax"` plus the fact that all mutating API endpoints check `req.session.userId` (session-based auth, not cookie-value auth)
- **Session data**: Stores `userId`, `orgId`, `orgRole`, `isAdmin`

**Known improvement opportunity**: `secure` should ideally be `true` in production (with `trust proxy` already set). If changing this, test that login still works in the Replit deployment environment.

---

## The Z Folder and Y File

These are **placeholders from the Replit project template** — they are default entries in `replit.md` that indicate "do not modify files/folders listed here." In Allotly's case:
- There is no actual folder named `Z` in the repository
- There is no actual file named `Y` in the repository

These entries exist in `replit.md` as part of the template's "User Preferences" section and serve as a reminder that the user can designate protected files/folders. They should be left as-is in `replit.md` to preserve the convention, but contributors do not need to worry about them — there are no real files being protected by these entries.

---

## db:push --force and FK Deletion Policies

**The risk:** Three FK relationships have `ON DELETE SET NULL` policies that were set via direct SQL in production, but are NOT declared in `shared/schema.ts`:
- `proxy_request_logs.api_key_id` → `allotly_api_keys.id` (SET NULL)
- `allotly_api_keys.project_id` → `projects.id` (SET NULL)
- `projects.created_by_id` → `users.id` (SET NULL)

In `schema.ts`, these are defined as simple `.references()` with no `onDelete` clause:
```typescript
apiKeyId: varchar("api_key_id").references(() => allotlyApiKeys.id),
projectId: varchar("project_id").references(() => projects.id),
createdById: varchar("created_by_id").references(() => users.id),
```

**What `db:push --force` does:** Drizzle's push compares the schema definition to the live database. Since the schema doesn't declare `onDelete: "set null"`, a push _could_ attempt to reset the FK constraint to the default (`NO ACTION` or `RESTRICT`). In practice, Drizzle's push focuses on column/table changes and often doesn't touch FK `ON DELETE` policies — but this is not guaranteed across Drizzle versions.

**Recommendation:** To keep the schema authoritative and prevent drift, these three references should be updated in `schema.ts` to explicitly declare the deletion policy:
```typescript
apiKeyId: varchar("api_key_id").references(() => allotlyApiKeys.id, { onDelete: "set null" }),
projectId: varchar("project_id").references(() => projects.id, { onDelete: "set null" }),
createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
```

Until this is done, **verify the FK policies after any `db:push`** by running:
```sql
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
AND kcu.column_name IN ('api_key_id', 'project_id', 'created_by_id');
```

---

## Logging

### What Gets Logged

**Request logging** (`server/index.ts`): Every `/api/*` request is logged with method, path, status code, duration, and the full JSON response body:
```
2:34:15 PM [express] GET /api/teams 200 in 45ms :: {"teams":[...]}
```
This includes response bodies, which may contain sensitive data (user emails, team names, etc.). The response body logging is acceptable in dev but should be reviewed for production if PII regulations apply.

**Proxy logging** (`server/lib/proxy/handler.ts`):
- Azure errors: `[proxy] Azure error {status} for deployment {model}: {body (500 chars)}` — logged at `console.error`
- Handler errors: `[proxy] handler error: {error}` — logged at `console.error`
- Azure debug lines: `[proxy-azure-debug] URL: ...`, `Headers: ...`, `Body keys: ...`, `Key length: ...` — logged at `console.log`. These include partial API key info (first 8 and last 4 chars). These should be removed or gated behind a debug flag for production.

**Background jobs**: Each job logs at start and completion using `[scheduler]`, `[budget-reset]`, `[voucher-expiry]`, `[redis-reconciliation]`, etc. prefixes.

**Webhook processing**: `[webhook]` prefix for Stripe webhook events.

### Log Format

No structured logging library (e.g., pino, winston). All logging uses `console.log`, `console.warn`, and `console.error` with bracketed prefixes like `[proxy]`, `[scheduler]`, `[webhook]`.

### What Should NOT Be Logged

- Full API keys or provider keys (partial prefixes/suffixes are acceptable)
- Full request bodies to the proxy (may contain user prompts/data)
- Full provider error bodies in user-facing responses (log server-side only, truncated)

### Known Issue

The `[proxy-azure-debug]` lines in `handler.ts` (lines 392-396) log API key length, prefix (8 chars), and suffix (4 chars). While not the full key, this is more information than necessary. These lines were added during Azure APIM debugging and should be removed or gated behind `process.env.DEBUG_PROXY` in production.

---

## Background Jobs

All jobs are managed by `server/lib/jobs/scheduler.ts` using `setInterval`. They start automatically when the server boots (`startJobScheduler()` called at end of `index.ts`).

| Job | File | Interval | What It Does | What Breaks If It Stops |
|-----|------|----------|--------------|------------------------|
| Budget Reset | `budget-reset.ts` | 1 hour | Resets monthly budgets when `periodEnd` passes, reactivates `BUDGET_EXHAUSTED` members, re-enables revoked keys, sends email notification | Members whose period expired stay locked out permanently. Keys stay revoked. |
| Concurrency Self-Heal | (in `safeguards.ts`) | 30 seconds | Finds stale concurrency counters in Redis (requests that crashed without cleanup) and resets them to 0 | Users get permanently stuck at "Too many concurrent requests" after any crash/timeout |
| Voucher Expiry | `voucher-expiry.ts` | 1 hour | Marks expired vouchers as `EXPIRED`, revokes associated keys, expires memberships, clears Redis caches | Expired vouchers continue to work indefinitely |
| Bundle Expiry | `bundle-expiry.ts` | 1 hour | Marks expired bundles as `EXPIRED`, cascades to child vouchers and their memberships/keys | Expired bundles continue to work indefinitely |
| Redis Reconciliation | `redis-reconciliation.ts` | 1 minute | Compares Redis budget counters against PostgreSQL spend records, restores missing keys, corrects drift >$1.00 | Redis/PG budget drift grows unbounded. Lost Redis keys mean budget enforcement stops for those members. |
| Provider Validation | `provider-validation.ts` | 24 hours | Tests each provider API key by making a real validation call. Marks `INVALID` if key fails. Emails ROOT_ADMINs on failure. | Broken provider keys stay marked `ACTIVE`, causing proxy errors on every request |
| Snapshot Cleanup | `snapshot-cleanup.ts` | 7 days | Deletes `usageSnapshots` and `proxyRequestLogs` older than the org's retention period (FREE=7d, TEAM=90d, ENTERPRISE=365d) | Database grows unbounded, queries slow down |
| Spend Anomaly | `spend-anomaly.ts` | 1 hour | Compares today's spend against the 7-day daily average. Flags if today >3x the average (minimum $1/day threshold). Creates usage snapshot and emails admins. | No anomaly alerts — sudden spend spikes go unnoticed |
| Model Sync | `model-sync.ts` | 6 hours (+ 10s after boot) | Queries each provider's live API for available models, upserts pricing into `modelPricing` table. Filters to chat-only models, excludes deprecated models. | Model catalog becomes stale. New models don't appear in allowlists. Pricing may be wrong for newly-released models. |

**Reentrancy guards:** Budget reset, voucher expiry, bundle expiry, redis reconciliation, and snapshot cleanup all have a `running` flag that prevents overlapping executions. If a job takes longer than its interval, the next tick is silently skipped.

**No persistence:** Job schedules are in-memory `setInterval` timers. If the server restarts, all timers restart from zero. There is no "last run" tracking — jobs simply run at their interval regardless of when they last completed.

---

## Webhook Security

### Stripe Webhook

**Endpoint:** `POST /api/stripe/webhook`

**Registration order matters:** The webhook route is registered BEFORE `express.json()` middleware in `server/index.ts`. It uses `express.raw({ type: 'application/json' })` to receive the raw Buffer body, which is required for Stripe signature verification. If `express.json()` parses the body first, verification fails.

**Signature validation:**

```typescript
// In webhookHandlers.ts
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
if (endpointSecret) {
  event = stripe.webhooks.constructEvent(payload, signature, endpointSecret);
} else {
  event = JSON.parse(payload.toString());
}
```

- When `STRIPE_WEBHOOK_SECRET` is set: Full signature verification using `stripe.webhooks.constructEvent()`. This validates the `stripe-signature` header against the raw payload to ensure the webhook came from Stripe and wasn't tampered with.
- When `STRIPE_WEBHOOK_SECRET` is NOT set: Falls back to parsing the raw JSON without verification. This is the current development behavior.

**Dual processing:** The webhook handler first passes the event to `stripe-replit-sync` for Stripe data synchronization, then processes it through custom handlers for:
- `checkout.session.completed` — Plan upgrades
- `customer.subscription.updated` — Subscription changes
- `customer.subscription.deleted` — Cancellations (triggers grace period)
- `invoice.payment_failed` — Payment failure notifications

**Missing `stripe-signature` header** returns 400 immediately without processing.

**Webhook URL auto-configuration:** During Stripe initialization (`initStripe()`), the webhook URL is automatically registered via `stripeSync.findOrCreateManagedWebhook()` using the first domain from `REPLIT_DOMAINS`.

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
- Schema changes require `npm run db:push --force` — never write manual SQL migrations
- The `Z` folder and `Y` file should not be modified (per user preference)

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

shared/
  schema.ts        — Database schema, enums, Zod schemas, types
```
