import { GreeksSurgeClient } from "../api/client.js";
import type { TokenStore } from "./token-store.js";

export interface LocalLoginOptions {
  store: TokenStore;
  validateToken: (token: string) => Promise<{ tier?: string }>;
  readBrowserToken: () => Promise<string>;
}

export async function validateTokenWithApi(
  apiBaseUrl: URL,
  token: string,
): Promise<{ tier?: string }> {
  const client = new GreeksSurgeClient({
    baseUrl: apiBaseUrl,
    tokenProvider: async () => token,
    minIntervalMs: 0,
  });
  const account = await client.getAccount();
  return { tier: account.userTier };
}

export async function runLocalLogin(
  options: LocalLoginOptions,
): Promise<{ status: "authenticated"; tier?: string }> {
  const token = await options.readBrowserToken();
  let validation: { tier?: string };
  try {
    validation = await options.validateToken(token);
  } catch {
    throw new Error(
      "Unable to validate the BrowserOS GreeksSurge session. Nothing was stored.",
    );
  }
  await options.store.write(token);
  return { status: "authenticated", tier: validation.tier };
}

export async function authStatus(
  store: TokenStore,
): Promise<{ authenticated: boolean }> {
  return { authenticated: Boolean(await store.read()) };
}

export async function authLogout(store: TokenStore): Promise<void> {
  await store.clear();
}
