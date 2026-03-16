# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform for managing and distributing AI API access with real-time budget controls. Built on a v4 unified proxy architecture where both Teams and Vouchers route through the same thin proxy. Every user gets an `allotly_sk_` key. No provider Admin API provisioning, no usage polling — all metering happens per-request at the proxy layer. Teams = monthly resetting budgets; Vouchers = fixed budgets with expiry. Admin Control Center at `/admin`. Production domain: `allotly.ai`.

## User Preferences
- Detailed explanations preferred
- Iterative development
- Ask before making major changes
- Do not make changes to the folder `Z`
- Do not make changes to the file `Y`

## Tech Stack
- **Frontend**: React 18, Vite, wouter (routing), TanStack Query v5, Shadcn/ui, Tailwind CSS, Recharts
- **Backend**: Express.js, express-session, connect-pg-simple
- **Database**: PostgreSQL via Drizzle ORM
- **Payments**: Stripe (subscriptions + one-time) via `stripe-replit-sync`
- **Email**: Resend integration (verified domain: `allotly.ai`, from: `hello@allotly.ai`), with fallback to `onboarding@resend.dev` if domain not verified
- **AI Providers**: OpenAI, Anthropic, Google — connected via encrypted API keys (AES-256-GCM)
- **Cache/Realtime**: Redis for budget counters, concurrency, rate limiting (falls back to in-memory Map)
- **Auth**: Session-based with scrypt password hashing

## Design System
- **Primary**: Indigo #6366F1, **Secondary**: Cyan #06B6D4
- **Provider Colors**: OpenAI (green), Anthropic (amber), Google (blue)
- **Dark Mode**: bg=#111827, card/sidebar=#1E293B, hover=#334155, borders=Neutral 700
- **Fonts**: Inter (UI), JetBrains Mono (code)
- **All money in integer cents** to avoid floating-point issues

## Key Architecture Decisions
- **v4 Unified Proxy**: Both TEAM and VOUCHER access types use the same proxy (`/api/v1/chat/completions`). No provider-side provisioning or usage polling.
- **Budget enforcement**: Real-time per-request. Proxy reserves budget before forwarding, refunds overage after response. Alerts at 80/90/100%.
- **Pricing formula**: `costCents = ceil(tokens * pricePerMTok / 1_000_000)` where `pricePerMTok` is cents per million tokens
- **`sendEmail` signature**: positional args `(to, subject, html)` — NOT an object
- **Rate/concurrency tiers**: Free=20rpm/2conc, Team-TEAM=60rpm/5conc, Team-VOUCHER=30rpm/2conc, Enterprise=120rpm/10conc

## Plan Limits (server/lib/plan-limits.ts)
| Feature | FREE | TEAM | ENTERPRISE |
|---------|------|------|------------|
| Teams | 1 | 10 | 999 |
| Team Admins | 0 (Root only) | 10 (paid seats) | 999 |
| Members/Team | 5 | 20 | 999 |
| Providers | 3 | 3 | 999 |
| Vouchers | 1 code, 25 redemptions | 5/admin, 50 redemptions | 999 |
| Retention | 7 days | 90 days | 365 days |
| Usage Tracking | Real-time | Real-time | Real-time |

## Stripe Integration
- **Team Plan**: Product with `metadata['plan']:'TEAM'`, $20/mo per seat (Team Admin)
- **Voucher Bundle**: Product with `metadata['type']:'bundle'`, $10 one-time
- **Seat purchasing**: Integrated into "+ Create Team" flow — if no seats available, prompts to buy via Stripe
- **`add_seats` flow**: If `stripeSubId` exists → prorated subscription update. If missing → creates new Stripe checkout session redirecting to `/dashboard/teams?upgrade=success`
- **Webhook handlers**: checkout.session.completed, subscription.updated, subscription.deleted, invoice.payment_failed
- **Live Stripe account**: Named "Voltzi Creditos" — user needs to rename in Stripe dashboard

## Key Pages & Routes
| Route | Description |
|-------|-------------|
| `/` | Landing page (12 sections: hero, problem stats, features, pricing, social proof, CTA) |
| `/docs` | Documentation (6 sidebar sections, code blocks with copy, API reference) |
| `/login`, `/signup` | Authentication |
| `/redeem` | Voucher redemption (anonymous "Get Key" or "Create Account") |
| `/contact` | Contact form — sends email to `tiagomaranhaoalves14nov@gmail.com` via Resend |
| `/forgot-password`, `/reset-password` | Password reset flow |
| `/admin/login`, `/admin` | Admin Control Center (Overview, Organizations, Users) |
| `/dashboard/*` | Protected: overview, providers, teams, members, vouchers, bundles, analytics, audit-log, settings, keys, usage |
| `/about`, `/careers`, `/privacy`, `/terms`, `/security` | Footer pages |

## API Endpoints (Key)
- `POST /api/contact` — Public contact form submission
- `GET /api/teams/capacity` — ROOT_ADMIN: seat/team capacity check
- `POST /api/stripe/create-checkout` — Types: `team_upgrade`, `add_seats`, `voucher_bundle`
- `POST /api/v1/chat/completions` — Proxy endpoint (allotly_sk_ auth)
- `GET /api/v1/models` — Available models for key holder
- `GET /api/v1/health` — Proxy health check
- `POST /api/admin/model-sync` — Trigger manual model sync
- `POST /api/admin/seed-stripe-products` — Seed Stripe products

## Background Jobs (server/lib/jobs/)
| Job | Interval | Description |
|-----|----------|-------------|
| Budget reset | 3600s | Monthly reset for TEAM members |
| Concurrency self-heal | 30s | Resets zombie concurrent counters |
| Voucher expiry | 3600s | Revokes expired vouchers |
| Bundle expiry | 3600s | Expires used-up bundles |
| Redis reconciliation | 60s | Syncs Redis ↔ Postgres |
| Provider validation | 86400s | Validates provider API keys |
| Snapshot cleanup | 604800s | Cleans old snapshots |
| Spend anomaly | 3600s | Detects unusual spending patterns |
| Model sync | 21600s | Syncs model catalog from providers |

## Email Templates (server/lib/email.ts)
13 templates: welcome, teamAdminInvite, memberInvite, voucherNotification, voucherRedeemed, budgetWarning80, budgetWarning90, budgetExhausted, budgetReset, voucherExpiring, bundlePurchased, providerKeyInvalid, spendAnomaly, passwordReset

Domain fallback: If `allotly.ai` domain fails verification, automatically retries with `Allotly <onboarding@resend.dev>`.

## Rate Limiters
- Login: 10/hr
- Redeem: 5/hr
- Regenerate key: 3/hr
- Proxy: per-tier (see architecture decisions)

## Security
- Provider API keys: AES-256-GCM encrypted at rest
- `allotly_sk_` keys: shown once only, stored as SHA-256 hash
- RBAC on all routes (ROOT_ADMIN, TEAM_ADMIN, MEMBER)
- Zod validation on all inputs
- Audit log: append-only, comprehensive event trail
- Sessions: secure cookies, connect-pg-simple store

## Testing
- **12 test files, 223 tests ALL PASSING**:
  - encryption.test.ts (5): roundtrip, uniqueness, wrong tag
  - budget.test.ts (8): threshold triggers 80/90/100%
  - voucher-code.test.ts (7): format, charset, uniqueness
  - permissions.test.ts (60): 3 roles x 19+ actions
  - key-generation.test.ts (8): prefix, SHA-256 hash
  - token-clamping.test.ts (18): clamp at budget, min 50 tokens
  - request-translation.test.ts (30): OpenAI→Anthropic/Google
  - proxy-tiers.test.ts (7): rate limits by plan
  - redis-budget.test.ts (19): reservation/refund, reconciliation
  - integration.test.ts (29): full lifecycle flows
  - proxy-errors.test.ts (19): Zod error formatting, provider error suggestions
  - model-catalog.test.ts (13): model catalog integrity, deprecated models, pricing sanity

## Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | Drizzle schema + Zod insert schemas |
| `server/routes.ts` | All API routes |
| `server/storage.ts` | IStorage interface + PostgreSQL implementation |
| `server/lib/plan-limits.ts` | Plan limits + enforcement logic |
| `server/lib/email.ts` | Resend email service + 13 templates |
| `server/lib/seed-models.ts` | AI model catalog with pricing |
| `server/lib/proxy/` | Proxy pipeline (auth, budget, translate, forward) |
| `server/lib/jobs/` | Background job definitions |
| `server/stripeService.ts` | Stripe API wrapper |
| `server/webhookHandlers.ts` | Stripe webhook processing |
| `client/src/pages/landing.tsx` | Landing page (12 sections) |
| `client/src/pages/docs.tsx` | Documentation page |
| `client/src/pages/dashboard/` | All dashboard pages |
| `client/src/pages/admin.tsx` | Admin Control Center |

## Custom Skills
- **`update-model-catalog`** (`.agents/skills/update-model-catalog/SKILL.md`): Triggers on "update the models" — searches web for current AI models and updates `server/lib/seed-models.ts`

## Domain Setup
- **Primary domain**: `allotly.ai` (verified for Resend)
- **Other domains**: `allotly.co.uk`, `allotly-ai.com` — should redirect (301) to `allotly.ai` at DNS level
- **Production URL**: `https://asset-manager-d1ctl.replit.app` (Replit deployment)
- **All source code references**: Updated to `@allotly.ai` email addresses

## Entity Edit Operations (CC-1)
All core entities support full CRUD with audit logging:
- **Organization**: PATCH `/api/org/settings` — name, billingEmail, description, orgBudgetCeilingCents, defaultMemberBudgetCents. Before/after audit trail.
- **Team**: PATCH `/api/teams/:id` — name, description. Unique name validation within org. ROOT_ADMIN edits any, TEAM_ADMIN edits own. Audit log.
- **Member**: PATCH `/api/members/:id/budget` — monthlyBudgetCents, allowedModels, allowedProviders, userName, userEmail. Redis budget sync on change. Auto-revokes keys on budget exhaustion, auto-reactivates if budget restored. Audit log with before/after.
- **Voucher**: PATCH `/api/vouchers/:id` — label, budgetCents, expiresAt, allowedProviders, allowedModels, maxRedemptions. Only ACTIVE unredeemed vouchers. Audit log.
- Schema additions: `billingEmail` and `description` on organizations, `description` on teams.

## Completed Milestones
All milestones (1-13) complete including: v4 proxy migration, Admin Control Center, Stripe integration, email system, background jobs, analytics dashboard, dark mode, security review, 191 passing tests, E2E tests. CC-1 entity edit operations milestone complete.
