import { createHash } from "node:crypto";
import { request } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  buildAuthorizationUrl,
  createPkceChallenge,
  createPkcePair,
  exchangeAuthorizationCode,
  startLoopbackAuthorization,
} from "../src/auth/native-oauth.js";

const EXPECTED_STATE = "s".repeat(43);

function base64Url(value: Buffer) {
  return value.toString("base64url");
}

async function requestWithHost(url: URL, host: string | string[]) {
  return new Promise<number>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers:
          typeof host === "string"
            ? { host }
            : ["Host", host[0] ?? "", "Host", host[1] ?? ""],
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    req.once("error", reject);
    req.end();
  });
}

async function requestRawTarget(redirectUri: URL, target: string) {
  return new Promise<number>((resolve, reject) => {
    const req = request(
      {
        host: redirectUri.hostname,
        port: redirectUri.port,
        method: "GET",
        path: target,
        headers: { host: redirectUri.host },
      },
      (response) => {
        response.resume();
        response.once("end", () => resolve(response.statusCode ?? 0));
      },
    );
    req.once("error", reject);
    req.end();
  });
}

describe("native OAuth helpers", () => {
  it("creates an RFC 7636 S256 verifier and challenge", () => {
    const pair = createPkcePair();
    const expected = base64Url(
      createHash("sha256").update(pair.verifier).digest(),
    );

    expect(pair.verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(pair.challenge).toBe(expected);
    expect(
      createPkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("rejects ambiguous issuer and authorization inputs before opening a browser", () => {
    const valid = {
      issuerUrl: new URL("https://csp.greekssurge.com"),
      clientId: "greekssurge-mcp",
      redirectUri: new URL("http://127.0.0.1:45678/callback"),
      state: "s".repeat(43),
      codeChallenge: "c".repeat(43),
    };

    expect(() =>
      buildAuthorizationUrl({
        ...valid,
        issuerUrl: new URL("https://user@csp.greekssurge.com/?query=1"),
      }),
    ).toThrow(/issuer/i);
    expect(() => buildAuthorizationUrl({ ...valid, clientId: "" })).toThrow(
      /client/i,
    );
    expect(() => buildAuthorizationUrl({ ...valid, state: "short" })).toThrow(
      /state/i,
    );
    expect(() =>
      buildAuthorizationUrl({ ...valid, codeChallenge: "short" }),
    ).toThrow(/challenge/i);
  });

  it("rejects a low-entropy callback state before binding a listener", async () => {
    await expect(
      startLoopbackAuthorization({ state: "short", timeoutMs: 5 }),
    ).rejects.toThrow(/state/i);
  });

  it("builds a public-client authorization request with state, loopback redirect, and S256 PKCE", () => {
    const state = "s".repeat(43);
    const challenge = "c".repeat(43);
    const authorizeUrl = buildAuthorizationUrl({
      issuerUrl: new URL("https://csp.greekssurge.com"),
      clientId: "greekssurge-mcp",
      redirectUri: new URL("http://127.0.0.1:45678/callback"),
      state,
      codeChallenge: challenge,
    });

    expect(authorizeUrl.origin).toBe("https://csp.greekssurge.com");
    expect(authorizeUrl.pathname).toBe("/api/auth/mcp/authorize");
    expect(Object.fromEntries(authorizeUrl.searchParams)).toEqual({
      client_id: "greekssurge-mcp",
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: "http://127.0.0.1:45678/callback",
      response_type: "code",
      scope: "mcp:read",
      state,
    });
  });

  it("accepts a one-time code only on the exact loopback callback and state", async () => {
    const callback = await startLoopbackAuthorization({
      state: EXPECTED_STATE,
      timeoutMs: 1_000,
    });
    const callbackUrl = new URL(callback.redirectUri);
    callbackUrl.searchParams.set("state", EXPECTED_STATE);
    callbackUrl.searchParams.set("code", "one-time-code");

    const response = await fetch(callbackUrl);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    expect(body).toMatch(/return to the terminal/i);
    expect(body).not.toContain("one-time-code");
    await expect(callback.waitForCode).resolves.toBe("one-time-code");
    await callback.close();
  });

  it("ignores forged state and Host headers while leaving the real callback usable", async () => {
    const callback = await startLoopbackAuthorization({
      state: EXPECTED_STATE,
      timeoutMs: 1_000,
    });
    const forgedState = new URL(callback.redirectUri);
    forgedState.searchParams.set("state", "wrong-state");
    forgedState.searchParams.set("code", "forged-code");
    expect((await fetch(forgedState)).status).toBe(400);

    const forgedHost = new URL(callback.redirectUri);
    forgedHost.searchParams.set("state", EXPECTED_STATE);
    forgedHost.searchParams.set("code", "forged-code");
    expect(await requestWithHost(forgedHost, "attacker.example")).toBe(400);
    expect(
      await requestWithHost(forgedHost, [
        callback.redirectUri.host,
        "attacker.example",
      ]),
    ).toBe(400);

    const duplicateState = new URL(callback.redirectUri);
    duplicateState.searchParams.append("state", EXPECTED_STATE);
    duplicateState.searchParams.append("state", EXPECTED_STATE);
    duplicateState.searchParams.set("code", "forged-code");
    expect((await fetch(duplicateState)).status).toBe(400);

    const codeAndError = new URL(callback.redirectUri);
    codeAndError.searchParams.set("state", EXPECTED_STATE);
    codeAndError.searchParams.set("code", "forged-code");
    codeAndError.searchParams.set("error", "access_denied");
    expect((await fetch(codeAndError)).status).toBe(400);

    const normalizedTarget = `/foo/%2e%2e/callback?state=${EXPECTED_STATE}&code=forged-code`;
    expect(await requestRawTarget(callback.redirectUri, normalizedTarget)).toBe(
      404,
    );

    const valid = new URL(callback.redirectUri);
    valid.searchParams.set("state", EXPECTED_STATE);
    valid.searchParams.set("code", "real-code");
    expect((await fetch(valid)).status).toBe(200);
    await expect(callback.waitForCode).resolves.toBe("real-code");
    await callback.close();
  });

  it("times out without accepting a code", async () => {
    const callback = await startLoopbackAuthorization({
      state: EXPECTED_STATE,
      timeoutMs: 25,
    });

    await expect(callback.waitForCode).rejects.toThrow(/timed out/i);
    await callback.close();
  });

  it("settles a matching-state provider denial without reflecting details", async () => {
    const callback = await startLoopbackAuthorization({
      state: EXPECTED_STATE,
      timeoutMs: 1_000,
    });
    const denied = new URL(callback.redirectUri);
    denied.searchParams.set("state", EXPECTED_STATE);
    denied.searchParams.set("error", "access_denied");
    denied.searchParams.set("error_description", "private provider detail");

    const response = await fetch(denied);
    const body = await response.text();

    expect(response.status).toBe(400);
    expect(body).not.toContain("private provider detail");
    await expect(callback.waitForCode).rejects.toThrow(/cancelled|denied/i);
    await callback.close();
    await callback.close();
  });

  it("exchanges the code using the verifier and rejects non-Bearer responses", async () => {
    const fetchImpl = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        Response.json({
          access_token: "site-token",
          expires_in: 3_600,
          token_type: "Bearer",
          scope: "mcp:read",
        }),
    );

    const token = await exchangeAuthorizationCode({
      issuerUrl: new URL("https://csp.greekssurge.com"),
      clientId: "greekssurge-mcp",
      code: "one-time-code",
      codeVerifier: "v".repeat(43),
      redirectUri: new URL("http://127.0.0.1:45678/callback"),
      fetchImpl,
    });

    expect(token).toBe("site-token");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url.toString()).toBe(
      "https://csp.greekssurge.com/api/auth/mcp/token",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      redirect: "error",
    });
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual(
      {
        client_id: "greekssurge-mcp",
        code: "one-time-code",
        code_verifier: "v".repeat(43),
        grant_type: "authorization_code",
        redirect_uri: "http://127.0.0.1:45678/callback",
      },
    );

    await expect(
      exchangeAuthorizationCode({
        issuerUrl: new URL("https://csp.greekssurge.com"),
        clientId: "greekssurge-mcp",
        code: "one-time-code",
        codeVerifier: "v".repeat(43),
        redirectUri: new URL("http://127.0.0.1:45678/callback"),
        fetchImpl: async () =>
          Response.json({ access_token: "site-token", token_type: "MAC" }),
      }),
    ).rejects.toThrow(/invalid token response/i);

    for (const hostileResponse of [
      new Response(
        JSON.stringify({
          access_token: "site-token",
          expires_in: 3_600,
          token_type: "Bearer",
          scope: "mcp:read",
        }),
        { headers: { "content-type": "text/plain" } },
      ),
      new Response("x".repeat(17_000), {
        headers: { "content-type": "application/json" },
      }),
      Response.json({ access_token: "site-token", token_type: "Bearer" }),
      Response.json({
        access_token: "site-token",
        expires_in: 86_400,
        token_type: "Bearer",
        scope: "mcp:read",
      }),
    ]) {
      await expect(
        exchangeAuthorizationCode({
          issuerUrl: new URL("https://csp.greekssurge.com"),
          clientId: "greekssurge-mcp",
          code: "one-time-code",
          codeVerifier: "v".repeat(43),
          redirectUri: new URL("http://127.0.0.1:45678/callback"),
          fetchImpl: async () => hostileResponse,
        }),
      ).rejects.toThrow(/invalid token response/i);
    }
  });
});
