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
