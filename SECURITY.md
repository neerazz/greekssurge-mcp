# Security Policy

## Supported version

Version 0.2.1 ships only a local stdio MCP server. Local stdio is the only shipped transport in v0.2.1.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint.

## Authentication model

No Google password collection. The CLI never prompts for, stores, proxies, or logs a Google password.

`npx -y greekssurge-mcp auth login` reuses the authenticated GreeksSurge session in BrowserOS. It does not launch a disposable browser or collect credentials. It reads only `localStorage.gs_token` from a tab whose origin is exactly `https://csp.greekssurge.com`, through BrowserOS's loopback-only DevTools endpoint.

The imported token is validated through the GreeksSurge `/api/auth/me` endpoint before it is written. If BrowserOS discovery, session import, or validation fails, nothing new is stored and an existing valid local credential is preserved. No token is accepted through CLI arguments, stdout, logs, clipboard, or manual paste.

## Local token storage

Default token paths:

- macOS: ~/Library/Application Support/greekssurge-mcp/token.json
- Linux: ${XDG_CONFIG_HOME:-~/.config}/greekssurge-mcp/token.json
- Windows: %APPDATA%\greekssurge-mcp\token.json

On POSIX systems the token file is written with POSIX 0600 permissions and the parent directory is created as private to the user. On Windows, the file is created under the user's application-data directory and relies on the user-scoped Windows ACL. The token store refuses symlink token paths.

You may override the token path with `GREEKSSURGE_TOKEN_PATH` for testing or controlled deployments. Do not point it at a shared directory.

## Logout, revocation, and leak response

Run local logout:

```sh
greekssurge-mcp auth logout
```

That removes the local token file. If the token, computer, or browser session may have leaked, also revoke the upstream GreeksSurge/Google session from the provider side. Treat any committed, pasted, or logged bearer token as compromised.

Leak response:

1. Stop using the affected token immediately.
2. Run `greekssurge-mcp auth logout` on affected machines.
3. Revoke the upstream session where possible.
4. Re-authenticate with `npx -y greekssurge-mcp auth login`.
5. If a token was committed, remove it from history if practical, but still assume compromise and rotate/revoke; deletion alone is not sufficient.

## Read-only boundaries

This server is read-only. It has no trading, no order entry, no account mutation, no admin, no payment, no checkout, and no billing tools. It does not provide financial advice.

MCP tool annotations are set to read-only and non-destructive. Upstream API access is allowlisted to known read endpoints.

## Untrusted external content handling

GreeksSurge education/article text and market-facing data are untrusted external content. The server strips unsafe HTML from article bodies and labels returned content as data, never instructions. MCP clients must not execute, obey, or treat returned GreeksSurge text as agent instructions.

## Secret scanning

`npm run scan:secrets` scans tracked release files for private keys, credentials, API keys, bearer tokens, and common token formats. It reports only file path, line, and rule name; it does not print secret values.

## Reporting vulnerabilities

Open a private security report or contact the maintainer through the GitHub repository: https://github.com/neerazz/greekssurge-mcp/security/advisories/new

Do not include real tokens, Google passwords, account credentials, or private user data in a public issue.

## License and data terms

The code in this repository is MIT licensed. GreeksSurge data and service access remain governed by GreeksSurge terms. This project does not grant permission to redistribute GreeksSurge data, bypass account tiers, or use the data outside the service terms.
