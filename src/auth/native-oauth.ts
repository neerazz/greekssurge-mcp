import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer, type Server, type ServerResponse } from "node:http";

const LOOPBACK_HOST = "127.0.0.1";
const CALLBACK_PATH = "/callback";
const READ_ONLY_SCOPE = "mcp:read";
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_TOKEN_RESPONSE_BYTES = 16_384;

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export interface AuthorizationUrlOptions {
  issuerUrl: URL;
  clientId: string;
  redirectUri: URL;
  state: string;
  codeChallenge: string;
}

export interface LoopbackAuthorization {
  redirectUri: URL;
  waitForCode: Promise<string>;
  close(): Promise<void>;
}

export interface StartLoopbackAuthorizationOptions {
  state: string;
  timeoutMs?: number;
}

export interface ExchangeAuthorizationCodeOptions {
  issuerUrl: URL;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: URL;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createPkceChallenge(verifier) };
}

export function createPkceChallenge(verifier: string): string {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
    throw new Error("The PKCE code verifier is invalid.");
  const challenge = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  return challenge;
}

export function createOAuthState(): string {
  return randomBytes(32).toString("base64url");
}

export function buildAuthorizationUrl(options: AuthorizationUrlOptions): URL {
  requireHttpsIssuer(options.issuerUrl);
  requireLoopbackRedirect(options.redirectUri);
  requireClientId(options.clientId);
  requireOAuthState(options.state);
  if (!/^[A-Za-z0-9_-]{43}$/.test(options.codeChallenge))
    throw new Error("The PKCE code challenge is invalid.");
  const url = new URL("/api/auth/mcp/authorize", options.issuerUrl);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: options.clientId,
    redirect_uri: options.redirectUri.toString(),
    state: options.state,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
    scope: READ_ONLY_SCOPE,
  }).toString();
  return url;
}

export async function startLoopbackAuthorization(
  options: StartLoopbackAuthorizationOptions,
): Promise<LoopbackAuthorization> {
  requireOAuthState(options.state);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0)
    throw new Error("OAuth callback timeout must be positive.");

  let expectedHost = "";
  let settled = false;
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  const waitForCode = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  // Callers may fail while launching the browser before they await this promise.
  // Attach a rejection handler now while preserving the original promise result.
  void waitForCode.catch(() => undefined);

  const server = createServer((request, response) => {
    const hosts = request.headersDistinct.host ?? [];
    if (
      request.method !== "GET" ||
      hosts.length !== 1 ||
      hosts[0] !== expectedHost ||
      request.socket.remoteAddress !== LOOPBACK_HOST ||
      !request.url ||
      request.url.length > 8_192 ||
      !request.url.startsWith("/") ||
      request.url.startsWith("//")
    ) {
      respond(response, 400, "Invalid authorization callback.");
      return;
    }

    const rawPath = request.url.split("?", 1)[0];
    if (rawPath !== CALLBACK_PATH) {
      respond(response, 404, "Not found.");
      return;
    }

    let url: URL;
    try {
      url = new URL(request.url, `http://${expectedHost}`);
    } catch {
      respond(response, 400, "Invalid authorization callback.");
      return;
    }
    if (url.pathname !== CALLBACK_PATH) {
      respond(response, 404, "Not found.");
      return;
    }

    const states = url.searchParams.getAll("state");
    const codes = url.searchParams.getAll("code");
    const errors = url.searchParams.getAll("error");
    if (
      states.length !== 1 ||
      states[0]!.length > 256 ||
      codes.length > 1 ||
      errors.length > 1 ||
      (codes.length === 1) === (errors.length === 1) ||
      (codes[0]?.length ?? 0) > 2_048 ||
      (errors[0]?.length ?? 0) > 256
    ) {
      respond(response, 400, "Invalid authorization callback.");
      return;
    }

    const state = states[0] ?? "";
    if (!sameSecret(state, options.state)) {
      respond(response, 400, "Invalid authorization callback.");
      return;
    }

    const oauthError = errors[0];
    if (oauthError) {
      response.once("finish", () => {
        void settleReject(
          new Error("GreeksSurge authorization was cancelled or denied."),
        );
      });
      respond(response, 400, "Authorization was not completed.");
      return;
    }

    const code = codes[0];
    if (!code) {
      respond(response, 400, "Invalid authorization callback.");
      return;
    }

    response.once("finish", () => {
      void settleResolve(code);
    });
    respond(
      response,
      200,
      "Authentication complete. You can close this tab and return to the terminal.",
    );
  });
  server.requestTimeout = 5_000;
  server.headersTimeout = 5_000;

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    await closeServer(server);
    throw new Error("Unable to create a loopback authorization callback.");
  }
  expectedHost = `${LOOPBACK_HOST}:${address.port}`;
  const redirectUri = new URL(`http://${expectedHost}${CALLBACK_PATH}`);

  const timeout = setTimeout(() => {
    void settleReject(
      new Error(
        "GreeksSurge authorization timed out before the callback arrived.",
      ),
    );
  }, timeoutMs);

  async function settleResolve(code: string): Promise<void> {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    await closeServer(server);
    resolveCode(code);
  }

  async function settleReject(error: Error): Promise<void> {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    await closeServer(server);
    rejectCode(error);
  }

  return {
    redirectUri,
    waitForCode,
    close: async () => {
      if (!settled) {
        await settleReject(
          new Error("GreeksSurge authorization was cancelled."),
        );
      } else {
        await closeServer(server);
      }
    },
  };
}

export async function exchangeAuthorizationCode(
  options: ExchangeAuthorizationCodeOptions,
): Promise<string> {
  requireHttpsIssuer(options.issuerUrl);
  requireLoopbackRedirect(options.redirectUri);
  requireClientId(options.clientId);
  if (!/^\S{1,2048}$/.test(options.code))
    throw new Error("The authorization code is invalid.");
  createPkceChallenge(options.codeVerifier);
  const exchangeTimeoutMs = options.timeoutMs ?? 15_000;
  if (!Number.isFinite(exchangeTimeoutMs) || exchangeTimeoutMs <= 0)
    throw new Error("The token-exchange timeout must be positive.");
  const fetchImpl = options.fetchImpl ?? fetch;
  const tokenUrl = new URL("/api/auth/mcp/token", options.issuerUrl);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: options.clientId,
    code: options.code,
    redirect_uri: options.redirectUri.toString(),
    code_verifier: options.codeVerifier,
  });

  let response: Response;
  try {
    response = await fetchImpl(tokenUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(exchangeTimeoutMs),
    });
  } catch {
    throw new Error("Unable to exchange the GreeksSurge authorization code.");
  }
  if (!response.ok)
    throw new Error(
      `GreeksSurge authorization-code exchange failed (${response.status}).`,
    );

  const contentType = response.headers.get("content-type") ?? "";
  if (!/^application\/json(?:\s*;|$)/i.test(contentType))
    throw new Error("GreeksSurge returned an invalid token response.");
  const responseText = await readLimitedBody(
    response,
    MAX_TOKEN_RESPONSE_BYTES,
  );

  let payload: unknown;
  try {
    payload = JSON.parse(responseText);
  } catch {
    throw new Error("GreeksSurge returned an invalid token response.");
  }
  if (!isBearerTokenResponse(payload))
    throw new Error("GreeksSurge returned an invalid token response.");
  return payload.access_token;
}

function isBearerTokenResponse(payload: unknown): payload is {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
} {
  if (!payload || typeof payload !== "object") return false;
  const value = payload as Record<string, unknown>;
  return (
    typeof value.access_token === "string" &&
    value.access_token.length > 0 &&
    value.access_token.length <= 16_384 &&
    value.expires_in === 3_600 &&
    typeof value.token_type === "string" &&
    value.token_type.toLowerCase() === "bearer" &&
    value.scope === READ_ONLY_SCOPE
  );
}

function requireHttpsIssuer(url: URL): void {
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("The GreeksSurge authorization issuer must use HTTPS.");
}

function requireClientId(clientId: string): void {
  if (!/^[A-Za-z0-9._~-]{1,128}$/.test(clientId))
    throw new Error("The OAuth client ID is invalid.");
}

function requireOAuthState(state: string): void {
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(state))
    throw new Error("The OAuth state is invalid.");
}

function requireLoopbackRedirect(url: URL): void {
  if (
    url.protocol !== "http:" ||
    url.hostname !== LOOPBACK_HOST ||
    !url.port ||
    url.pathname !== CALLBACK_PATH ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error(
      "The authorization redirect must be an exact random-port 127.0.0.1 loopback callback.",
    );
}

function sameSecret(received: string, expected: string): boolean {
  const receivedBytes = Buffer.from(received, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return (
    receivedBytes.length === expectedBytes.length &&
    timingSafeEqual(receivedBytes, expectedBytes)
  );
}

function respond(
  response: ServerResponse,
  status: number,
  message: string,
): void {
  response.writeHead(status, {
    "cache-control": "no-store",
    connection: "close",
    "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
    "content-type": "text/plain; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(message);
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, LOOPBACK_HOST);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

async function readLimitedBody(
  response: Response,
  limitBytes: number,
): Promise<string> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > limitBytes)
    throw new Error("GreeksSurge returned an invalid token response.");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limitBytes) {
      await reader.cancel();
      throw new Error("GreeksSurge returned an invalid token response.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
    "utf8",
  );
}
