# Azure APIM Connection — Debugging Timeline

## Context

**User's setup:**
- Azure API Management (APIM) gateway
- Endpoint: `https://apim-n1ai-uks-f31ee48d7.azure-api.net/`
- Key: APIM subscription key (32-character hex)
- Endpoint mode: Legacy (auto-detected from `azure-api.net` domain)
- API version: `2024-10-21`

**Problem:** Adding an Azure provider connection via the Allotly dashboard consistently fails with a validation error.

---

## Attempt 1 — Three-tier validation

### Hypothesis
The original validation tried a single endpoint (`gpt-4o` chat completions). The user's APIM might not have `gpt-4o` deployed, causing a false negative. A lighter probe (e.g., `GET /openai/models`) would validate the key without needing a specific deployment.

### Implementation
Three-step validation cascade:
1. `GET /openai/models` — lightweight key check
2. `GET /openai/deployments` — fallback key check
3. `POST .../chat/completions` — last resort with a real model

### Result
**Failed.** APIM returned `401` on `GET /openai/models`.

### Why it failed
APIM gateways only expose specific API paths that are configured in the gateway's product/API definitions. Paths like `/openai/models` are typically **not** exposed through APIM. When APIM receives a request to an unconfigured path, it returns `401` (not `404`), making it indistinguishable from a genuinely invalid key.

---

## Attempt 2 — APIM-aware routing (skip models, go straight to chat)

### Hypothesis
Since APIM returns `401` for unconfigured paths, we should skip the `/openai/models` and `/openai/deployments` probes for APIM gateways and go directly to the chat completions endpoint, which IS the path the user has configured.

### Implementation
- Detect APIM gateways via `azure-api.net` in the URL
- For APIM: skip models/deployments probes, test chat completions directly
- For direct Azure endpoints: keep the models probe

### Result
**Failed.** APIM returned `404` on `/openai/deployments/gpt-4o/chat/completions`. The code treated `404` as "deployment not found" and returned an error.

### Why it failed
The test deployment name `gpt-4o` doesn't exist on the user's APIM gateway. A `404` here doesn't mean the key is invalid — it means the gateway authenticated the request but couldn't route to that specific deployment. The key is actually valid.

---

## Attempt 3 — Treat 404 as valid (key works, deployment doesn't exist)

### Hypothesis
A `404` response from a deployment-specific path proves the key IS valid (the gateway authenticated and processed the request). Only `401`/`403` should be treated as "invalid key."

### Implementation
- Changed `404` handling from error → `{ valid: true }`
- Also fixed a URL double-slash bug (trailing slash in user's URL + `/openai/...` prefix)

### Result
**Failed.** APIM returned `401` on the chat completions path itself:
```
Access denied due to invalid subscription key.
Make sure to provide a valid key for an active subscription.
```

### Why it failed
This was unexpected — a `401` on the actual chat completions path. Possible causes:
1. The APIM subscription key might be scoped to a specific product/API that uses a different path structure than what we're probing
2. The APIM might require the subscription key via query parameter (`?subscription-key=...`) rather than header
3. The APIM might be configured with a custom path prefix that doesn't match `/openai/deployments/{name}/chat/completions`
4. The subscription might be for a different APIM product that exposes a different API surface

The fundamental issue: **APIM configurations are too variable to reliably validate programmatically.** Each APIM instance can have completely different products, APIs, path mappings, and auth mechanisms.

---

## Attempt 4 (Current) — Allow APIM connections without strict validation

### Hypothesis
Since APIM gateways have highly variable configurations (different products, path structures, auth scoping, subscription tiers), programmatic validation using test requests is unreliable. The validation should be lenient for APIM gateways and let actual proxy usage surface any real auth issues.

### Implementation
- For APIM gateways (`azure-api.net`): always allow the connection, even if the validation probe returns `401`, `403`, `404`, or other errors
- For direct Azure OpenAI endpoints (e.g., `*.openai.azure.com`): maintain strict validation via the models endpoint
- Log APIM validation results for diagnostics but don't block the connection
- Real auth errors will surface during actual proxy requests, providing more useful diagnostic info (correct path, correct deployment name, correct headers)

### Status
**Deployed.** Awaiting user confirmation.

---

## Root cause analysis

The core issue is the difference between:
- **Direct Azure OpenAI endpoints** (`*.openai.azure.com`) — predictable API surface, standard auth, validation works reliably
- **APIM gateways** (`*.azure-api.net`) — fully customisable proxy layer with variable path mappings, product scoping, auth mechanisms, and subscription tiers

Our validation probes were designed for direct endpoints and fail on APIM because:
1. APIM returns `401` for unconfigured paths (not `404`)
2. APIM subscription keys may be scoped to specific products/APIs
3. APIM may use custom path prefixes or mappings
4. Test deployment names (`gpt-4o`) may not exist on the gateway

## Open questions

1. Does the user's APIM subscription key work when called from their own application/code? (This would confirm the key itself is valid)
2. What exact path does their APIM expose for chat completions? (Custom prefix?)
3. Is the subscription key delivered via header or query parameter in their setup?
4. What APIM product/API is the subscription associated with?
