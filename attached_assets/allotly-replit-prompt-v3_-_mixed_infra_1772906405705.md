# Allotly — Build Prompt for Replit Agent (v3 — Hybrid Architecture)

---

## ⚠️ INSTRUCTIONS TO THE AGENT

**Read this ENTIRE document before writing a single line of code.**

You are building a complete, production-ready SaaS application called **Allotly**. Build EVERYTHING described in this document in a single deployment. Follow the build order in Section 22 step by step. Do NOT skip steps or reorder them.

**After building, you must:**
1. Run all tests (unit + integration + E2E)
2. Fix any failures
3. Visually review every page in both light and dark mode
4. Verify all role-based dashboards render correctly
5. Confirm the landing page scores >90 on Lighthouse

**Design quality matters.** This is a paid SaaS product. Every page must look polished, professional, and cohesive. Follow the brand identity exactly. Do not use default unstyled components. Do not leave placeholder text or broken layouts. The design benchmark is **Stripe, Linear, and Vercel dashboards** — clean, data-dense, modern.

**Follow critical sections EXACTLY as specified:**
- The Prisma schema in Section 6 — use it verbatim
- The permission matrix in Section 7.2 — enforce every rule
- The provider integration flows in Section 5.3 — implement the API calls exactly
- The proxy request lifecycle in Section 9.3 — implement every step exactly
- The proxy safeguards in Section 9.4 — all three are mandatory
- The background job logic in Section 12 — implement the pseudocode exactly
- The encryption implementation in Section 17 — use AES-256-GCM exactly as shown
- The voucher code format in Section 8.2 — ALLOT-XXXX-XXXX-XXXX with the exact charset

---

## 1. PRODUCT OVERVIEW

**Allotly** is "The AI Spend Control Plane" — a SaaS platform with two distinct features, both available from one dashboard:

### Feature 1: Allotly Teams (No-Proxy)
For trusted internal teams. Allotly connects to your AI provider accounts and provisions scoped API keys with budget limits and model restrictions directly at the provider level. Team members call AI providers directly — zero proxy, zero latency, zero single point of failure. Allotly monitors usage by polling provider APIs at regular intervals (15-minute intervals on Team plan). If Allotly goes down, all team API keys continue working.

**Best for:** Engineering teams, R&D departments, internal cost governance, development workflows where latency matters.

### Feature 2: Allotly Vouchers (Thin Proxy)
For distributing scoped AI access to anyone. Admins create voucher codes that recipients redeem to get an Allotly API key (`allotly_sk_...`). Recipients call `api.allotly.com` instead of providers directly. The proxy authenticates, checks budget, clamps max tokens to remaining balance, forwards to the provider, meters the response, and deducts cost in real time. Budget enforcement is hard — per-request, not polling-based.

**Best for:** Hackathons, workshops, onboarding, contractors, agencies, partners, promotional access, short-lived external users, and any scenario requiring tight per-request cost control.

### Hybrid Architecture
These two features coexist in one platform. A Team Admin can have 15 internal developers using Allotly Teams (direct provider keys, no proxy) AND distribute vouchers to 50 hackathon attendees using Allotly Vouchers (proxy-based) — all managed from the same dashboard, using the same provider accounts.

### What You Are Building (Phases 1 + 2)

Build ALL of the following as a single, working deployment:

**Public pages:**
- Marketing landing page (conversion-focused, explains both features)
- Voucher redemption page (with optional account creation)
- Documentation page
- Proxy endpoint: `api.allotly.com/v1/*` (for voucher recipients)

**Allotly Teams (no-proxy):**
- Provider connection management (encrypted Admin API key storage)
- Programmatic provisioning of scoped API keys per member via provider Admin APIs
- Budget monitoring via provider Usage API polling
- Budget alerts at 80% and 90%, key revocation at 100%
- Team Admin and Member dashboards with spend analytics

**Allotly Vouchers (thin proxy):**
- Voucher creation, distribution (codes + QR + email), and management
- Voucher redemption with optional account creation
- Proxy endpoint with streaming support, request translation, real-time metering
- Three proxy safeguards: atomic Redis budget, concurrency limits, max token clamping
- External Access Bundle purchase ($10 one-time via Stripe)

**Shared:**
- User authentication with three roles: Root Admin → Team Admin → Member
- Organization management with two-level admin hierarchy
- Phase 2 analytics: cost-per-model breakdown, top spenders, forecast, anomaly detection
- Stripe subscription billing ($20/month per Team Admin seat) + bundle purchases
- Email notifications (15 templates)
- Background jobs (7 recurring jobs)
- Full dark mode on every page
- Comprehensive testing

---

## 2. BRAND IDENTITY & DESIGN SYSTEM

### 2.1 Logo

Generate an SVG logo for "Allotly". This logo must be used on every page — landing page header, dashboard sidebar, favicon, loading states, and email templates.

Design requirements:
- **Wordmark-based** with a subtle icon element to the left of the text
- The icon must evoke "allocation" or "distribution" — design a motif of **branching nodes** or **pie chart slices** that suggests splitting resources among recipients
- Clean geometric style. No gradients. Primary Indigo (#6366F1) for the icon, Neutral 800 (#1F2937) for the wordmark in light mode, white (#FFFFFF) for dark mode
- Must be legible at 24px height (favicon) and look premium at 200px height (landing page hero)
- Create **3 variants** as React SVG components:
  - `LogoFull` — icon + "Allotly" wordmark (for headers, landing page)
  - `LogoIcon` — icon only (for favicon, mobile nav, app icon)
  - `LogoMono` — monochrome white version (for dark backgrounds, footers, email headers)
- Also export PNG at these sizes: 32×32 (favicon), 180×180 (apple-touch-icon), 512×512 (PWA icon)

### 2.2 Color Palette

Implement these as Tailwind CSS custom colors in `tailwind.config.ts`. Every UI element must use these colors — no off-brand colors anywhere.

```
Primary:        #6366F1  (Indigo 500 — brand color, CTAs, active states, selected tabs)
Primary Dark:   #4338CA  (Indigo 700 — hover states, header backgrounds)
Primary Light:  #E0E7FF  (Indigo 100 — light backgrounds, badge fills, selected row highlights)

Secondary:      #06B6D4  (Cyan 500 — accents, links, secondary actions, chart highlights)
Secondary Dark: #0891B2  (Cyan 600 — hover on secondary elements)

Success:        #10B981  (Emerald 500 — budget OK, positive trends, connected status)
Warning:        #F59E0B  (Amber 500 — budget 60-89%, approaching limits)
Danger:         #EF4444  (Red 500 — budget 90%+, exceeded, errors, destructive actions)

Neutral 50:     #F9FAFB  (page backgrounds in light mode)
Neutral 100:    #F3F4F6  (card backgrounds in light mode)
Neutral 200:    #E5E7EB  (borders, dividers, table lines)
Neutral 400:    #9CA3AF  (placeholder text, disabled states)
Neutral 600:    #4B5563  (secondary text, labels)
Neutral 800:    #1F2937  (primary text, headings in light mode)
Neutral 900:    #111827  (dark mode page backgrounds)

Dark mode card:  #1E293B  (card/sidebar backgrounds in dark mode)
Dark mode hover: #334155  (hover states in dark mode)

Provider-specific colors (use alongside provider names in all provider UI):
  OpenAI:       #10A37F
  Anthropic:    #D4A574
  Google:       #4285F4
```

### 2.3 Typography

```
Headings:   Inter (weights: 600 semibold, 700 bold)
Body text:  Inter (weights: 400 regular, 500 medium)
Code/keys:  JetBrains Mono (weights: 400 regular, 500 medium)

Import via Google Fonts in the root layout:
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');
```

Use JetBrains Mono for: API keys, voucher codes, proxy base URLs, provider key IDs, any technical identifiers.

### 2.4 Design Principles — Follow These Religiously

1. **Stripe/Linear/Vercel quality.** Dashboards must look like they belong to a well-funded startup. Clean spacing, consistent alignment, thoughtful whitespace, subtle shadows, smooth transitions.

2. **Data-dense but uncluttered.** Show spend data at a glance: numbers, percentages, trends, and status colors. No unnecessary decorative elements.

3. **Dark mode from day one.** COMPLETE dark mode using Tailwind's `dark:` prefix on every single element. Test every page in both modes. Dark backgrounds: Neutral 900, dark cards: #1E293B, dark hover: #334155.

4. **Provider-aware visuals.** Show provider color dot or logo alongside provider-specific data.

5. **Feature-aware.** Clearly distinguish between Teams (direct key icon) and Vouchers (proxy/ticket icon) throughout the UI. Use distinct visual language so admins always know which feature they're looking at.

6. **Status-forward.** Color-code budget utilization EVERYWHERE: Green (#10B981) 0-59%, Amber (#F59E0B) 60-89%, Red (#EF4444) 90%+.

7. **Professional micro-interactions.** Smooth transitions, hover states, loading skeletons (not spinners), toast notifications, confirmation dialogs for destructive actions.

8. **The Allotly logo must appear on:** Landing page header, dashboard sidebar, favicon, login/signup, email headers, docs page, voucher redemption page, proxy error responses, and loading states.

### 2.5 Custom Components

| Component | Description |
|-----------|-------------|
| `<LogoFull>` / `<LogoIcon>` / `<LogoMono>` | SVG logo variants as React components |
| `<ProviderBadge provider="OPENAI">` | Colored dot + provider name |
| `<BudgetBar spent={150} budget={200}>` | Horizontal progress bar. Green→amber→red. Shows "$150 / $200 (75%)" |
| `<AdminRoleBadge role="ROOT_ADMIN">` | Pill badge. Indigo=Root, Cyan=Team Admin, Gray=Member |
| `<SpendCard provider="OPENAI" amount={4523} trend={12.5}>` | Provider icon + formatted amount + trend arrow |
| `<KeyRevealCard keyValue="sk-..." masked={true}>` | Masked key with copy. When masked=false, shows full key ONCE with warning |
| `<VoucherCard code="ALLOT-..." status="ACTIVE" budget={2500}>` | Voucher code in JetBrains Mono + status + budget |
| `<AutomationBadge level="FULL_AUTO">` | "Instant Setup" (green) / "Quick Setup" (amber) / "Guided Setup" (gray) |
| `<FeatureBadge type="TEAMS">` | "Teams" with key icon (indigo) / "Vouchers" with ticket icon (cyan) |
| `<BundleCard bundle={...}>` | Bundle status: redemptions used, proxy requests used, expiry, progress bars |
| `<QRCode value="..." size={200}>` | QR code generator for voucher URLs |
| `<EmptyState icon={...} title="..." action={...}>` | Friendly empty states with CTA |
| `<DashboardShell>` | Role-aware layout: sidebar nav per role + header + content |
| `<StatsCard title="..." value="..." change={...}>` | Dashboard overview cards with trend |
| `<DataTable>` | Sortable, filterable, paginated table with shadcn/ui |

---

## 3. TECH STACK

Use exactly these technologies. Do not substitute alternatives.

```
Framework:       Next.js 14 (App Router, NOT Pages Router)
Language:        TypeScript (strict mode)
Styling:         Tailwind CSS 3 + shadcn/ui
Database:        PostgreSQL (Replit PostgreSQL or Neon/Supabase)
ORM:             Prisma (latest)
Authentication:  NextAuth.js v5 (credentials + email magic link)
Payments:        Stripe (subscriptions + one-time bundle purchases)
Email:           Resend
Cache/Locks:     Redis (for proxy budget ledger, concurrency locks, rate limiting)
Job Queue:       Next.js cron routes with setInterval for Replit
Charts:          Recharts
Validation:      Zod (validate ALL API inputs)
HTTP Client:     Native fetch() for provider API calls
QR Generation:   qrcode (npm package, for voucher QR codes)
Testing:         Vitest (unit + integration) + Playwright (E2E)
Icons:           Lucide React
```

### Additional for Proxy:
```
Streaming:       Native Web Streams API (ReadableStream, TransformStream)
Token Estimation: tiktoken (for accurate input token counting) OR character-based estimation (chars/4)
```

---

## 4. ARCHITECTURE OVERVIEW

```
┌───────────────────────────────────────────────────────────────────────┐
│                         ALLOTLY PLATFORM                              │
│                                                                       │
│  ┌─────────────────────────────┐  ┌────────────────────────────────┐  │
│  │     ALLOTLY TEAMS           │  │      ALLOTLY VOUCHERS          │  │
│  │     (No-Proxy)              │  │      (Thin Proxy)              │  │
│  │                             │  │                                │  │
│  │  Admin connects providers   │  │  Admin creates voucher codes   │  │
│  │         ↓                   │  │         ↓                      │  │
│  │  Allotly provisions scoped  │  │  Recipient redeems code        │  │
│  │  keys via Provider Admin API│  │         ↓                      │  │
│  │         ↓                   │  │  Gets allotly_sk_ proxy key    │  │
│  │  Member calls provider      │  │         ↓                      │  │
│  │  DIRECTLY (zero latency)    │  │  Calls api.allotly.com/v1/*   │  │
│  │         ↓                   │  │         ↓                      │  │
│  │  Allotly polls Usage APIs   │  │  Proxy: auth → budget check → │  │
│  │  every 15min for monitoring │  │  token clamp → forward →      │  │
│  │                             │  │  stream → meter → deduct      │  │
│  │  Budget: eventually         │  │                                │  │
│  │  consistent (polling-based) │  │  Budget: real-time hard       │  │
│  │                             │  │  enforcement (per-request)     │  │
│  └─────────────────────────────┘  └────────────────────────────────┘  │
│                                                                       │
│  Shared: Dashboard, Auth, Providers, Billing, Analytics, Audit Log    │
└───────────────────────────────────────────────────────────────────────┘
```

---

## 5. PROVIDER ADMIN API INTEGRATION (Teams Feature)

### 5.1 How Teams Provisioning Works

```
1. Root Admin connects provider → stores encrypted Admin API key
2. Team Admin creates a member → Allotly calls provider Admin API:
   a. Create isolated project/workspace for the member
   b. Create a service account (OpenAI) or workspace (Anthropic)
   c. Generate scoped API key
   d. Set budget limits at provider level
3. Member receives scoped key (shown once) → calls provider directly
4. Allotly polls Usage APIs to monitor spend
5. Allotly revokes keys if budget exceeded
```

### 5.2 Provider Capabilities

| Capability | OpenAI | Anthropic | Google Gemini |
|---|---|---|---|
| Create project/workspace via API | ✅ Projects | ✅ Workspaces | ❌ Manual |
| Create scoped API key via API | ✅ Service Accounts | ❌ User must create | ❌ Manual |
| Set budget limits via API | ⚠️ Dashboard only | ✅ Workspace limits | ❌ Manual |
| Usage/cost reporting API | ✅ | ✅ | ⚠️ Limited |
| Disable/revoke key via API | ✅ | ✅ (set inactive) | ❌ Manual |

### 5.3 Provider-Specific Flows — Implement Exactly

**`/lib/providers/types.ts`** — Shared interfaces:
```typescript
export interface ProviderAdapter {
  validateAdminKey(encryptedKey: EncryptedKey): Promise<ValidationResult>;
  createMemberAccess(params: CreateAccessParams): Promise<ProviderAccessResult>;
  getUsage(params: UsageParams): Promise<UsageResult>;
  revokeAccess(params: RevokeParams): Promise<void>;
  getAutomationLevel(): AutomationLevel;
  // For proxy: translate OpenAI-format request to provider format
  translateRequest?(request: ProxyRequest): ProviderRequest;
  translateResponse?(response: ProviderResponse): OpenAIFormatResponse;
  extractUsage?(response: ProviderResponse): TokenUsage;
}

export type AutomationLevel = 'FULL_AUTO' | 'SEMI_AUTO' | 'GUIDED';
```

**`/lib/providers/openai.ts`** — Full Auto (uses Service Accounts, NOT user API keys):
```
TEAMS FLOW:
1. validateAdminKey:
   GET https://api.openai.com/v1/organization/projects
   Headers: Authorization: Bearer {admin_key}
   Expect 200 → valid

2. createMemberAccess:
   POST https://api.openai.com/v1/organization/projects
   Body: { name: "allotly-{teamSlug}-{memberSlug}" }
   → Save project ID
   
   POST https://api.openai.com/v1/organization/projects/{projectId}/service_accounts
   Body: { name: "allotly-managed" }
   → Response includes api_key.value (the actual key!)
   → Save service account ID + key ID
   → Return api_key.value to show member ONCE

3. getUsage:
   GET https://api.openai.com/v1/organization/usage
   Query: project_ids[]={projectId}&start_time={periodStart}
   → Parse, calculate cost

4. revokeAccess:
   DELETE https://api.openai.com/v1/organization/projects/{projectId}/service_accounts/{svcAcctId}

PROXY FLOW (for voucher recipients):
   - Request arrives in OpenAI format → forward as-is to api.openai.com
   - Extract usage from response: response.usage.prompt_tokens, response.usage.completion_tokens
```

**`/lib/providers/anthropic.ts`** — Semi Auto (cannot create keys via API):
```
TEAMS FLOW:
1. validateAdminKey:
   GET https://api.anthropic.com/v1/organizations/workspaces
   Headers: anthropic-version: 2023-06-01, x-api-key: {admin_key}
   Expect 200 → valid

2. createMemberAccess:
   POST https://api.anthropic.com/v1/organizations/workspaces
   Body: { name: "allotly-{teamSlug}-{memberSlug}" }
   → Save workspace ID
   → Set workspace spend limit if API supports it
   → Return setupInstructions (member must create key in Console)
   → setupStatus = AWAITING_MEMBER

3. getUsage:
   GET /v1/organizations/usage_report/messages?workspace_ids[]={id}&starting_at={start}
   GET /v1/organizations/cost_report?workspace_ids[]={id}&starting_at={start}

4. revokeAccess:
   List keys: GET /v1/organizations/api_keys?workspace_id={id}
   For each: POST /v1/organizations/api_keys/{keyId} with { status: "inactive" }

PROXY FLOW (for voucher recipients):
   - Request arrives in OpenAI format → translate to Anthropic format:
     model: "claude-sonnet-4-5" → model: "claude-sonnet-4-5-20250929"
     messages → messages (adjust system message to top-level field)
     max_tokens → max_tokens (required by Anthropic)
   - Forward to api.anthropic.com/v1/messages
   - Extract usage: response.usage.input_tokens, response.usage.output_tokens
   - Translate response back to OpenAI format
```

**`/lib/providers/google.ts`** — Guided (no admin API):
```
TEAMS FLOW:
   - All manual. Generate step-by-step markdown instructions.
   - "Mark as Complete" button.

PROXY FLOW (for voucher recipients):
   - Request arrives in OpenAI format → translate to Gemini format:
     model: "gemini-2.5-flash" → target URL includes model name
     messages → contents (different format)
     max_tokens → generationConfig.maxOutputTokens
   - Forward to generativelanguage.googleapis.com
   - Extract usage: response.usageMetadata.promptTokenCount, candidatesTokenCount
   - Translate response back to OpenAI format
```

### 5.4 Automation Badges

| Level | Badge | Color | Teams Meaning | Voucher Meaning |
|-------|-------|-------|---------------|-----------------|
| FULL_AUTO | Instant Setup | Green | Key generated automatically | Proxy works automatically |
| SEMI_AUTO | Quick Setup | Amber | Member creates own key | Proxy works automatically |
| GUIDED | Guided Setup | Gray | Fully manual | Proxy works automatically |

Note: **Vouchers always work automatically** for all providers because the proxy uses the admin's key. The automation level only affects the Teams (direct key) experience.

---

## 6. DATABASE SCHEMA

**Use this Prisma schema EXACTLY. Do not modify table names, field names, or relationships.**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================
// ORGANIZATIONS
// ============================================================

model Organization {
  id                       String    @id @default(cuid())
  name                     String
  plan                     Plan      @default(FREE)
  stripeCustomerId         String?   @unique @map("stripe_customer_id")
  stripeSubId              String?   @map("stripe_subscription_id")
  maxTeamAdmins            Int       @default(0) @map("max_team_admins")
  orgBudgetCeilingCents    Int?      @map("org_budget_ceiling_cents")
  defaultMemberBudgetCents Int?      @map("default_member_budget_cents")
  createdAt                DateTime  @default(now()) @map("created_at")
  updatedAt                DateTime  @updatedAt @map("updated_at")

  users               User[]
  teams               Team[]
  providerConnections ProviderConnection[]
  vouchers            Voucher[]
  voucherBundles      VoucherBundle[]
  auditLogs           AuditLog[]

  @@map("organizations")
}

enum Plan {
  FREE
  TEAM
  ENTERPRISE
}

// ============================================================
// USERS & ROLES
// ============================================================

model User {
  id             String     @id @default(cuid())
  email          String     @unique
  name           String?
  passwordHash   String?    @map("password_hash")
  orgId          String     @map("org_id")
  orgRole        OrgRole    @map("org_role")
  status         UserStatus @default(ACTIVE)
  isVoucherUser  Boolean    @default(false) @map("is_voucher_user")
  lastLoginAt    DateTime?  @map("last_login_at")
  createdAt      DateTime   @default(now()) @map("created_at")
  updatedAt      DateTime   @updatedAt @map("updated_at")

  organization       Organization        @relation(fields: [orgId], references: [id])
  adminOfTeam        Team?               @relation("TeamAdmin")
  teamMembership     TeamMembership?     @relation("TeamMember")
  vouchersCreated    Voucher[]           @relation("VoucherCreator")
  voucherRedemptions VoucherRedemption[]
  allotlyApiKeys     AllotlyApiKey[]
  auditLogs          AuditLog[]          @relation("AuditActor")

  @@index([orgId])
  @@map("users")
}

enum OrgRole {
  ROOT_ADMIN
  TEAM_ADMIN
  MEMBER
}

enum UserStatus {
  ACTIVE
  SUSPENDED
  INVITED
  EXPIRED
}

// ============================================================
// TEAMS
// ============================================================

model Team {
  id                      String   @id @default(cuid())
  name                    String
  orgId                   String   @map("org_id")
  adminId                 String   @unique @map("admin_id")
  monthlyBudgetCeilingCents Int?   @map("monthly_budget_ceiling_cents")
  createdAt               DateTime @default(now()) @map("created_at")
  updatedAt               DateTime @updatedAt @map("updated_at")

  organization Organization    @relation(fields: [orgId], references: [id])
  admin        User            @relation("TeamAdmin", fields: [adminId], references: [id])
  memberships  TeamMembership[]
  vouchers     Voucher[]       @relation("TeamVouchers")

  @@index([orgId])
  @@map("teams")
}

// ============================================================
// TEAM MEMBERSHIPS
// ============================================================

model TeamMembership {
  id                      String           @id @default(cuid())
  teamId                  String           @map("team_id")
  userId                  String           @unique @map("user_id")
  accessMode              AccessMode       @map("access_mode")
  monthlyBudgetCents      Int              @map("monthly_budget_cents")
  allowedModels           Json?            @map("allowed_models")
  allowedProviders        Json?            @map("allowed_providers")
  currentPeriodSpendCents Int              @default(0) @map("current_period_spend_cents")
  periodStart             DateTime         @map("period_start")
  periodEnd               DateTime         @map("period_end")
  status                  MembershipStatus @default(ACTIVE)
  voucherRedemptionId     String?          @map("voucher_redemption_id")
  createdAt               DateTime         @default(now()) @map("created_at")
  updatedAt               DateTime         @updatedAt @map("updated_at")

  team           Team               @relation(fields: [teamId], references: [id])
  user           User               @relation("TeamMember", fields: [userId], references: [id])
  providerLinks  ProviderMemberLink[]
  usageSnapshots UsageSnapshot[]
  budgetAlerts   BudgetAlert[]
  proxyLogs      ProxyRequestLog[]

  @@index([teamId])
  @@map("team_memberships")
}

enum AccessMode {
  DIRECT    // Allotly Teams: member calls provider directly with scoped key
  PROXY     // Allotly Vouchers: member calls api.allotly.com with allotly_sk_ key
}

enum MembershipStatus {
  ACTIVE
  SUSPENDED
  BUDGET_EXHAUSTED
  EXPIRED
}

// ============================================================
// PROVIDER CONNECTIONS (Org-level, Root Admin only)
// ============================================================

model ProviderConnection {
  id                   String          @id @default(cuid())
  orgId                String          @map("org_id")
  provider             Provider
  displayName          String?         @map("display_name")
  adminApiKeyEncrypted Bytes           @map("admin_api_key_encrypted")
  adminApiKeyIv        Bytes           @map("admin_api_key_iv")
  adminApiKeyTag       Bytes           @map("admin_api_key_tag")
  automationLevel      AutomationLevel @map("automation_level")
  status               ProviderStatus  @default(ACTIVE)
  lastValidatedAt      DateTime?       @map("last_validated_at")
  orgAllowedModels     Json?           @map("org_allowed_models")
  createdAt            DateTime        @default(now()) @map("created_at")
  updatedAt            DateTime        @updatedAt @map("updated_at")

  organization Organization       @relation(fields: [orgId], references: [id])
  memberLinks  ProviderMemberLink[]

  @@unique([orgId, provider])
  @@map("provider_connections")
}

enum Provider {
  OPENAI
  ANTHROPIC
  GOOGLE
}

enum AutomationLevel {
  FULL_AUTO
  SEMI_AUTO
  GUIDED
}

enum ProviderStatus {
  ACTIVE
  INVALID
  DISCONNECTED
}

// ============================================================
// PROVIDER MEMBER LINKS (Per-member, per-provider — Teams only)
// ============================================================

model ProviderMemberLink {
  id                   String      @id @default(cuid())
  membershipId         String      @map("membership_id")
  providerConnectionId String      @map("provider_connection_id")
  providerProjectId    String?     @map("provider_project_id")
  providerWorkspaceId  String?     @map("provider_workspace_id")
  providerApiKeyId     String?     @map("provider_api_key_id")
  providerSvcAcctId    String?     @map("provider_svc_acct_id")
  providerBudgetCents  Int?        @map("provider_budget_cents")
  setupStatus          SetupStatus @default(PENDING)
  setupInstructions    String?     @map("setup_instructions")
  keyDeliveredAt       DateTime?   @map("key_delivered_at")
  status               LinkStatus  @default(ACTIVE)
  createdAt            DateTime    @default(now()) @map("created_at")
  updatedAt            DateTime    @updatedAt @map("updated_at")

  membership         TeamMembership     @relation(fields: [membershipId], references: [id])
  providerConnection ProviderConnection @relation(fields: [providerConnectionId], references: [id])
  usageSnapshots     UsageSnapshot[]

  @@unique([membershipId, providerConnectionId])
  @@index([providerConnectionId])
  @@map("provider_member_links")
}

enum SetupStatus {
  PENDING
  PROVISIONING
  AWAITING_MEMBER
  COMPLETE
  FAILED
}

enum LinkStatus {
  ACTIVE
  REVOKED
  EXPIRED
}

// ============================================================
// ALLOTLY API KEYS (Proxy keys for voucher recipients)
// ============================================================

model AllotlyApiKey {
  id             String        @id @default(cuid())
  userId         String        @map("user_id")
  membershipId   String        @map("membership_id")
  keyHash        String        @unique @map("key_hash")
  keyPrefix      String        @map("key_prefix")
  status         AllotlyKeyStatus @default(ACTIVE)
  lastUsedAt     DateTime?     @map("last_used_at")
  createdAt      DateTime      @default(now()) @map("created_at")
  updatedAt      DateTime      @updatedAt @map("updated_at")

  user       User           @relation(fields: [userId], references: [id])

  @@index([keyHash])
  @@map("allotly_api_keys")
}

enum AllotlyKeyStatus {
  ACTIVE
  REVOKED
  EXPIRED
}

// ============================================================
// USAGE MONITORING
// ============================================================

model UsageSnapshot {
  id                   String @id @default(cuid())
  providerMemberLinkId String? @map("provider_member_link_id")
  membershipId         String @map("membership_id")
  snapshotAt           DateTime @map("snapshot_at")
  inputTokens          BigInt   @default(0) @map("input_tokens")
  outputTokens         BigInt   @default(0) @map("output_tokens")
  totalCostCents       Int      @default(0) @map("total_cost_cents")
  periodCostCents      Int      @default(0) @map("period_cost_cents")
  model                String?
  source               UsageSource @default(POLL)
  rawData              Json?    @map("raw_data")
  createdAt            DateTime @default(now()) @map("created_at")

  providerMemberLink ProviderMemberLink? @relation(fields: [providerMemberLinkId], references: [id])
  membership         TeamMembership      @relation(fields: [membershipId], references: [id])

  @@index([providerMemberLinkId, snapshotAt])
  @@index([membershipId, snapshotAt])
  @@map("usage_snapshots")
}

enum UsageSource {
  POLL    // From Teams polling
  PROXY   // From Voucher proxy metering
}

model BudgetAlert {
  id               String         @id @default(cuid())
  membershipId     String         @map("membership_id")
  thresholdPercent Int            @map("threshold_percent")
  triggeredAt      DateTime       @map("triggered_at")
  notified         Boolean        @default(false)
  actionTaken      String?        @map("action_taken")
  createdAt        DateTime       @default(now()) @map("created_at")

  membership TeamMembership @relation(fields: [membershipId], references: [id])

  @@unique([membershipId, thresholdPercent])
  @@map("budget_alerts")
}

// ============================================================
// PROXY REQUEST LOG (Voucher proxy only)
// ============================================================

model ProxyRequestLog {
  id             String   @id @default(cuid())
  membershipId   String   @map("membership_id")
  provider       Provider
  model          String
  inputTokens    Int      @map("input_tokens")
  outputTokens   Int      @map("output_tokens")
  costCents      Int      @map("cost_cents")
  durationMs     Int      @map("duration_ms")
  statusCode     Int      @map("status_code")
  maxTokensApplied Int?   @map("max_tokens_applied")
  createdAt      DateTime @default(now()) @map("created_at")

  membership TeamMembership @relation(fields: [membershipId], references: [id])

  @@index([membershipId, createdAt])
  @@map("proxy_request_logs")
}

// ============================================================
// VOUCHERS
// ============================================================

model Voucher {
  id                 String        @id @default(cuid())
  code               String        @unique
  orgId              String        @map("org_id")
  teamId             String        @map("team_id")
  createdById        String        @map("created_by_id")
  bundleId           String?       @map("bundle_id")
  label              String?
  budgetCents        Int           @map("budget_cents")
  allowedProviders   Json          @map("allowed_providers")
  allowedModels      Json?         @map("allowed_models")
  expiresAt          DateTime      @map("expires_at")
  maxRedemptions     Int           @default(1) @map("max_redemptions")
  currentRedemptions Int           @default(0) @map("current_redemptions")
  status             VoucherStatus @default(ACTIVE)
  createdAt          DateTime      @default(now()) @map("created_at")
  updatedAt          DateTime      @updatedAt @map("updated_at")

  organization Organization        @relation(fields: [orgId], references: [id])
  team         Team                 @relation("TeamVouchers", fields: [teamId], references: [id])
  createdBy    User                 @relation("VoucherCreator", fields: [createdById], references: [id])
  bundle       VoucherBundle?       @relation(fields: [bundleId], references: [id])
  redemptions  VoucherRedemption[]

  @@index([code])
  @@index([orgId])
  @@index([bundleId])
  @@map("vouchers")
}

enum VoucherStatus {
  ACTIVE
  EXPIRED
  FULLY_REDEEMED
  REVOKED
}

model VoucherRedemption {
  id        String   @id @default(cuid())
  voucherId String   @map("voucher_id")
  userId    String   @map("user_id")
  redeemedAt DateTime @default(now()) @map("redeemed_at")

  voucher Voucher @relation(fields: [voucherId], references: [id])
  user    User    @relation(fields: [userId], references: [id])

  @@unique([voucherId, userId])
  @@map("voucher_redemptions")
}

// ============================================================
// VOUCHER BUNDLES (Purchased add-on capacity)
// ============================================================

model VoucherBundle {
  id                     String       @id @default(cuid())
  orgId                  String       @map("org_id")
  purchasedById          String       @map("purchased_by_id")
  stripePaymentIntentId  String?      @map("stripe_payment_intent_id")
  totalRedemptions       Int          @map("total_redemptions")
  usedRedemptions        Int          @default(0) @map("used_redemptions")
  totalProxyRequests     Int          @map("total_proxy_requests")
  usedProxyRequests      Int          @default(0) @map("used_proxy_requests")
  maxBudgetPerVoucherCents Int        @map("max_budget_per_voucher_cents")
  maxBudgetPerRecipientCents Int      @map("max_budget_per_recipient_cents")
  expiresAt              DateTime     @map("expires_at")
  status                 BundleStatus @default(ACTIVE)
  createdAt              DateTime     @default(now()) @map("created_at")
  updatedAt              DateTime     @updatedAt @map("updated_at")

  organization Organization @relation(fields: [orgId], references: [id])
  vouchers     Voucher[]

  @@index([orgId])
  @@map("voucher_bundles")
}

enum BundleStatus {
  ACTIVE
  EXHAUSTED
  EXPIRED
}

// ============================================================
// AUDIT LOG
// ============================================================

model AuditLog {
  id         String   @id @default(cuid())
  orgId      String   @map("org_id")
  actorId    String   @map("actor_id")
  action     String
  targetType String?  @map("target_type")
  targetId   String?  @map("target_id")
  metadata   Json?
  createdAt  DateTime @default(now()) @map("created_at")

  organization Organization @relation(fields: [orgId], references: [id])
  actor        User         @relation("AuditActor", fields: [actorId], references: [id])

  @@index([orgId, createdAt])
  @@map("audit_logs")
}

// ============================================================
// MODEL PRICING (Reference data)
// ============================================================

model ModelPricing {
  id                 String   @id @default(cuid())
  provider           Provider
  modelId            String   @map("model_id")
  displayName        String   @map("display_name")
  inputPricePerMTok  Int      @map("input_price_per_m_tok")
  outputPricePerMTok Int      @map("output_price_per_m_tok")
  isActive           Boolean  @default(true) @map("is_active")
  updatedAt          DateTime @updatedAt @map("updated_at")

  @@unique([provider, modelId])
  @@map("model_pricing")
}
```

### Seed Data

Create `/prisma/seed.ts` with this model pricing data:

```typescript
const modelPricing = [
  // OpenAI (prices in cents per 1M tokens)
  { provider: 'OPENAI', modelId: 'gpt-4o', displayName: 'GPT-4o', inputPricePerMTok: 250, outputPricePerMTok: 1000 },
  { provider: 'OPENAI', modelId: 'gpt-4o-mini', displayName: 'GPT-4o Mini', inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: 'OPENAI', modelId: 'gpt-4.1', displayName: 'GPT-4.1', inputPricePerMTok: 200, outputPricePerMTok: 800 },
  { provider: 'OPENAI', modelId: 'gpt-4.1-mini', displayName: 'GPT-4.1 Mini', inputPricePerMTok: 40, outputPricePerMTok: 160 },
  { provider: 'OPENAI', modelId: 'gpt-4.1-nano', displayName: 'GPT-4.1 Nano', inputPricePerMTok: 10, outputPricePerMTok: 40 },
  { provider: 'OPENAI', modelId: 'o3', displayName: 'o3', inputPricePerMTok: 1000, outputPricePerMTok: 4000 },
  { provider: 'OPENAI', modelId: 'o3-mini', displayName: 'o3 Mini', inputPricePerMTok: 110, outputPricePerMTok: 440 },
  { provider: 'OPENAI', modelId: 'o4-mini', displayName: 'o4 Mini', inputPricePerMTok: 110, outputPricePerMTok: 440 },
  // Anthropic
  { provider: 'ANTHROPIC', modelId: 'claude-opus-4-5-20250929', displayName: 'Claude Opus 4.5', inputPricePerMTok: 1500, outputPricePerMTok: 7500 },
  { provider: 'ANTHROPIC', modelId: 'claude-sonnet-4-5-20250929', displayName: 'Claude Sonnet 4.5', inputPricePerMTok: 300, outputPricePerMTok: 1500 },
  { provider: 'ANTHROPIC', modelId: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', inputPricePerMTok: 80, outputPricePerMTok: 400 },
  // Google
  { provider: 'GOOGLE', modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', inputPricePerMTok: 125, outputPricePerMTok: 1000 },
  { provider: 'GOOGLE', modelId: 'gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', inputPricePerMTok: 15, outputPricePerMTok: 60 },
  { provider: 'GOOGLE', modelId: 'gemini-2.0-flash', displayName: 'Gemini 2.0 Flash', inputPricePerMTok: 10, outputPricePerMTok: 40 },
];
```

---

## 7. ADMIN HIERARCHY & PERMISSIONS

### 7.1 Three Roles

Identical to the roles described in Section 1. Root Admin → Team Admins → Members.

Root Admin: 1 per org. Connects providers, creates Team Admins ($20/seat), sets org policies, views all data, manages billing, purchases bundles.

Team Admin: Up to 10 per org. Manages one team of up to 20 members. Creates DIRECT (Teams) members AND PROXY (Voucher) members. Creates vouchers from plan allowance or purchased bundles.

Member: Receives either a direct provider key (Teams) or an Allotly proxy key (Vouchers). Views own usage.

### 7.2 Permission Matrix — ENFORCE ON EVERY API ROUTE

| Action | Root Admin | Team Admin | Member |
|--------|-----------|------------|--------|
| Connect/disconnect providers | ✅ | ❌ | ❌ |
| Set org model allowlist | ✅ | ❌ | ❌ |
| Set org budget ceiling | ✅ | ❌ | ❌ |
| Create Team Admins | ✅ | ❌ | ❌ |
| Remove Team Admins | ✅ | ❌ | ❌ |
| Purchase bundles | ✅ | ✅ (own team) | ❌ |
| Create DIRECT members | ✅ (any team) | ✅ (own team) | ❌ |
| Create vouchers | ✅ (any team) | ✅ (own team) | ❌ |
| View team usage | ✅ (all teams) | ✅ (own team) | ❌ |
| View own usage | ✅ | ✅ | ✅ |
| View org-wide analytics | ✅ | ❌ | ❌ |
| Suspend/reactivate members | ✅ (any) | ✅ (own team) | ❌ |
| Revoke API keys | ✅ (any) | ✅ (own team) | Own key only |
| Export reports | ✅ (org-wide) | ✅ (team) | ❌ |
| View audit log | ✅ | ❌ | ❌ |
| Manage billing | ✅ | ❌ | ❌ |

### 7.3 Free Plan Behavior

On Free, Root Admin acts as sole Team Admin. Auto-create "Default" team. Can add up to 5 DIRECT members. Gets 1 voucher with limited capacity (see Section 8).

---

## 8. VOUCHER SYSTEM

### 8.1 Voucher Architecture

Vouchers use the **thin proxy**. When a voucher is redeemed, the recipient gets an `allotly_sk_` key and calls `api.allotly.com/v1/*`. The proxy authenticates, checks budget, forwards to the provider using the admin's key, meters the response, and deducts cost in real time.

This means **all providers work instantly for voucher recipients** — no manual setup, no creating provider accounts, no visiting consoles. The admin's provider API key handles everything behind the scenes.

### 8.2 Voucher Code Format

`ALLOT-XXXX-XXXX-XXXX` using charset: `23456789ABCDEFGHJKMNPQRSTUVWXYZ`

Excludes: 0/O, 1/I/L. Generate with `crypto.randomBytes()`. Verify uniqueness in DB.

### 8.3 Voucher Limits by Plan

| | Free | Team (included) | External Access Bundle ($10) |
|---|---|---|---|
| Active voucher codes | 1 | 5 per Team Admin | 10 per bundle |
| Max redemptions per code | 2 | 5 | 50 (pool across bundle) |
| Max budget per recipient | $5 | $20 | $50 |
| Total allocated budget | $10 | $100 per Team Admin | (admin's provider pays) |
| Total proxy requests | 200 | 5,000 per Team Admin | 25,000 per bundle |
| Max expiry | 1 day | 30 days | 30 days from purchase |
| Proxy rate limit/recipient | 10 req/min | 30 req/min | 30 req/min |
| Max concurrent requests/recipient | 2 | 2 | 2 |

### 8.4 External Access Bundle — $10 One-Time Purchase

When a Team Admin (or Root Admin) pays $10, they receive a block of voucher capacity:

| Parameter | Value |
|-----------|-------|
| Price | $10 one-time (via Stripe) |
| Voucher redemptions | 50 (pool — can split across up to 10 voucher codes) |
| Proxy requests | 25,000 (pool — shared across all recipients in bundle) |
| Max budget per voucher code | $100 |
| Max budget per recipient | $50 |
| Max voucher codes from bundle | 10 |
| TTL | 30 days from purchase (all vouchers from bundle expire) |
| Rate limit per recipient | 30 req/min |
| Max concurrent per recipient | 2 |

**Multiple bundles:** Admins can purchase multiple bundles. Each is independent with its own pools and expiry. When creating a voucher, admin selects which bundle (or plan allowance) to draw from.

**Bundle tracking in Redis:**
```
allotly:bundle:{bundleId}:redemptions  → atomic integer (remaining)
allotly:bundle:{bundleId}:requests     → atomic integer (remaining)
```

When either hits 0, all vouchers from that bundle return HTTP 402.

### 8.5 Voucher Creation Flow

```
1. Admin opens Vouchers → "Create Voucher"
2. Fills form:
   - Source: "Plan Allowance" or select a purchased bundle
   - Label: "AI Workshop March 2026"
   - Budget per recipient: $25 (slider + input, max per source)
   - Allowed providers: ☑ OpenAI ☑ Anthropic ☐ Google
   - Allowed models: from org allowlist, admin can restrict further
   - Expiry: date + time (max per source)
   - Max redemptions: 20 (draws from source pool)
3. Validation:
   - Redemptions ≤ remaining in source pool
   - Budget × redemptions ≤ source limits
   - Providers are connected at org level
   - Models within org allowlist
4. Generate: ALLOT-XXXX-XXXX-XXXX
5. Success screen shows:
   - Voucher code (large, JetBrains Mono, copy button)
   - Shareable link: allotly.com/redeem?code=ALLOT-XXXX-XXXX-XXXX
   - QR code (downloadable PNG)
   - "Send via email" option
   - Summary: "$25 × 20 redemptions = $500 total"
```

### 8.6 Voucher Redemption Flow — With Optional Account

```
1. Recipient visits allotly.com/redeem (from link, QR, or manual entry)
2. Enters voucher code in format-masked input
3. Allotly validates (no auth required):
   - Code exists, ACTIVE, not expired, redemptions available
   - Bundle has remaining redemptions + proxy requests (if bundle-sourced)
4. Shows voucher details card:
   "This voucher gives you:
    • $25 of AI API access
    • Models: GPT-4o, GPT-4o Mini, Claude Sonnet 4.5
    • Expires: March 15, 2026"

5. TWO OPTIONS presented side by side:

   ┌─────────────────────────────┐  ┌──────────────────────────────────┐
   │  ⚡ GET KEY INSTANTLY        │  │  👤 CREATE ACCOUNT (Recommended)  │
   │                             │  │                                  │
   │  No account needed.         │  │  Track your remaining budget     │
   │  Get your API key now and   │  │  in a personal dashboard.       │
   │  start building.            │  │  View usage history and         │
   │                             │  │  available models.              │
   │  Your budget info will be   │  │                                  │
   │  in the API response        │  │  Name: [____________]           │
   │  headers.                   │  │  Email: [____________]          │
   │                             │  │  Password: [____________]       │
   │  [Get My Key →]             │  │                                  │
   │                             │  │  [Create Account & Get Key →]   │
   └─────────────────────────────┘  └──────────────────────────────────┘

6. "Get Key Instantly" path:
   a. Create User with auto-generated email placeholder (voucher-{code}-{random}@allotly.local)
   b. Set isVoucherUser = true, status = ACTIVE
   c. Skip to step 8

7. "Create Account" path:
   a. Create User with real email, password, name
   b. Set isVoucherUser = true, status = ACTIVE
   c. Continue to step 8

8. Backend processing:
   a. Add user to Team Admin's team as MEMBER with accessMode = PROXY
   b. Create TeamMembership with voucher budget + models
   c. Create VoucherRedemption, increment voucher.currentRedemptions
   d. Decrement bundle redemptions pool (if bundle-sourced)
   e. Generate Allotly proxy key: allotly_sk_ + 48 crypto-random chars (base64url)
   f. SHA-256 hash the key → store hash in AllotlyApiKey table
   g. Initialize Redis budget: SET allotly:budget:{membershipId} {budgetCents}
   h. Initialize Redis bundle counters (if not already set)

9. Show "You're All Set!" page:
   - KeyRevealCard with FULL key (shown ONCE, copy button)
   - Warning: "⚠️ This key will only be shown once. Copy it now."
   - Quickstart code block:
     "Use this key with any OpenAI-compatible client:

      Base URL: https://api.allotly.com/v1
      API Key:  allotly_sk_...

      Example (curl):
      curl https://api.allotly.com/v1/chat/completions \
        -H 'Authorization: Bearer allotly_sk_...' \
        -H 'Content-Type: application/json' \
        -d '{"model": "gpt-4o-mini", "messages": [{"role": "user", "content": "Hello!"}]}'

      Example (Python):
      from openai import OpenAI
      client = OpenAI(base_url='https://api.allotly.com/v1', api_key='allotly_sk_...')
      response = client.chat.completions.create(
          model='gpt-4o-mini',
          messages=[{'role': 'user', 'content': 'Hello!'}]
      )

      Works with: OpenAI Python/Node SDKs, LangChain, LlamaIndex, Cursor, etc.
      Just change the base_url to https://api.allotly.com/v1"
   - Available models list with provider badges
   - Budget: $25.00 remaining
   - Expires: March 15, 2026
   - If account created: "View your dashboard" link
   - Response header info: "Your remaining budget is also in every API response as X-Allotly-Budget-Remaining"
```

---

## 9. PROXY IMPLEMENTATION (Allotly Vouchers)

### 9.1 Proxy Endpoint

`POST /api/v1/chat/completions` — the primary proxy endpoint, OpenAI-compatible.

Also support: `GET /api/v1/models` — list available models for this key.

All requests to `/api/v1/*` are proxy requests. They ONLY accept `allotly_sk_` keys. Regular provider keys or admin keys must never reach this endpoint.

### 9.2 Request Translation

The proxy accepts **OpenAI-format requests** and translates to the appropriate provider:

```
Incoming model name → Provider routing:
  gpt-*          → OpenAI (forward as-is)
  o3*, o4*       → OpenAI (forward as-is)
  claude-*       → Anthropic (translate to /v1/messages format)
  gemini-*       → Google (translate to generateContent format)
```

Implement translation in the provider adapters. The proxy never changes the developer experience — they always use OpenAI SDK format.

### 9.3 Proxy Request Lifecycle — IMPLEMENT EVERY STEP

```
REQUEST arrives at /api/v1/chat/completions

│ STEP 1: AUTH
│  Extract Bearer token from Authorization header
│  If not allotly_sk_ prefix → 401 Unauthorized
│  SHA-256 hash → lookup in AllotlyApiKey table (cache in Redis for 60s)
│  If not found or status != ACTIVE → 401 Unauthorized
│  Load membership (with team, org, allowed models, allowed providers)
│  If membership.status != ACTIVE → 403 with descriptive error
│
│ STEP 2: CONCURRENCY CHECK (Safeguard 2)
│  INCR allotly:concurrent:{membershipId}
│  SET allotly:req:{requestId} 1 EX 120  (auto-expires safety net)
│  If concurrent count > 2 → DECR → 429 Too Many Requests (Retry-After: 2)
│
│ STEP 3: RATE LIMIT CHECK
│  Check allotly:ratelimit:{membershipId} (sliding window in Redis)
│  If > plan limit (10/30 req/min) → 429 Too Many Requests
│  INCR with 60s TTL
│
│ STEP 4: BUNDLE REQUEST POOL CHECK
│  If membership sourced from bundle:
│    remaining = GET allotly:bundle:{bundleId}:requests
│    If remaining <= 0 → 402 { "error": "proxy_requests_exhausted" }
│
│ STEP 5: PARSE REQUEST
│  Parse model, messages, max_tokens, stream from request body (Zod validate)
│  Determine provider from model name
│  Verify model is in membership.allowedModels → 403 if not
│  Verify provider is in membership.allowedProviders → 403 if not
│
│ STEP 6: INPUT COST ESTIMATION
│  Estimate input tokens: ceil(JSON.stringify(messages).length / 4)
│  Look up model pricing from cached ModelPricing table
│  inputCostCents = ceil((estimatedInputTokens / 1_000_000) * inputPricePerMTok)
│  Get remainingBudget = GET allotly:budget:{membershipId}
│  If remainingBudget < inputCostCents → 402 Budget Exhausted
│
│ STEP 7: MAX TOKEN CLAMPING (Safeguard 3)
│  remainingAfterInput = remainingBudget - inputCostCents
│  maxAffordableOutput = floor((remainingAfterInput / outputPricePerMTok) * 1_000_000)
│  If maxAffordableOutput < 50 → 402 with suggested cheaper model:
│    { "error": { "type": "insufficient_budget",
│      "message": "Remaining budget ($X.XX) too low for {model}. Try {cheaperModel}.",
│      "suggested_model": "gpt-4o-mini",
│      "suggested_model_max_tokens": calculated_value }}
│  effectiveMaxTokens = min(userMaxTokens || 4096, maxAffordableOutput)
│
│ STEP 8: BUDGET RESERVATION (Safeguard 1)
│  estimatedTotalCents = inputCostCents + ceil((effectiveMaxTokens / 1_000_000) * outputPricePerMTok)
│  result = DECRBY allotly:budget:{membershipId} estimatedTotalCents
│  If result < 0 → INCRBY to restore → 402 Budget Exhausted
│
│ STEP 9: FORWARD TO PROVIDER
│  Decrypt admin's provider API key (from ProviderConnection, cached in memory 5min)
│  Translate request to provider format (inject effectiveMaxTokens in correct field)
│  Forward with streaming (SSE passthrough via TransformStream)
│  Stream response chunks back to client as-is
│  Buffer final chunk to extract usage metadata
│
│ STEP 10: ON RESPONSE COMPLETE
│  Parse actual usage: input_tokens, output_tokens from provider response
│  actualCostCents = ceil((input_tokens / 1M) * inputPrice) + ceil((output_tokens / 1M) * outputPrice)
│  refundCents = estimatedTotalCents - actualCostCents
│  INCRBY allotly:budget:{membershipId} refundCents  ← reconcile
│  DECR allotly:concurrent:{membershipId}  ← release slot
│  DEL allotly:req:{requestId}  ← clear safety net
│  DECRBY allotly:bundle:{bundleId}:requests 1  ← decrement bundle pool (if applicable)
│
│ STEP 11: ASYNC (non-blocking, queue for batch write)
│  Insert ProxyRequestLog { model, tokens, cost, duration, statusCode, maxTokensApplied }
│  Update TeamMembership.currentPeriodSpendCents += actualCostCents
│  Update VoucherBundle.usedProxyRequests += 1
│  Check if budget below alert thresholds → queue alert emails
│
│ STEP 12: RESPONSE HEADERS (appended to client response)
│  X-Allotly-Budget-Remaining: {remainingCents after deduction}
│  X-Allotly-Budget-Total: {totalBudgetCents}
│  X-Allotly-Requests-Remaining: {bundleRequestsLeft or "unlimited"}
│  X-Allotly-Max-Tokens-Applied: {effectiveMaxTokens}
│  X-Allotly-Expires: {voucherExpiresAt ISO string}
│
│ ON ERROR/TIMEOUT at any point after reservation:
│  INCRBY allotly:budget:{membershipId} estimatedTotalCents  ← full refund
│  DECR allotly:concurrent:{membershipId}  ← release slot
│  DEL allotly:req:{requestId}
│  Return appropriate error to client (502 for provider errors, 504 for timeout)
```

### 9.4 Proxy Safeguards — ALL THREE ARE MANDATORY

**Safeguard 1: Atomic Redis Budget Ledger**
- Store budget as atomic integer in Redis (in cents): `allotly:budget:{membershipId}`
- Use DECRBY to reserve before forwarding, INCRBY to reconcile after
- Initialize from Postgres on voucher redemption
- Reconcile Redis ↔ Postgres every 60 seconds (background job)
- If Redis restarts, next reconciliation job restores from Postgres
- Postgres is source of truth; Redis is hot enforcement cache

**Safeguard 2: Concurrency Limits**
- Max 2 concurrent requests per voucher recipient
- Redis INCR/DECR on `allotly:concurrent:{membershipId}`
- Safety net: each request sets `allotly:req:{requestId}` with EX 120 (2-minute TTL)
- Self-healing sweep every 30s: if concurrent > 0 but no active request keys exist, reset to 0
- Decrement on: success, error, timeout — all paths

**Safeguard 3: Max Token Clamping**
- Before forwarding, calculate max affordable output tokens based on remaining budget
- Account for input cost first (estimate from request body size)
- Inject/override provider-specific max_tokens field:
  - OpenAI: `max_tokens` or `max_completion_tokens`
  - Anthropic: `max_tokens` (already required)
  - Google: `generationConfig.maxOutputTokens`
- Minimum floor: 50 tokens. Below that, reject with suggested cheaper model.

### 9.5 Redis Key Schema

```
allotly:budget:{membershipId}         → integer (remaining budget in cents)
allotly:concurrent:{membershipId}     → integer (active request count, 0-2)
allotly:req:{requestId}               → "1" with EX 120 (safety net TTL)
allotly:ratelimit:{membershipId}      → integer (requests in current 60s window)
allotly:bundle:{bundleId}:redemptions → integer (remaining redemptions)
allotly:bundle:{bundleId}:requests    → integer (remaining proxy requests)
allotly:apikey:{keyHash}              → JSON string (cached key+membership data, EX 60)
allotly:modelprice:{provider}:{model} → JSON string (cached pricing, EX 3600)
```

### 9.6 Proxy Error Responses

All proxy errors must be clear, actionable, and include the Allotly branding:

```json
// 401 - Invalid or missing key
{ "error": { "type": "authentication_error", "message": "Invalid API key. Keys start with allotly_sk_" } }

// 402 - Budget exhausted
{ "error": { "type": "budget_exhausted", "message": "Your AI budget of $25.00 has been fully used.", "budget_total_cents": 2500 } }

// 402 - Insufficient for model
{ "error": { "type": "insufficient_budget", "message": "Remaining budget ($0.03) too low for claude-opus-4-5. Try claude-haiku-4-5.", "remaining_cents": 3, "suggested_model": "claude-haiku-4-5", "suggested_model_max_tokens": 3750 } }

// 402 - Bundle requests exhausted
{ "error": { "type": "proxy_requests_exhausted", "message": "This voucher's request pool is exhausted. Contact the voucher issuer." } }

// 403 - Model not allowed
{ "error": { "type": "model_not_allowed", "message": "Model gpt-4o is not available with this voucher.", "allowed_models": ["gpt-4o-mini", "claude-haiku-4-5"] } }

// 403 - Voucher expired
{ "error": { "type": "voucher_expired", "message": "This voucher expired on March 15, 2026." } }

// 429 - Rate limit
{ "error": { "type": "rate_limit", "message": "Rate limit: 30 requests/minute. Retry after 2 seconds.", "retry_after": 2 } }

// 429 - Concurrency limit
{ "error": { "type": "concurrent_limit", "message": "Max 2 concurrent requests. Wait for current request to complete.", "retry_after": 2 } }
```

---

## 10. USAGE MONITORING & BUDGET ENFORCEMENT

### 10.1 Two Enforcement Models

| | Allotly Teams (DIRECT) | Allotly Vouchers (PROXY) |
|---|---|---|
| Enforcement | Polling-based (eventually consistent) | Per-request (real-time) |
| Budget storage | Provider-side limits + Allotly polling | Redis atomic integer |
| Overshoot risk | $1-3 between polls | <$0.05 (estimation gap only) |
| Alert triggers | 80%, 90%, 100% from polling job | 80%, 90%, 100% from proxy |
| Key revocation | Via provider Admin API | Allotly key set to REVOKED |

### 10.2 Teams: Polling Intervals

| Plan | Interval | Max Overshoot |
|------|----------|---------------|
| Free | 60 minutes | ~$1-3 |
| Team | 15 minutes | ~$0.50-1 |
| Enterprise | 5 minutes | ~$0.10-0.50 |

### 10.3 Teams: Usage Poll Job — Implement Exactly

```
JOB: usage-poll (runs per org plan interval)

FOR each Organization:
  Skip if not time to poll (track lastPolledAt)
  FOR each active ProviderConnection:
    Decrypt admin API key
    FOR each active ProviderMemberLink (accessMode = DIRECT):
      TRY:
        result = providerAdapter.getUsage({ projectId/workspaceId, periodStart })
        CREATE UsageSnapshot { source: POLL, ... }
        UPDATE membership.currentPeriodSpendCents
        
        percentUsed = (spend / budget) * 100
        IF >= 100 AND no alert: revoke key, email, audit log
        ELSE IF >= 90 AND no alert: email member + admin
        ELSE IF >= 80 AND no alert: email member
      CATCH: log error, continue (don't block others)
```

### 10.4 Vouchers: Real-Time Enforcement

No polling needed. The proxy deducts from the Redis budget on every request. Budget alerts are triggered inline:

```
After proxy deduction:
  remainingPercent = (remaining / total) * 100
  IF remainingPercent <= 20 AND no 80% alert: queue "budget-warning-80" email
  IF remainingPercent <= 10 AND no 90% alert: queue "budget-warning-90" email
  IF remaining <= 0: set AllotlyApiKey.status = REVOKED, queue "budget-exhausted" email
```

### 10.5 Budget Reset Job (Teams only)

```
JOB: budget-reset (daily at 00:05 UTC)
FOR each TeamMembership WHERE accessMode = DIRECT AND periodEnd <= now():
  Reset spend, clear alerts, reactivate if exhausted, re-provision keys
```

---

## 11. PAGES & ROUTES

### 11.1 Landing Page (`/`) — The Most Important Page

**Header:** LogoFull + "Docs" + "Pricing" + "Login" + "Get Started Free" CTA (indigo)

**Hero Section:**
- Headline: **"The AI Spend Control Plane"**
- Subheadline: "Give your team AI access. Keep your budget intact."
- Description: "Two powerful features, one dashboard. Connect your OpenAI, Anthropic, and Gemini accounts — then choose how to distribute access."
- Two CTA buttons: "Start Free" (indigo, primary) + "See How It Works" (outline, scrolls down)
- Right side: polished dashboard screenshot mockup

**Two Features Section — Side by Side Cards:**

Design this as two large, equally prominent cards. Each card has an icon, title, description, key benefits list, and "ideal for" section.

```
┌─────────────────────────────────────────┐  ┌─────────────────────────────────────────┐
│  🔑  ALLOTLY TEAMS                      │  │  🎫  ALLOTLY VOUCHERS                   │
│  No-Proxy · Direct Provider Access      │  │  Thin Proxy · Instant Access Codes      │
│                                         │  │                                         │
│  Provision scoped API keys for your     │  │  Create voucher codes that give anyone   │
│  team directly at the provider level.   │  │  instant AI access with hard budget     │
│  Members call OpenAI, Anthropic, and    │  │  limits. Recipients call one unified    │
│  Gemini directly — zero latency, zero   │  │  API (api.allotly.com) that works with  │
│  proxy, zero single point of failure.   │  │  all providers. Real-time per-request   │
│                                         │  │  metering. Automatic token clamping.    │
│  ✓ Zero added latency                  │  │                                         │
│  ✓ Members talk to providers directly  │  │  ✓ One API key, all providers           │
│  ✓ Budget monitoring via usage polling │  │  ✓ Hard per-request budget enforcement  │
│  ✓ If Allotly goes down, keys work    │  │  ✓ No provider accounts needed          │
│  ✓ Model access restrictions          │  │  ✓ Shareable codes with QR             │
│                                         │  │  ✓ Works with any OpenAI SDK           │
│  Ideal for:                             │  │                                         │
│  Engineering teams · R&D · Internal     │  │  Ideal for:                             │
│  governance · Development workflows     │  │  Hackathons · Workshops · Contractors   │
│                                         │  │  Agencies · Partners · Onboarding       │
│  Included in all plans                  │  │  Gifts · Promotional access             │
│                                         │  │                                         │
│                                         │  │  Included in all plans + $10 bundles    │
└─────────────────────────────────────────┘  └─────────────────────────────────────────┘
```

**How It Works Section:** Tabbed interface — "Teams" tab and "Vouchers" tab, each with 3-step visual:

Teams tab:
1. **Connect** — "Link your AI provider accounts. Keys encrypted with AES-256."
2. **Allocate** — "Create teams, set budgets, choose models. Members get scoped keys."
3. **Monitor** — "Unified dashboard. Alerts at 80%. Auto-revocation at 100%."

Vouchers tab:
1. **Create** — "Generate voucher codes with budget limits. Share via link, QR, or email."
2. **Redeem** — "Recipients scan the code, get an API key instantly. No provider account needed."
3. **Control** — "Real-time spend tracking. Hard budget enforcement. Auto-expiry."

**Trust Section:**
- "Your data stays between you and the AI provider"
- Teams: "Direct provider calls — Allotly never sees prompts or responses"
- Vouchers: "Proxy processes requests in-flight — never stored, never logged, never persisted"
- Security badges: AES-256, SOC 2 (planned), GDPR-compliant architecture

**Pricing Section:** (See Section 15)

**CTA Section:** "Ready to take control?" + "Start Free" button

**Footer:** LogoMono + links + © 2026 Allotly

### 11.2 Voucher Redemption (`/redeem`)

As described in Section 8.6. Clean, focused page. Allotly logo at top. Two-path redemption (instant key vs. create account).

### 11.3 Docs (`/docs`)

Sidebar navigation covering:
- Getting Started
- Allotly Teams: Setup + Per-Provider Guides
- Allotly Vouchers: Creating + Distributing + Proxy API Reference
- Budget Enforcement (Teams vs Vouchers comparison)
- API Reference (proxy endpoint details, headers, error codes)
- FAQ

### 11.4 Dashboard — Role-Aware

**Root Admin Sidebar:**
Overview · Providers · Teams · Vouchers · Bundles · Analytics · Audit Log · Settings

**Team Admin Sidebar:**
Overview · Members · Vouchers · Bundles · Settings

**Member Sidebar:**
Overview · API Keys (DIRECT) or Usage (PROXY)

### 11.5 Dashboard Pages

**Root Admin → Overview:**
- StatsCards: total spend, members (direct + proxy), active vouchers, provider health
- Spend-by-team chart, spend-by-provider donut, recent alerts
- Quick actions: Add Team Admin, Connect Provider, Create Voucher, Buy Bundle

**Root Admin → Bundles (`/dashboard/bundles`):**
- List of purchased bundles with BundleCard: redemptions used/total, requests used/total, expiry, status
- "Buy Bundle" button → Stripe checkout

**Team Admin → Overview:**
- StatsCards: team spend, direct members, voucher recipients, bundle capacity
- Split view: "Teams Members" table + "Voucher Recipients" table (clearly labeled with FeatureBadge)
- Spend chart with two series (direct vs proxy)

**Team Admin → Members:**
- Two tabs: "Direct Members" (Teams) and "Voucher Recipients" (Vouchers)
- Direct tab: name, email, budget, spend, BudgetBar, provider setup status
- Voucher tab: name/email (or "Anonymous"), voucher code, budget, spend, requests used, expiry

**Team Admin → Vouchers:**
- DataTable: code, label, source (Plan/Bundle #), budget, redemptions used/max, status
- "Create Voucher" button → modal with source selection, budget, providers, models, expiry
- Click row → detail: list of recipients, spend per recipient, copy code, QR download

**Member (DIRECT) → Overview:**
- Large BudgetBar, per-provider spend cards, usage trend chart
- API Keys tab: masked keys, regenerate button, setup status

**Member (PROXY) → Overview:**
- Large BudgetBar showing real-time balance
- Models available, requests used, voucher expiry countdown
- "Your API Key" section with masked key (can't reveal again) + base URL reminder
- Recent requests table: timestamp, model, tokens, cost

---

## 12. BACKGROUND JOBS

| Job | Schedule | Description |
|-----|----------|-------------|
| `usage-poll` | 5/15/60 min | Teams: poll provider APIs, update spend, alerts, revocation |
| `budget-reset` | Daily 00:05 | Teams: reset monthly periods, reactivate members |
| `voucher-expiry` | Hourly | Expire vouchers + revoke all associated proxy keys |
| `bundle-expiry` | Hourly | Expire bundles, revoke vouchers sourced from them |
| `provider-validation` | Daily 06:00 | Re-validate admin API keys, email on failure |
| `redis-reconciliation` | Every 60s | Sync Redis budget counters with Postgres truth |
| `snapshot-cleanup` | Weekly | Delete old UsageSnapshots + ProxyRequestLogs per retention |
| `spend-anomaly` | Hourly (Phase 2) | Alert if member >3x rolling average spend rate |

### Redis Reconciliation Job — Critical

```
JOB: redis-reconciliation (every 60 seconds)

FOR each active TeamMembership WHERE accessMode = PROXY:
  pgBudgetRemaining = membership.monthlyBudgetCents - membership.currentPeriodSpendCents
  redisBudgetRemaining = GET allotly:budget:{membershipId}
  
  IF redisBudgetRemaining IS NULL:
    // Redis lost the key (restart, eviction) — restore from Postgres
    SET allotly:budget:{membershipId} pgBudgetRemaining
  
  IF abs(redisBudgetRemaining - pgBudgetRemaining) > 100:
    // >$1 drift — something is wrong, log warning
    LOG warning "Budget drift: Redis={redisBudgetRemaining} PG={pgBudgetRemaining}"
    // Trust Postgres, reset Redis
    SET allotly:budget:{membershipId} pgBudgetRemaining

FOR each active VoucherBundle:
  Sync bundle redemption + request counters similarly
```

---

## 13. EMAIL TEMPLATES

15 templates. Professional design with Allotly logo header, indigo accent.

| Template | Trigger | Recipients |
|----------|---------|------------|
| `welcome` | New org | Root Admin |
| `team-admin-invite` | Root Admin creates Team Admin | Team Admin |
| `member-invite` | Team Admin creates direct member | Member |
| `voucher-notification` | Voucher created (optional send) | External recipient |
| `voucher-redeemed` | Someone redeems a voucher | Team Admin |
| `key-ready` | Provider key provisioned (Teams) | Member |
| `setup-instructions` | Semi-auto/guided provider | Member |
| `budget-warning-80` | 80% spent | Member |
| `budget-warning-90` | 90% spent | Member + Team Admin |
| `budget-exhausted` | 100% → keys revoked | Member + Team Admin |
| `budget-reset` | Monthly reset (Teams) | Member |
| `voucher-expiring` | Voucher expires in 48h | Voucher recipient |
| `bundle-purchased` | Bundle purchase confirmed | Purchaser |
| `provider-key-invalid` | Admin key validation failed | Root Admin |
| `spend-anomaly` | Phase 2: unusual spend | Team Admin |

---

## 14. API ROUTES

### Auth
```
POST /api/auth/signup, /api/auth/login, /api/auth/magic-link, GET /api/auth/session
```

### Organization (Root Admin)
```
GET/PATCH /api/org/settings
```

### Providers (Root Admin)
```
GET/POST /api/providers, PATCH/DELETE /api/providers/[id], POST /api/providers/[id]/validate
```

### Teams (Root Admin)
```
GET/POST /api/teams, PATCH/DELETE /api/teams/[id], GET /api/teams/[id]/usage
```

### Members (Root Admin: any. Team Admin: own team)
```
GET/POST /api/members, PATCH/DELETE /api/members/[id]
POST /api/members/[id]/suspend, /api/members/[id]/reactivate
GET /api/members/[id]/usage
POST /api/members/[id]/provision (Teams: provision provider key)
POST /api/members/[id]/regenerate-key/[provider] (Teams: revoke + new key)
POST /api/members/[id]/revoke-key/[provider] (Teams: revoke provider key)
POST /api/members/[id]/mark-complete/[provider] (Teams: mark guided setup done)
```

### Vouchers (Root Admin: any. Team Admin: own team)
```
GET/POST /api/vouchers, PATCH/DELETE /api/vouchers/[id]
GET /api/vouchers/validate/[code] (Public: check if valid)
POST /api/vouchers/redeem (Public: redeem voucher, create key)
```

### Bundles
```
GET /api/bundles (List bundles, scoped by role)
POST /api/bundles/purchase (Create Stripe checkout for $10 bundle)
GET /api/bundles/[id] (Bundle detail with usage stats)
```

### Proxy Endpoint
```
POST /api/v1/chat/completions (Proxy: the main endpoint)
GET /api/v1/models (Proxy: list available models for this key)
```

### Dashboard Data (scoped by role)
```
GET /api/dashboard/root-overview, /api/dashboard/team-overview, /api/dashboard/member-overview
GET /api/dashboard/spend-by-provider, /api/dashboard/spend-by-team, /api/dashboard/spend-trend
GET /api/dashboard/alerts, /api/dashboard/voucher-stats
```

### Analytics (Phase 2)
```
GET /api/analytics/cost-per-model, /api/analytics/top-spenders
GET /api/analytics/forecast, /api/analytics/anomalies, /api/analytics/optimization
```

### Billing (Root Admin + Team Admin for bundles)
```
POST /api/billing/checkout (Stripe subscription), /api/billing/portal
POST /api/billing/bundle-checkout (Stripe one-time $10)
POST /api/billing/webhooks (Stripe webhooks)
GET /api/billing/subscription
```

### Audit Log (Root Admin)
```
GET /api/audit-log, GET /api/audit-log/export
```

### Models (Public)
```
GET /api/models, GET /api/models/[provider]
```

---

## 15. PRICING & STRIPE

### 15.1 Plans — Display as Pricing Cards on Landing Page

Design three pricing cards side by side. The Team plan should be visually highlighted as "Most Popular".

**FREE — $0/month**
- 1 Root Admin (acts as Team Admin)
- Up to 5 direct members (Teams)
- 1 provider connection
- Usage polling: every 60 minutes
- Data retention: 7 days
- **Vouchers:** 1 code, 2 redemptions, $5/recipient, 200 proxy requests, 1-day expiry

**TEAM — $20/month per Team Admin seat** ★ Most Popular
- 1 Root Admin (free) + up to 10 Team Admins ($20/each)
- Up to 20 direct members per team (Teams)
- 3 provider connections
- Usage polling: every 15 minutes
- Data retention: 90 days
- Audit log (30 days) + CSV export
- Phase 2 analytics
- **Vouchers included:** 5 codes/admin, 5 redemptions/code, $100 total budget/admin, 5,000 proxy requests/admin, 30-day expiry
- **+ External Access Bundles:** $10 each — 50 redemptions, 25,000 proxy requests

**ENTERPRISE — Custom**
- Unlimited everything
- 5-minute polling
- 1-year retention
- SSO + dedicated support
- Custom voucher limits

### 15.2 Stripe Products

**Product 1: "Allotly Team — Team Admin Seat"**
- $20/month, quantity-based subscription
- Adding seat → increment quantity (prorated)
- Removing seat → decrement (credited)

**Product 2: "Allotly External Access Bundle"**
- $10 one-time payment
- Creates a VoucherBundle record on successful payment

### 15.3 Stripe Webhooks

```
checkout.session.completed → if subscription: upgrade plan, set maxTeamAdmins
                           → if bundle: create VoucherBundle, init Redis counters
customer.subscription.updated → sync seat count
customer.subscription.deleted → downgrade to FREE (30-day grace)
invoice.payment_failed → email Root Admin, 7-day grace
```

---

## 16. ENVIRONMENT VARIABLES

```bash
DATABASE_URL="postgresql://..."
NEXTAUTH_URL="https://your-app.replit.app"
NEXTAUTH_SECRET="generate-64-char-random-string"
ENCRYPTION_KEY="generate-64-char-hex-string-32-bytes"
STRIPE_SECRET_KEY="sk_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_..."
STRIPE_BUNDLE_PRICE_ID="price_..."
RESEND_API_KEY="re_..."
EMAIL_FROM="Allotly <notifications@allotly.com>"
REDIS_URL="redis://..."
NEXT_PUBLIC_APP_URL="https://your-app.replit.app"
NEXT_PUBLIC_PROXY_URL="https://api.allotly.com"
```

---

## 17. SECURITY

### 17.1 Provider Key Encryption (AES-256-GCM) — Implement Exactly

```typescript
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
const ALGO = 'aes-256-gcm';
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');

export function encryptProviderKey(plaintext: string): { encrypted: Buffer; iv: Buffer; tag: Buffer } {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { encrypted, iv, tag };
}

export function decryptProviderKey(encrypted: Buffer, iv: Buffer, tag: Buffer): string {
  const decipher = createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}
```

### 17.2 Allotly Proxy Key Generation

```typescript
import { randomBytes, createHash } from 'crypto';

export function generateAllotlyKey(): { key: string; hash: string; prefix: string } {
  const raw = randomBytes(36).toString('base64url');
  const key = `allotly_sk_${raw}`;
  const hash = createHash('sha256').update(key).digest('hex');
  const prefix = key.slice(0, 15) + '...';
  return { key, hash, prefix };
}
```

### 17.3 Security Rules

1. Provider Admin API keys: AES-256-GCM encrypted. Never logged, returned, or displayed.
2. Allotly proxy keys: shown ONCE. Store only SHA-256 hash + prefix.
3. RBAC on every route. Team Admins see only own team.
4. Zod validation on ALL inputs.
5. Rate limiting (Redis-backed): proxy = per plan, voucher redemption = 5/hour/IP, login = 10/hour/IP.
6. Proxy NEVER stores, logs, or persists request bodies (prompts/responses). Only metadata (model, tokens, cost).
7. Audit log: append-only, no edits, no deletes.
8. All money in integer cents.
9. Redis must be persistent (RDB or AOF) for budget state.

---

## 18. PHASE 2: ANALYTICS

Build alongside Phase 1. Uses UsageSnapshot + ProxyRequestLog data.

- **Cost-per-model:** Bar chart by model. Shows both Teams (polled) and Vouchers (proxy-metered).
- **Top spenders:** Ranked table. FeatureBadge showing if direct or proxy user.
- **Spend forecast:** Line chart with projected month-end. Warning if exceeds total budgets.
- **Anomaly detection:** Flag members >3x their 7-day rolling average. Email Team Admin.
- **Optimization:** "3 members using GPT-4o for tasks GPT-4o-mini could handle — save $45/month"

---

## 19. TESTING

### Unit (Vitest)
- Encryption roundtrip
- Budget calculation (cents, thresholds)
- Voucher code generation (format, charset, uniqueness)
- Permission matrix (every role × every action)
- Token clamping calculation (various models, budgets)
- Request translation (OpenAI → Anthropic format, OpenAI → Google format)
- Redis budget reservation/reconciliation logic

### Integration
- Teams: provision → poll → alert → revoke cycle
- Voucher: create → redeem → proxy request → budget deduct → exhaust → 402
- Bundle: purchase → create voucher from bundle → exhaust requests → 402
- Proxy safeguards: concurrent limit (fire 5 simultaneous → 3 get 429), token clamping (low budget → capped tokens)
- Redis reconciliation: corrupt Redis → job restores from Postgres

### E2E (Playwright)
- Root Admin signup → connect provider → create Team Admin → dashboard
- Team Admin: add direct member → provision key → see in dashboard
- Team Admin: create voucher → copy code → redeem in new browser → get key → make proxy request
- Bundle purchase → create voucher from bundle → redeem → use

Run ALL tests. Fix ALL failures.

---

## 20. DEPLOYMENT NOTES

- PostgreSQL: Replit DB or external Neon/Supabase
- Redis: Upstash Redis (Replit-compatible, persistent) or Replit Redis
- Set all env vars in Replit Secrets
- Background jobs: `/api/cron/[job]` pattern with setInterval
- Run `npx prisma generate && npx prisma db push && npx prisma db seed` before first run
- Proxy endpoint must handle streaming (SSE) — verify with curl

---

## 21. FILE STRUCTURE

```
/app
  /(public)/page.tsx                         — Landing page
  /(public)/redeem/page.tsx                  — Voucher redemption
  /(public)/docs/page.tsx                    — Documentation
  /(auth)/login/page.tsx
  /(auth)/signup/page.tsx
  /(auth)/invite/[token]/page.tsx
  /(dashboard)/dashboard/page.tsx            — Role-aware dashboard
  /(dashboard)/dashboard/providers/page.tsx
  /(dashboard)/dashboard/teams/page.tsx
  /(dashboard)/dashboard/members/page.tsx
  /(dashboard)/dashboard/vouchers/page.tsx
  /(dashboard)/dashboard/bundles/page.tsx
  /(dashboard)/dashboard/keys/page.tsx       — Member: API keys
  /(dashboard)/dashboard/analytics/page.tsx
  /(dashboard)/dashboard/audit-log/page.tsx
  /(dashboard)/dashboard/settings/page.tsx

/api
  /auth/[...nextauth]/route.ts
  /org/settings/route.ts
  /providers/route.ts, /providers/[id]/route.ts, /providers/[id]/validate/route.ts
  /teams/route.ts, /teams/[id]/route.ts, /teams/[id]/usage/route.ts
  /members/route.ts, /members/[id]/route.ts, /members/[id]/provision/route.ts
  /members/[id]/regenerate-key/[provider]/route.ts
  /members/[id]/revoke-key/[provider]/route.ts
  /members/[id]/mark-complete/[provider]/route.ts
  /vouchers/route.ts, /vouchers/[id]/route.ts
  /vouchers/validate/[code]/route.ts, /vouchers/redeem/route.ts
  /bundles/route.ts, /bundles/purchase/route.ts, /bundles/[id]/route.ts
  /v1/chat/completions/route.ts              — PROXY ENDPOINT
  /v1/models/route.ts                        — PROXY: list models
  /dashboard/*.ts                            — Dashboard data endpoints
  /analytics/*.ts                            — Phase 2
  /billing/checkout/route.ts, /billing/portal/route.ts
  /billing/bundle-checkout/route.ts, /billing/webhooks/route.ts
  /audit-log/route.ts
  /models/route.ts
  /cron/usage-poll/route.ts
  /cron/budget-reset/route.ts
  /cron/voucher-expiry/route.ts
  /cron/bundle-expiry/route.ts
  /cron/provider-validation/route.ts
  /cron/redis-reconciliation/route.ts
  /cron/snapshot-cleanup/route.ts
  /cron/spend-anomaly/route.ts

/lib
  /providers/openai.ts, anthropic.ts, google.ts, types.ts
  /proxy/handler.ts                          — Main proxy request lifecycle
  /proxy/safeguards.ts                       — Redis budget, concurrency, token clamping
  /proxy/translate.ts                        — Request/response translation
  /proxy/streaming.ts                        — SSE streaming passthrough
  /encryption.ts
  /voucher-codes.ts
  /budget.ts
  /auth.ts
  /stripe.ts
  /email.ts
  /redis.ts                                  — Redis client + helpers
  /jobs/*.ts

/components
  /ui/                                       — shadcn/ui
  /logo.tsx (LogoFull, LogoIcon, LogoMono)
  /provider-badge.tsx, /budget-bar.tsx, /admin-role-badge.tsx
  /spend-card.tsx, /key-reveal-card.tsx, /voucher-card.tsx
  /automation-badge.tsx, /feature-badge.tsx, /bundle-card.tsx
  /qr-code.tsx, /empty-state.tsx, /stats-card.tsx
  /data-table.tsx, /dashboard-shell.tsx

/prisma
  /schema.prisma, /seed.ts, /migrations/
```

---

## 22. BUILD ORDER — Follow Exactly

```
STEP  1: Project setup — Next.js 14, TypeScript strict, Tailwind, shadcn/ui, Prisma, PostgreSQL, Redis
STEP  2: Brand assets — SVG logo (3 variants), Tailwind color config, font imports
STEP  3: Database — Prisma schema (EXACT from Section 6), generate, migrate, seed pricing
STEP  4: Auth — NextAuth v5 with credentials + magic link. Session includes orgId, orgRole, isVoucherUser
STEP  5: Org creation — Signup creates org + Root Admin + "Default" team
STEP  6: Dashboard shell — Role-aware layout, all custom components from Section 2.5
STEP  7: Provider connection — Root Admin: connect → validate → encrypt → save
STEP  8: Org model allowlist — Root Admin toggles models per provider
STEP  9: Team Admin management — Invite flow, seat management
STEP 10: Team creation — Each Team Admin gets a team
STEP 11: Direct member management — Team Admin creates DIRECT members with budget + models
STEP 12: OpenAI provisioning — Service account flow: create project → create svc acct → get key
STEP 13: Anthropic provisioning — Workspace creation → setup instructions
STEP 14: Google provisioning — Guided setup → Mark as Complete
STEP 15: Key management — Regenerate, revoke for direct members
STEP 16: Usage polling — Background job, snapshots, spend updates (Teams)
STEP 17: Budget alerts + enforcement — 80/90/100% thresholds (Teams)
STEP 18: Budget reset — Monthly cycle (Teams)
STEP 19: Redis setup — Client, budget keys, concurrency keys, rate limit keys
STEP 20: Proxy endpoint — Full lifecycle from Section 9.3 with all 3 safeguards
STEP 21: Proxy streaming — SSE passthrough for all providers
STEP 22: Request translation — OpenAI format → Anthropic, Google formats
STEP 23: Voucher CRUD — Create/list/revoke. VoucherCard + QR generation
STEP 24: Voucher redemption — Public /redeem with dual-path (instant key vs. account)
STEP 25: Bundle purchase — Stripe one-time $10, VoucherBundle creation, Redis init
STEP 26: Voucher from bundle — Draw redemptions + requests from bundle pool
STEP 27: Voucher expiry + bundle expiry — Background jobs
STEP 28: Redis reconciliation — Background job (every 60s)
STEP 29: Member dashboard (PROXY) — Balance, requests, expiry, recent calls
STEP 30: Member dashboard (DIRECT) — Spend, keys, provider status
STEP 31: Team Admin dashboard — Combined view, split by feature badge
STEP 32: Root Admin dashboard — Org overview, bundles, all teams, alerts
STEP 33: Audit log — Log all actions, viewer with filters + CSV export
STEP 34: Stripe subscription — Checkout → webhooks → seat management → plan enforcement
STEP 35: Phase 2 analytics — Cost-per-model, top spenders, forecast, anomalies, optimization
STEP 36: Email templates — All 15 via Resend, professional design with logo
STEP 37: Landing page — Full marketing page with two-feature layout. Lighthouse >90.
STEP 38: Docs page — Setup guides, proxy API reference, FAQ
STEP 39: Dark mode pass — Verify EVERY page in both modes. Fix all issues.
STEP 40: Testing — All unit + integration + E2E tests. Fix ALL failures.
STEP 41: Security review — Rate limiting, RBAC, validation, encryption, Redis persistence
STEP 42: Polish — Loading skeletons, empty states, error boundaries, transitions, responsive
```

---

## 23. CRITICAL IMPLEMENTATION NOTES

1. **Provider Admin API keys are the crown jewels.** AES-256-GCM. Never logged, returned, or displayed. Only decrypted in-memory.

2. **The proxy NEVER stores request/response bodies.** Only metadata: model, tokens, cost, duration. No prompts. No completions. Ever.

3. **Redis budget is the enforcement layer; Postgres is the truth layer.** Deductions happen in Redis (fast). Reconciliation syncs to Postgres (reliable). If Redis loses data, the reconciliation job restores it within 60 seconds.

4. **All three proxy safeguards are mandatory.** Atomic Redis budget (prevents race conditions), concurrency limits (prevents parallel drain + rate limit abuse), max token clamping (prevents any single request from overshooting). Skip none.

5. **Voucher codes: `ALLOT-XXXX-XXXX-XXXX`.** Base32 charset excluding 0/O/1/I/L. Crypto-random. Unique.

6. **Allotly proxy keys shown ONCE.** `allotly_sk_` + 48 base64url chars. Store only SHA-256 hash. Never retrievable.

7. **All money in integer cents.** Never float. $1.50 = 150 cents.

8. **Teams: provider-side budgets at 110%.** Allotly budget = $50, provider limit = $55. Allotly enforcement triggers first.

9. **Plan limits checked on every mutation.** Members < 20, vouchers < plan limit, providers < plan limit, bundle pool > 0.

10. **Audit log is append-only.** No edits, no deletes, not even by Root Admin.

11. **Dark mode must be complete.** Every page, component, state.

12. **Landing page must be fast.** Static generation. Lighthouse >90.

13. **Provider adapters isolated.** `/lib/providers/{openai,anthropic,google}.ts`. Changes don't ripple.

14. **The Allotly logo appears everywhere.** Header, sidebar, favicon, login, emails, docs, redeem page, proxy error responses.

15. **OpenAI key provisioning uses Service Accounts** (not user API keys). The Admin API can create service accounts which return an API key in the response. Do NOT try to create user/project API keys — the OpenAI API does not support that.

16. **Concurrency limit self-healing.** Every 30s, check: if `allotly:concurrent:{id}` > 0 but no `allotly:req:*` keys exist for that member, reset to 0. Prevents permanent lockout from zombie state.

17. **Token clamping minimum floor = 50 tokens.** Below that, reject with 402 + suggested cheaper model. A 50-token response is useless — don't waste the admin's money.

18. **Bundle Redis counters initialized on Stripe webhook.** When `checkout.session.completed` fires for a bundle purchase, atomically SET both `allotly:bundle:{id}:redemptions` and `allotly:bundle:{id}:requests`.

---

## END OF BUILD PROMPT

Build everything. Test everything. Make it beautiful. Ship it.
