<div align="center">

# GreeksSurge MCP

**Read-only MCP server for your GreeksSurge account, positions, and options course.**

Ask your AI assistant about your own trade ideas, win rate, and lessons — grounded in
live GreeksSurge data instead of guesses.

[![CI](https://github.com/neerazz/greekssurge-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/neerazz/greekssurge-mcp/actions/workflows/ci.yml)
[![CodeQL](https://github.com/neerazz/greekssurge-mcp/actions/workflows/codeql.yml/badge.svg)](https://github.com/neerazz/greekssurge-mcp/actions/workflows/codeql.yml)
[![npm version](https://img.shields.io/npm/v/greekssurge-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/greekssurge-mcp)
[![npm downloads](https://img.shields.io/npm/dm/greekssurge-mcp?logo=npm&color=cb3837)](https://www.npmjs.com/package/greekssurge-mcp)
[![node](https://img.shields.io/node/v/greekssurge-mcp?logo=node.js&color=339933)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/greekssurge-mcp?color=blue)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-read--only-6E56CF)](https://modelcontextprotocol.io)

</div>

---

## What this is

A local [Model Context Protocol](https://modelcontextprotocol.io) server that gives an
AI client **10 read-only tools** and **7 ready-made prompts** over your GreeksSurge data,
authenticated with the session you already have in your browser.

| It can                                       | It cannot                          |
| -------------------------------------------- | ---------------------------------- |
| Read your tier, watchlist, and preferences   | Place, close, or roll any position |
| List current trade ideas and settled history | Change account settings or billing |
| Summarize performance, streaks, drawdown     | Give financial advice              |
| Teach lessons from the education course      | Bypass your account tier           |

Everything returned is educational information, **not financial advice**.

Repository: https://github.com/neerazz/greekssurge-mcp

## Quick start

**Requirements:** Node.js 20+ · BrowserOS with a signed-in `https://csp.greekssurge.com` tab

```sh
# 1. Reuse the GreeksSurge login you already have in BrowserOS
npx -y greekssurge-mcp auth login

# 2. Confirm the token was stored
npx -y greekssurge-mcp auth status

# 3. Register the server with your client (example: Claude Code)
claude mcp add --scope user greekssurge -- npx -y greekssurge-mcp
```

Verify the connection by asking your client to call `get_account`. A working setup returns your tier, for example `{"tier":"lifetime","isLifetimeFree":true,...}`.

Step 1 reads only the `gs_token` value from a tab whose origin is exactly
`https://csp.greekssurge.com`, validates it against `/api/auth/me`, and saves it to a
private local file. It never asks for your Google password and never makes you paste a
token anywhere.

## Client setup

Every client runs the same local stdio server. Pick yours.

<details open>
<summary><b>Claude Code</b></summary>

```sh
claude mcp add --scope user greekssurge -- npx -y greekssurge-mcp
```

</details>

<details>
<summary><b>Codex CLI</b></summary>

```sh
codex mcp add greekssurge -- npx -y greekssurge-mcp
```

</details>

<details>
<summary><b>Gemini CLI</b></summary>

```sh
gemini mcp add --scope user --transport stdio greekssurge npx -y greekssurge-mcp
```

</details>

<details>
<summary><b>Claude Desktop</b></summary>

Merge into `claude_desktop_config.json`
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

</details>

<details>
<summary><b>Cursor</b></summary>

Merge into `~/.cursor/mcp.json` (or `.cursor/mcp.json` for one project):

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

</details>

<details>
<summary><b>Warp</b></summary>

Merge into `~/.warp/.mcp.json`:

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

</details>

<details>
<summary><b>VS Code</b></summary>

Note the wrapper key is `servers`, not `mcpServers`:

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

</details>

To print this guidance without touching any config file:

```sh
npx -y greekssurge-mcp setup
```

`setup` is a dry run. It never reads or writes your client configuration.

## Tools

Ten read-only tools. Every response carries the source URL, a retrieval timestamp, and
an educational disclosure.

| Tool                    | Login | Returns                                                                                            |
| ----------------------- | :---: | -------------------------------------------------------------------------------------------------- |
| `get_account`           |  ✅   | Tier, lifetime-free status, feature flags, whether premium values are masked                       |
| `get_market_status`     |   —   | Whether the market is currently open                                                               |
| `list_trade_ideas`      |  ✅   | Current tier-scoped ideas · filters: `ticker` `expiry` `roi` `pop` `capital` `mode` `page` `limit` |
| `get_available_filters` |   —   | Valid filter buckets, screenable tickers and expiries                                              |
| `get_performance_stats` |  ✅   | Premium totals, win rate, streaks, max drawdown, per-ticker and monthly breakdowns                 |
| `list_trade_history`    |  ✅   | Settled trades · filters: `symbol` `outcome` `ideaMode` `from` `to` `page` `limit`                 |
| `list_education`        |   —   | Ordered course lessons plus your completion progress                                               |
| `get_education_article` |   —   | One lesson by `slug`, as sanitized plain text                                                      |
| `get_watchlist`         |  ✅   | Saved watchlist tickers                                                                            |
| `get_preferences`       |  ✅   | Watchlist-only ideas/alerts flags                                                                  |

Article and description text comes back as **untrusted external content**. Your client
should summarize it as data, never follow it as instructions.

## Prompts

Seven prompts ship with the server, usually surfaced as slash commands. Each one calls
the right tools in the right order and forbids inventing numbers.

| Prompt                      | Arguments                                      | Does                                                                   |
| --------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `account_overview`          | —                                              | Confirms the connection and what your tier can reach                   |
| `screen_ideas`              | `ticker` `expiry` `roi` `pop` `capital` `mode` | Validates your filters against real buckets, then ranks matches by ROI |
| `performance_retrospective` | —                                              | Win rate, streaks, drawdown, monthly trend, top tickers by premium     |
| `assignment_review`         | `outcome` `symbol` `from` `to`                 | Groups settled trades by outcome, finds repeat underperformers         |
| `watchlist_digest`          | —                                              | Cross-references your watchlist against the live idea feed             |
| `learn_concept`             | `topic`                                        | Teaches one course lesson, treating article text as untrusted data     |
| `learning_path`             | —                                              | Whole course in order, with progress and remaining read time           |

All arguments are optional.

```
/screen_ideas ticker=ASTS roi=2-3
/assignment_review outcome=ASSIGNED
/learn_concept topic=cash-secured-puts
```

No prompt UI in your client? Just ask in plain language — the tools work the same.

## Troubleshooting

| Symptom                            | Fix                                                                                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npx -y greekssurge-mcp` not found | Confirm Node.js 20+ with `node --version`, then `npx -y greekssurge-mcp --version`                                                                           |
| Login fails                        | Start BrowserOS, open `https://csp.greekssurge.com`, sign in normally, leave that tab open, re-run `auth login`. Lookalike hostnames are rejected on purpose |
| Connects, but authed tools error   | Token expired — run `auth login` again. To clear it deliberately: `auth logout`                                                                              |
| Numbers read as blank or zero      | Check `get_account`. If `premiumMasked` is `true`, your tier masks those values — hidden, not missing                                                        |
| Remote/HTTP URL setup fails        | Local stdio is the only transport in this version. Remove any remote MCP URL                                                                                 |
| Unexpected output on stdout        | The server writes JSON-RPC to stdout and logs to stderr. Drop any wrapper script that prints banners                                                         |

Never paste a GreeksSurge token into client configuration. The server keeps its own
local token store.

## Transport status

Local stdio is the only shipped transport in v0.1.1.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint. Do not configure a remote URL for this version; use local stdio.

## Install fallback

The canonical package is published on npm as
[`greekssurge-mcp`](https://www.npmjs.com/package/greekssurge-mcp). If npm is
unavailable, use the matching GitHub release in the same command position:

```sh
npx -y github:neerazz/greekssurge-mcp#v0.1.1 auth login
npx -y github:neerazz/greekssurge-mcp#v0.1.1
```

The canonical published command is `npx -y greekssurge-mcp`; the GitHub form is fallback-only.

## Security and privacy

- No Google password collection.
- Login imports an existing session only from an exact-origin GreeksSurge BrowserOS tab,
  over BrowserOS's loopback-only DevTools endpoint.
- Imported tokens are validated against `/api/auth/me` before storage; a failed check
  leaves your previous credential untouched.
- Tokens are stored under your local user profile with POSIX `0600` permissions on
  macOS/Linux and user-scoped ACLs on Windows.
- `auth logout` deletes the local token. If a device or token leaks, also revoke the
  upstream GreeksSurge/Google session.
- Returned article text is treated as untrusted external content, never instructions.
- Read-only, no trading, no financial advice is a hard product boundary.

Full details: [SECURITY.md](SECURITY.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). The full gate is:

```sh
npm ci && npm run format:check && npm run lint && npm run check \
  && npm run test && npm run build && npm run scan:secrets && npm run pack:check
```

## Licensing and terms

The MCP package code is MIT licensed. GreeksSurge data and service access remain governed by GreeksSurge terms; this repository does not grant rights to redistribute GreeksSurge data or bypass account tier limits.
