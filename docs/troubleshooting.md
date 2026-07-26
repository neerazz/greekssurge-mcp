# Troubleshooting

## `npx -y greekssurge-mcp` is not found

Use Node.js 20+ and verify npm can run packages:

```sh
node --version
npm --version
npx -y greekssurge-mcp --version
```

Until npm publication, use the GitHub-package fallback explicitly:

```sh
npx -y github:neerazz/greekssurge-mcp#v0.1.0 --version
npx -y github:neerazz/greekssurge-mcp#v0.1.0 auth login
```

This fallback is only until npm publication. After npm publication, use `npx -y greekssurge-mcp`.

## Authentication times out

Run:

```sh
npx -y greekssurge-mcp auth login
```

Complete Google login in the Chromium window opened by the CLI. Do not paste a token into your MCP client config. The CLI does not collect your Google password.

If the browser does not open, install Chrome/Chromium/Edge or set `BROWSER_EXECUTABLE` to an installed Chromium-family browser.

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
