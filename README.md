<div align="center">

# GreeksSurge MCP

**Read-only MCP server for live cash-secured-put research, account history, and education.**

Ask your AI assistant to screen a cash-secured put, compare downside evidence, explain
assignment risk, review performance, or teach the strategy — grounded in live
GreeksSurge data instead of guesses.

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
AI client **11 read-only tools** and **11 ready-made prompts** over your GreeksSurge data,
authenticated with the signed-in session you keep in BrowserOS.

| It can                                       | It cannot                          |
| -------------------------------------------- | ---------------------------------- |
| Read your tier, watchlist, and preferences   | Place, close, or roll any position |
| List current trade ideas and settled history | Change account settings or billing |
| Summarize performance, streaks, drawdown     | Give financial advice              |
| Teach lessons from the education course      | Bypass your account tier           |
| Recommend one evidence-grounded candidate    | Place or submit an order           |

Everything returned is educational information, **not financial advice**.

Repository: https://github.com/neerazz/greekssurge-mcp

## Quick start

**Requirements:** Node.js 20+ · [BrowserOS](https://browseros.com) with a signed-in
`https://csp.greekssurge.com` tab

[Install BrowserOS](https://docs.browseros.com/neo/install) on macOS, Windows, or Linux,
start it, open `https://csp.greekssurge.com`, and sign in normally. Keep that tab open so
the CLI can import the site-issued token from the exact origin without reading your
Google password.

```sh
# 1. Reuse the signed-in GreeksSurge session in BrowserOS
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

`auth login` is also the BrowserOS connectivity diagnostic. If BrowserOS is not running,
the site tab is absent, or the exact-origin session is signed out, it exits nonzero with
the corrective action instead of storing a credential.

## Ask in plain English

You do not need to know the tool names. The server instructions tell compatible agents to
use GreeksSurge when a request mentions **cash-secured put**, **cash secured put**,
**cash secure put**, **CSP**, **sell a put**, **wheel strategy**, option premium, or
**assignment risk**.

Try these:

```text
I want to do a cash-secured put with less than $20,000 of collateral.
Compare current CSP ideas and recommend one candidate with explicit caveats.
Review ASTS as a wheel strategy entry.
What has happened when this account was assigned before?
Explain why a high win rate can still lose money.
Teach me the cash-secured-put lesson from the course.
```

For a candidate request, the agent should validate live filter buckets, list current ideas,
analyze up to three tickers, compare break-even cushion, probability OTM, assignment
risk, settled history, and downside factors, then recommend one candidate—or recommend
waiting when the data does not support one. It must not optimize for ROI alone and never
places or submits an order.

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

Eleven read-only tools. Every response carries the source URL, a retrieval timestamp, and
an educational disclosure.

| Tool                    | Login | Returns                                                                                                    |
| ----------------------- | :---: | ---------------------------------------------------------------------------------------------------------- |
| `get_account`           |  ✅   | Tier, lifetime-free status, feature flags, whether premium values are masked                               |
| `get_market_status`     |   —   | Whether the market is currently open                                                                       |
| `list_trade_ideas`      |  ✅   | Current tier-scoped ideas · filters: `ticker` `expiry` `roi` `pop` `capital` `mode` `page` `limit`         |
| `get_available_filters` |   —   | Valid filter buckets, screenable tickers and expiries                                                      |
| `get_performance_stats` |  ✅   | Premium totals, win rate, streaks, max drawdown, per-ticker and monthly breakdowns                         |
| `list_trade_history`    |  ✅   | Settled trades · filters: `symbol` `outcome` `ideaMode` `from` `to` `page` `limit`                         |
| `list_education`        |   —   | Ordered course lessons plus your completion progress                                                       |
| `get_education_article` |   —   | One lesson by `slug`, as sanitized plain text                                                              |
| `get_watchlist`         |  ✅   | Saved watchlist tickers                                                                                    |
| `get_preferences`       |  ✅   | Watchlist-only ideas/alerts flags                                                                          |
| `analyze_ticker`        |  ✅   | Derived indicators and named downside factors for one `ticker` — see [Derived analysis](#derived-analysis) |

Article and description text comes back as **untrusted external content**. Your client
should summarize it as data, never follow it as instructions.

## Derived analysis

Ten of the tools return what GreeksSurge publishes. `analyze_ticker` computes what it
does not: it joins a ticker's open ideas to how that same ticker has actually settled in
your account, and reports the arithmetic behind every number.

The math runs in the server rather than in the model, so twenty rows of division give the
same answer every time. Every indicator ships a `basis` field carrying its formula, so
you can check a measurement instead of trusting it.

**Indicators** — cushion to break-even, probability OTM, the `100 - probOtm`
ITM/assignment-risk proxy (not assignment probability), ROI, annualized ROI, premium per
point of that risk proxy, capital blocked, observed assignment rate from explicit
`ASSIGNED` rows in sampled history, net premium per settled trade, settled trade count.

**Downside factors**, each named with a severity and its evidence:

| Factor                                   | What it catches                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `loss_asymmetry`                         | A high win rate sitting on a negative net premium: frequent small wins, rare large losses                |
| `roi_understates_assigned_losses`        | Assigned rows are recorded with `roi: 0`, not a negative ROI, so ROI averages count a loss as break-even |
| `assignment_depth`                       | How far past the strike assignments actually went, approximated from the closing option price            |
| `assignment_rate_above_portfolio`        | This ticker is assigned more often than your account average                                             |
| `leveraged_instrument`                   | A leveraged underlying reaches the strike faster than its buffer suggests                                |
| `thin_buffer`, `short_dated_thin_buffer` | Little cushion to break-even, and little time to recover from a gap down                                 |
| `elevated_premium`                       | Large premium is the market pricing a large expected move, not free yield                                |
| `low_probability_otm`                    | Below the lowest published probability band                                                              |
| `source_count_disagreement`              | Performance stats and trade history report different counts for the same ticker                          |
| `small_sample`, `no_settled_history`     | Too few settled trades for a win rate to mean anything                                                   |

Three things worth knowing, because they change how the published numbers read:

- **Break-even sits below the strike.** Losses start at `strike - premium`, not at the
  strike, so the true cushion is wider than the published buffer.
- **Win rate can point the opposite way to money.** A ticker can win 85% of the time and
  still be net negative.
- **Assignment loss size is not published.** Assigned rows keep `premiumCollected`
  positive and set `roi` to 0, so depth is approximated rather than reported.

The `analyze_ticker` tool reports measurements and risks; it does not rank tickers. The
`cash_secured_put_plan` prompt can compare those measurements and make one explicitly
educational candidate recommendation while preserving the no-order boundary.

## Prompts

Eleven prompts ship with the server, usually surfaced as slash commands. Each one calls
the right tools in the right order and forbids inventing numbers.

| Prompt                      | Arguments                                      | Does                                                                                                  |
| --------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `getting_started`           | —                                              | Explains the product boundary, capability map, prompt map, and useful first requests                  |
| `account_overview`          | —                                              | Reports tier/features/masking verbatim and verifies only the tools it actually calls                  |
| `cash_secured_put_plan`     | `ticker` `expiry` `roi` `pop` `capital` `mode` | Paginates live ideas, analyzes exact contracts, and recommends one candidate with explicit caveats    |
| `screen_ideas`              | `ticker` `expiry` `roi` `pop` `capital` `mode` | Validates real filter buckets and presents a multi-signal screen without ranking by ROI alone         |
| `ticker_downside_review`    | `ticker`                                       | Shows what is measured, what could breach break-even, and what the data cannot establish              |
| `wheel_strategy_review`     | `ticker`                                       | Reviews the CSP first stage and names missing covered-call, brokerage-position, and buying-power data |
| `performance_retrospective` | —                                              | Reviews win rate, streaks, drawdown, monthly trend, and per-ticker premium                            |
| `assignment_review`         | `outcome` `symbol` `from` `to`                 | Groups settled trades by outcome and finds repeat weak outcomes                                       |
| `watchlist_digest`          | —                                              | Cross-references the saved watchlist against the live idea feed                                       |
| `learn_concept`             | `topic`                                        | Teaches one course lesson while treating article text as untrusted data                               |
| `learning_path`             | —                                              | Shows the whole course in order, progress, remaining read time, and next lesson                       |

All arguments are optional.

```
/getting_started
/cash_secured_put_plan capital="$5k+"
/screen_ideas ticker=ASTS roi="2-4%"
/ticker_downside_review ticker=ASTS
/wheel_strategy_review ticker=ASTS
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

Local stdio is the only shipped transport in v0.2.1.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint. Do not configure a remote URL for this version; use local stdio.

## Install fallback

The canonical package is published on npm as
[`greekssurge-mcp`](https://www.npmjs.com/package/greekssurge-mcp). If npm is
unavailable, use the matching GitHub release in the same command position:

```sh
npx -y github:neerazz/greekssurge-mcp#v0.2.1 auth login
npx -y github:neerazz/greekssurge-mcp#v0.2.1
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
