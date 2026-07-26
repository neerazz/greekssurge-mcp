import { GreeksSurgeClient } from "../api/client.js";
import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkcePair,
  exchangeAuthorizationCode,
  startLoopbackAuthorization,
  type ExchangeAuthorizationCodeOptions,
  type LoopbackAuthorization,
  type StartLoopbackAuthorizationOptions,
} from "./native-oauth.js";
import { openSystemBrowser } from "./system-browser.js";
import type { TokenStore } from "./token-store.js";

const DEFAULT_CLIENT_ID = "greekssurge-mcp";

export interface LocalLoginOptions {
  issuerUrl: URL;
  store: TokenStore;
  validateToken: (token: string) => Promise<{ tier?: string }>;
  clientId?: string;
  timeoutMs?: number;
  createLoopback?: (
    options: StartLoopbackAuthorizationOptions,
  ) => Promise<LoopbackAuthorization>;
  openBrowser?: (authorizationUrl: URL) => Promise<void>;
  exchangeCode?: (options: ExchangeAuthorizationCodeOptions) => Promise<string>;
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
  const clientId = options.clientId ?? DEFAULT_CLIENT_ID;
  const state = createOAuthState();
  const pkce = createPkcePair();
  const callback = await (options.createLoopback ?? startLoopbackAuthorization)(
    { state, timeoutMs: options.timeoutMs },
  );
  try {
    const authorizationUrl = buildAuthorizationUrl({
      issuerUrl: options.issuerUrl,
      clientId,
      redirectUri: callback.redirectUri,
      state,
      codeChallenge: pkce.challenge,
    });
    await (options.openBrowser ?? openSystemBrowser)(authorizationUrl);
    const code = await callback.waitForCode;
    const token = await (options.exchangeCode ?? exchangeAuthorizationCode)({
      issuerUrl: options.issuerUrl,
      clientId,
      code,
      codeVerifier: pkce.verifier,
      redirectUri: callback.redirectUri,
    });

    let validation: { tier?: string };
    try {
      validation = await options.validateToken(token);
    } catch {
      throw new Error(
        "Unable to validate the captured GreeksSurge token. Nothing was stored.",
      );
    }
    await options.store.write(token);
    return { status: "authenticated", tier: validation.tier };
  } finally {
    await callback.close();
  }
}

export async function authStatus(
  store: TokenStore,
): Promise<{ authenticated: boolean }> {
  return { authenticated: Boolean(await store.read()) };
}

export async function authLogout(store: TokenStore): Promise<void> {
  await store.clear();
}
