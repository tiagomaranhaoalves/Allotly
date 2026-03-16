# Allotly — The AI Spend Control Plane

## Overview
Allotly is a SaaS platform designed for managing and distributing AI API access with real-time budget controls. It operates on a unified v4 proxy architecture, routing both team and voucher-based access through a single, thin proxy layer. The platform aims to provide an "allotly_sk_" key to every user, eliminating the need for provider Admin API provisioning or usage polling by performing all metering per-request at the proxy. Key features include monthly resetting budgets for teams and fixed, expiring budgets for vouchers. The project envisions significant market potential in controlled AI resource allocation, targeting businesses and organizations that need granular control over their AI API spending.

## User Preferences
- Detailed explanations preferred
- Iterative development
- Ask before making major changes
- Do not make changes to the folder `Z`
- Do not make changes to the file `Y`

## System Architecture
Allotly employs a robust architecture with a focus on real-time budget enforcement and secure API management.

**UI/UX Decisions:**
- **Design System**: Primary color: Indigo #6366F1, Secondary: Cyan #06B6D4. Provider-specific colors for OpenAI (green), Anthropic (amber), Google (blue).
- **Dark Mode**: Uses a dark palette for background (`#111827`), card/sidebar (`#1E293B`), hover states (`#334155`), and neutral borders (`Neutral 700`).
- **Fonts**: Inter for UI elements and JetBrains Mono for code displays.
- **Monetary Values**: All money is handled in integer cents to prevent floating-point inaccuracies.

**Technical Implementations & System Design Choices:**
- **Unified v4 Proxy**: A single proxy endpoint (`/api/v1/chat/completions`) handles all AI API requests for both TEAM and VOUCHER access types, centralizing metering and control without reliance on external provider mechanisms.
- **Real-time Budget Enforcement**: The proxy reserves budget before forwarding requests and refunds any overage after the response. Alerts are triggered at 80%, 90%, and 100% budget utilization.
- **Pricing Formula**: `costCents = ceil(tokens * pricePerMTok / 1_000_000)` calculates costs based on tokens and a configurable price per million tokens.
- **API Key Management**: AI provider API keys are encrypted using AES-256-GCM. The system includes functionality for key rotation, immediate validation, and connection testing to ensure provider health.
- **Rate & Concurrency Limiting**: Tiered limits are implemented: Free (20rpm/2conc), Team-TEAM (60rpm/5conc), Team-VOUCHER (30rpm/2conc), and Enterprise (120rpm/10conc).
- **Plan Limits**: Configurable limits for various features (Teams, Team Admins, Members/Team, Providers, Vouchers, Data Retention) are defined and enforced per plan (FREE, TEAM, ENTERPRISE).
- **Entity Management**: Comprehensive CRUD operations for core entities (Organization, Team, Member, Voucher, Provider) with detailed audit logging.
- **Cascade Delete**: Robust cascade deletion logic ensures complete cleanup across all related entities when an organization, team, member, or voucher is deleted. These operations are wrapped in DB transactions for atomicity.
- **Member Operations**: Supports member transfers (intra-org and cross-org), role changes, bulk suspension/reactivation/deletion, and invite resending.
- **Voucher Lifecycle**: Includes bulk creation, extension, top-up, enhanced revocation (affecting redeemed vouchers), and CSV export for comprehensive voucher management.
- **Budget Management**: Features manual budget reset and credit functionalities for members, with corresponding audit logs.
- **Audit Log UI**: Enhanced audit logs with expandable metadata, human-readable action labels, categorized filters, and change diff views.
- **Email Service**: Uses a consistent `sendEmail` signature with positional arguments `(to, subject, html)`.
- **Organization Settings**: `settings` JSONB column on `organizations` table stores `notifications` (budgetAlerts, spendAnomalies, providerKeyIssues, voucherRedemptions, memberInvitesAccepted) and `defaults` (defaultBudgetCents, defaultAllowedModels, defaultVoucherExpiryDays). PATCH `/api/org/settings` deep-merges nested JSON.
- **Danger Zone**: `POST /api/org/revoke-all-keys` (requires `confirmText: "REVOKE ALL"`) and `POST /api/org/disconnect-all-providers` (requires `confirmName` matching org name). Both cascade-clear Redis caches and create audit logs.
- **Data Exports**: `GET /api/export/usage` and `GET /api/export/members` return CSV files with formula-injection-safe escaping. Available to ROOT_ADMIN and TEAM_ADMIN (scoped to their teams).
- **Bulk Add Members**: `POST /api/teams/:teamId/bulk-add-members` accepts up to 200 members with email, optional name, optional budgetCents. Creates user, membership, API key, and sends invite email per member.
- **Cleanup Utilities**: `POST /api/admin/cleanup/:type` supports `expired-vouchers`, `revoked-keys`, `orphans`, `redis-reconcile`. ROOT_ADMIN only.
- **Admin Control Center**: Expanded with 8 tabs (Overview, Organizations, Users, API Keys, Proxy Stats, Providers, Vouchers, Audit Logs). Backend routes include: hard/soft delete user (frees email via tombstone prefix), reactivate, transfer between orgs (moveHistory updates membership in-place to preserve FK integrity), delete org (cascade), org drill-down, platform-wide keys/revoke, audit logs, proxy stats, providers, vouchers/void. Hard-delete guards against users who are team admins and nullifies voucher ownership. Transfer with `moveHistory=true` updates the existing membership row (preserving the same ID) rather than delete+create, to avoid FK constraint violations on `proxyRequestLogs`/`usageSnapshots`/`budgetAlerts`.

## External Dependencies
- **Frontend**: React 18, Vite, wouter (routing), TanStack Query v5, Shadcn/ui, Tailwind CSS, Recharts.
- **Backend**: Express.js, express-session, connect-pg-simple.
- **Database**: PostgreSQL via Drizzle ORM.
- **Payments**: Stripe (for subscriptions and one-time payments) integrated via `stripe-replit-sync`.
- **Email**: Resend for email delivery, with `allotly.ai` as the verified domain and `hello@allotly.ai` as the sender. Fallback to `onboarding@resend.dev` if the domain is not verified.
- **AI Providers**: OpenAI, Anthropic, Google are integrated for AI model access.
- **Cache/Realtime**: Redis is used for budget counters, concurrency control, and rate limiting, with an in-memory Map fallback.
- **Authentication**: Session-based authentication using scrypt for password hashing.