# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform for managing and distributing AI API access with budget controls. Two main features:
1. **Allotly Teams** (No-Proxy) — Scoped AI Provider API keys with polling-based budget monitoring
2. **Allotly Vouchers** (Thin Proxy) — Voucher codes with real-time per-request budget enforcement

## Architecture
- **Frontend**: React 18 + Vite + wouter (routing) + TanStack Query v5 + Shadcn/ui + Tailwind CSS
- **Backend**: Express.js + express-session + connect-pg-simple
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Session-based (express-session + pg sessions), scrypt password hashing
- **Encryption**: AES-256-GCM for AI Provider API keys (ENCRYPTION_KEY env var)
- **Payments**: Stripe (via stripe-replit-sync integration)

## Key Files
- `shared/schema.ts` — All 15 Drizzle tables + Zod schemas + types
- `server/routes.ts` — All API routes with RBAC + voucher limits + Stripe checkout
- `server/storage.ts` — IStorage interface + DrizzleStorage implementation
- `server/auth.ts` — Session setup + requireAuth/requireRole middleware
- `server/index.ts` — Express app with Stripe init (schema migrations, webhook, sync)
- `server/stripeClient.ts` — Stripe client + StripeSync via Replit connector
- `server/stripeService.ts` — Stripe checkout/portal/product service
- `server/webhookHandlers.ts` — Stripe webhook processing
- `server/seed-stripe-products.ts` — Seed Team Plan ($20/mo) + Voucher Bundle ($10)
- `server/lib/encryption.ts` — AES-256-GCM encrypt/decrypt
- `server/lib/keys.ts` — Allotly proxy key generation (allotly_sk_ prefix)
- `server/lib/voucher-codes.ts` — ALLOT-XXXX-XXXX-XXXX code generation
- `server/lib/password.ts` — scrypt password hashing
- `client/src/App.tsx` — All routes with DashboardShell wrapper
- `client/src/lib/auth.tsx` — AuthProvider + useAuth hook
- `client/src/components/dashboard-shell.tsx` — Sidebar + role-aware navigation
- `client/src/pages/landing.tsx` — Marketing landing page
- `client/src/pages/redeem.tsx` — Public voucher redemption flow
- `client/src/pages/docs.tsx` — Documentation page
- `client/src/pages/dashboard/bundles.tsx` — Voucher Bundles page with Stripe checkout
- `client/src/pages/dashboard/settings.tsx` — Org settings + Team upgrade via Stripe
- `client/src/pages/dashboard/providers.tsx` — AI Provider connections (max 3)
- `client/src/pages/dashboard/vouchers.tsx` — Voucher management with plan-based limits

## Design System
- Primary color: Indigo (#6366F1 / HSL 239 84% 67%)
- Secondary: Cyan (#06B6D4) for vouchers
- Provider colors: OpenAI (#10A37F), Anthropic (#D4A574), Google (#4285F4)
- Status colors: Success (#10B981), Warning (#F59E0B), Danger (#EF4444)
- Allotly brand colors available as `allotly-primary`, `allotly-secondary`, etc. in Tailwind
- Provider colors available as `provider-openai`, `provider-anthropic`, `provider-google` in Tailwind
- Fonts: Inter (sans) + JetBrains Mono (mono)
- Dark mode via ThemeProvider + `class` strategy on `<html>`
- Brand components in `client/src/components/brand/`
- Terminology: "AI Provider" (not "Provider"), "Voucher Bundle" (not "External Access Bundle"), "AI usage analytics" (not "Phase 2 analytics")

## Database Tables
organizations, users, teams, team_memberships, provider_connections, provider_member_links, allotly_api_keys, usage_snapshots, budget_alerts, proxy_request_logs, vouchers, voucher_redemptions, voucher_bundles, audit_logs, model_pricing

## Model Pricing (Seeded)
18 models seeded across 3 providers:
- OpenAI: GPT-4o, GPT-4o Mini, GPT-4.1, GPT-4.1 Mini, GPT-4.1 Nano, o3, o3 Mini, o4 Mini, GPT-5.2
- Anthropic: Claude Opus 4.5, Claude Sonnet 4.5, Claude Haiku 4.5, Claude Opus 4.6, Claude Sonnet 4.6
- Google: Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash, Gemini 3.1

## Role Hierarchy
ROOT_ADMIN > TEAM_ADMIN > MEMBER — enforced on every API route

## Voucher Limits (VOUCHER_LIMITS constant in routes.ts)
- **FREE**: 1 active code, 25 max redemptions/code, $5/recipient, 200 proxy req, 1-day expiry, 10 req/min
- **TEAM**: 5 codes/admin, 50 redemptions/code, $20/recipient, 5000 proxy req/admin, 30-day expiry, 30 req/min
- **BUNDLE** ($10 purchase): 10 codes/bundle, 50 pooled redemptions, $50/recipient, $100/voucher, 25000 proxy req, 30-day expiry, 30 req/min
- All plans get 3 AI Provider connections

## Stripe Products (seeded via seed-stripe-products.ts)
- **Team Plan**: $20/mo subscription (metadata: plan=TEAM)
- **Voucher Bundle**: $10 one-time (metadata: type=bundle)

## API Routes
- Auth: POST /api/auth/signup, /login, /logout; GET /api/auth/session
- AI Providers: GET/POST/DELETE /api/providers (Root Admin, max 3)
- Teams: GET/POST /api/teams
- Members: GET/POST /api/members, PATCH suspend/reactivate
- Vouchers: GET/POST /api/vouchers, GET /api/voucher-limits, GET /api/vouchers/validate/:code, POST /api/vouchers/redeem
- Bundles: GET /api/bundles
- Stripe: GET /api/stripe/publishable-key, POST /api/stripe/create-checkout, POST /api/stripe/portal, POST /api/stripe/handle-success
- Stripe Webhook: POST /api/stripe/webhook (registered BEFORE express.json())
- Dashboard: GET /api/dashboard/overview, /usage/:id, /proxy-logs/:id
- Models: GET /api/models (public)
- Audit: GET /api/audit-log (Root Admin)
- Settings: GET/PATCH /api/org/settings

## Environment Variables
- DATABASE_URL — PostgreSQL connection
- SESSION_SECRET — Express session secret
- ENCRYPTION_KEY — AES-256 key for AI Provider API keys (hex string)
- Stripe credentials via Replit connector (not env vars)

## Voucher Code Format
ALLOT-XXXX-XXXX-XXXX using base32 charset (A-Z, 2-9, excluding 0/O/1/I/L), 17 chars without dashes

## Allotly Proxy Keys
Format: allotly_sk_ + 48 base64url chars. Only SHA-256 hash stored in DB.

## All Money in Integer Cents
Never use floats for money. Display as `$(cents / 100).toFixed(2)`.

## Brand Components (client/src/components/brand/)
ProviderBadge, BudgetBar, AdminRoleBadge, SpendCard, KeyRevealCard, VoucherCard, AutomationBadge, FeatureBadge, BundleCard, QRCode, EmptyState, StatsCard, DataTable

## Logo Components (client/src/components/logo.tsx)
LogoFull (icon + wordmark), LogoIcon (icon only), LogoMono (monochrome white)
Branching-nodes motif: central hub with 3 branch nodes representing allocation/distribution

## Provider Adapters (server/lib/providers/)
- OpenAI: FULL_AUTO — validates via GET /v1/organization/projects
- Anthropic: SEMI_AUTO — validates via GET /v1/models
- Google: GUIDED — no validation (always returns valid, manual setup required)
- Audit helper: server/lib/audit.ts (logAudit function)

## Milestone Status
- Milestone 1 (Foundation, DB, Auth): COMPLETE — schema, auth, storage, all 15 tables, model pricing seeded, signup→login→dashboard flow verified
- Milestone 2 (Brand Assets & Components): COMPLETE — all 14 brand components, logo variants, SVG favicon, dark mode, component showcase at /components, DataTable with sort/filter/pagination
- Milestone 3 (Provider Connections & Model Allowlist): COMPLETE — provider adapters with real API validation, PATCH/validate routes with Zod validation, model allowlist toggles, confirmation dialog for disconnect, audit logging, RBAC enforced on all provider routes (ROOT_ADMIN only)
