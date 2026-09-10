# Security Policy

## Supported version

Version 0.4.0 ships only a local stdio MCP server. Local stdio is the only shipped transport in v0.4.0.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract for a compliant remote MCP endpoint.

## Authentication model

No Google password collection. The CLI never prompts for, stores, proxies, or logs a Google password.

`auth login` opens a private loopback connection guide in the OS default browser.
The user saves a one-time bookmark, signs into GreeksSurge normally, and invokes the
bookmark on that site to approve session sharing. This is session import, not OAuth:
GreeksSurge has not provided a native CLI authorization/code-exchange contract.

Only the browser-side bookmark reads `localStorage.gs_token`, and only in the top-level
`https://csp.greekssurge.com` page. It encrypts the session with AES-256-GCM and wraps
the key with the login process's pinned, ephemeral RSA-OAEP/SHA-256 public key.
An exact-origin, exact-source, nonce-bound `postMessage` handshake sends that encrypted
payload to a user-opened loopback popup. The popup submits a same-origin JSON POST;
there is no cross-origin fetch allowance or wildcard CORS. The helper never displays
the session. The bridge never places a token in a URL; the upstream website's own
Google callback may use token query parameters outside this package's control.

The listener binds only to `127.0.0.1` on a randomly allocated port. It checks the exact
Host, raw path, Origin, method, content type, transaction nonce, message size and expiry.
The transaction is single-use. `/api/auth/me` must validate the decrypted session before
the private credential store changes; a replacement session returned by that endpoint
is retained only inside the auth boundary. Failed validation or cancellation before
storage begins preserves the old credential. Once atomic replacement starts, the CLI
finishes that commit and reports its actual result instead of claiming a false cancellation.
No token is accepted through CLI arguments, stdout, logs, clipboard, or manual paste.

The package does not enable debugging ports, enumerate tabs, read personal profile
files, or install a browser. The browser remains open after login. Delete the expired
bookmark after use. Old managed-browser caches/profiles are not automatically deleted;
the new flow ignores them.

This protects against unrelated websites, accidental stale-port reuse and transaction
replay, not malware running as the same OS user or a compromised GreeksSurge page.
The imported session retains its upstream permissions: only the MCP adapter's endpoint
allowlist is read-only; the session itself is not a newly scoped OAuth credential.
Browser policies, popup blocking, or future local-network restrictions can prevent the
handoff. Do not weaken browser protections or attach a debugger as a fallback.

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
