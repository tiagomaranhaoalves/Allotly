# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform designed to manage and distribute AI API access with robust budget controls. Its primary purpose is to empower organizations with granular control over their AI spending. The platform offers two core functionalities: Allotly Teams, which provides scoped AI Provider API keys with polling-based budget monitoring, and Allotly Vouchers, which enforces real-time, per-request budget limits through a thin proxy. Allotly aims to provide a comprehensive solution for managing AI resource consumption, optimizing costs, and ensuring compliance within various organizational structures.

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
- **AI Provider Management**: Connections to various AI providers (OpenAI, Anthropic, Google) with different provisioning methods (full-auto, semi-auto, guided). Max 3 connections per plan.
- **Team and Member Management**: Role-based access control (ROOT_ADMIN, TEAM_ADMIN, MEMBER) enforced across all API routes. Functionality for adding, suspending, reactivating, and deleting members and teams, including budget allocation and tracking.
- **Voucher System**: Generation and management of voucher codes with customizable limits on redemptions, recipient budgets, proxy requests, and expiry. Supports different tiers (FREE, TEAM, BUNDLE) with varying capacities.
- **Budget Control & Enforcement**: Polling-based usage monitoring with plan-based intervals. Automatic budget alerts at 80%, 90%, and 100% thresholds, leading to key revocation upon budget exhaustion. A 110% safety net budget is provisioned on OpenAI to ensure Allotly's system triggers before provider-side limits.
- **Real-time Proxy**: A 12-step proxy lifecycle handling authentication, concurrency, rate limiting, request parsing, cost estimation, token clamping, budget reservation, forwarding to AI providers, response processing, and async logging. Includes request/response translation between different AI provider formats and SSE streaming passthrough.
- **Background Jobs**: A scheduler manages tasks such as usage polling, budget resets, voucher and bundle expiry, and Redis-Postgres reconciliation for budget consistency.
- **Audit Logging**: Comprehensive audit trail with filtering and export capabilities.
- **Stripe Integration**: Handles subscription and one-time purchases for Team Plans and Voucher Bundles, including webhook processing for lifecycle events like subscription updates and deletions.

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
- `/dashboard/*` — Protected dashboard routes (overview, providers, teams, members, vouchers, bundles, analytics, audit-log, settings, keys, usage)

## Milestone Status
- Milestones 1-9: COMPLETE
- Milestone 10 (Landing Page + Docs Page): COMPLETE — Full landing page rewrite with 12 sections (sticky frosted header, hero with dashboard mockup, problem stats dark strip, solution intro, two feature cards with hover lift, voucher callout with code visual, tabbed how-it-works, dark trust section, 3-tier pricing with Most Popular ribbon, social proof vignettes, final CTA, dark footer), smooth scroll, fade-in animations via IntersectionObserver, mobile hamburger menu, dark mode support. Docs page with fixed sidebar (6 collapsible sections, 31 items), active section tracking, code blocks with copy buttons, comprehensive real documentation for all sections including API reference with curl examples, error codes table, response headers, streaming docs, and 5 FAQ answers.
- Footer Pages: COMPLETE — 6 pages (About, Careers, Contact, Privacy, Terms, Security) with shared PublicLayout (header+footer), scroll-to-top on route change.
- Milestone 11 (Phase 2 Analytics): COMPLETE — Full analytics dashboard at /dashboard/analytics with 5 sections and 5 backend API endpoints:
  - Cost per Model: Recharts BarChart with provider color coding (Cell per bar), time range selector (7d/30d/90d), aggregates UsageSnapshots (POLL) + ProxyRequestLogs (PROXY)
  - Top Spenders: Ranked sortable table (client-side sort by spend/budget/utilization), BudgetBar, FeatureBadge (TEAMS/VOUCHERS)
  - Spend Forecast: AreaChart with historical + linear regression projected line, budget reference line, stats cards (projected month-end, daily avg, days remaining, total budget), warning indicator
  - Anomaly Detection: Table from audit_logs (spend.anomaly_detected), shows multiplier badges, links to spend-anomaly background job
  - Optimization Recommendations: Model downgrade suggestions based on modelPricing differentials, budget reallocation tips
  - RBAC: Team Admin scoped to their team only (via teams.adminId); Root Admin sees all org data
  - Files: server/lib/analytics.ts (5 analytics functions), server/routes.ts (5 GET endpoints), client/src/pages/dashboard/analytics.tsx (Recharts + data tables)
- Milestone 12 (Security, Dark Mode, Polish, Testing): COMPLETE
  - Security: Helmet middleware (CSP disabled for Vite compat), rate limiters (login 10/hr, redeem 5/hr, key revoke 3/hr), Zod validation on all mutable routes (providers, teams, members, vouchers, settings, redeem)
  - ErrorBoundary: React class component wrapping all dashboard routes in App.tsx, catches render errors with retry button
  - Confirmation Dialogs: AlertDialog on all destructive actions (member remove, member suspend, team delete, provider disconnect)
  - Dark Mode Pass: Fixed Recharts tooltip contentStyle to use hsl(var(--popover)), PieChart labels with explicit fill, all pages audited for hardcoded colors
  - Empty States & Skeletons: All dashboard pages verified for loading skeletons and empty state CTAs
  - Unit Tests: vitest.config.ts + 8 test files (155 tests passing):
    - encryption.test.ts: roundtrip, uniqueness, wrong tag, empty/long keys
    - budget.test.ts: thresholds at 80/90/100, integer cents, zero budget, sequential triggers
    - voucher-code.test.ts: ALLOT-XXXX-XXXX-XXXX format, charset (no 0/O/1/I/L), uniqueness
    - permissions.test.ts: 3 roles × 19 actions permission matrix
    - key-generation.test.ts: allotly_sk_ prefix, SHA-256 hash, prefix truncation, consistency
    - token-clamping.test.ts: clamp at low budget, minimum 50 tokens, GPT-4o/Claude/Gemini pricing, cost calculations
    - request-translation.test.ts: OpenAI→Anthropic (system extraction, role mapping), OpenAI→Google (parts format, systemInstruction), response translation, detectProvider, setProviderAuth
    - redis-budget.test.ts: budget reservation/refund/adjustment, reconciliation drift detection/restore, concurrency tracking, rate limiting, bundle request pool, REDIS_KEYS format
  - Security Audit: Provider keys never in responses, audit log append-only (no PUT/PATCH/DELETE), all money integer cents, Helmet configured, rate limiters on login/redeem/key-revoke, Zod on all body-accepting routes
  - E2E Tests (Playwright): Root Admin signup+dashboard navigation, voucher create+redeem+key generation, dark mode toggle+empty states, rate limiting 429 verification — ALL PASSING
  - Files: server/lib/rate-limiter.ts, server/index.ts, server/routes.ts, client/src/components/error-boundary.tsx, client/src/App.tsx, vitest.config.ts, tests/*.test.ts