# Architecture

## v0.1.0 transport

Local stdio is the only shipped transport in v0.1.0.

The package starts an MCP server over the process stdin/stdout transport. Each MCP client launches the server locally through `npx -y greekssurge-mcp`. There is no hosted MCP endpoint in this release.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint. Specifically, a hosted MCP service would need server-side OAuth discovery, client registration or equivalent trust policy, callback handling, token exchange/storage semantics, and an authorization boundary that is documented and testable. Those pieces are not present in the current GreeksSurge backend contract, so the release intentionally avoids pretending remote transport exists.

## Components

1. CLI entrypoint (`greekssurge-mcp`): routes `serve`, `auth`, and `setup` commands.
2. Local auth flow: opens a dedicated temporary Chromium profile for GreeksSurge Google login.
3. Token store: validates the captured token through `/api/auth/me` and stores it under the user's OS config directory.
4. API client: issues only allowlisted GET requests to GreeksSurge read endpoints.
5. MCP tool registry: exposes read-only tools with read-only annotations and stable output schemas.
6. Stdio transport: connects the MCP server to a local client over stdin/stdout.

## Data flow

```text
MCP client
  -> local stdio process: npx -y greekssurge-mcp
  -> MCP tool registry
  -> GreeksSurge API client
  -> https://csp.greekssurge.com read endpoint
  -> stable MCP structured content
  -> MCP client
```

Authentication data is not placed in client configuration. The client config only launches `npx`; the server reads its own local token store.

## Auth and privacy design

No Google password collection occurs. The CLI uses a dedicated temporary Chromium profile and reads the token from exact-origin localStorage only after the login flow returns to `https://csp.greekssurge.com`. It then validates the token through `/api/auth/me` before writing it.

The temporary Chromium profile is removed when login finishes or fails. The default token path is OS-specific and user-scoped:

- macOS: `~/Library/Application Support/greekssurge-mcp/token.json`
- Linux: `${XDG_CONFIG_HOME:-~/.config}/greekssurge-mcp/token.json`
- Windows: `%APPDATA%\greekssurge-mcp\token.json`

## Security boundaries

The server is read-only/no trading/no financial advice. It does not expose mutation, admin, billing, payment, checkout, order-entry, or trade-execution tools.

Returned GreeksSurge article text is untrusted external content. It is sanitized and returned as data, never as instructions. Clients should preserve that boundary.

## License and data terms

The package code is MIT licensed. GreeksSurge data and service access remain governed by GreeksSurge terms, including any account tier and redistribution restrictions.
