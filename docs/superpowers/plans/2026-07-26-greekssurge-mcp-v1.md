# GreeksSurge MCP v1 Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Publish one read-only GreeksSurge MCP package that runs locally over stdio and remotely over OAuth-protected Streamable HTTP, with Google-backed GreeksSurge account authentication and verified setup paths for major MCP clients.

**Architecture:** A transport-neutral `McpServer` factory registers one stable tool set over a typed GreeksSurge API adapter. Local mode uses the operating system default browser, an ephemeral `127.0.0.1` callback, state, and S256 PKCE to obtain a one-time code; the CLI exchanges and validates the user token before writing it to a user-only token store. Remote mode accepts a per-user bearer token issued by the planned GreeksSurge OAuth 2.1 authorization server and validates it through `/api/auth/me`. stdio and HTTP are thin adapters around the same server/tool registry.

**Tech Stack:** Node.js 20+, TypeScript ESM, `@modelcontextprotocol/sdk@1.29.0`, Zod 4, Vitest, Node HTTP/crypto/child-process primitives, npm packaging, GitHub Actions.

**Approved spec:** `docs/superpowers/specs/2026-07-26-greekssurge-mcp-design.md`

**Primary sources:**
- MCP server guide: https://modelcontextprotocol.io/docs/develop/build-server
- MCP transports, latest specification: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP authorization, latest specification: https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- MCP TypeScript SDK 1.29.0 package/source: https://github.com/modelcontextprotocol/typescript-sdk
- Claude MCP docs: https://code.claude.com/docs/en/mcp
- Codex MCP docs: https://developers.openai.com/codex/mcp/

---

### Task 1: Scaffold a publishable ESM package

**Objective:** Create the minimum build/test/package surface before production code.

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.npmignore`
- Create: `src/index.ts`
- Create: `tests/package-metadata.test.ts`

**Steps:**
1. Write a failing metadata test asserting package name `greekssurge-mcp`, Node engine `>=20`, ESM type, `bin.greekssurge-mcp = dist/cli.js`, and that only `dist`, `README.md`, `LICENSE`, and required docs are published.
2. Run `npm test -- tests/package-metadata.test.ts`; expect failure because metadata is absent.
3. Add scripts: `build`, `check`, `test`, `test:coverage`, `lint`, `format:check`, `pack:check`, and `start`.
4. Add runtime dependencies: `@modelcontextprotocol/sdk@1.29.0` and `zod@4`; add TypeScript/Vitest/ESLint/Prettier type dependencies.
5. Set exports to `./dist/index.js` and bin to `./dist/cli.js`; compile with `tsc` and preserve executable shebang.
6. Run `npm install`, `npm test`, `npm run build`, and `npm pack --dry-run`; expect all green and no source/tests in the package.
7. Commit: `chore: scaffold publishable MCP package`.

### Task 2: Define configuration and secret-safe logging

**Objective:** Centralize every runtime setting and make token leakage testable.

**Files:**
- Create: `src/config.ts`
- Create: `src/logger.ts`
- Create: `tests/config.test.ts`
- Create: `tests/logger.test.ts`

**Steps:**
1. Write failing tests for defaults (`https://csp.greekssurge.com`, stdio, localhost HTTP bind), environment overrides, invalid URLs/ports, and redaction of `Authorization`, `gs_token`, JWT-like strings, query tokens, and email addresses.
2. Implement a Zod-backed `loadConfig(env = process.env)` returning:

```ts
export interface AppConfig {
  apiBaseUrl: URL;
  authIssuerUrl: URL;
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  allowedHosts: string[];
  tokenPath: string;
}
```

3. Implement structured stderr-only logging for stdio. Never log request headers, response bodies, token-store contents, or OAuth query strings.
4. Run focused tests, then `npm run check`.
5. Commit: `feat: add validated configuration and redacted logging`.

### Task 3: Freeze upstream API contracts with Zod

**Objective:** Convert the observed private API into explicit, drift-detectable contracts.

**Files:**
- Create: `src/api/schemas.ts`
- Create: `src/api/types.ts`
- Create: `tests/fixtures/api/*.json`
- Create: `tests/api-schemas.test.ts`

**Steps:**
1. Create sanitized fixtures for `/api/status`, `/api/auth/me`, `/api/ideas`, `/api/filters`, `/api/stats`, `/api/history`, `/api/trade-history`, `/api/education`, one education article, watchlist, and preferences. Fixtures contain no real token, private email, or hidden premium text.
2. Write tests that each schema accepts its fixture, strips/rejects undeclared sensitive fields, and fails with an endpoint-specific drift error when required keys change.
3. Implement schemas with bounded arrays and tolerant optional fields where the live anonymous response already varies.
4. Define stable MCP-facing DTOs separately from upstream response types; do not return raw upstream objects.
5. Run `npm test -- tests/api-schemas.test.ts`.
6. Commit: `feat: define GreeksSurge API contracts`.

### Task 4: Build the API client with limits and tier preservation

**Objective:** Make all GreeksSurge HTTP access go through one safe adapter.

**Files:**
- Create: `src/api/client.ts`
- Create: `src/api/errors.ts`
- Create: `src/api/query.ts`
- Create: `tests/api-client.test.ts`

**Steps:**
1. Write failing tests with a local HTTP fixture server for bearer/no-bearer requests, `User-Agent`, timeout/abort, 401/403 tier errors, 429 retry guidance, malformed JSON, schema drift, ETag/short cache behavior, and no retry for non-idempotent methods.
2. Implement `GreeksSurgeClient` with constructor-injected base URL, `fetch`, token provider, 10-second timeout, one request per second per process, and a 30-second in-memory cache for public GETs.
3. Cap `ideas` and `trade-history` limits at 100, validate dates/tickers/enums, and forbid arbitrary paths or query keys.
4. Always send `Accept: application/json` and `User-Agent: greekssurge-mcp/<version> (+https://github.com/neerazz/greekssurge-mcp)`.
5. Map 401 to `AUTH_REQUIRED`, 403 to `TIER_REQUIRED`, 429 to `RATE_LIMITED`, 5xx/network to `UPSTREAM_UNAVAILABLE`, and schema mismatch to `UPSTREAM_CONTRACT_CHANGED` without leaking bodies.
6. Run focused tests and coverage.
7. Commit: `feat: add bounded GreeksSurge API client`.

### Task 5: Implement the local token store

**Objective:** Store only the revocable GreeksSurge token with least-permission filesystem behavior.

**Files:**
- Create: `src/auth/token-store.ts`
- Create: `tests/token-store.test.ts`

**Steps:**
1. Write failing tests using a temporary home for environment-token precedence, missing token, atomic write, mode `0600` on POSIX, malformed store recovery, logout deletion, and no token in thrown errors.
2. Implement this interface:

```ts
export interface TokenStore {
  read(): Promise<string | undefined>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}
```

3. Store JSON under the OS-appropriate user config directory, write to a same-directory temporary file, chmod, rename atomically, and reject symlink targets.
4. Document that Windows ACLs govern access where POSIX modes do not apply.
5. Run tests on the current OS; add platform-conditional assertions for CI.
6. Commit: `feat: add user-scoped token storage`.

### Task 6: Implement system-browser native-app authorization without Google credential handling

**Objective:** Complete GreeksSurge authorization in the user's normal browser without browser instrumentation, token copying, or Google credential handling.

**Files:**
- Create: `src/auth/native-oauth.ts`
- Create: `src/auth/system-browser.ts`
- Create: `src/auth/local-login.ts`
- Create: `tests/native-oauth.test.ts`
- Create: `tests/system-browser.test.ts`
- Create: `tests/local-login.test.ts`

**Steps:**
1. Write failing tests for OS-default-browser launch, random-port `127.0.0.1` binding, exact callback parsing, state, RFC 7636 S256 vectors, timeout/cancel, hostile token responses, validation-before-storage, and unconditional cleanup.
2. Bind `http://127.0.0.1:<OS-assigned-port>/callback` before opening the browser. Never bind all interfaces or use a fixed port.
3. Open `/api/auth/mcp/authorize` through the operating system default browser. Keep state and the PKCE verifier only in CLI memory; do not read browser storage or cookies.
4. Accept only one matching-state code/error response on the exact callback host/path, then close the listener. Invalid probes must not consume the flow.
5. Exchange the one-time code through `/api/auth/mcp/token` using the exact redirect URI and verifier. Reject redirects, malformed/oversized responses, and non-Bearer tokens.
6. Validate the token with `/api/auth/me` before atomic storage. Add `auth status` and `auth logout` service functions.
7. Run unit and real-socket client integration tests. Keep release blocked until the production backend contract and a human Google-login smoke pass.
8. Commit: `feat: add system-browser PKCE authentication`.

### Task 7: Register the transport-neutral MCP tool set

**Objective:** Expose stable, read-only tools from one server factory.

**Files:**
- Create: `src/mcp/create-server.ts`
- Create: `src/mcp/result.ts`
- Create: `src/mcp/tools.ts`
- Create: `src/mcp/disclaimer.ts`
- Create: `tests/mcp-tools.test.ts`

**Steps:**
1. Write failing in-memory MCP client/server tests for tool listing, annotations, input schemas, success DTOs, authentication errors, tier errors, result-size caps, and disclaimer/provenance fields.
2. Implement `createGreeksSurgeMcpServer({ clientFactory, tokenProvider })` and register:
   - `get_account`
   - `get_market_status`
   - `list_trade_ideas`
   - `get_available_filters`
   - `get_performance_stats`
   - `list_trade_history`
   - `list_education`
   - `get_education_article`
   - `get_watchlist`
   - `get_preferences`
3. Give every tool `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true`, and `openWorldHint: true`.
4. Return `structuredContent` matching an output schema plus short text. Include `source: https://csp.greekssurge.com`, `retrievedAt`, publication timestamp when present, tier/masking status, and the educational/no-financial-advice disclosure.
5. Keep the first 512 characters of server instructions self-contained: read-only, educational, no order placement, verify market facts independently, and never infer missing values.
6. Run `npm test -- tests/mcp-tools.test.ts`.
7. Commit: `feat: expose read-only GreeksSurge tools`.

### Task 8: Add the stdio transport and CLI lifecycle

**Objective:** Make the package executable by any local MCP host.

**Files:**
- Create: `src/transports/stdio.ts`
- Create: `src/cli.ts`
- Create: `tests/cli.test.ts`
- Create: `tests/stdio.integration.test.ts`

**Steps:**
1. Write failing tests for commands `serve` (default stdio), `auth login`, `auth status`, `auth logout`, `setup`, `--help`, `--version`, invalid flags, and stdout purity.
2. Implement stdio with `StdioServerTransport`; all diagnostics go to stderr.
3. Ensure `greekssurge-mcp` with no arguments starts stdio and never launches a browser implicitly.
4. Return an actionable `AUTH_REQUIRED` tool error pointing to `npx greekssurge-mcp auth login` when an authenticated tool has no token.
5. Spawn the built CLI in an integration test, initialize MCP, list tools, invoke one mocked public tool, and assert every stdout line is valid JSON-RPC.
6. Run build and focused tests.
7. Commit: `feat: add stdio server and CLI`.

### Task 9: Define and validate the upstream GreeksSurge OAuth contract

**Objective:** Make hosted mode depend on a precise, secure site-side contract instead of a browser-token relay.

**Files:**
- Create: `docs/upstream-oauth-contract.md`
- Create: `src/auth/upstream-metadata.ts`
- Create: `tests/upstream-metadata.test.ts`
- Create: `tests/fixtures/oauth/*.json`

**Steps:**
1. Write failing tests for discovery at `/.well-known/oauth-authorization-server`, PKCE `S256`, exact redirect URI, authorization-code flow, resource indicator, `mcp:read` scope, refresh/revocation support, issuer equality, and HTTPS-only endpoints.
2. Specify required GreeksSurge endpoints: authorization metadata, `/api/auth/mcp/authorize`, `/api/auth/mcp/token`, `/api/auth/mcp/revoke`, and optional introspection/JWKS. Existing Google login remains the human login step.
3. Require authorization codes to be one-time, short-lived, PKCE-bound, client/redirect/resource-bound, and never placed in logs. Access tokens must be user/tier-bound and accepted by `/api/auth/me` and read APIs.
4. Implement metadata fetch/validation. Production HTTP startup fails closed when auth metadata is absent or unsafe; tests may inject a fixture issuer.
5. Add an explicit current-state probe test showing production lacks this metadata until the GreeksSurge backend is updated. This is a tracked external blocker, not a mocked success.
6. Commit: `docs: define hosted OAuth contract`.

### Task 10: Add OAuth-protected Streamable HTTP

**Objective:** Serve the same tools remotely with per-user bearer validation.

**Files:**
- Create: `src/auth/token-verifier.ts`
- Create: `src/transports/http.ts`
- Create: `tests/token-verifier.test.ts`
- Create: `tests/http.integration.test.ts`

**Steps:**
1. Write failing tests for protected-resource metadata, `WWW-Authenticate`, missing/invalid/expired/wrong-resource tokens, account validation, CORS/origin handling, Host validation, content-type/Accept requirements, POST tool calls, GET behavior, and cross-user token substitution.
2. Implement `GreeksSurgeTokenVerifier.verifyAccessToken(token)` by calling `/api/auth/me` and returning SDK `AuthInfo` with `mcp:read`, expiry, resource, and a non-PII subject hash in `extra`.
3. Build an Express 5 app with `createMcpExpressApp({ host, allowedHosts })`, request size limits, global and auth rate limits, exact allowed origins, health/readiness endpoints, `mcpAuthMetadataRouter`, and `requireBearerAuth` before `/mcp`.
4. Use stateless `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })`, create/close one server per POST, and pass `req.auth` through the transport.
5. Bind localhost by default. Require explicit `PUBLIC_BASE_URL`, HTTPS, and allowed hosts when binding `0.0.0.0`.
6. Run integration tests with two fixture users/tokens and assert no cross-user cache key collision.
7. Commit: `feat: add OAuth-protected Streamable HTTP`.

### Task 11: Build the cross-client setup wizard

**Objective:** Reduce installation to one command without corrupting client configuration.

**Files:**
- Create: `src/setup/detect-clients.ts`
- Create: `src/setup/configs.ts`
- Create: `src/setup/setup.ts`
- Create: `tests/setup.test.ts`
- Create: `docs/clients/*.md`

**Steps:**
1. Fetch and pin current official setup syntax for Claude Desktop/Code, Codex, Gemini CLI, Cursor, and VS Code in documentation comments/links.
2. Write failing golden tests for each generated config and CLI command. Parse generated JSON/TOML rather than snapshotting only strings.
3. Implement dry-run by default and an explicit confirmation before mutating any client config. Use client CLIs when available; otherwise write an atomic backup and merge only the `greekssurge` entry.
4. Support local config (`npx -y greekssurge-mcp`) and remote URL config (`https://<host>/mcp`) as separate wizard choices.
5. Never write the GreeksSurge token into client config; local mode reads its token store, remote mode uses MCP OAuth.
6. Add idempotency tests: running setup twice produces one entry and preserves unrelated configuration.
7. Commit: `feat: add universal MCP setup wizard`.

### Task 12: Add deployment assets for hosted mode

**Objective:** Make remote mode straightforward to deploy without embedding secrets.

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `render.yaml`
- Create: `docs/deployment.md`
- Create: `tests/deployment-assets.test.ts`

**Steps:**
1. Write tests that parse deployment assets and reject secrets, mutable image tags, root execution, missing health checks, HTTP public URLs, wildcard allowed hosts, and missing production auth metadata requirements.
2. Use a multi-stage Node 22 slim image, non-root user, `npm ci`, `npm run build`, and `node dist/cli.js serve --transport http`.
3. Document required environment names only: `PUBLIC_BASE_URL`, `GREEKSSURGE_API_BASE_URL`, `GREEKSSURGE_AUTH_ISSUER`, `ALLOWED_HOSTS`, `PORT`; never include values or a production token.
4. Add readiness that fails until upstream OAuth metadata validates.
5. Build and run the container locally against fixture services; invoke `/healthz`, `/readyz`, and a mocked MCP request.
6. Commit: `feat: add secure hosted deployment assets`.

### Task 13: Write public documentation and governance

**Objective:** Make the repository understandable, safe, and contribution-ready.

**Files:**
- Create: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `docs/architecture.md`
- Create: `docs/troubleshooting.md`
- Create: `tests/docs.test.ts`

**Steps:**
1. Write failing link/command tests for README install/auth/setup, local and remote config, supported tools, disclosure, privacy model, data-license boundary, and troubleshooting.
2. Put the shortest path first: install/authenticate, add to client, test `get_account`.
3. State clearly: MIT covers code only; GreeksSurge data/content remains subject to GreeksSurge terms; users must use their own account/tier; the server does not provide financial advice or execute trades.
4. Document token location, logout/revocation, browser profile isolation, no Google password collection, and how to report a leaked token.
5. Link every client instruction to official current docs and label unverified UI-only clients honestly.
6. Run docs tests and Markdown link checker.
7. Commit: `docs: add public setup and security guidance`.

### Task 14: Add CI, dependency, and secret gates

**Objective:** Make release safety visible on every pull request.

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/codeql.yml`
- Create: `.github/dependabot.yml`
- Create: `scripts/verify-package.mjs`
- Create: `scripts/scan-secrets.mjs`
- Create: `tests/security-invariants.test.ts`

**Steps:**
1. Add failing invariant tests for token-like strings, forbidden admin/payment endpoints, non-read-only annotations, token logs, and package file allow-list.
2. Configure CI for macOS/Windows/Linux with Node 20 and 22; run install, format, lint, typecheck, tests, build, pack verification, and dependency audit.
3. Add CodeQL and Dependabot; do not add a publish workflow until npm provenance/2FA is configured.
4. Pack the tarball and run it from a clean temporary home with no source checkout.
5. Commit: `ci: add cross-platform release gates`.

### Task 15: Verify local and remote protocol behavior

**Objective:** Exercise the built artifact, not just unit tests.

**Files:**
- Create: `scripts/smoke-stdio.mjs`
- Create: `scripts/smoke-http.mjs`
- Create: `docs/verification.md`

**Steps:**
1. Run `npm ci && npm run format:check && npm run lint && npm run check && npm test && npm run build`.
2. Run MCP Inspector against the packed stdio command and save non-secret tool-list/call receipts.
3. Start fixture API/OAuth servers and the packed HTTP server; use an MCP client to complete discovery, obtain a fixture token via PKCE, list tools, and call one authenticated tool.
4. Run the two-user isolation test and a no-auth/wrong-resource negative test.
5. Run `npx --yes <packed-tgz> --version` and an stdio smoke from an empty temporary home.
6. Probe production `/.well-known/oauth-authorization-server`; if unavailable, mark the hosted production criterion blocked with the exact HTTP receipt. Do not replace it with fixture success.
7. Commit: `test: add end-to-end MCP smoke coverage`.

### Task 16: Cross-model review and remediation

**Objective:** Red-team the latest revision before publication.

**Files:**
- Create: `docs/reviews/final-security-review.md`
- Modify as findings require: exact source/test/docs files

**Steps:**
1. Give a fresh Gemini or Codex reviewer the spec, full diff, threat model, test output, and package manifest. Ask for PASS/FAIL per evaluation criterion plus auth, token, tenancy, prompt-injection, SSRF, DNS-rebinding, caching, and financial-safety findings.
2. Verify every claimed defect against code/runtime; reject speculative findings with evidence.
3. Fix release-blocking findings through red-green tests, rerun the full suite, then rerun the critic on the new revision.
4. Record revision-bound final verdict and evidence.
5. Commit: `fix: address final security review` if changes exist; otherwise `docs: record final security review`.

### Task 17: Update the spec with real evidence

**Objective:** Make completion claims mechanically auditable.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-26-greekssurge-mcp-design.md`

**Steps:**
1. Change status to `IN-FLIGHT` while any production hosted-auth dependency remains open.
2. Check each criterion only with a same-line `— evidence: <command/output/path/URL>` receipt.
3. Add the final critic verdict under Verification.
4. Run:

```bash
python3 /Users/neeraj/.hermes/skills/spec-first/scripts/spec_gate.py \
  docs/superpowers/specs/2026-07-26-greekssurge-mcp-design.md
```

5. Expect PASS only if production local auth, production hosted OAuth, both transports, client paths, clean packaging, and public repository evidence all exist. Otherwise preserve the exact blocker and do not mark DONE.
6. Commit: `docs: record v1 verification evidence`.

### Task 18: Create and verify the public GitHub repository

**Objective:** Publish only after the local release gates pass.

**Files:**
- Modify: repository remote metadata only

**Steps:**
1. Run secret scan, `git status`, full test/build/pack gates, and inspect every committed path.
2. Verify GitHub CLI is using personal account `neerazz`; create public `neerazz/greekssurge-mcp` with description and homepage without leaking a work identity/token.
3. Push `main`; enable vulnerability alerts and delete-branch-on-merge. Add topics: `mcp`, `model-context-protocol`, `greekssurge`, `options-education`, `claude`, `codex`, `gemini`.
4. Read back via GitHub API: visibility public, owner `neerazz`, default branch `main`, HEAD SHA equal to local, README/license rendered, no Actions failures.
5. Do not publish to npm until `npm whoami` succeeds for the intended account and the user completes any required 2FA/provenance prompt. The GitHub repo and packed tarball are still publishable without npm credentials.
6. Record the public URL and remote SHA in the spec, rerun the spec gate, and report any remaining production OAuth or npm blocker precisely.
