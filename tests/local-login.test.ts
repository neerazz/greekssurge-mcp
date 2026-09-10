import { describe, expect, it, vi } from "vitest";
import {
  authLogout,
  authStatus,
  runLocalLogin,
  validateTokenWithApi,
} from "../src/auth/local-login.js";
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

describe("local login service", () => {
  it("validates and stores an explicitly shared browser session", async () => {
    const store = new MemoryTokenStore();
    const readSessionToken = vi.fn(async () => "synthetic-test-token");
    const validateToken = vi.fn(async () => ({ tier: "lifetime" }));

    const result = await runLocalLogin({
      store,
      readSessionToken,
      validateToken,
    });

    expect(readSessionToken).toHaveBeenCalledOnce();
    expect(validateToken).toHaveBeenCalledWith("synthetic-test-token");
    expect(store.token).toBe("synthetic-test-token");
    expect(result).toEqual({ status: "authenticated", tier: "lifetime" });
  });

  it("preserves the prior credential when session validation fails", async () => {
    const store = new MemoryTokenStore();
    await store.write("site-token");

    await expect(
      runLocalLogin({
        store,
        readSessionToken: async () => "synthetic-test-token",
        validateToken: async () => {
          throw new Error("AUTH_REQUIRED");
        },
      }),
    ).rejects.toThrow(/GreeksSurge session/);

    expect(store.token).toBe("site-token");
  });

  it("does not persist validation that completes after cancellation", async () => {
    const store = new MemoryTokenStore();
    store.token = "site-token";
    const controller = new AbortController();
    await expect(
      runLocalLogin({
        store,
        signal: controller.signal,
        readSessionToken: async () => "synthetic-test-token",
        validateToken: async () => {
          controller.abort();
          return { tier: "free" };
        },
      }),
    ).rejects.toThrow();
    expect(store.token).toBe("site-token");
  });

  it("stores the validated replacement session when the account endpoint rotates it", async () => {
    const store = new MemoryTokenStore();
    await runLocalLogin({
      store,
      readSessionToken: async () => "synthetic-test-token",
      validateToken: async () => ({ tier: "free", token: "site-token" }),
    });
    expect(store.token).toBe("site-token");
  });

  it.each(["", "token with spaces", "x".repeat(16_385)])(
    "rejects malformed input before account validation",
    async (token) => {
      const validateToken = vi.fn(async () => ({ tier: "free" }));
      await expect(
        runLocalLogin({
          store: new MemoryTokenStore(),
          readSessionToken: async () => token,
          validateToken,
        }),
      ).rejects.toThrow();
      expect(validateToken).not.toHaveBeenCalled();
    },
  );

  it("validates the account response and retains a rotated token privately", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ userTier: "free", token: "site-token" }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    const result = await validateTokenWithApi(
      new URL("https://csp.greekssurge.com"),
      "synthetic-test-token",
      { fetchImpl },
    );
    expect(result).toEqual({ tier: "free", token: "site-token" });
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://csp.greekssurge.com/api/auth/me"),
      expect.objectContaining({
        redirect: "error",
        cache: "no-store",
        headers: expect.objectContaining({
          Authorization: "Bearer synthetic-test-token",
        }),
      }),
    );
  });

  it.each([
    new Response("<html>Login</html>", {
      headers: { "content-type": "text/html" },
    }),
    new Response(
      JSON.stringify({ userTier: "free", token: "token with spaces" }),
      { headers: { "content-type": "application/json" } },
    ),
    new Response(JSON.stringify({ error: "No token" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    }),
  ])(
    "rejects invalid live account responses without disclosing contents",
    async (response) => {
      await expect(
        validateTokenWithApi(
          new URL("https://csp.greekssurge.com"),
          "synthetic-test-token",
          { fetchImpl: async () => response },
        ),
      ).rejects.toThrow(/Unable to validate/);
    },
  );

  it("reports auth status and logout without exposing tokens", async () => {
    const store = new MemoryTokenStore();
    expect(await authStatus(store)).toEqual({ authenticated: false });
    await store.write("site-token");
    expect(await authStatus(store)).toEqual({ authenticated: true });
    await authLogout(store);
    expect(await authStatus(store)).toEqual({ authenticated: false });
  });
});
