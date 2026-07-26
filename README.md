# GreeksSurge MCP

Read-only Model Context Protocol (MCP) server for GreeksSurge account and educational data.

This package ships a local stdio MCP server for v0.1.0. It lets an MCP client read GreeksSurge data through your own local authenticated session. It cannot place trades, change account settings, manage billing, or provide financial advice; returned content is not financial advice.

Repository: https://github.com/neerazz/greekssurge-mcp

## Shortest path

Prerequisite: Node.js 20+.

1. Authenticate locally:

```sh
npx -y greekssurge-mcp auth login
```

The login command opens GreeksSurge in a dedicated temporary Chromium profile. Complete Google login there. The CLI never asks for or collects your Google password.

2. Add the local stdio server to your MCP client:

```sh
npx -y greekssurge-mcp
```

Use the client-specific command or JSON from the setup docs below.

3. Verify the connection from your MCP client by calling `get_account`.

Until npm publication, use this GitHub-package fallback explicitly in the same command position:

```sh
npx -y github:neerazz/greekssurge-mcp#v0.1.0 auth login
npx -y github:neerazz/greekssurge-mcp#v0.1.0
```

The GitHub fallback is labeled fallback-only until npm publication; after npm publication the canonical package spec is `greekssurge-mcp`.

## Client setup docs

- [Claude Code](docs/clients/claude-code.md)
- [Codex CLI](docs/clients/codex.md)
- [Gemini CLI](docs/clients/gemini.md)
- [Claude Desktop](docs/clients/claude-desktop.md)
- [Cursor](docs/clients/cursor.md)
- [VS Code](docs/clients/vscode.md)

You can also print setup guidance without changing any client config:

```sh
npx -y greekssurge-mcp setup
```

## Transport status

Local stdio is the only shipped transport in v0.1.0.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint. Do not configure a remote URL for this version; use local stdio.

See docs/architecture.md for the transport decision and docs/troubleshooting.md for setup failures.

## Tools

All tools are read-only and return structured content with source, retrieval time, and an educational disclosure.

- `get_account` — connected account tier and feature flags; requires auth.
- `get_market_status` — public market open/closed status.
- `list_trade_ideas` — tier-scoped ideas; requires auth.
- `get_available_filters` — public filter values.
- `get_performance_stats` — tier-scoped performance statistics; requires auth.
- `list_trade_history` — settled tier-scoped history; requires auth.
- `list_education` — public education index.
- `get_education_article` — one education article as sanitized untrusted external content.
- `get_watchlist` — connected account watchlist; requires auth.
- `get_preferences` — connected account preferences; requires auth.

## Security and privacy summary

- No Google password collection.
- Local login uses a dedicated temporary Chromium profile.
- The CLI reads the GreeksSurge token only from exact-origin `localStorage` after Google login returns to `https://csp.greekssurge.com`.
- Captured tokens are validated against `/api/auth/me` before storage.
- Tokens are stored per OS under the local user profile with POSIX `0600` permissions on macOS/Linux and user-scoped Windows ACLs on Windows.
- `greekssurge-mcp auth logout` deletes the local token; revoke the upstream GreeksSurge/Google session if a device or token leaks.
- Returned article text is treated as untrusted external content, never instructions.
- Read-only/no trading/no financial advice is a hard product boundary.

Full details: [SECURITY.md](SECURITY.md).

## Licensing and terms

The MCP package code is MIT licensed. GreeksSurge data and service access remain governed by GreeksSurge terms; this repository does not grant rights to redistribute GreeksSurge data or bypass account tier limits.
