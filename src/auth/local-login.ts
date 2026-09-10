import { parseUpstream } from "../api/schemas.js";
import type { TokenStore } from "./token-store.js";

export interface SessionValidation {
  tier?: string;
  token?: string;
}

export interface LocalLoginOptions {
  store: TokenStore;
  validateToken: (token: string) => Promise<SessionValidation>;
  readSessionToken: () => Promise<string>;
  signal?: AbortSignal;
  beforeStore?: () => void;
}

export async function validateTokenWithApi(
  apiBaseUrl: URL,
  token: string,
  options: { fetchImpl?: typeof fetch; signal?: AbortSignal } = {},
): Promise<SessionValidation> {
  try {
    requireSessionToken(token);
    if (
      apiBaseUrl.username ||
      apiBaseUrl.password ||
      apiBaseUrl.hash ||
      !(
        apiBaseUrl.protocol === "https:" ||
        (apiBaseUrl.protocol === "http:" && apiBaseUrl.hostname === "127.0.0.1")
      )
    ) {
      throw new Error("Invalid account URL.");
    }
    const deadline = AbortSignal.timeout(10_000);
    const signal = options.signal
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
    const response = await (options.fetchImpl ?? fetch)(
      new URL("/api/auth/me", apiBaseUrl),
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
        },
        redirect: "error",
        cache: "no-store",
        signal,
      },
    );
    if (
      !response.ok ||
      !/^application\/json(?:\s*;|$)/i.test(
        response.headers.get("content-type") ?? "",
      ) ||
      !response.body
    ) {
      await response.body?.cancel();
      throw new Error("Invalid account response.");
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65_536) throw new Error("Account response is too large.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    const payload: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const account = parseUpstream("authMe", payload);
    // Account DTOs deliberately strip credentials. Only this auth boundary may
    // consume a session replacement returned by the website's account endpoint.
    const replacement = (payload as Record<string, unknown>).token;
    if (replacement !== undefined) requireSessionToken(replacement);
    return {
      tier: account.userTier,
      ...(typeof replacement === "string" ? { token: replacement } : {}),
    };
  } catch {
    throw new Error(
      "Unable to validate the GreeksSurge session. Nothing was stored.",
    );
  }
}

export async function runLocalLogin(
  options: LocalLoginOptions,
): Promise<{ status: "authenticated"; tier?: string }> {
  options.signal?.throwIfAborted();
  const token = await options.readSessionToken();
  options.signal?.throwIfAborted();
  requireSessionToken(token);
  let validation: SessionValidation;
  try {
    validation = await options.validateToken(token);
  } catch {
    throw new Error(
      "Unable to validate the GreeksSurge session. Nothing was stored.",
    );
  }
  options.signal?.throwIfAborted();
  const acceptedToken = validation.token ?? token;
  requireSessionToken(acceptedToken);
  options.beforeStore?.();
  await options.store.write(acceptedToken);
  return { status: "authenticated", tier: validation.tier };
}

function requireSessionToken(value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9._~+/=-]{1,16384}$/.test(value)
  ) {
    throw new Error("Invalid GreeksSurge session. Nothing was stored.");
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
