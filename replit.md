# Allotly

Allotly is a SaaS platform for managing and distributing AI API access with real-time budget controls.

## Run & Operate

```bash
npm install
npm run build
npm start
npm run typecheck
npm run db:generate # Generate Drizzle ORM migrations
npm run db:push # Apply Drizzle ORM migrations
```

**Required Environment Variables:**

*   `DATABASE_URL`
*   `RESEND_API_KEY`
*   `STRIPE_SECRET_KEY`
*   `ALLOTLY_SECRET_KEY`
*   `TURNSTILE_SECRET_KEY` (production)
*   `VITE_TURNSTILE_SITE_KEY` (production, build-time)
*   `MCP_STREAMING_ENABLED` (optional)

## Stack

*   **Frontend:** React 18, Vite, wouter, TanStack Query v5, Shadcn/ui, Tailwind CSS, Recharts
*   **Backend:** Express.js, express-session, connect-pg-simple
*   **Database:** PostgreSQL (Drizzle ORM)
*   **Payments:** Stripe
*   **Email:** Resend
*   **Cache/Realtime:** Redis (with in-memory fallback)
*   **Authentication:** Session-based (scrypt for passwords)
*   **i18n:** react-i18next (`en`, `es`, `pt-BR` locales)

## Where things live

*   `client/` - Frontend application source
*   `server/` - Backend application source
*   `db/schema.ts` - Database schema definition
*   `server/lib/currency.ts` - Server-side currency conversion logic
*   `client/src/lib/currency.ts` - Frontend currency conversion logic
*   `server/lib/turnstile.ts` - Turnstile captcha verification
*   `server/lib/oauth/authorize-credential.ts` - In-flow OAuth credential POST (password / voucher / api_key)
*   `server/lib/oauth/credential-form-template.ts` - CSS-only 3-tab credential form
*   `server/lib/oauth/consent-template.ts` - Consent page (renders membership picker for multi-team users)
*   `client/src/hooks/use-active-membership.ts` - Shared selector for the active member dashboard membership
*   `client/src/components/dashboard/membership-switcher.tsx` - Dashboard team switcher (multi-team users)
*   `server/lib/vouchers/redeem-inline.ts` - Pure helper: voucher redemption side effects
*   `server/lib/auth/api-key-lookup.ts` - Validate-and-resolve `allotly_sk_…` keys (no Redis cache)
*   `client/src/i18n/locales/` - i18n translation files
*   `docs/release-checklist.md` - Release procedures
*   `tests/e2e/` - Playwright end-to-end tests

## Architecture decisions

*   **Unified v4 Proxy:** All AI API requests (team/voucher) route through a single proxy for centralized, real-time metering and budget enforcement.
*   **Integer USD-Cents for Money:** All monetary values are handled internally as integer USD-cents to prevent floating-point errors. Display currency is a view-layer concern.
*   **Encrypted AI Provider Keys:** AI provider API keys are AES-256-GCM encrypted, supporting rotation and real-time validation.
*   **Robust Cascade Deletion:** Critical entity deletions (org, team, member, voucher) are atomic transactions with full cascade cleanup.
*   **Branded Error Codes for Test-Your-Key:** User-facing errors from the `test-connection` endpoint are mapped to six branded codes with context-aware hints, abstracting upstream provider specifics.
*   **Multi-membership member dashboard:** Users belonging to multiple teams see a switcher; selection lives in URL `?membership=` + sessionStorage. Member-facing endpoints (`/api/me/keys`, `/api/my-keys`, `/api/dashboard/member-overview`, `/api/members/me/welcome`) accept an optional `membershipId` (validated against ownership) and fall back to the legacy "primary" pick when omitted. New `/api/me/memberships` endpoint lists every membership the user holds. The OAuth consent page renders a `<select name="membership_id">` when the user has >1 eligible membership, and the consent handler re-validates the chosen id against an allow-list captured at `/oauth/authorize` time so a tampered POST can't bind a foreign membership.
*   **Voucher-aware OAuth authorize:** Unauthenticated `/oauth/authorize` renders an in-flow 3-tab credential form (password / voucher / API key) instead of bouncing to `/login`. Synthetic voucher users are first-class OAuth subjects — security is enforced via membership status at the proxy, not via `isVoucherUser`. POST handler at `/oauth/authorize/credential`; CSS-only tabs (CSP `script-src 'none'`); generic error string only (no enumeration oracle); `oauth_continue` must be a relative `/oauth/authorize` path (open-redirect block). Failure auditing is two-tiered: attributable failures (known user/voucher/API key) write `audit_logs` rows with `action: oauth.credential_failed` and precise cause; inattributable failures (CSRF mismatch, unknown email, malformed key) fall back to server logs only — `audit_logs.actor_id` is a NOT NULL FK to `users.id`, so we never fabricate an actor.

## Product

*   Real-time AI API budget enforcement for teams and vouchers.
*   Unified proxy for all AI API requests.
*   Configurable tiered rate and concurrency limiting.
*   Comprehensive CRUD for organizations, teams, members, vouchers, and providers.
*   Audit logging with detailed metadata and change diffs.
*   Multi-currency display options per organization.
*   Dynamic AI model discovery per provider key.
*   Project-level API key management for granular usage tracking.
*   Abuse protection for public endpoints using rate limits and captchas.

## User preferences

- Detailed explanations preferred
- Iterative development
- Ask before making major changes
- Do not make changes to the folder `Z`
- Do not make changes to the file `Y`

## Gotchas

*   Always run `npm run build` which includes `vitest run` before deployment; `SKIP_RELEASE_TESTS=1` is for local debugging only.
*   Ensure `TURNSTILE_SECRET_KEY` (server) and `VITE_TURNSTILE_SITE_KEY` (client build-time) are set for production to enable captcha protection on public endpoints.
*   `max_tokens` and `max_completion_tokens` are mutually exclusive in forwarded API requests.
*   Azure OpenAI requires deployment-to-model mappings and custom pricing; deployment names are URL-encoded in requests.

## Pointers

*   [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
*   [Stripe API Documentation](https://stripe.com/docs/api)
*   [Resend API Documentation](https://resend.com/docs)
*   [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
*   [React-i18next Documentation](https://react.i18next.com/)