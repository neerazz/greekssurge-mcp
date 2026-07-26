# SPEC: GreeksSurge MCP — Local and Hosted v1

> Date: 2026-07-26 · Owner: Neeraj · Agent: Patty
> Status: IN-FLIGHT — npm v0.1.0 is public and trusted publishing is configured; dedicated-browser authentication is being replaced with a system-browser loopback PKCE flow; production auth remains blocked on the GreeksSurge backend contract

Normative backend contract: `docs/upstream-oauth-contract.md`.

## Goal
Ship a public, tool-agnostic MCP integration that lets any GreeksSurge user connect their own account to Claude, Codex, Gemini, Cursor, VS Code, or another MCP host with minimal setup, while preserving GreeksSurge authentication, subscription boundaries, financial disclosures, and data rights.

## Non-goals
- Execute or recommend trades, place brokerage orders, or present output as financial advice.
- Expose admin, billing, payment, subscription-mutation, or bulk-export capabilities.
- Bypass GreeksSurge tiers, cache premium data for redistribution, or share one user's credentials/data with another.
- Support legacy HTTP+SSE as a primary transport; v1 uses stdio and Streamable HTTP.
- Treat a deployable remote server as complete until its Google/OAuth flow works end to end against production GreeksSurge.

## Buckets
1. **Public package foundation.** TypeScript/Node package, stable API adapter, typed schemas, read-only MCP tools, tests, and license/data-rights boundary → checkpoint: a packed npm tarball runs over stdio in MCP Inspector.
2. **Local mode.** System-default-browser GreeksSurge Google login, loopback PKCE authorization-code return, secure local token lifecycle, environment override, and stdio transport → checkpoint: a clean user profile authenticates through Google in its normal browser and an authenticated tool returns that account's tier-scoped data without browser-profile instrumentation or token copying.
3. **Hosted mode.** Streamable HTTP protected resource plus standards-based OAuth 2.1 delegation to GreeksSurge, including the required upstream authorization metadata/token contract → checkpoint: a remote MCP client signs in with Google, receives a user-bound token, and cannot read another user's data.
4. **Universal setup.** Interactive setup command plus verified commands/configuration for Claude Desktop/Code, Codex, Gemini CLI, Cursor, VS Code, and generic MCP clients → checkpoint: clean-home smoke tests connect at least one client from each configuration family (CLI, JSON config, remote URL).
5. **Publication.** CI, security checks, README, deployment guide, contribution policy, release metadata, public GitHub repository, and npm-ready package → checkpoint: GitHub reads back a public `neerazz/greekssurge-mcp` repository and the install path works from the packed artifact without a source checkout.

## Key decisions
| # | Decision | Choice | Cost if wrong | Status |
|---|----------|--------|---------------|--------|
| 1 | transport sequence | Ship local stdio in v0.1; add Streamable HTTP only after production OAuth discovery and token contracts exist | high | VERIFIED — local transport works; hosted remains in scope without faking production readiness |
| 2 | local Google auth | Use the operating system's default browser as an external user-agent plus a random-port `127.0.0.1` loopback callback, authorization code, state, and S256 PKCE; never launch/instrument a dedicated browser or read browser storage | high | VERIFIED — Neeraj explicitly rejected the dedicated-Chromium design; RFC 8252 §§4.1/7.3 and RFC 7636 §4 ground the replacement |
| 2a | local auth backend contract | GreeksSurge exposes `/api/auth/mcp/authorize` and `/api/auth/mcp/token`; registers `greekssurge-mcp` as a public native client; exact-matches `http://127.0.0.1:<ephemeral-port>/callback` with only the port variable; requires explicit user authorization plus method `S256`; and issues a short-lived, atomic single-use code bound to user, client, exact redirect URI, challenge/method, and read-only resource scope before token exchange | high | BLOCKED — the live backend does not expose these routes and its source/deployment account is not available in this workspace |
| 3 | hosted Google auth | GreeksSurge acts as the OAuth authorization server for the remote MCP protected resource; add OAuth 2.1 metadata, PKCE authorization, token, and revocation/introspection support upstream | high | VERIFIED — avoids browser-token relays and preserves per-user tiers |
| 4 | hosted deployment boundary | Do not ship or advertise a remote endpoint until GreeksSurge exposes standards-compatible OAuth metadata, PKCE authorization/token exchange, and resource-bound validation | high | BLOCKED — all three well-known production paths currently return SPA HTML, not OAuth JSON metadata |
| 5 | tool safety | Read-only v1: account/tier, market status, ideas, filters, statistics, settled history, education, watchlist, and preferences | high | VERIFIED — no brokerage or account mutation |
| 6 | distribution | Public `neerazz/greekssurge-mcp`; unscoped npm package `greekssurge-mcp`; Node 20+; MIT code license with GreeksSurge content/data excluded | low | ASSUMED |
| 7 | client compatibility | Protocol-first implementation using the official MCP TypeScript SDK; client-specific logic is confined to setup adapters/docs | high | VERIFIED — prevents vendor lock-in |

## Evaluation criteria
- [ ] A first-time user can authenticate with Google in the operating system's default browser and invoke an authenticated GreeksSurge tool from a supported local MCP client without browser instrumentation or manually extracting/pasting a token — evidence: client implementation and production backend deployment/smoke remain in flight.
- [ ] A remote MCP client can discover OAuth metadata, complete Google-backed PKCE authorization, and invoke a tier-scoped tool over Streamable HTTP; a cross-user isolation test denies token/data substitution — evidence: blocked; `/.well-known/oauth-authorization-server`, `/.well-known/openid-configuration`, and `/.well-known/oauth-protected-resource` return `200 text/html`, not OAuth metadata.
- [ ] The same MCP tool contract passes Inspector tests over stdio and Streamable HTTP, with no client-specific tool implementation — evidence: official SDK stdio initialize/listTools/public-tool smoke passes; HTTP is intentionally not shipped.
- [x] Claude, Codex, and Gemini setup paths are validated against their current official documentation and exercised with available local CLIs or deterministic config smoke tests — evidence: `tests/setup.test.ts`, `tests/cli.test.ts`, and live `claude mcp add --help`, `codex mcp add --help`, `gemini mcp add --help` inspection.
- [x] Every tool is read-only, validates inputs and upstream responses, caps result size, preserves source timestamp/disclaimer metadata, and never logs or returns a token — evidence: `npm run prepublishOnly`; 95/95 tests, secret scan over 74 public files, stable per-tool DTO schemas, and tarball secret scan.
- [x] A clean temporary home can install/run the packed package without the repository or undeclared dependencies, on Node 20 and 22 CI lanes — evidence: local packed-artifact verification passes; public CI run `30218428482` passed Node 20/22 on Linux, macOS, and Windows, including fresh install and official-SDK package smoke.
- [x] The public GitHub repository is readable at `https://github.com/neerazz/greekssurge-mcp`, reports the intended license/default branch, and exposes no secrets — evidence: GitHub API readback reports `PUBLIC`, owner `neerazz`, default branch `main`, MIT license, and verified release implementation head `b2be49e`; unauthenticated `git ls-remote` succeeds; raw and local README SHA-256 values match; committed-blob secret review found zero redacted findings.

## Verification plan
- External signal: real system-browser authorization through a random-port loopback callback, `/api/auth/me` and tier-scoped API reads; MCP Inspector calls over both transports; OAuth discovery/PKCE/isolation tests; clean-home packed-package run; CI matrix; GitHub API readback of repository visibility and default branch.
- Cross-model critic required: Yes — Gemini/Codex fresh-context review of the final repository against this spec, with auth/security findings treated as release blockers.
- Critic verdict: reviewer found one P1 on `8ed5cf2` (public raw request primitive allowed runtime POST); fixed at `8c7d03d` with ECMAScript-private `#requestJson` plus a runtime-absence test. Narrow post-fix independent review approved the fix with no P0/P1 findings. Current `b2be49e` also passes CI and CodeQL.
