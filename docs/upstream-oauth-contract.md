# GreeksSurge secure native CLI authorization backend contract

## Grounded current state

Checked 2026-07-26 against production and the `fix/default-browser-auth` working branch.

- The public npm v0.1.0 artifact opens `/api/auth/google`, launches a dedicated browser profile, and reads `gs_token` through browser instrumentation. The working branch has removed that path but is intentionally unreleased.
- The production SPA bundle reads `token` from `window.location.search` and copies it to `localStorage` as `gs_token`; it also sends full `window.location.href` to analytics. This makes the current bearer-in-query flow leak-prone.
- Live production probes: `GET /api/auth/mcp/authorize` = 404 HTML; `POST /api/auth/mcp/token` = 404 HTML; `/.well-known/oauth-authorization-server` = 200 HTML, not metadata. Backend source is not in this repository.

## Required v1 flow

CLI binds `127.0.0.1:0` first, chooses callback `http://127.0.0.1:{ephemeralPort}/callback`, generates independent 256-bit random `state` and PKCE `code_verifier`, derives `BASE64URL(SHA256(verifier))`, and opens the OS default browser.

### GET `/api/auth/mcp/authorize`

Example:

```http
GET /api/auth/mcp/authorize?response_type=code&client_id=greekssurge-mcp&redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&code_challenge=<43-char-base64url>&code_challenge_method=S256&state=<43-char-base64url>&scope=mcp%3Aread
```

Accepted input, all required:

- `response_type`: exactly `code`.
- `client_id`: exactly the registered public client `greekssurge-mcp`; no embedded client secret.
- `redirect_uri`: for this v1 contract, parse then validate; exactly `http`, host exactly the IPv4 literal `127.0.0.1`, any non-zero numeric port, path exactly `/callback`, no userinfo, fragment, query, wildcard, `localhost`, alternate IPv4 encoding, or arbitrary return target. Preserve the exact accepted string for later comparison. Never fetch/preflight it. RFC 8252 also defines `[::1]`; the backend may register that as a separate allowed loopback form and the CLI should attempt both address families, but IPv6 must not broaden the v1 IPv4 rule into a hostname/wildcard rule.
- `code_challenge_method`: exactly `S256`; reject `plain` and omission.
- `code_challenge`: exactly 43 unpadded base64url chars.
- `state`: for this fixed CLI client, 43-128 unpadded base64url chars generated from high-entropy randomness; after bounded syntax validation, treat it as opaque, store/echo it unchanged, and never interpret it as a URL. A future general-purpose OAuth endpoint should accept the broader RFC 6749 opaque `state` syntax rather than impose this client-specific encoding.
- `scope`: exactly `mcp:read` for v1.
- Reject duplicate parameters and requests over a small bounded URL size (for example 4 KiB).

Behavior:

1. Validate `client_id` and `redirect_uri` before any redirect. Invalid/untrusted redirect requests fail at the GreeksSurge origin with HTTP 400 and MUST NOT redirect.
2. Create a server-side authorization transaction in shared DB/Redis (10-minute TTL), containing `client_id`, exact `redirect_uri`, PKCE challenge/method, CLI state, requested scope/audience, creation time, status, and a hash of a stable browser-flow cookie. Use a `__Host-` prefixed, unguessable `Secure; HttpOnly; SameSite=Lax; Path=/` browser-flow cookie; do not use a single per-transaction cookie value that concurrent tabs overwrite. Each provider state/transaction is distinct but bound to the same browser-flow cookie. Do not place transaction values into a caller-controlled `return_to`.
3. Start the existing Google login. The Google provider round trip has its own independent, one-time, server-validated provider `state`; do not reuse the CLI state as the sole Google CSRF binding.
4. After Google callback validation and internal user resolution, show an explicit GreeksSurge consent/confirmation page identifying the account, client, and read-only scope. Its POST uses a one-time anti-CSRF token bound to the authenticated browser session and exact authorization transaction, rejects missing/mismatched Origin and Fetch Metadata where available, and is unframeable (`CSP frame-ancestors 'none'`, `X-Frame-Options: DENY`). Do not silently authorize merely because a web session already exists: this is a public client whose identity cannot be proven by a packaged secret.
5. On approval, mint an opaque 32-byte random authorization code. Persist only a hash/HMAC and bind it to `user_id`, `client_id`, exact redirect URI, PKCE challenge/method, scope/audience, `issued_at`, `expires_at`, and `used_at`; TTL 60 seconds (hard maximum 5 minutes).
6. Return `303 See Other` to the exact stored redirect URI with only `code` and the original `state` query parameters. For post-validation denial/failure, return only a standard static error (`access_denied`, `temporarily_unavailable`, or `server_error`) plus state. Never include a bearer/refresh/Google token, email, user ID, stack trace, or caller-controlled error text.
7. Authorization/login/consent responses use `Cache-Control: no-store`, `Pragma: no-cache`, `Referrer-Policy: no-referrer`, restrictive CSP/frame protections, and no third-party analytics. Query strings and cookies are excluded/redacted from proxy, app, APM, and audit logs.

### POST `/api/auth/mcp/token`

Request must be HTTPS and `application/x-www-form-urlencoded` (body cap e.g. 8 KiB):

```http
POST /api/auth/mcp/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=<one-time-code>&client_id=greekssurge-mcp&redirect_uri=http%3A%2F%2F127.0.0.1%3A49152%2Fcallback&code_verifier=<43-128-char-verifier>
```

Contract:

- Required exact `grant_type=authorization_code`, code, public `client_id`, exact redirect URI, and RFC 7636 verifier (`43..128` unreserved chars). No client secret and no browser cookie dependency. Reject duplicate known fields, JSON, and GET; per RFC 6749 §3.2, ignore unrecognized request parameters rather than turning extensions into failures.
- Look up the code safely and return the same generic `invalid_grant` for unknown, expired, used, redirect/client mismatch, malformed verifier, or PKCE failure; do not expose which check failed.
- Compute S256 and compare in constant time. Validate every stored binding. Atomically compare-and-mark the code consumed in the same transaction that records token issuance; only one concurrent exchange may succeed. Replay always fails. If an already-consumed code is observed, revoke/denylist every token issued from that code when possible (this is RFC 6749's replay recommendation) and raise a credential-free security event. Rate-limit by IP/client and authorization handle without logging credential values.
- Success `200 application/json;charset=UTF-8`:

```json
{
  "access_token": "<opaque-or-signed-GreeksSurge-access-token>",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "mcp:read"
}
```

- Always return `Cache-Control: no-store` and `Pragma: no-cache`; never put the response in a redirect, URL, cookie, log, telemetry, or error.
- Standard errors use HTTP 400 JSON `{ "error": "invalid_request|invalid_grant|unsupported_grant_type" }`; unknown client uses `invalid_client`; throttling uses 429 plus `Retry-After`. Error text is static and non-sensitive. Do not enable browser CORS for this endpoint.

### Access-token profile

Do not return the current broad browser-session JWT unchanged. Issue a CLI-specific, least-privilege token with `iss`, internal user `sub`, fixed API `aud`, `client_id/azp=greekssurge-mcp`, `scope=mcp:read`, `iat`, `exp<=1h`, unique `jti`, and explicit access-token type. Resource APIs validate signature/issuer/audience/expiry/scope and derive current tier/entitlements server-side so a stale token cannot preserve an old tier. Never expose Google access/ID/refresh tokens.

For v1, omit a refresh token and reauthorize on expiry. If durable sessions are required, add a separately specified refresh-token grant with opaque refresh tokens, rotation/reuse detection, client/scope binding, revocation, and secure CLI storage; do not solve usability by issuing a long-lived broad bearer. Add `/api/auth/mcp/revoke` before claiming that CLI logout revokes server-side access; otherwise document logout as local deletion only.

## CLI-side half of the contract

- Listen only on `127.0.0.1`, random OS port, before opening the browser; accept one GET on the exact callback path and `Host: 127.0.0.1:{boundPort}`, validate state before exchange, return a static no-third-party-content success/error page with `Cache-Control: no-store`, then close on success/error/timeout. If separately supporting IPv6, use a distinct `[::1]` redirect URI and exact bracketed Host rule.
- Use the system default browser; never CDP, browser-profile instrumentation, cookies, localStorage scraping, clipboard, or manual token paste.
- Keep verifier/state/code/tokens out of stdout/stderr/logs. Persist only after token exchange plus `/api/auth/me` succeeds for the expected audience/account; atomic user-private storage remains required.
- PKCE mitigates local port interception; state mitigates unsolicited/login-CSRF callbacks. The HTTP loopback URL carries only a short-lived one-time code, never a bearer token.

## Migration with no bearer tokens in URLs

1. **Additive backend launch:** deploy the two MCP endpoints and new token validation alongside existing web auth. Feature-flag the fixed CLI client. Do not overload the existing Google callback with a user-supplied `return_to` or redirect URI.
2. **Remove the existing web JWT query immediately:** after Google callback, create a 60-second one-time web bootstrap handle in server storage, set it only in a transient `__Host-` prefixed `Secure; HttpOnly; SameSite=Lax; Path=/` cookie bound to the validated browser/provider transaction, and `303` to a clean `/auth/complete` URL. The SPA performs a same-origin custom-header POST to `/api/auth/web/token`; that endpoint requires exact Origin/Fetch Metadata plus a one-time CSRF value bound to the bootstrap transaction, has no CORS, atomically consumes the handle, returns the current web credential with `no-store`, and clears the transient cookie. Cross-site top-level navigation alone must never consume or reveal it. This compatibility bridge preserves the current Bearer/localStorage SPA temporarily while ensuring neither token nor bootstrap code appears in a URL; if the application can absorb the CSRF/API change immediately, skip the bridge and issue the final HttpOnly session cookie directly.
3. **Final web hardening:** migrate the SPA from JavaScript-readable `localStorage` JWTs to a `Secure; HttpOnly; SameSite` session cookie/BFF model, add CSRF protection to state-changing routes, then remove URL-token parsing and `gs_token` writes. During overlap, API middleware may accept old and new credentials, but new callbacks never issue URL tokens.
4. **CLI release:** the working branch has replaced the browser-instrumentation modules with loopback/PKCE/default-browser adapters. Ship only after the backend contract is deployed and production E2E succeeds; the public v0.1.0 artifact remains the old implementation until then.
5. **Legacy retirement:** add telemetry that counts auth mode only (never credentials/query strings), set a deadline, revoke/expire old broad browser JWTs, delete callback `?token=` support, and add regression gates preventing tokens in `Location`, browser URLs, analytics, logs, and localStorage.

## Required abuse/acceptance tests

- Reject `localhost`, `0.0.0.0`, `::1` unless separately registered, private/LAN/public hosts, userinfo, fragments, wrong paths, missing/zero ports, alternate IP encodings, duplicate parameters, unknown client, non-S256, and open-redirect/`return_to` attempts; invalid redirects never redirect.
- State mismatch, missing state, unsolicited callback, cancelled login, callback-port substitution, redirect-string substitution, wrong verifier, missing verifier, expired code, replay, and two simultaneous exchanges all fail; exactly one valid exchange succeeds. Re-presenting an already-consumed code also revokes/denylists the token minted from it when possible, and that token then receives 401 at the API.
- A malicious local process that captures the code cannot redeem it without the verifier.
- Consent POST without its transaction-bound CSRF token, with the wrong browser-flow cookie, or in a framed/cross-site context fails without minting a code; two concurrent tabs remain independently bound.
- Cross-user/client/audience/scope substitution fails; APIs reject expired/wrong-audience/wrong-scope tokens and honor tier downgrade immediately.
- Responses and infrastructure logs contain no bearer, refresh token, Google token, email, full query string, verifier, or code. Browser history and analytics contain no token. `/api/auth/me` succeeds after exchange.

## Standards basis

- RFC 8252 §§4.1, 7.3, 8.3: default external user-agent, loopback IP literal, dynamic port, PKCE.
- RFC 7636 §§4.1-4.6: S256 challenge/verifier and exchange.
- RFC 9700 §§2.1, 2.1.1, 2.1.2, 4.1, 4.2, 4.3: exact redirect matching with native-port exception, public-client PKCE, state/CSRF, and avoiding access tokens in authorization responses/URLs.
- RFC 6749 §§4.1.2, 4.1.3, 5.1, 5.2: authorization-code/token request and no-store/error semantics.
