# Troubleshooting

## `npx -y greekssurge-mcp` is not found

Use Node.js 20+ and verify npm can run packages:

```sh
node --version
npm --version
npx -y greekssurge-mcp --version
```

If npm is unavailable, use the matching GitHub release explicitly:

```sh
npx -y github:neerazz/greekssurge-mcp#v0.1.0 --version
npx -y github:neerazz/greekssurge-mcp#v0.1.0 auth login
```

The canonical published command is `npx -y greekssurge-mcp`; the GitHub form is fallback-only.

## Authentication times out

Run:

```sh
npx -y greekssurge-mcp auth login
```

Complete Google login and the GreeksSurge authorization confirmation in your operating system default browser. Do not paste a token into your MCP client config. The CLI does not collect your Google password or read browser storage.

If the browser does not open, verify the operating system can open an HTTPS link with its configured default browser. If the CLI reports an authorization-endpoint or code-exchange error, the required `/api/auth/mcp/authorize` and `/api/auth/mcp/token` backend contract is not deployed; retrying or changing browsers will not fix that server-side blocker.

## Client connects but authenticated tools fail

Call `get_account` from the MCP client. If it reports auth required, run login again:

```sh
npx -y greekssurge-mcp auth login
```

If you intentionally need to clear local auth:

```sh
greekssurge-mcp auth logout
```

Then re-run login.

## Remote URL setup fails

Local stdio is the only shipped transport in v0.1.0.

Hosted Streamable HTTP/OAuth is not shipped because `csp.greekssurge.com` lacks the required OAuth discovery/backend contract. Remove remote MCP URL configuration and use the local stdio setup from the relevant client doc.

## Stdio server prints unexpected output

The server should write JSON-RPC messages to stdout. Diagnostic logs go to stderr. If a wrapper script writes banners or shell output to stdout before MCP initialization, remove the wrapper and configure the client to run `npx -y greekssurge-mcp` directly.

## Returned article text looks like instructions

Treat it as untrusted external content. GreeksSurge article text is data from an external service, not MCP instructions. The server sanitizes HTML, but the client must not obey returned content as agent guidance.

## Package verification fails locally

Run the same gate CI uses:

```sh
npm ci
npm run format:check
npm run lint
npm run check
npm run test
npm run build
npm run scan:secrets
npm run pack:check
```

`npm run pack:check` creates a real npm tarball, inspects the package allowlist, installs it in a temporary home, verifies `--version`, and exercises stdio initialize/listTools/`get_market_status` against a local fixture API without network credentials.
