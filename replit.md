# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform for managing and distributing AI API access with budget controls. Two main features:
1. **Allotly Teams** (No-Proxy) — Scoped provider API keys with polling-based budget monitoring
2. **Allotly Vouchers** (Thin Proxy) — Voucher codes with real-time per-request budget enforcement

## Architecture
- **Frontend**: React 18 + Vite + wouter (routing) + TanStack Query v5 + Shadcn/ui + Tailwind CSS
- **Backend**: Express.js + express-session + connect-pg-simple
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Session-based (express-session + pg sessions), scrypt password hashing
- **Encryption**: AES-256-GCM for provider API keys (ENCRYPTION_KEY env var)

## Key Files
- `shared/schema.ts` — All 15 Drizzle tables + Zod schemas + types
- `server/routes.ts` — All API routes with RBAC
- `server/storage.ts` — IStorage interface + DrizzleStorage implementation
- `server/auth.ts` — Session setup + requireAuth/requireRole middleware
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

## Design System
- Primary color: Indigo (#6366F1 / HSL 239 84% 67%)
- Secondary: Cyan for vouchers
- Fonts: Inter (sans) + JetBrains Mono (mono)
- Dark mode via ThemeProvider + `class` strategy on `<html>`
- Brand components in `client/src/components/brand/`

## Database Tables
organizations, users, teams, team_memberships, provider_connections, provider_member_links, allotly_api_keys, usage_snapshots, budget_alerts, proxy_request_logs, vouchers, voucher_redemptions, voucher_bundles, audit_logs, model_pricing

## Role Hierarchy
ROOT_ADMIN > TEAM_ADMIN > MEMBER — enforced on every API route

## API Routes
- Auth: POST /api/auth/signup, /login, /logout; GET /api/auth/session
- Providers: GET/POST/DELETE /api/providers (Root Admin)
- Teams: GET/POST /api/teams
- Members: GET/POST /api/members, PATCH suspend/reactivate
- Vouchers: GET/POST /api/vouchers, GET /api/vouchers/validate/:code, POST /api/vouchers/redeem
- Dashboard: GET /api/dashboard/overview, /usage/:id, /proxy-logs/:id
- Models: GET /api/models (public)
- Audit: GET /api/audit-log (Root Admin)
- Settings: GET/PATCH /api/org/settings

## Environment Variables
- DATABASE_URL — PostgreSQL connection
- SESSION_SECRET — Express session secret
- ENCRYPTION_KEY — AES-256 key for provider API keys (hex string)

## Voucher Code Format
ALLOT-XXXX-XXXX-XXXX using base32 charset (A-Z, 2-9, excluding 0/O/1/I/L)

## Allotly Proxy Keys
Format: allotly_sk_ + 48 base64url chars. Only SHA-256 hash stored in DB.

## All Money in Integer Cents
Never use floats for money. Display as `$(cents / 100).toFixed(2)`.
