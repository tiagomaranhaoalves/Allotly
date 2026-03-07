# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform designed to manage and distribute AI API access with robust budget controls. v4 unified proxy architecture: both Teams and Vouchers route through the same thin proxy. Every user gets an `allotly_sk_` key. No provider Admin API provisioning, no usage polling. Teams = monthly resetting budgets; Vouchers = fixed budgets with expiry. Admin Control Center at `/admin` with its own login flow.

## User Preferences
I prefer detailed explanations.
I want iterative development.
Ask before making major changes.
Do not make changes to the folder `Z`.
Do not make changes to the file `Y`.

## System Architecture
Allotly employs a modern web architecture. The frontend is built with React 18, Vite, wouter for routing, TanStack Query v5 for data fetching, and a design system leveraging Shadcn/ui and Tailwind CSS. Key UI/UX decisions include a primary color scheme of Indigo with Cyan as a secondary accent, specific colors for different AI providers (OpenAI, Anthropic, Google), and distinct status colors. The application supports dark mode and utilizes Inter and JetBrains Mono fonts. Brand components are modularized for reusability.

The backend is an Express.js application, utilizing express-session for session management and connect-pg-simple for PostgreSQL session storage. PostgreSQL serves as the primary database, managed through Drizzle ORM. Authentication is session-based with scrypt for password hashing. AI Provider API keys are secured using AES-256-GCM encryption. Stripe is integrated for payment processing via a custom `stripe-replit-sync` integration.

Core features include:
- **AI Provider Management**: Connections to AI providers (OpenAI, Anthropic, Google). Max 3 connections per plan. No provider-side provisioning (v4).
- **Team and Member Management**: Role-based access control (ROOT_ADMIN, TEAM_ADMIN, MEMBER). Teams have monthly resetting budgets. All members get `allotly_sk_` keys and use the proxy.
- **Voucher System**: Voucher codes with fixed budgets and expiry. `accessType` enum: TEAM | VOUCHER.
- **Budget Control & Enforcement**: Real-time budget enforcement via proxy. Automatic budget alerts at 80/90/100% thresholds.
- **Real-time Proxy**: Unified proxy for all access types (TEAM + VOUCHER). Handles auth, tier-based concurrency/rate limiting (Free=20rpm/2conc, Team-TEAM=60rpm/5conc, Team-VOUCHER=30rpm/2conc, Enterprise=120rpm/10conc), cost estimation, token clamping, budget reservation, forwarding, response processing, 503 provider_unavailable for disconnected providers, and async logging.
- **Background Jobs**: Budget resets (TEAM only), voucher/bundle expiry, Redis-Postgres reconciliation. Usage polling stubbed (no-op in v4).
- **Audit Logging**: Comprehensive audit trail with filtering and export.
- **Stripe Integration**: Subscriptions and one-time purchases with webhook processing.
- **Admin Control Center**: Master admin panel at `/admin` with login via ADMIN_EMAIL/ADMIN_PASSWORD env vars. Org CRUD, user management, stats dashboard.

All money values are handled in integer cents to avoid floating-point inaccuracies.

## External Dependencies
- **PostgreSQL**: Primary database for all application data.
- **Stripe**: Payment gateway for handling subscriptions (Team Plan) and one-time purchases (Voucher Bundles). Integrated via `stripe-replit-sync`.
- **OpenAI API**: For AI provider integration and usage.
- **Anthropic API**: For AI provider integration and usage.
- **Google AI API**: For AI provider integration and usage.
- **Redis**: Used for real-time budget counters, concurrency control, and rate limiting within the proxy. Falls back to an in-memory Map if not available.
- **Resend**: Integrated for sending transactional emails, with a console.log fallback for development.

## Key Pages
- `/` — Landing page (12 sections: header, hero, problem stats strip, solution intro, two features, voucher callout, how-it-works tabs, trust/security, pricing cards, social proof, final CTA, footer)
- `/docs` — Documentation page (sidebar with 6 collapsible sections: Getting Started, Teams, Vouchers, Budget Enforcement, API Reference, FAQ; code blocks with copy; real content)
- `/login`, `/signup`, `/redeem` — Auth and redemption pages
- `/forgot-password` — Forgot password page (email entry, sends reset link via email)
- `/reset-password` — Reset password page (requires ?token= query param, sets new password)
- `/admin/login` — Admin Control Center login
- `/admin` — Admin Control Center (Overview, Organizations, Users tabs)
- `/dashboard/*` — Protected dashboard routes (overview, providers, teams, members, vouchers, bundles, analytics, audit-log, settings, keys, usage)

## Milestone Status
- Milestones 1-9, v4 migration, Admin Control Center: COMPLETE
- Milestone 3 (Provider Connections): COMPLETE — encryption, key gen, provider adapters, provider UI, model allowlist
- Milestone 4 (Team Admin + Member Management): COMPLETE
  - Team admin invite flow: POST /api/teams creates INVITED admin + sends invite email with /invite/:token link
  - Member creation v4: POST /api/members creates INVITED member, generates allotly_sk_ key, inits Redis budget, returns raw key
  - Invite acceptance: GET/POST /api/invite/:token validates + accepts invites, sets password, activates user
  - Member welcome page: /invite/:token shows KeyRevealCard, quickstart (curl+Python), available models, budget info
  - Key management: POST /api/members/:id/regenerate-key, POST /api/members/:id/revoke-key (TEAM only)
  - Members page: provider check warning, allowed providers/models in form, KeyRevealCard after creation, regenerate/revoke key buttons
  - Teams page: no password field, invite-based flow
  - Audit events: team.created, member.created, key.generated, key.regenerated, key.revoked, member.suspended, member.reactivated, member.removed
- Milestone 10 (Landing Page + Docs Page): COMPLETE — Full landing page rewrite with 12 sections (sticky frosted header, hero with dashboard mockup, problem stats dark strip, solution intro, two feature cards with hover lift, voucher callout with code visual, tabbed how-it-works, dark trust section, 3-tier pricing with Most Popular ribbon, social proof vignettes, final CTA, dark footer), smooth scroll, fade-in animations via IntersectionObserver, mobile hamburger menu, dark mode support. Docs page with fixed sidebar (6 collapsible sections, 31 items), active section tracking, code blocks with copy buttons, comprehensive real documentation for all sections including API reference with curl examples, error codes table, response headers, streaming docs, and 5 FAQ answers.
- Footer Pages: COMPLETE — 6 pages (About, Careers, Contact, Privacy, Terms, Security) with shared PublicLayout (header+footer), scroll-to-top on route change.
- Milestone 11 (Phase 2 Analytics): COMPLETE — Full analytics dashboard at /dashboard/analytics with 5 sections and 5 backend API endpoints:
  - Cost per Model: Recharts BarChart with provider color coding (Cell per bar), time range selector (7d/30d/90d), data exclusively from ProxyRequestLogs (v4 proxy metering only)
  - Top Spenders: Ranked sortable table (client-side sort by spend/budget/utilization), BudgetBar, FeatureBadge (TEAMS/VOUCHERS)
  - Spend Forecast: AreaChart with historical + linear regression projected line, budget reference line, stats cards (projected month-end, daily avg, days remaining, total budget), warning indicator
  - Anomaly Detection: Table from audit_logs (spend.anomaly_detected), shows multiplier badges, links to spend-anomaly background job
  - Optimization Recommendations: Model downgrade suggestions based on modelPricing differentials, budget reallocation tips
  - RBAC: Team Admin scoped to their team only (via teams.adminId); Root Admin sees all org data
  - Files: server/lib/analytics.ts (5 analytics functions), server/routes.ts (5 GET endpoints), client/src/pages/dashboard/analytics.tsx (Recharts + data tables)
- Milestone 9 (Stripe, Plan Enforcement, Email Templates): COMPLETE
  - Stripe subscription: checkout, 4 webhook handlers (checkout.session.completed, subscription.updated, subscription.deleted, invoice.payment_failed), seat management all pre-built
  - Plan enforcement: member limits (5 Free/20 Team) count BOTH TEAM+VOUCHER, voucher limits, provider limits (3 per plan), bundle purchase allowed on all plans
  - Email templates: 13 templates implemented (welcome, team-admin-invite, member-invite, voucher-notification, voucher-redeemed, budget-warning-80/90, budget-exhausted, budget-reset, voucher-expiring, bundle-purchased, provider-key-invalid, spend-anomaly)
  - Removed dead templates: keyReady, setupInstructions (v4 spec: DO NOT build)
  - Budget alerts 90%/100% now sent to BOTH member AND Team Admin
  - Voucher redemption sends voucherRedeemed email to Team Admin
- Milestone 7 (Background Jobs, Budget Alerts, Reconciliation): COMPLETE
  - Budget alerts: proxy post-processing sends emails at 80/90/100% via emailTemplates + revokes ALL active API keys at 100% + clears Redis cache for each revoked key
  - Budget reset job: sends budgetReset email after reactivation, clears Redis cache for reactivated keys
  - All other jobs pre-built: voucher-expiry (hourly), bundle-expiry (hourly), provider-validation (daily), redis-reconciliation (60s), snapshot-cleanup (weekly), spend-anomaly (hourly)
  - Usage poll: no-op in v4 (all metering by proxy)
  - Concurrency self-heal: every 30s, resets zombie concurrent counters
- Milestone 5 (Proxy v4 Refinements): COMPLETE — Tier-based rate limits (Free=20rpm/2conc, Team-TEAM=60rpm/5conc, Team-VOUCHER=30rpm/2conc, Enterprise=120rpm/10conc), configurable concurrency in checkConcurrency, 503 provider_unavailable for disconnected providers, 9 test files (162 tests)
- Milestone 6 (Voucher CRUD, Redemption, Bundle Purchase): COMPLETE
  - All voucher CRUD, redemption, bundle purchase were pre-built
  - Added: Member count enforcement during redemption (checkPlanLimit counts TEAM+VOUCHER together, returns "This team has reached its member limit")
  - Added: POST /api/vouchers/send-email route (admin-only, validates voucher ACTIVE+not expired, uses sendEmail with correct positional args, audit logs)
  - Voucher code format: ALLOT-XXXX-XXXX-XXXX
  - Dual redemption: "Get Key Instantly" (anonymous) vs "Create Account"
  - Bundle: $10 via Stripe, webhook creates VoucherBundle + Redis counters
  - Plan limits: FREE (1 code, 25 redemptions, $5 budget, 1-day), TEAM (5 codes/admin, 50 redemptions, $20 budget, 30-day)
- Milestone 13 (Dark Mode Pass, Polish, Testing, Security Review): COMPLETE
  - Dark Mode (A1-A4): CSS variables updated to spec (#111827 bg, #1E293B/#217 33% 17% card/sidebar, #374151/#217 19% 27% borders), all 27 pages verified
  - Polish (B1-B8): Skeleton loading on all 10 data-fetching pages, 8 empty states with exact spec messaging+CTAs, ErrorBoundary on all dashboard groups, 6 confirmation dialogs with red Confirm buttons, 12 toast notifications, page transitions (fade-in), sidebar/modal/toast animations via tailwindcss-animate
  - v3 Cleanup (D9): Removed usage-poll job/file/route/cron-status, updated "Direct Provider Access"/"zero latency" text to v4 proxy language, all D9.1-D9.8 searches return zero results
  - Testing (C1-C4): 10 test files, 191 tests ALL PASSING:
    - encryption.test.ts (5): roundtrip, uniqueness, wrong tag, empty/long keys
    - budget.test.ts (8): thresholds 80/90/100%, integer cents, zero budget, sequential triggers
    - voucher-code.test.ts (7): ALLOT-XXXX-XXXX-XXXX format, charset validation, uniqueness
    - permissions.test.ts (60): 3 roles x 19+ actions permission matrix
    - key-generation.test.ts (8): allotly_sk_ prefix, SHA-256 hash, prefix truncation
    - token-clamping.test.ts (18): clamp at low budget, min 50 tokens, multi-model pricing
    - request-translation.test.ts (30): OpenAI->Anthropic/Google request+response translation
    - proxy-tiers.test.ts (7): rate limit tiers by plan (Free/Team/Enterprise)
    - redis-budget.test.ts (19): budget reservation/refund, reconciliation, concurrency, bundles
    - integration.test.ts (29): budget lifecycle, voucher exhaustion, bundle pool, concurrency, token clamping, reconciliation, provider disconnect cascade
  - Security (D1-D8): Rate limiters verified (login 10/hr, redeem 5/hr, regen 3/hr, proxy per-tier), RBAC on all routes, Zod validation on all inputs, provider keys never in responses, allotly_sk_ keys shown once only, audit log append-only, all money integer cents, Redis reconciliation every 60s
  - Logo (B7): Verified on landing header, sidebar, favicon, login, signup, redeem, docs, invite, email headers, footer
  - E2E Tests: Root Admin signup+dashboard, dark mode toggle, empty states, page transitions — ALL PASSING