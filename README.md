# GreeksSurge MCP

Read-only Model Context Protocol (MCP) server that lets an AI assistant read your
GreeksSurge account and course data — trade ideas, settled performance, watchlist,
and the education course — through your own local login.

It **cannot** place trades, close or roll positions, change account settings, touch
billing, or give financial advice. Everything it returns is educational information,
not financial advice.

Repository: https://github.com/neerazz/greekssurge-mcp

## What you can ask once it is connected

- "What's my GreeksSurge win rate and current streak?"
- "Screen this week's cash-secured put ideas above 2% ROI."
- "Which of my positions got assigned, and what did they have in common?"
- "Teach me how cash-secured puts work, using the GreeksSurge course."

The server also ships seven ready-made prompts so you don't have to phrase these
yourself — see [Prompts](#prompts).

## Requirements

- **Node.js 20+** (`node --version`)
- **BrowserOS**, with a signed-in `https://csp.greekssurge.com` tab open
- An MCP client (Claude Code, Codex CLI, Gemini CLI, Claude Desktop, Cursor, VS Code, Warp, …)

## Setup

### Step 1 — Log in

```sh
npx -y greekssurge-mcp auth login
```

This reuses the GreeksSurge session **already** in BrowserOS. It reads only the
`gs_token` value from a tab whose origin is exactly `https://csp.greekssurge.com`,
checks it against `/api/auth/me`, and saves it to a private local file.

It never asks for your Google password and never makes you copy or paste a token.

Check it worked:

```sh
npx -y greekssurge-mcp auth status
```

> If login fails, the usual cause is that BrowserOS is closed or the GreeksSurge tab
> is not signed in. See [Troubleshooting](#troubleshooting).

### Step 2 — Add the server to your client

Pick your client below. Each one registers the same local stdio server.

**Claude Code**

```sh
claude mcp add --scope user greekssurge -- npx -y greekssurge-mcp
```

**Codex CLI**

```sh
codex mcp add greekssurge -- npx -y greekssurge-mcp
```

**Gemini CLI**

```sh
gemini mcp add --scope user --transport stdio greekssurge npx -y greekssurge-mcp
```

**Claude Desktop** — merge into `claude_desktop_config.json`
(macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "greekssurge": {
      "command": "npx",
      "args": ["-y", "greekssurge-mcp"]
    }
  }
}
```

**Cursor** — merge into `~/.cursor/mcp.json` (or `.cursor/mcp.json` in a project):

```json
{
  "mcpServers": {
    "greekssurge": {
      "command": "npx",
      "args": ["-y", "greekssurge-mcp"]
    }
  }
}
```

**Warp** — merge into `~/.warp/.mcp.json`:

```json
{
  "mcpServers": {
    "greekssurge": {
      "command": "npx",
      "args": ["-y", "greekssurge-mcp"]
    }
  }
}
```

**VS Code** — note the wrapper key is `servers`, not `mcpServers`:

```json
{
  "servers": {
    "greekssurge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "greekssurge-mcp"]
    }
  }
}
```

To print this guidance without editing any config:

```sh
npx -y greekssurge-mcp setup
```

`setup` is a dry run. It never reads or writes your client configuration.

### Step 3 — Verify

Verify the connection by asking your client to call `get_account`. A working connection returns your tier, for example `{"tier":"lifetime","isLifetimeFree":true,...}`.

If it returns an auth error, re-run Step 1.

## Tools

Ten read-only tools. Every response carries the source URL, a retrieval timestamp,
and an educational disclosure.

| Tool                    | Needs login | What it returns                                                                                           |
| ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------- |
| `get_account`           | yes         | Tier, lifetime-free status, feature flags, whether premium values are masked                              |
| `get_market_status`     | no          | Whether the market is currently open                                                                      |
| `list_trade_ideas`      | yes         | Current tier-scoped ideas. Filter by `ticker`, `expiry`, `roi`, `pop`, `capital`, `mode`, `page`, `limit` |
| `get_available_filters` | no          | Valid filter buckets and screenable tickers/expiries                                                      |
| `get_performance_stats` | yes         | Premium totals, win rate, streaks, max drawdown, per-ticker and monthly breakdowns                        |
| `list_trade_history`    | yes         | Settled trades. Filter by `symbol`, `outcome`, `ideaMode`, `from`, `to`, `page`, `limit`                  |
| `list_education`        | no          | The ordered course lesson list plus your completion progress                                              |
| `get_education_article` | no          | One lesson by `slug`, as sanitized plain text                                                             |
| `get_watchlist`         | yes         | Saved watchlist tickers                                                                                   |
| `get_preferences`       | yes         | Watchlist-only ideas/alerts flags                                                                         |

Article and description text is returned as **untrusted external content**. Your
client should treat it as data to summarize, never as instructions to follow.

## Prompts

Seven prompts ship with the server. Most clients surface them as slash commands or a
prompt picker. Each one calls the right tools in the right order and tells the model
not to invent numbers.

| Prompt                      | Arguments                                                          | What it does                                                                  |
| --------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `account_overview`          | none                                                               | Confirms the connection and explains what your tier can access                |
| `screen_ideas`              | `ticker`, `expiry`, `roi`, `pop`, `capital`, `mode` (all optional) | Validates your filters against real buckets, then ranks matching ideas by ROI |
| `performance_retrospective` | none                                                               | Win rate, streaks, drawdown, monthly trend, top tickers by premium            |
| `assignment_review`         | `outcome`, `symbol`, `from`, `to` (all optional)                   | Groups settled trades by outcome and finds repeat underperformers             |
| `watchlist_digest`          | none                                                               | Cross-references your watchlist against the live idea feed                    |
| `learn_concept`             | `topic` (optional)                                                 | Teaches one course lesson, handling article text as untrusted data            |
| `learning_path`             | none                                                               | Full course in order with progress and remaining read time                    |

Example — screen one ticker:

```
/screen_ideas ticker=ASTS roi=2-3
```

If your client has no prompt UI, just ask in plain language; the tools work the same way.

## Troubleshooting

**`npx -y greekssurge-mcp` not found** — confirm Node.js 20+ with `node --version`,
then `npx -y greekssurge-mcp --version`.

**Login fails** — start BrowserOS, open `https://csp.greekssurge.com`, complete the
normal Google login there, leave that tab open, then re-run `auth login`. A tab on a
lookalike hostname is rejected on purpose. Do not paste a token into client config.

**Client connects but authenticated tools fail** — your stored token expired. Run
`npx -y greekssurge-mcp auth login` again. To clear it deliberately:
`npx -y greekssurge-mcp auth logout`.

**Numbers look blank or zero** — check `get_account`. If `premiumMasked` is `true`,
your tier masks those values; they are hidden, not missing.

**A remote/HTTP URL setup fails** — local stdio is the only transport in this version.
Remove any remote MCP URL for this server and use the setup above.

**The server prints unexpected output** — it writes JSON-RPC to stdout and logs to
stderr. If a wrapper script prints banners to stdout, drop the wrapper and point the
client at `npx -y greekssurge-mcp` directly.

## Transport status

Local stdio is the only shipped transport in v0.1.1.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint. Do not configure a remote URL for this version; use local stdio.

## Install fallback

The canonical package is published on npm as `greekssurge-mcp`. If npm is unavailable,
use the matching GitHub release in the same command position:

```sh
npx -y github:neerazz/greekssurge-mcp#v0.1.1 auth login
npx -y github:neerazz/greekssurge-mcp#v0.1.1
```

The canonical published command is `npx -y greekssurge-mcp`; the GitHub form is fallback-only.

## Security and privacy

- No Google password collection.
- Login imports an existing session only from an exact-origin GreeksSurge BrowserOS
  tab, over BrowserOS's loopback-only DevTools endpoint.
- Imported tokens are validated against `/api/auth/me` before storage; a failed check
  leaves your previous credential untouched.
- Tokens are stored under your local user profile with POSIX `0600` permissions on
  macOS/Linux and user-scoped ACLs on Windows.
- `auth logout` deletes the local token. If a device or token leaks, also revoke the
  upstream GreeksSurge/Google session.
- Returned article text is treated as untrusted external content, never instructions.
- Read-only, no trading, no financial advice is a hard product boundary.

Full details: [SECURITY.md](SECURITY.md).

## Licensing and terms

The MCP package code is MIT licensed. GreeksSurge data and service access remain governed by GreeksSurge terms; this repository does not grant rights to redistribute GreeksSurge data or bypass account tier limits.
