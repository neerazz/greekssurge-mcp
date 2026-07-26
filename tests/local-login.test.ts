import { describe, expect, it, vi } from "vitest";
import {
  runLocalLogin,
  authStatus,
  authLogout,
} from "../src/auth/local-login.js";
import {
  createPkceChallenge,
  type LoopbackAuthorization,
} from "../src/auth/native-oauth.js";
import type { TokenStore } from "../src/auth/token-store.js";

class MemoryTokenStore implements TokenStore {
  token: string | undefined;
  async read() {
    return this.token;
  }
  async write(token: string) {
    this.token = token;
  }
  async clear() {
    this.token = undefined;
  }
}

function fakeCallback(
  code: Promise<string> = Promise.resolve("one-time-code"),
): LoopbackAuthorization & { close: ReturnType<typeof vi.fn> } {
  return {
    redirectUri: new URL("http://127.0.0.1:45678/callback"),
    waitForCode: code,
    close: vi.fn(async () => undefined),
  };
}

describe("local login service", () => {
  it("uses the system browser, exchanges the one-time code, validates the token, and only then stores it", async () => {
    const store = new MemoryTokenStore();
    const callback = fakeCallback();
    const openBrowser = vi.fn(async (_url: URL) => undefined);
    const exchangeCode = vi.fn(async () => "site-token");
    const validateToken = vi.fn(async () => ({ tier: "premium" }));
    const originalWrite = store.write.bind(store);
    store.write = vi.fn(async (token: string) => {
      expect(validateToken).toHaveBeenCalledWith("site-token");
      await originalWrite(token);
    });

    const result = await runLocalLogin({
      issuerUrl: new URL("https://csp.greekssurge.com"),
      store,
      createLoopback: async () => callback,
      openBrowser,
      exchangeCode,
      validateToken,
    });

    expect(openBrowser).toHaveBeenCalledOnce();
    const authorizationUrl = openBrowser.mock.calls[0]![0];
    expect(authorizationUrl).toBeInstanceOf(URL);
    expect(authorizationUrl.pathname).toBe("/api/auth/mcp/authorize");
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      callback.redirectUri.toString(),
    );
    expect(authorizationUrl.searchParams.get("state")).toBeTruthy();
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe(
      "S256",
    );
    expect(exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "greekssurge-mcp",
        code: "one-time-code",
        redirectUri: callback.redirectUri,
      }),
    );
    expect(store.token).toBe("site-token");
    expect(callback.close).toHaveBeenCalledOnce();
    expect(result).toEqual({ status: "authenticated", tier: "premium" });
  });

  it("completes the full real-socket loopback lifecycle before storing a validated token", async () => {
    const store = new MemoryTokenStore();
    let redirectUri: URL | undefined;
    const exchangeCode = vi.fn(async (options) => {
      expect(options.code).toBe("real-one-time-code");
      expect(options.redirectUri.toString()).toBe(redirectUri?.toString());
      expect(createPkceChallenge(options.codeVerifier)).toHaveLength(43);
      return "site-token";
    });
    const validateToken = vi.fn(async () => ({ tier: "premium" }));

    const result = await runLocalLogin({
      issuerUrl: new URL("https://csp.greekssurge.com"),
      store,
      openBrowser: async (authorizationUrl) => {
        redirectUri = new URL(
          authorizationUrl.searchParams.get("redirect_uri")!,
        );
        const callbackUrl = new URL(redirectUri);
        callbackUrl.searchParams.set(
          "state",
          authorizationUrl.searchParams.get("state")!,
        );
        callbackUrl.searchParams.set("code", "real-one-time-code");
        const response = await fetch(callbackUrl);
        expect(response.status).toBe(200);
        await response.text();
      },
      exchangeCode,
      validateToken,
    });

    expect(result).toEqual({ status: "authenticated", tier: "premium" });
    expect(store.token).toBe("site-token");
    expect(exchangeCode).toHaveBeenCalledOnce();
    expect(validateToken).toHaveBeenCalledWith("site-token");
    await expect(fetch(redirectUri!)).rejects.toThrow();
  });

  it("closes the loopback server and stores nothing when the default browser cannot open", async () => {
    const store = new MemoryTokenStore();
    const callback = fakeCallback();

    await expect(
      runLocalLogin({
        issuerUrl: new URL("https://csp.greekssurge.com"),
        store,
        createLoopback: async () => callback,
        openBrowser: async () => {
          throw new Error("browser unavailable");
        },
        exchangeCode: vi.fn(async () => "site-token"),
        validateToken: vi.fn(async () => ({ tier: "premium" })),
      }),
    ).rejects.toThrow(/browser unavailable/);

    expect(callback.close).toHaveBeenCalledOnce();
    expect(store.token).toBeUndefined();
  });

  it("does not store tokens that fail exact API validation", async () => {
    const store = new MemoryTokenStore();
    const callback = fakeCallback();

    await expect(
      runLocalLogin({
        issuerUrl: new URL("https://csp.greekssurge.com"),
        store,
        createLoopback: async () => callback,
        openBrowser: async () => undefined,
        exchangeCode: async () => "bad-token",
        validateToken: async () => {
          throw new Error("AUTH_REQUIRED");
        },
      }),
    ).rejects.toThrow(/Unable to validate/);

    expect(callback.close).toHaveBeenCalledOnce();
    expect(store.token).toBeUndefined();
  });

  it("reports auth status and logout without exposing tokens", async () => {
    const store = new MemoryTokenStore();
    expect(await authStatus(store)).toEqual({ authenticated: false });
    await store.write("site-token");
    expect(await authStatus(store)).toEqual({ authenticated: true });
    await authLogout(store);
    expect(await authStatus(store)).toEqual({ authenticated: false });
  });
});
