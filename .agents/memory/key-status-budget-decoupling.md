---
name: API key status decoupled from budget state
description: Why budget exhaustion/recovery must never mutate API key status; enforcement is membership-level + cache flush.
---

# API key status is decoupled from budget state

API key lifecycle status (`ACTIVE` / `REVOKED` / `EXPIRED`) must NOT be flipped by
budget exhaustion or budget recovery. Budget blocking is enforced at the
**membership** level: both `authenticateKey` (proxy `safeguards.ts`) and
`lookupApiKey` (`api-key-lookup.ts`) deny when `membership.status === "BUDGET_EXHAUSTED"`,
regardless of key status. To make a budget state change take effect immediately,
flush the `apiKeyCache(keyHash)` Redis snapshot (it has a ~60s TTL); do not touch
key status.

**Why:** The key enum has only one revoked state (`REVOKED`). When budget
exhaustion auto-revoked keys and budget recovery (reset endpoint, credit endpoint,
nightly job, admin budget-decrease, voucher top-up) blindly flipped every `REVOKED`
key back to `ACTIVE`, a manual revocation became indistinguishable from a budget
revocation — so resetting a budget resurrected keys the user had deliberately
revoked. Decoupling removes that whole bug class without weakening enforcement.

**How to apply:** In any budget exhaustion/recovery path, change only
`membership.status` and flush `apiKeyCache` for the member's keys. Never call
`updateAllotlyApiKey(..., { status: "ACTIVE"|"REVOKED" })` from budget logic.
Manual/admin revoke, voucher expiry, and cascade delete are the only legitimate
writers of key status.
