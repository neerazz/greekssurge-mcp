import { describe, expect, it, vi } from "vitest";
import {
  authLogout,
  authStatus,
  runLocalLogin,
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
  it("validates and stores the existing BrowserOS session", async () => {
    const store = new MemoryTokenStore();
    const readBrowserToken = vi.fn(async () => "synthetic-test-token");
    const validateToken = vi.fn(async () => ({ tier: "lifetime" }));

    const result = await runLocalLogin({
      store,
      readBrowserToken,
      validateToken,
    });

    expect(readBrowserToken).toHaveBeenCalledOnce();
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
        readBrowserToken: async () => "synthetic-test-token",
        validateToken: async () => {
          throw new Error("AUTH_REQUIRED");
        },
      }),
    ).rejects.toThrow(/BrowserOS GreeksSurge session/);

    expect(store.token).toBe("site-token");
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
