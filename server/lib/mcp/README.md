# Allotly MCP Server (V1)

Hosted MCP server that exposes the Allotly proxy's consumption surface as Model Context Protocol tools. Lives in the same Node/Express process as the proxy, mounted at **`/mcp`**.

- Transport: Streamable HTTP (single `POST /mcp` endpoint, JSON-RPC body).
- Protocol version: `2025-03-26`.
- Auth: bearer token (V1). OAuth 2.1 with Dynamic Client Registration is V1.5.
- All tool responses carry `_meta.budget`. No `allotly_sk_` ever leaves the server.

## Authentication

Send `Authorization: Bearer <token>` with one of:

1. `allotly_sk_…` — an Allotly API key (Team or Voucher membership). Resolved via the proxy's `authenticateKey()`.
2. `ALLOT-XXXX-XXXX-XXXX` — a voucher code. Auto-redeemed server-side on first use; bound for 24h in Redis (`allotly:mcp:voucher_binding:{sha256(code)}`). The minted `allotly_sk_` is never returned to the client.

`voucher_info` is callable without a bearer token. All other tools require auth and return JSON-RPC error `-32001` (`Unauthorised`) otherwise.

## Quick smoke test

```bash
# Initialize handshake
curl -s https://allotly.ai/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'

# List tools (no auth needed)
curl -s https://allotly.ai/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# Call a protected tool with a key
curl -s https://allotly.ai/mcp \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer allotly_sk_…' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"my_budget","arguments":{}}}'
```

## Adding the MCP to popular hosts

### Claude Code

```bash
claude mcp add --transport http allotly https://allotly.ai/mcp \
  --header "Authorization: Bearer allotly_sk_…"
```

### Cursor — `~/.cursor/mcp.json`

```json
{
  "mcpServers": {
    "allotly": {
      "url": "https://allotly.ai/mcp",
      "headers": { "Authorization": "Bearer allotly_sk_…" }
    }
  }
}
```

### VS Code — `.vscode/mcp.json`

```json
{
  "servers": {
    "allotly": {
      "url": "https://allotly.ai/mcp",
      "type": "http",
      "headers": { "Authorization": "Bearer allotly_sk_…" }
    }
  }
}
```

### Claude Desktop (via local stdio bridge — V1.0.1)

V1 is hosted-only. Once the `@allotly/mcp` npm bridge ships:

```json
{
  "mcpServers": {
    "allotly": {
      "command": "npx",
      "args": ["-y", "@allotly/mcp@latest"],
      "env": { "ALLOTLY_KEY": "allotly_sk_…" }
    }
  }
}
```

### ChatGPT Developer Mode

Add a remote MCP at `https://allotly.ai/mcp` with the bearer header.

## Tool catalog

### Tier 1 — Consumption

| Tool | Auth | Purpose |
|---|---|---|
| `chat` | required | Send messages to any allowed model. Returns content, usage, cost. |
| `compare_models` | required | Same prompt, multiple models in parallel; per-model failures are non-fatal. |
| `recommend_model` | required | Heuristic recommendation from your allowlist + budget. (LLM-based: V1.5.) |
| `list_available_models` | required | Models your key can use, with pricing and capabilities. |

### Tier 2 — Recipient self-service

| Tool | Auth | Purpose |
|---|---|---|
| `quickstart` | required | Friendly intro + sample prompts. |
| `my_budget` | required | Remaining/total budget, formatted. |
| `my_status` | required | Budget + concurrency + rate-limit + voucher status in one view. |
| `my_recent_usage` | required | Last N proxy calls (no prompt content). |
| `diagnose` | required | Plain-English explanation of your most recent failure. |
| `voucher_info` | **no auth** | Inspect a voucher code without redeeming it. |
| `redeem_voucher` | required (voucher bearer) | Confirm the auto-redemption that happened during auth, idempotent. |
| `redeem_and_chat` | required (voucher bearer) | Redeem + first chat in one call. |
| `request_topup` | required | Email the issuing admin for more budget. Rate-limited 5/24h per voucher. |

## MCP error codes

All errors are JSON-RPC error responses with one of these codes:

| Code | Name | Cause |
|---|---|---|
| -32001 | Unauthorised | Missing/invalid bearer |
| -32002 | Forbidden | Authenticated but action not allowed |
| -32004 | NotFound | Voucher code not found, etc. |
| -32010 | InsufficientBudget | Pre-flight budget check failed |
| -32011 | RateLimited | RPM (or MCP-layer per-tool limit) exceeded |
| -32012 | ConcurrencyLimited | Membership concurrency cap exceeded |
| -32013 | VoucherExpired | Voucher past expiry |
| -32014 | VoucherAlreadyRedeemed | Voucher fully redeemed (or revoked) |
| -32015 | ModelNotAllowed | Model not in your allowlist |
| -32020 | BudgetExceeded | Allotly's specific budget exhaustion error |
| -32030 | ProviderError | Upstream AI provider returned an error |
| -32100 | InvalidInput | Zod input validation failed |

Every error's `data` carries `{ message, hint }` plus context where relevant (`allowed_models`, `retry_after_seconds`, etc.).

## MCP-layer rate limits

In addition to the proxy's per-membership RPM, the MCP layer enforces:

| Tool | Limit |
|---|---|
| `redeem_voucher` | 10 / hour / principal |
| `redeem_and_chat` | 10 / hour / principal |
| `request_topup` | 5 / hour / principal (and 5 / 24h / voucher) |
| All others | 600 / hour / principal (effectively non-blocking) |

Keys: `allotly:mcp:ratelimit:{principal_hash}:{tool}:{hour_bucket}`.

## Security checklist

- No `allotly_sk_` MUST appear in any tool output, prompt, resource, or audit row. Verified by `tests/mcp/security.test.ts`.
- No raw provider key (`sk-`, `sk-ant-`, `AIza…`) MUST appear in error data. Upstream errors are scrubbed by `buildUpstreamError`.
- Voucher codes only appear in `voucher_info` (echoed back) and `redeem_voucher` confirmations. The audit log stores hashes only.
- Tool description hashes are pinned at server start (`pinDescriptionsAtStartup`); a console warning fires if any hash drifts intentionally between releases — bump them in `tools/index.ts` only after review.
- The audit-log writer runs in `setImmediate`; a write failure NEVER fails the tool call.

## Database surface

Three new tables, all created via the existing `npm run db:push` flow:

- `mcp_audit_log` — `(tool_name, input_hash, ok, error_code, latency_ms, membership_id?, created_at)`
- `mcp_idempotency` — `(scope, key, principal_id, response_json, created_at)` with composite PK
- `voucher_topup_requests` — `(voucher_id, requested_by_principal_hash, amount_cents_requested?, reason?, status, ...)`

## Known V1 limitations

- **Streaming** is buffered: `chat` with `stream: true` is delivered as one final response. Progress notifications across MCP transports are inconsistent across hosts; spec §4.6 explicitly allows this. True progressive streaming is a V1.5 follow-up.
- **`compare_models` is not streamed** — all results are returned at once after `Promise.allSettled`.
- **Currency** is USD only. The proxy stores costs in cents and the budget snapshot uses `currency: "usd"`. GBP conversion is V1.5.
- **OAuth 2.1 / Dynamic Client Registration** — not in V1; required to enable claude.ai connectors. V1.5.
- **`recommend_model`** is heuristic (rules over the allowlist). LLM-based ranking is V1.5.
- **Express handler size**: spec §3.4 asked for a ≤30-line `handleChatCompletion` post-refactor. V1 ships a parallel callable (`processChatCompletion`) used by the MCP path; the existing HTTP handler is left intact to keep the existing proxy test suite green. Consolidating both paths onto a shared streaming abstraction is a tracked follow-up.
- **Admin tools** (`create_voucher`, `revoke_voucher`, etc.) are explicitly out of scope. Admin tooling stays in the dashboard.

## Testing

The MCP suite lives at `tests/mcp/`. Run:

```bash
npm install
npm run db:push   # ensure mcp_audit_log, mcp_idempotency, voucher_topup_requests exist
npx vitest run tests/mcp/
```

The transport test boots Express on a random port and makes real JSON-RPC calls against `/mcp`. The voucher-info test mocks `storage`. Existing proxy tests (`tests/integration.test.ts`, `tests/proxy-tiers.test.ts`, etc.) continue to pass — `processChatCompletion` is added alongside the existing handler, no helpers were renamed.

Manual smoke test in Claude Code:

```bash
claude mcp add --transport http allotly https://allotly.ai/mcp \
  --header "Authorization: Bearer allotly_sk_…"
claude mcp list
# In a session: ask Claude to "call list_available_models" to verify wiring
```
