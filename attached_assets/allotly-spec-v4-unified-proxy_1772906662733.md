# Allotly — Spec v4: Unified Proxy Architecture

## What This Document Is

This is a **change spec** against the v3 hybrid architecture (`allotly-replit-prompt-v3_-_mixed_infra.md`). It describes what changes when both Teams and Vouchers run through the same thin proxy. Anything not mentioned here stays the same as v3.

---

## 1. ARCHITECTURAL CHANGE: ONE PROXY FOR EVERYTHING

### What Changed

In v3, Allotly had two enforcement models:
- **Teams** used direct provider access (no proxy) with polling-based budget monitoring
- **Vouchers** used a thin proxy with real-time per-request budget enforcement

In v4, **both Teams and Vouchers route through the same proxy.** Every user — internal team member or external voucher recipient — gets an `allotly_sk_` key and calls `api.allotly.com/v1/*`.

### What This Means

- One code path for all budget enforcement (real-time, per-request, via Redis)
- One key type for all users (`allotly_sk_`)
- No provider Admin API provisioning (no OpenAI service accounts, no Anthropic workspaces, no Google guided setup)
- No usage polling jobs
- No semi-auto/guided setup UX
- Provider connections still exist — the proxy needs the admin's provider API key to forward requests

### Teams vs. Vouchers: Now a Lifecycle Distinction

The proxy is the same. What differs is **how access is distributed** and **how budgets behave**:

| | Allotly Teams | Allotly Vouchers |
|---|---|---|
| **Who** | Internal team members (invited by email) | Anyone (redeems a shareable code) |
| **Distribution** | Admin invites by email | Admin generates code, shares link/QR/email |
| **Account** | Always has an account | Optional (can get key without account) |
| **Budget type** | Monthly, resets automatically | Fixed, never resets |
| **Expiry** | No expiry (persists until removed) | Hard expiry date |
| **Dashboard** | Full member dashboard | Optional (only if account created) |
| **Key lifecycle** | Persistent, can regenerate | One-time, expires with voucher |

Both call `api.allotly.com/v1/*`. Both get real-time budget enforcement. Both use the same proxy safeguards (atomic Redis budget, concurrency limits, token clamping).

---

## 2. REVISED PRODUCT OVERVIEW

**Allotly** is "The AI Spend Control Plane" — a SaaS platform that lets organizations connect their AI provider accounts (OpenAI, Anthropic, Google Gemini) and distribute scoped API access with hard budget enforcement.

### Feature 1: Allotly Teams
For internal team members. Admins invite team members by email, set monthly budgets and model restrictions. Members get an `allotly_sk_` API key and call `api.allotly.com` — one unified endpoint that works with all providers. Budgets reset monthly. Real-time per-request enforcement ensures no one exceeds their allocation.

**Best for:** Engineering teams, R&D departments, internal cost governance, development workflows.

### Feature 2: Allotly Vouchers
For distributing scoped AI access to anyone. Admins create voucher codes with fixed budgets and expiry dates. Recipients redeem the code, get an API key instantly — no provider account needed. Same proxy, same enforcement, but budgets don't reset and keys expire automatically.

**Best for:** Hackathons, workshops, onboarding, contractors, agencies, partners, promotional access.

### Unified Architecture

Both features share the same infrastructure:
- Same proxy endpoint (`api.allotly.com/v1/*`)
- Same key format (`allotly_sk_`)
- Same budget enforcement (atomic Redis, per-request)
- Same request translation (OpenAI-compatible → any provider)
- Same three safeguards (budget ledger, concurrency limits, token clamping)

The difference is in distribution (invite vs. code) and lifecycle (monthly reset vs. fixed expiry).

---

## 3. WHAT'S REMOVED FROM v3

### Removed: Provider Admin API Provisioning

The entire provider provisioning system for Teams is removed:

- **OpenAI service account creation** (create project → create service account → get key) — REMOVED
- **Anthropic workspace creation** (create workspace → setup instructions → await member) — REMOVED
- **Google guided setup** (step-by-step instructions → "Mark as Complete") — REMOVED
- **All provider-specific key management** (regenerate-key/[provider], revoke-key/[provider], mark-complete/[provider]) — REMOVED

Provider connections still exist. Root Admin still stores encrypted provider API keys. But these keys are now used **only by the proxy** to forward requests — not to provision per-member access at the provider level.

### Removed: Usage Polling

The `usage-poll` background job is removed entirely. There's no need to poll provider Usage APIs because all requests flow through the proxy, which meters usage in real time.

### Removed: Polling-Based Budget Enforcement

The concept of "eventually consistent" budget enforcement is gone. All budgets — Teams and Vouchers — use the same real-time Redis atomic enforcement.

### Removed or Simplified: Database Tables and Enums

**ProviderMemberLink** — REMOVED entirely. This table tracked per-member, per-provider setup status (project IDs, workspace IDs, API key IDs, setup status). Since the proxy uses the admin's key for all forwarding, there's no per-member provider state to track.

**AccessMode enum** — REMOVED. The `DIRECT` vs `PROXY` distinction no longer exists. All access is proxy-based.

Replace with a new field on TeamMembership:

```
accessType  AccessType  @map("access_type")

enum AccessType {
  TEAM      // Invited member, monthly budget reset
  VOUCHER   // Voucher recipient, fixed budget, expiry
}
```

**SetupStatus enum** — REMOVED (PENDING, PROVISIONING, AWAITING_MEMBER, COMPLETE, FAILED no longer apply).

**LinkStatus enum** — REMOVED (was for provider-level key status).

**AutomationLevel enum** — REMOVED from ProviderConnection. The concept of FULL_AUTO/SEMI_AUTO/GUIDED no longer applies because there's no per-member provisioning. All providers work identically through the proxy.

**UsageSource enum** — REMOVED. All usage comes from the proxy. Remove `source` field from UsageSnapshot, or set it always to `PROXY`.

### Removed: Background Jobs

| Job | v3 Status | v4 Status |
|---|---|---|
| `usage-poll` | Poll provider APIs every 5/15/60 min | **REMOVED** — proxy meters in real time |
| `budget-reset` | Reset monthly periods for DIRECT members | **CHANGED** — still needed for TEAM members, but simpler (reset Redis budget, clear alerts, no key re-provisioning) |
| `voucher-expiry` | Expire vouchers + revoke proxy keys | **KEPT** — unchanged |
| `bundle-expiry` | Expire bundles + revoke vouchers | **KEPT** — unchanged |
| `provider-validation` | Re-validate admin API keys daily | **KEPT** — still useful; proxy needs valid admin keys |
| `redis-reconciliation` | Sync Redis ↔ Postgres every 60s | **CHANGED** — now covers ALL memberships, not just PROXY ones |
| `snapshot-cleanup` | Delete old snapshots | **KEPT** — unchanged |
| `spend-anomaly` | Hourly anomaly check | **KEPT** — unchanged |

### Removed: API Routes

```
DELETE  /api/members/[id]/provision               — REMOVED
POST   /api/members/[id]/regenerate-key/[provider] — REMOVED (replaced by regenerate allotly key)
POST   /api/members/[id]/revoke-key/[provider]     — REMOVED (replaced by revoke allotly key)
POST   /api/members/[id]/mark-complete/[provider]  — REMOVED
GET    /api/members/[id]/provider-status            — REMOVED
```

### Removed: UI Components

**AutomationBadge** — REMOVED. No automation levels to display.

### Removed: Provider Adapter Methods (Partially)

The ProviderAdapter interface loses Teams-specific methods:

```typescript
// REMOVED from ProviderAdapter:
createMemberAccess()   // no per-member provisioning
getUsage()             // no polling
revokeAccess()         // no provider-level revocation
getAutomationLevel()   // no automation levels

// KEPT in ProviderAdapter:
validateAdminKey()      // still validate on connect
translateRequest()      // proxy needs this
translateResponse()     // proxy needs this
extractUsage()          // proxy needs this
```

---

## 4. WHAT'S ADDED OR CHANGED

### Changed: Team Member Onboarding Flow

**Old flow (v3):**
Admin creates member → Allotly calls provider Admin API to provision scoped key → member receives provider-native key → member calls provider directly

**New flow (v4):**
Admin creates member → Allotly generates `allotly_sk_` key → member receives key (shown once) → member calls `api.allotly.com/v1/*`

The member creation flow now mirrors the voucher redemption flow in terms of key generation:

```
1. Admin fills "Add Member" form: email, name, monthly budget, allowed models, allowed providers
2. Backend:
   a. Create User (role=MEMBER, status=INVITED)
   b. Create TeamMembership (accessType=TEAM, budget, models, providers, periodStart/End)
   c. Generate allotly_sk_ key
   d. SHA-256 hash → store in AllotlyApiKey table
   e. Initialize Redis: SET allotly:budget:{membershipId} {budgetCents}
   f. Send member-invite email with the key (or show in UI if admin is doing it in-person)
3. Show key to admin ONCE via KeyRevealCard (admin delivers to member)
4. Member can also accept invite by email → set password → see key in dashboard (shown once on first login)
```

### Changed: Member Dashboard

All members now see the same dashboard, whether TEAM or VOUCHER type:

- Large BudgetBar showing real-time balance
- Models available with provider badges
- Requests made (from ProxyRequestLog)
- "Your API Key" section with masked key + base URL reminder
- Recent requests table: timestamp, model, tokens, cost

**Additional for TEAM members:**
- Budget period: "Resets on April 1, 2026"
- Regenerate key button (revokes old `allotly_sk_` key, creates new one)

**Additional for VOUCHER members:**
- Expiry countdown: "Expires in 3 days"
- No regenerate option

### Changed: Team Admin → Members Page

No more two tabs ("Direct Members" and "Voucher Recipients"). Now a single unified table with an `AccessType` badge:

| Name | Email | Type | Budget | Spent | Status | Actions |
|---|---|---|---|---|---|---|
| Jane Dev | jane@co.com | 🔑 Team | $50/mo | $23.40 | Active | Edit, Suspend |
| Hackathon User | anon | 🎫 Voucher | $25 (fixed) | $12.00 | Active | Revoke |

The FeatureBadge component (already built) shows "Team" (indigo key icon) or "Voucher" (cyan ticket icon) for each row.

### Changed: Budget Reset Job

Simplified. No longer needs to re-provision provider keys:

```
JOB: budget-reset (daily at 00:05 UTC)
FOR each TeamMembership WHERE accessType = TEAM AND periodEnd <= now():
  Reset currentPeriodSpendCents = 0
  Update periodStart, periodEnd
  Clear BudgetAlerts for this membership
  IF status == BUDGET_EXHAUSTED:
    Set status = ACTIVE
    Set AllotlyApiKey.status = ACTIVE (re-enable the proxy key)
    SET allotly:budget:{membershipId} {monthlyBudgetCents} (reset Redis)
  ELSE:
    SET allotly:budget:{membershipId} {monthlyBudgetCents} (reset Redis)
  Send budget-reset email to member
```

### Changed: Key Management Routes

Replace provider-specific key routes with unified allotly key routes:

```
POST /api/members/[id]/regenerate-key    — Revoke old allotly_sk_ + generate new one (TEAM members only)
POST /api/members/[id]/revoke-key        — Revoke allotly_sk_ key
```

No provider parameter needed — there's only one key type.

### Changed: Redis Reconciliation Job

Now covers ALL memberships (not just `accessMode = PROXY`):

```
JOB: redis-reconciliation (every 60 seconds)
FOR each active TeamMembership:
  IF accessType = TEAM:
    pgBudgetRemaining = monthlyBudgetCents - currentPeriodSpendCents
  ELSE (VOUCHER):
    pgBudgetRemaining = voucher.budgetCents - currentPeriodSpendCents
  
  redisBudgetRemaining = GET allotly:budget:{membershipId}
  
  IF redisBudgetRemaining IS NULL:
    SET allotly:budget:{membershipId} pgBudgetRemaining
  IF abs(redisBudgetRemaining - pgBudgetRemaining) > 100:
    LOG warning, SET allotly:budget:{membershipId} pgBudgetRemaining
```

### Changed: Provider Connection UI

Simplified. No longer shows automation level badges. The provider connection page becomes:

- Connect provider: select provider → paste admin API key → validate → encrypt → save
- Show connected providers: provider name + badge, status indicator (green/red), display name, last validated date
- Model allowlist toggles (unchanged)
- Disconnect button with confirmation

The automation badges (Instant Setup / Quick Setup / Guided Setup) are removed because all providers work identically through the proxy.

### Added: AllotlyApiKey.membershipId Relationship

The AllotlyApiKey table in v3 has `userId` but not a direct link to `membershipId`. Add:

```prisma
model AllotlyApiKey {
  // ... existing fields ...
  membershipId   String        @map("membership_id")
  // ... remove the old membership relation through user ...
}
```

This simplifies key lookups during proxy auth.

---

## 5. REVISED DATABASE SCHEMA CHANGES

Apply these changes to the v3 Prisma schema:

```
REMOVE: ProviderMemberLink model (entire table)
REMOVE: AccessMode enum
REMOVE: SetupStatus enum
REMOVE: LinkStatus enum
REMOVE: AutomationLevel enum
REMOVE: automationLevel field from ProviderConnection

ADD to TeamMembership:
  accessType    AccessType    @map("access_type")
  allowedProviders  Json?     @map("allowed_providers")  // moved from voucher-only to all members
  voucherExpiresAt  DateTime? @map("voucher_expires_at") // for VOUCHER type

ADD enum:
  enum AccessType {
    TEAM
    VOUCHER
  }

ADD to AllotlyApiKey:
  membershipId  String  @map("membership_id")

CHANGE UsageSnapshot:
  REMOVE: providerMemberLinkId field and relation
  REMOVE: source field (UsageSource enum)
  // All snapshots now come from proxy metering

REMOVE: UsageSource enum
```

---

## 6. REVISED LANDING PAGE POSITIONING

### Hero
The hero headline we agreed on:
**"You want your team on AI. They want every model. Give them access. Keep the control."**

### Two Features Section

Both cards now share the same underlying value prop (one API, hard budget enforcement) but differ on distribution:

**LEFT CARD — ALLOTLY TEAMS**
Icon: Key (indigo)
Tagline: "Managed Access for Your People"

"Invite team members, set monthly budgets, choose which models they can use. Everyone gets their own scoped API key and calls one unified endpoint — all providers, one integration. Budgets reset monthly. You see every dollar from your dashboard."

Benefits:
- One API key, all providers
- Per-person monthly budgets that reset
- Model restrictions by team or role
- Real-time spend tracking per member
- Hard budget enforcement on every request

Built for: Engineering · R&D · Internal governance · Ongoing team access

**RIGHT CARD — ALLOTLY VOUCHERS**
Icon: Ticket (cyan)
Tagline: "AI Access as a Shareable Link"

"Generate a code. Set a budget. Share a link. Recipients get their own scoped API key instantly — no provider account, no setup, no surprises. Works with any OpenAI-compatible SDK. When the budget runs out or the clock expires, it just stops."

Benefits:
- One API key, all providers
- Hard per-request budget enforcement
- No provider accounts needed
- Shareable codes with QR
- Automatic expiry

Built for: Hackathons · Workshops · Contractors · Agencies · Partners · Onboarding

### Voucher Callout Section

"Think Gift Card. But for AI."

"Generate a code. Set a budget. Share a link. Recipients get their own scoped API key instantly — no provider account, no setup, no surprises. It works with any OpenAI-compatible SDK. When the budget runs out or the clock expires, it just stops.

Running a hackathon? Onboarding freelancers? Training a cohort? One voucher code, 50 people, 60 seconds. Everyone gets their own key. You see every dollar from your dashboard."

### Trust Section

Now simpler — one architecture, one trust story:

Headline: "Your prompts are none of our business."

"The Allotly proxy forwards requests to AI providers in real time. Request and response bodies are processed in memory and immediately discarded — never written to disk, never logged, never stored in any database. We track metadata only: model name, token counts, cost. That's it."

Security badges: AES-256-GCM · Zero content storage · SOC 2 (planned) · GDPR-compliant

### How It Works

No more tabbed interface (both paths are similar enough to unify):

1. **Connect** — "Link your AI provider accounts. Admin keys encrypted with AES-256-GCM."
2. **Distribute** — "Invite your team or generate voucher codes. Set budgets, choose models, set expiry."
3. **Control** — "One dashboard. Real-time spend tracking. Hard budget enforcement on every request."

### Pricing Section

Same structure but remove any references to "usage polling intervals" as a plan differentiator (polling no longer exists). Replace with proxy-relevant limits like rate limits per member.

### FAQ Updates

- "What happens if Allotly goes down?" — Now one answer: "API calls will fail until the proxy is restored. We target 99.9% uptime."
- "Do you store my prompts?" — "No. The proxy processes requests in memory and discards them immediately."
- "How accurate are budgets?" — "Real-time, per-request enforcement. Typical variance is under $0.05 between estimated and actual cost per request."

---

## 7. REVISED BUILD ORDER

The 42-step build order from v3 changes as follows:

```
STEPS REMOVED:
  Step 12: OpenAI provisioning (service account flow) — REMOVED
  Step 13: Anthropic provisioning (workspace creation) — REMOVED
  Step 14: Google provisioning (guided setup) — REMOVED
  Step 15: Key management (provider-level regenerate/revoke) — REMOVED
  Step 16: Usage polling — REMOVED
  Step 30: Member dashboard (DIRECT) — MERGED with Step 29

STEPS CHANGED:
  Step 11: Direct member management
    → Now: "Team member management — creates allotly_sk_ key instead of provider keys"
  Step 17: Budget alerts + enforcement
    → Now: "Budget alerts from proxy (inline, not polling-based)"
  Step 18: Budget reset
    → Now: "Simpler — reset Redis budget + re-enable allotly key, no provider re-provisioning"
  Step 28: Redis reconciliation
    → Now: "Covers ALL memberships, not just PROXY"
  Step 29: Member dashboard (PROXY)
    → Now: "Unified member dashboard (all members are proxy-based)"

NEW CONDENSED ORDER:
  1-10:  Foundation, brand, DB, auth, org, dashboard shell, providers, model allowlist, team admins, teams
  11:    Team member management (invite, allotly_sk_ key generation, budget setup)
  12:    Key management (regenerate/revoke allotly keys — no provider parameter)
  13-14: Redis setup, Proxy endpoint (full lifecycle, all safeguards)
  15:    Proxy streaming + request translation
  16:    Voucher CRUD + redemption + bundles
  17:    Budget alerts (triggered inline by proxy) + budget reset job (TEAM only)
  18:    Expiry jobs (voucher + bundle) + redis reconciliation
  19:    Member dashboard (unified)
  20:    Team Admin dashboard
  21:    Root Admin dashboard + audit log
  22:    Stripe subscription + plan enforcement
  23:    Phase 2 analytics
  24:    Email templates
  25:    Landing page + docs
  26:    Footer pages (about, careers, contact, privacy, terms, security)
  27:    Dark mode pass + polish + testing + security review
```

---

## 8. REVISED PERMISSION MATRIX

Remove provider-specific actions:

| Action | Root Admin | Team Admin | Member |
|--------|-----------|------------|--------|
| Connect/disconnect providers | ✅ | ❌ | ❌ |
| Set org model allowlist | ✅ | ❌ | ❌ |
| Set org budget ceiling | ✅ | ❌ | ❌ |
| Create Team Admins | ✅ | ❌ | ❌ |
| Remove Team Admins | ✅ | ❌ | ❌ |
| Purchase bundles | ✅ | ✅ (own team) | ❌ |
| Create team members | ✅ (any team) | ✅ (own team) | ❌ |
| Create vouchers | ✅ (any team) | ✅ (own team) | ❌ |
| View team usage | ✅ (all teams) | ✅ (own team) | ❌ |
| View own usage | ✅ | ✅ | ✅ |
| View org-wide analytics | ✅ | ❌ | ❌ |
| Suspend/reactivate members | ✅ (any) | ✅ (own team) | ❌ |
| Revoke API keys | ✅ (any) | ✅ (own team) | Own key only |
| Regenerate own key | ✅ | ✅ | ✅ (TEAM only) |
| Export reports | ✅ (org-wide) | ✅ (team) | ❌ |
| View audit log | ✅ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ |

**Removed rows:** "Provision provider keys", "Mark setup complete" — no longer applicable.

---

## 9. WHAT STAYS EXACTLY THE SAME

For clarity, these v3 sections are unchanged:

- Section 2: Brand Identity & Design System (except AutomationBadge removed)
- Section 3: Tech Stack
- Section 6: Database Schema (with the modifications listed in Section 5 above)
- Section 8: Voucher System (codes, redemption, bundles — all unchanged)
- Section 9: Proxy Implementation (now used by ALL users, not just voucher recipients)
- Section 9.3: Proxy Request Lifecycle (all 12 steps — unchanged)
- Section 9.4: Proxy Safeguards (all three mandatory — unchanged)
- Section 9.5: Redis Key Schema (unchanged)
- Section 9.6: Proxy Error Responses (unchanged)
- Section 13: Email Templates (remove `setup-instructions` and `key-ready` provider templates; keep everything else)
- Section 15: Pricing & Stripe (remove polling interval as plan differentiator)
- Section 16: Environment Variables (unchanged)
- Section 17: Security (unchanged)
- Section 18: Phase 2 Analytics (unchanged — now ALL data comes from proxy)

---

## 10. EMAIL TEMPLATE CHANGES

13 templates (down from 15):

| Template | Status | Notes |
|----------|--------|-------|
| `welcome` | KEPT | |
| `team-admin-invite` | KEPT | |
| `member-invite` | CHANGED | Now includes allotly_sk_ key + api.allotly.com quickstart |
| `voucher-notification` | KEPT | |
| `voucher-redeemed` | KEPT | |
| `key-ready` | REMOVED | No provider-level provisioning |
| `setup-instructions` | REMOVED | No semi-auto/guided setup |
| `budget-warning-80` | KEPT | |
| `budget-warning-90` | KEPT | |
| `budget-exhausted` | KEPT | |
| `budget-reset` | KEPT | Only for TEAM members |
| `voucher-expiring` | KEPT | |
| `bundle-purchased` | KEPT | |
| `provider-key-invalid` | KEPT | Proxy needs valid admin keys |
| `spend-anomaly` | KEPT | |

---

## 11. SUMMARY OF BENEFITS

### For Development
- ~40% less code to build and maintain
- One enforcement model instead of two
- No provider-specific provisioning logic (was the most complex, most fragile code)
- No usage polling infrastructure
- Simpler database schema (removed ProviderMemberLink + 4 enums)
- One member dashboard instead of two

### For Product
- Consistent experience for all users (same API, same key format, same docs)
- Real-time budget enforcement for everyone (not just voucher recipients)
- No semi-auto/guided setup friction for Anthropic/Google
- Simpler pricing story (no polling interval tiers)
- Easier to explain: "Everyone gets a key. Everyone calls one endpoint."

### For Go-to-Market
- Cleaner pitch: "One control plane, one API, hard budget enforcement"
- No awkward "direct access vs. proxy" explanation needed
- The trust story simplifies: one architecture, one privacy statement
- Can lead with Vouchers (the novel value prop) without confusing people about a second architecture

### What's Lost
- "Zero proxy, zero latency, zero SPOF" pitch for Teams
- Allotly becomes a dependency for API calls (if proxy is down, Teams can't call providers)
- Small latency addition for all requests (~10-50ms)
- If a CTO explicitly wants "no middleman," they'll need to look elsewhere (or wait for a future direct-access tier)

---

## END OF v4 SPEC
