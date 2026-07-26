# SPEC: GreeksSurge MCP — Local and Hosted v1

> Date: 2026-07-26 · Owner: Neeraj · Agent: Patty
> Status: DECISIONS-VERIFIED

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
2. **Local mode.** Browser-assisted GreeksSurge Google login, secure local token lifecycle, environment override, and stdio transport → checkpoint: a clean user profile authenticates through Google and an authenticated tool returns that account's tier-scoped data.
3. **Hosted mode.** Streamable HTTP protected resource plus standards-based OAuth 2.1 delegation to GreeksSurge, including the required upstream authorization metadata/token contract → checkpoint: a remote MCP client signs in with Google, receives a user-bound token, and cannot read another user's data.
4. **Universal setup.** Interactive setup command plus verified commands/configuration for Claude Desktop/Code, Codex, Gemini CLI, Cursor, VS Code, and generic MCP clients → checkpoint: clean-home smoke tests connect at least one client from each configuration family (CLI, JSON config, remote URL).
5. **Publication.** CI, security checks, README, deployment guide, contribution policy, release metadata, public GitHub repository, and npm-ready package → checkpoint: GitHub reads back a public `neerazz/greekssurge-mcp` repository and the install path works from the packed artifact without a source checkout.

## Key decisions
| # | Decision | Choice | Cost if wrong | Status |
|---|----------|--------|---------------|--------|
| 1 | v1 transports | Ship both stdio and Streamable HTTP from one core/tool registry | high | VERIFIED — Neeraj selected both local and hosted v1 |
| 2 | local Google auth | Open the existing GreeksSurge Google flow in a dedicated installed-Chromium profile; capture only the resulting GreeksSurge token; never collect Google credentials | high | VERIFIED — existing production flow inspected |
| 3 | hosted Google auth | GreeksSurge acts as the OAuth authorization server for the remote MCP protected resource; add OAuth 2.1 metadata, PKCE authorization, token, and revocation/introspection support upstream | high | VERIFIED — avoids browser-token relays and preserves per-user tiers |
| 4 | hosted deployment boundary | Repository ships a production-ready remote mode and deployment templates; deployment secrets/URL remain operator configuration | low | ASSUMED |
| 5 | tool safety | Read-only v1: account/tier, market status, ideas, filters, statistics, settled history, education, watchlist, and preferences | high | VERIFIED — no brokerage or account mutation |
| 6 | distribution | Public `neerazz/greekssurge-mcp`; unscoped npm package `greekssurge-mcp`; Node 20+; MIT code license with GreeksSurge content/data excluded | low | ASSUMED |
| 7 | client compatibility | Protocol-first implementation using the official MCP TypeScript SDK; client-specific logic is confined to setup adapters/docs | high | VERIFIED — prevents vendor lock-in |

## Evaluation criteria
- [ ] A first-time user can authenticate with Google and invoke an authenticated GreeksSurge tool from a supported local MCP client without manually extracting or pasting a token — evidence:
- [ ] A remote MCP client can discover OAuth metadata, complete Google-backed PKCE authorization, and invoke a tier-scoped tool over Streamable HTTP; a cross-user isolation test denies token/data substitution — evidence:
- [ ] The same MCP tool contract passes Inspector tests over stdio and Streamable HTTP, with no client-specific tool implementation — evidence:
- [ ] Claude, Codex, and Gemini setup paths are validated against their current official documentation and exercised with available local CLIs or deterministic config smoke tests — evidence:
- [ ] Every tool is read-only, validates inputs and upstream responses, caps result size, preserves source timestamp/disclaimer metadata, and never logs or returns a token — evidence:
- [ ] A clean temporary home can install/run the packed package without the repository or undeclared dependencies, on Node 20 and 22 CI lanes — evidence:
- [ ] The public GitHub repository is readable at `https://github.com/neerazz/greekssurge-mcp`, reports the intended license/default branch, and exposes no secrets — evidence:

## Verification plan
- External signal: real `/api/auth/me` and tier-scoped API reads; MCP Inspector calls over both transports; OAuth discovery/PKCE/isolation tests; clean-home packed-package run; CI matrix; GitHub API readback of repository visibility and default branch.
- Cross-model critic required: Yes — Gemini/Codex fresh-context review of the final repository against this spec, with auth/security findings treated as release blockers.
- Critic verdict: pending implementation
