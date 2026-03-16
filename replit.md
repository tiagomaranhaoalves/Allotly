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

## Key Files
| File | Purpose |
|------|---------|
| `shared/schema.ts` | All Drizzle tables, enums, types |
| `server/routes.ts` | All API routes |
| `server/storage.ts` | IStorage interface + PostgreSQL implementation |
| `server/lib/plan-limits.ts` | Plan limits + enforcement logic |
| `server/lib/email.ts` | Resend email service + 13 templates |
| `server/lib/seed-models.ts` | AI model catalog with pricing |
| `server/lib/proxy/` | Proxy pipeline (auth, budget, translate, forward) |
| `server/lib/jobs/` | Background job definitions |
| `server/lib/encryption.ts` | AES-256-GCM encryption for provider keys |
| `server/lib/redis.ts` | Redis client + REDIS_KEYS constants |
| `server/lib/cascade-delete.ts` | Centralized cascade logic |
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

## Delete Operations (CC-2)
All entities support cascade delete with full cleanup:
- **Organization**: DELETE `/api/organizations/:id` — ROOT_ADMIN only, requires `confirmName`. Cascade: revoke Redis keys → delete proxy logs → usage snapshots → budget alerts → audit logs → API keys → voucher redemptions → memberships → vouchers → bundles → provider connections → teams → password reset tokens → users → org. Platform audit log survives deletion.
- **Team**: DELETE `/api/teams/:id` — ROOT_ADMIN, requires `confirmName`. Cascade: revoke keys → delete proxy logs → usage → alerts → API keys → memberships → voucher redemptions → vouchers → team.
- **Member**: DELETE `/api/members/:id` — ROOT_ADMIN/TEAM_ADMIN. Cascade: revoke keys → delete API keys → proxy logs → usage → alerts → membership. If user has no other memberships, also deletes voucher redemptions, password reset tokens, and user account (frees email).
- **Voucher**: DELETE `/api/vouchers/:id` — ROOT_ADMIN/TEAM_ADMIN (own team). Works on all statuses. If redeemed: cascades to revoke member API keys, delete memberships, voucher redemptions, and orphaned voucher-users.
- All operations wrapped in DB transactions for atomicity. Audit logs written inside transactions. Redis cleanup includes budget, concurrent, ratelimit, and request-pattern keys.
- `platformAuditLogs` table: survives org deletion, records platform-level events.
- Frontend: Settings page has Danger Zone with org delete (type-to-confirm). Teams page requires typing team name. Vouchers page has delete button with redeemed-warning variant.
- Key file: `server/lib/cascade-delete.ts` — centralized cascade logic.

## User Transfers & Bulk Operations (CC-3)
Member management extended with transfers, role changes, bulk ops, and invite resend:
- **Transfer**: POST `/api/members/:id/transfer` — { targetTeamId, targetOrgId?, newBudgetCents, newAllowedModels?, newAllowedProviders? }. Intra-org: Root Admin or Team Admin of both teams. Cross-org: Root Admin of both orgs or platform super-admin (ADMIN_EMAIL). Revokes old key → clears Redis → deletes old membership → creates new membership + key → sends notification email → audit log in both orgs for cross-org.
- **Change Role**: POST `/api/members/:id/change-role` — { newRole: "TEAM_ADMIN" | "MEMBER" }. ROOT_ADMIN only. Updates user.orgRole, does NOT affect API key or budget.
- **Bulk Suspend**: POST `/api/members/bulk/suspend` — { membershipIds[] }. Suspends each member, revokes keys, zeros Redis budget. Non-atomic across batch, returns results array.
- **Bulk Reactivate**: POST `/api/members/bulk/reactivate` — { membershipIds[] }. Reactivates each member, generates new key, restores Redis budget. Returns results array with apiKey per member.
- **Bulk Delete**: POST `/api/members/bulk/delete` — { membershipIds[], confirm: true }. ROOT_ADMIN only. Uses cascadeDeleteMember per member.
- **Resend Invite**: POST `/api/members/:id/resend-invite` — Only for INVITED status users. Creates fresh password reset token, re-sends invite email. Does NOT regenerate key.
- Frontend: Member cards have checkboxes for multi-select. Bulk action bar appears when 1+ selected (Suspend/Reactivate/Delete Selected). Transfer dialog with team selector. Change Role dialog. Resend Invite button (INVITED members only).
- Email template: `memberTransferred` added to `server/lib/email.ts`.

## Voucher Lifecycle Operations (CC-4)
Full voucher lifecycle management for hackathon/workshop use cases:
- **Bulk Create**: POST `/api/vouchers/bulk-create` — { count: 1-500, budgetCents, expiresAt, allowedProviders?, allowedModels?, bundleId?, teamId?, label? }. Generates unique ALLOT-XXXX codes via batch insert. Single audit log entry. ROOT_ADMIN or TEAM_ADMIN (own team).
- **Extend**: POST `/api/vouchers/:id/extend` — { newExpiresAt }. Works on active/fully-redeemed vouchers (not expired/revoked). Must be after current expiry. Updates voucher + membership voucherExpiresAt + periodEnd.
- **Top Up**: POST `/api/vouchers/:id/top-up` — { additionalBudgetCents }. Works on active/fully-redeemed. Increases voucher budget + membership budget + Redis budget. Reactivates BUDGET_EXHAUSTED members (re-enables keys). Audit log with from/to/added.
- **Enhanced Revoke**: PATCH `/api/vouchers/:id/revoke` — Now handles redeemed vouchers: sets voucher REVOKED + membership SUSPENDED + revokes keys + clears Redis (budget/concurrent/ratelimit).
- **Export CSV**: GET `/api/vouchers/export?status=&bundleId=&createdAfter=&createdBefore=` — Downloads CSV with code, status, budget, spend, remaining, expiry, redeemed-by, dates. TEAM_ADMIN scoped to own team.
- **Bulk Revoke**: POST `/api/vouchers/bulk/revoke` — { voucherIds[] }. Per-voucher results. TEAM_ADMIN scoped. Single audit log.
- **Details View**: GET `/api/vouchers/:id/details` — Redemption details: redeemed-by email, key prefix, spend, requests, last request, membership status.
- **Frontend**: Bulk Create dialog with count/budget/expiry/providers, success shows codes with Copy All / Download CSV. Extend modal (date picker). Top Up modal (amount). Export CSV with status filter dropdown. Checkboxes + Revoke Selected bulk toolbar. Expandable redemption details panel.
- **Storage**: `bulkCreateVouchers()`, `getMembershipsByVoucherId()`, `getVouchersFiltered()`, `getVoucherRedemptionsByVoucherId()`.
- All endpoints enforce TEAM_ADMIN scope (own team only). Status validation on export filter. No `revokedAt` on API keys (column doesn't exist).

## Provider & API Key Management (CC-5)
Full provider lifecycle and centralized key audit:
- **Rotate Key**: POST `/api/providers/:id/rotate-key` — validates new key via provider API, encrypts with AES-256-GCM, replaces old key. No member disruption. Audit log (key not logged). ROOT_ADMIN.
- **Validate Now**: POST `/api/providers/:id/validate-now` — immediate key validation. Returns { valid, lastValidated, error? }. Updates provider status to ACTIVE/INVALID. ROOT_ADMIN.
- **Test Connection**: POST `/api/providers/:id/test-connection` — minimal test request (max_tokens=5) to cheapest model. Returns { success, latencyMs, model, response?, error? }. Models: gpt-4o-mini (OpenAI), claude-3-haiku (Anthropic), gemini-2.0-flash-lite (Google). ROOT_ADMIN.
- **Provider Health**: GET `/api/providers/:id/health` — aggregated metrics from proxyRequestLogs: last 1h/24h counts, errors, errorRate, avgLatencyMs, lastSuccessfulRequest, lastError. ROOT_ADMIN.
- **Key Audit View**: GET `/api/keys` — all allotly_sk_ keys with owner info, team, type (team/voucher), search, status/team/type filters. ROOT_ADMIN.
- **Bulk Key Revoke**: POST `/api/keys/bulk-revoke` — revokes multiple keys, clears Redis (budget/concurrent/ratelimit/apiKeyCache using REDIS_KEYS helpers). Audit log. ROOT_ADMIN.
- **Frontend Providers**: Each card has Rotate Key modal, Validate Now button, Test Connection button (with result display), health indicator dot (green/yellow/red), expandable health panel with metrics.
- **Frontend API Keys**: `/dashboard/keys` — Root Admins see full audit table with search, status/type/team filters, stat cards (total/active/revoked), checkbox bulk revoke. Non-admins see personal keys view.
- **Sidebar**: "API Keys" added to ROOT_ADMIN nav.
- **Provider status enum**: ACTIVE | INVALID | DISCONNECTED (fixed from INVALID_KEY bug in existing validate endpoint).
- **Storage**: `getProxyLogsByProvider()`, `getAllApiKeysWithOwnerInfo()`.

## Completed Milestones
All milestones (1-13) complete including: v4 proxy migration, Admin Control Center, Stripe integration, email system, background jobs, analytics dashboard, dark mode, security review, 223 passing tests, E2E tests. CC-1 entity edit operations complete. CC-2 delete operations with cascade logic complete. CC-3 user transfers and bulk member operations complete. CC-4 voucher lifecycle operations complete. CC-5 provider and API key management complete.
