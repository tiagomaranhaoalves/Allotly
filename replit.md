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
*   `server/lib/vouchers/redeem-inline.ts` - Voucher redemption side effects (atomic slot claim + compensation)
*   `server/lib/auth/api-key-lookup.ts` - Validate-and-resolve `allotly_sk_…` keys (no Redis cache)
*   `server/lib/members/create-member.ts` - Extracted POST /api/members handler (multi-team-aware invite check)
*   `client/src/i18n/locales/` - i18n translation files
*   `docs/release-checklist.md` - Release procedures
*   `tests/e2e/` - Playwright end-to-end tests

## Architecture decisions

*   **Unified v4 Proxy:** All AI API requests (team/voucher) route through a single proxy for centralized, real-time metering and budget enforcement.
*   **Integer Micro-Cents for Money:** The canonical server unit is MICRO-CENTS (1 cent = 1_000_000 micro-cents), stored in `bigint` (mode `"number"`) columns so tiny sub-cent AI requests accumulate exactly instead of rounding to 0. DB column names and TS property names are KEPT as `...Cents` but now hold micro-cents. The wire/display/frontend/external (Stripe) contract stays in CENTS — convert micro↔cents ONLY at wire boundaries via `centsToMicroCents` / `microCentsToCents` (`server/lib/currency.ts`). Settlement/estimate helpers in `server/lib/proxy/safeguards.ts` are named `...MicroCents`. `model_pricing` rates (cents/MTok) and Stripe `unit_amount` are unchanged.
*   **Encrypted AI Provider Keys:** AI provider API keys are AES-256-GCM encrypted, supporting rotation and real-time validation.
*   **Robust Cascade Deletion:** Critical entity deletions (org, team, member, voucher) are atomic transactions with full cascade cleanup.
*   **Atomic Voucher Slot Claim:** `redeemVoucherInline` claims a voucher slot via a single conditional UPDATE (`currentRedemptions < maxRedemptions AND status='ACTIVE'`) inside a transaction that also claims the parent bundle slot when present. The claim runs *before* user/membership/redemption-row creation; failures before the redemption row commits release the slot, failures after it commits intentionally retain the slot to prevent re-opening occupied capacity on retry. Prevents over-redemption under concurrent load (MCP retries, parallel `/oauth/authorize/credential` posts).
*   **Multi-team Memberships:** A user can belong to multiple teams. `team_memberships` no longer has a UNIQUE constraint on `user_id`; uniqueness is enforced on the composite `(team_id, user_id)` to close the concurrent-invite race. `getMembershipByUser` returns the user's "primary" membership using status priority (ACTIVE > BUDGET_EXHAUSTED > SUSPENDED > other; ties by `updated_at DESC`); the same ordering drives the OAuth team picker and the dashboard switcher's default selection. Use `getMembershipsByUser` / `getMembershipByUserAndTeam` whenever a single team scope is required.
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
*   Playwright runs three projects (chromium, firefox, webkit). The default chromium project runs the full e2e suite; firefox and webkit are filtered to specs tagged `@cross-browser` (currently `tests/e2e/oauth-consent.spec.ts`). The Replit dev container can run chromium + firefox but not webkit (bundled webkit needs `libjxl.so.0.8`, not in nixpkgs); use `PLAYWRIGHT_SKIP_WEBKIT=1 bash scripts/pre-release.sh` locally. CI must run `npx playwright install --with-deps` once at provisioning so all three engines work.
*   Ensure `TURNSTILE_SECRET_KEY` (server) and `VITE_TURNSTILE_SITE_KEY` (client build-time) are set for production to enable captcha protection on public endpoints.
*   `max_tokens` and `max_completion_tokens` are mutually exclusive in forwarded API requests.
*   Azure OpenAI requires deployment-to-model mappings and custom pricing; deployment names are URL-encoded in requests.
*   Member-facing API endpoints (`/api/me/keys`, `/api/my-keys`, `/api/dashboard/member-overview`, `/api/members/me/welcome`, etc.) accept an optional `membershipId` query/body param. Always resolve it via `resolveOwnedMembership()` — an explicit but unowned id deliberately returns 404 (no silent fallback to the user's primary membership).

## Pointers

*   [Drizzle ORM Documentation](https://orm.drizzle.team/docs/overview)
*   [Stripe API Documentation](https://stripe.com/docs/api)
*   [Resend API Documentation](https://resend.com/docs)
*   [Cloudflare Turnstile Documentation](https://developers.cloudflare.com/turnstile/)
*   [React-i18next Documentation](https://react.i18next.com/)