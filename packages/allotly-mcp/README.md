# @allotly/mcp

A tiny stdio-to-HTTP bridge that connects [Claude Desktop](https://claude.ai/download), [Cursor](https://cursor.sh), [Claude Code](https://docs.anthropic.com/claude-code), [VS Code](https://code.visualstudio.com), and other MCP hosts to **Allotly**'s hosted MCP server at `https://allotly.ai/mcp`.

## What is Allotly?

[Allotly](https://allotly.ai) is an AI spend control plane. You issue an `allotly_sk_...` key to your team, your assistant, or your agent; Allotly enforces budgets, model allowlists, and per-key spending caps; the same key works across OpenAI, Anthropic, Google Gemini, and Azure OpenAI.

This package gives MCP hosts that only speak **stdio** (Claude Desktop, Cursor's stdio mode, Claude Code, VS Code) the ability to call Allotly's MCP tools. The hosted server itself speaks Streamable HTTP — this bridge translates between the two.

## What you get

Once connected, your assistant can call these Allotly tools:

| Tool | What it does |
| --- | --- |
| `list_available_models` | Models your key is allowed to use, with pricing |
| `chat` | Send a chat completion through Allotly's proxy |
| `compare_models` | Run the same prompt across models, compare cost & latency |
| `recommend_model` | Suggest a cheaper model that fits your task |
| `voucher_info` | Inspect a voucher code (no auth needed) |
| `my_budget` | Remaining budget on your key |
| `my_status` | Health, key info, and recent activity |
| `my_recent_usage` | Last N requests with cost breakdown |
| `diagnose` | Diagnose a failing request |
| `quickstart` | Step-by-step onboarding for a new user |
| `redeem_voucher` | Turn a voucher into a usable key |
| `redeem_and_chat` | Redeem a voucher and immediately chat |
| `request_topup` | Ask your team admin for more budget |

All tool responses include `_meta.budget` so the host can show you remaining spend in real time.

## Install

You don't install this package globally. Your MCP host runs it on demand via `npx`. The configuration snippets below take care of everything.

You will need:

1. An Allotly API key (`allotly_sk_...`). [Get one here](https://allotly.ai/dashboard/keys), or [redeem a voucher](https://allotly.ai/redeem).
2. Node.js 18 or newer on your machine (for `npx` to work).

## Claude Desktop

Edit `claude_desktop_config.json`:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "allotly": {
      "command": "npx",
      "args": ["-y", "@allotly/mcp"],
      "env": {
        "ALLOTLY_KEY": "allotly_sk_..."
      }
    }
  }
}
```

Restart Claude Desktop. The Allotly tools will appear in the tools menu.

## Cursor

Edit `.cursor/mcp.json` in your project root (or `~/.cursor/mcp.json` for global):

```json
{
  "mcpServers": {
    "allotly": {
      "command": "npx",
      "args": ["-y", "@allotly/mcp"],
      "env": {
        "ALLOTLY_KEY": "allotly_sk_..."
      }
    }
  }
}
```

Open the Cursor command palette and run **MCP: Reload Servers**.

## Claude Code

Claude Code can speak HTTP MCP directly, so you don't strictly need this bridge — but if you prefer to use it for consistency:

```bash
claude mcp add allotly npx -y @allotly/mcp \
  --env ALLOTLY_KEY=allotly_sk_...
```

Or, the native HTTP path:

```bash
claude mcp add --transport http allotly https://allotly.ai/mcp \
  --header "Authorization: Bearer allotly_sk_..."
```

## VS Code (with the MCP extension)

Edit your VS Code `settings.json`:

```json
{
  "mcp.servers": {
    "allotly": {
      "command": "npx",
      "args": ["-y", "@allotly/mcp"],
      "env": {
        "ALLOTLY_KEY": "allotly_sk_..."
      }
    }
  }
}
```

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ALLOTLY_KEY` | yes | — | Your Allotly API key (`allotly_sk_...`). The bridge refuses to start without it. |
| `ALLOTLY_MCP_URL` | no | `https://allotly.ai/mcp` | Override the hosted endpoint. Useful for self-hosted Allotly or staging. |

## How it works

This package wraps [`mcp-remote`](https://www.npmjs.com/package/mcp-remote) — a generic stdio↔HTTP MCP bridge — and pre-configures it for Allotly. When your MCP host launches `npx -y @allotly/mcp`:

1. The bridge reads `ALLOTLY_KEY` from the environment your host passes in.
2. It spawns `mcp-remote` against `https://allotly.ai/mcp` with `Authorization: Bearer <ALLOTLY_KEY>`.
3. `stdin`/`stdout` are forwarded to your host transparently. JSON-RPC requests flow over HTTP to Allotly; responses flow back unchanged.
4. `stderr` from `mcp-remote` is prefixed with `[allotly-mcp]` so you can tell our diagnostic logs apart from the bridge's own.
5. `SIGINT` / `SIGTERM` are forwarded so the bridge exits cleanly when your host shuts down.

Your `allotly_sk_...` key never appears in `stdout`, never crosses host process boundaries beyond the spawned bridge, and never reaches the model providers — only Allotly sees it.

## Security notes

- **`ALLOTLY_KEY` is passed to `mcp-remote` on its command line** as `--header "Authorization: Bearer <key>"`. This means the key is briefly visible in process listings (`ps`, `/proc/<pid>/cmdline`, Activity Monitor) to **other processes running as the same OS user on the same machine**. It does not cross network or user boundaries. If you consider local-process-listing exposure a threat in your environment, do not use this bridge from that machine; instead, point your host directly at the HTTP endpoint (Claude Code supports this — see above).
- The key never appears on `stdout` and is never sent to the model providers — only to Allotly.
- A future release of this package will switch to `mcp-remote`'s programmatic API once it exposes a non-argv way to pass headers, eliminating the listing exposure entirely. Track [issue tracker](https://github.com/tiagomaranhaoalves/Allotly/issues) for updates.
- All other secret-handling guarantees of the hosted MCP server still apply: `voucher_info` is the only unauthenticated tool, redacted log lines never contain `allotly_sk_…`, and audit-log writes happen out of band.

## Troubleshooting

**`ALLOTLY_KEY is not set`** — Your host isn't passing the env var. Double-check the `env` block in your config matches the snippet exactly. Restart your host after editing.

**`Authentication failed` from `mcp-remote`** — Your key is invalid, expired, or revoked. Check the key on your [Allotly dashboard](https://allotly.ai/dashboard/keys).

**No tools appear in Claude Desktop** — Open the developer settings and check the MCP log. Most issues are JSON syntax errors in `claude_desktop_config.json`.

**Behind a corporate proxy** — `mcp-remote` honours the standard `HTTPS_PROXY` env var. Add it to the `env` block of your host config.

## Source

This is a thin bridge. The interesting code is the hosted server — its source and protocol details live in the [Allotly repo](https://github.com/tiagomaranhaoalves/Allotly).

## License

MIT — see [LICENSE](./LICENSE).
