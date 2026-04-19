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
- **Design System**: Primary color: Indigo #6366F1, Secondary: Cyan #06B6D4. Provider-specific colors for OpenAI (green #10A37F), Anthropic (amber #D4A574), Google (blue #4285F4), Azure OpenAI (blue #0078D4).
- **Dark Mode**: Uses a dark palette for background (`#111827`), card/sidebar (`#1E293B`), hover states (`#334155`), and neutral borders (`Neutral 700`).
- **Fonts**: Inter for UI elements and JetBrains Mono for code displays.
- **Monetary Values**: All money is handled in integer cents to prevent floating-point inaccuracies.

**Technical Implementations & System Design Choices:**
- **Unified v4 Proxy**: A single proxy endpoint (`/api/v1/chat/completions`) handles all AI API requests for both TEAM and VOUCHER access types, centralizing metering and control without reliance on external provider mechanisms. Non-POST methods return 405 JSON; unknown `/api/v1/` paths return 404 JSON. Request parameters are sanitized per-provider (whitelist-based) before forwarding upstream.
- **Real-time Budget Enforcement**: The proxy reserves budget before forwarding requests and refunds any overage after the response. Alerts are triggered at 80%, 90%, and 100% budget utilization.
- **Pricing Formula**: `costCents = ceil(tokens * pricePerMTok / 1_000_000)` calculates costs based on tokens and a configurable price per million tokens.
- **API Key Management**: AI provider API keys are encrypted using AES-256-GCM. The system includes functionality for key rotation, immediate validation, and connection testing to ensure provider health.
- **Rate & Concurrency Limiting**: Tiered limits are implemented: Free (20rpm/2conc), Team-TEAM (60rpm/5conc), Team-VOUCHER (30rpm/2conc), and Enterprise (120rpm/10conc). Rate limit checks happen early (DDoS protection), but bundle pool checks are deferred until after all proxy validation passes — only fully-validated requests reaching upstream count against the user's quota.
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
- **Project Keys**: Team-level `projects` table allows admins to create named projects. Users self-serve API keys (up to 10 per membership) via `POST /api/me/keys`, optionally assigning each key to a project (existing or new). All project keys share the parent membership's budget, rate limits, and model restrictions. Proxy logger records `apiKeyId` on every request for per-project usage tracking. `proxyRequestLogs.apiKeyId` links to `allotlyApiKeys.id`; `allotlyApiKeys.projectId` links to `projects.id`. Admin Keys page shows project column. Member dashboard shows per-project usage breakdown and multi-key management UI. Usage CSV export includes a `project` column. Routes: `GET/POST /api/teams/:teamId/projects`, `PATCH/DELETE /api/projects/:id`, `GET/POST /api/me/keys`, `DELETE /api/me/keys/:keyId`.

## Release Testing
- **Pre-build vitest gate**: `script/build.ts` runs `vitest run` (all `tests/**/*.test.ts`, including the arena session reducer suite) as the first step of `npm run build`. Replit deployments invoke `npm run build`, so a failing vitest aborts publish. Set `SKIP_RELEASE_TESTS=1` only for local debugging — never for a real release.
- **Pre-release Playwright walk**: `tests/e2e/arena-flow.spec.ts` covers the arena setup → round → vote → results flow via `playwright.config.ts`. Run `bash scripts/pre-release.sh` (vitest + e2e) before publishing. The release checklist lives in `docs/release-checklist.md`.

## External Dependencies
- **Frontend**: React 18, Vite, wouter (routing), TanStack Query v5, Shadcn/ui, Tailwind CSS, Recharts.
- **Backend**: Express.js, express-session, connect-pg-simple.
- **Database**: PostgreSQL via Drizzle ORM.
- **Payments**: Stripe (for subscriptions and one-time payments) integrated via `stripe-replit-sync`.
- **Email**: Resend for email delivery, with `allotly.ai` as the verified domain and `hello@allotly.ai` as the sender. Fallback to `onboarding@resend.dev` if the domain is not verified.
- **AI Providers**: OpenAI, Anthropic, Google, and Azure OpenAI are integrated for AI model access. Google adapter uses `v1beta` API (required for `systemInstruction` support), filters out thinking/reasoning parts from Gemini 2.5 responses, and forwards `stop` → `stopSequences` in `generationConfig`. Provider parameter sanitization strips unknown keys before forwarding to prevent upstream rejections. Azure OpenAI uses `api-key` + `Ocp-Apim-Subscription-Key` headers, supports v1 and legacy endpoint modes, and requires deployment-to-model mappings with custom pricing. Deployment names can match real model names (e.g., gpt-4.1-nano). Routing priority: Azure deployments checked first (exact name match), then prefix-based routing (gpt→OpenAI, claude→Anthropic, gemini→Google). Azure errors are sanitized — raw upstream error bodies are never forwarded to users. Deployment names are URL-encoded in outbound requests.
- **Dynamic Model Discovery**: `GET /api/providers/:id/models` queries each provider's live API using the connected API key to discover available models. The allowlist shows only models the key can actually access (not a static seed list). For Azure, returns configured deployment mappings. Stale allowlist entries (models no longer available) are filtered out on the frontend. Google API uses header-based auth (`x-goog-api-key`). Anthropic uses paginated fetching.
- **Token Cap Handling**: `max_tokens` and `max_completion_tokens` are mutually exclusive in the forwarded body (never both). Reasoning models (o1/o3/o4/gpt-5) always use `max_completion_tokens`. Non-reasoning preserves whichever field the client sent. When client sends no cap and budget doesn't require clamping, no cap field is injected (provider decides its default). Budget estimation uses 4096 as fallback for cost reservation only. `clampMaxTokens` returns `undefined` when no cap needed.
- **Upstream Error Types**: `upstream_quota_exhausted` for Azure APIM 403 quota/capacity messages (distinct from `upstream_auth_failed`). Friendly message names Azure subscription quota and recommends contacting tenant admin.
- **Cache/Realtime**: Redis is used for budget counters, concurrency control, and rate limiting, with an in-memory Map fallback.
- **Authentication**: Session-based authentication using scrypt for password hashing.