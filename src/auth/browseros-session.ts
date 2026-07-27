import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";

const GREEKSSURGE_ORIGIN = "https://csp.greekssurge.com";
const MAX_TOKEN_LENGTH = 16_384;
const MAX_PAGE_LIST_LENGTH = 1_048_576;

export interface BrowserOsPage {
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

interface BrowserOsServerConfig {
  cdp_port?: unknown;
  cdpPort?: unknown;
}

export interface ReadBrowserOsTokenOptions {
  serverConfig?: BrowserOsServerConfig;
  serverConfigPath?: string;
  fetchImpl?: typeof fetch;
  evaluateToken?: (webSocketDebuggerUrl: string) => Promise<unknown>;
  timeoutMs?: number;
}

export function findGreeksSurgeBrowserOsPage(
  pages: BrowserOsPage[],
): BrowserOsPage | undefined {
  return pages.find((page) => {
    if (page.type !== "page" || !page.url || !page.webSocketDebuggerUrl)
      return false;
    try {
      const pageUrl = new URL(page.url);
      const debuggerUrl = new URL(page.webSocketDebuggerUrl);
      return (
        pageUrl.origin === GREEKSSURGE_ORIGIN &&
        debuggerUrl.protocol === "ws:" &&
        ["127.0.0.1", "localhost", "::1"].includes(debuggerUrl.hostname) &&
        /^\/devtools\/page\/[A-Za-z0-9_-]+$/.test(debuggerUrl.pathname) &&
        !debuggerUrl.username &&
        !debuggerUrl.password
      );
    } catch {
      return false;
    }
  });
}

export async function readBrowserOsToken(
  options: ReadBrowserOsTokenOptions = {},
): Promise<string> {
  const config =
    options.serverConfig ??
    (await readServerConfig(
      options.serverConfigPath ??
        join(process.env.HOME ?? homedir(), ".browseros", "server.json"),
    ));
  const port = parsePort(config.cdp_port ?? config.cdpPort);
  const timeoutMs = options.timeoutMs ?? 5_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      `http://127.0.0.1:${port}/json/list`,
      { signal: controller.signal },
    );
  } catch {
    throw new Error(
      "BrowserOS is not reachable. Start BrowserOS, open GreeksSurge, and try again.",
    );
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw new Error(
      "BrowserOS did not return its current tabs. Start BrowserOS and try again.",
    );
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAGE_LIST_LENGTH)
    throw new Error("BrowserOS returned an invalid tab list.");
  const text = await response.text();
  if (text.length > MAX_PAGE_LIST_LENGTH)
    throw new Error("BrowserOS returned an invalid tab list.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("BrowserOS returned an invalid tab list.");
  }
  if (!Array.isArray(parsed))
    throw new Error("BrowserOS returned an invalid tab list.");
  const page = findGreeksSurgeBrowserOsPage(parsed as BrowserOsPage[]);
  if (!page?.webSocketDebuggerUrl)
    throw new Error(
      "Open GreeksSurge in BrowserOS, sign in with Google, and run this command again.",
    );
  const value = await (options.evaluateToken ?? evaluateGreeksSurgeToken)(
    page.webSocketDebuggerUrl,
  );
  if (
    typeof value !== "string" ||
    value.length < 20 ||
    value.length > MAX_TOKEN_LENGTH ||
    /\s/.test(value)
  )
    throw new Error(
      "BrowserOS does not contain a valid GreeksSurge session. Sign in and try again.",
    );
  return value;
}

async function readServerConfig(path: string): Promise<BrowserOsServerConfig> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    throw new Error(
      "BrowserOS is not configured. Start BrowserOS, open GreeksSurge, and try again.",
    );
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("invalid");
    return parsed as BrowserOsServerConfig;
  } catch {
    throw new Error("BrowserOS has an invalid server configuration.");
  }
}

function parsePort(value: unknown): number {
  const port = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("BrowserOS has an invalid DevTools port configuration.");
  return port;
}

async function evaluateGreeksSurgeToken(
  webSocketDebuggerUrl: string,
): Promise<unknown> {
  const socket = new WebSocket(webSocketDebuggerUrl, {
    handshakeTimeout: 5_000,
  });
  return new Promise((resolve, reject) => {
    const requestId = 1;
    const timeout = setTimeout(
      () => finish(new Error("BrowserOS session read timed out.")),
      5_000,
    );
    const finish = (error?: Error, value?: unknown) => {
      clearTimeout(timeout);
      socket.removeAllListeners();
      socket.close();
      if (error) reject(error);
      else resolve(value);
    };
    socket.once("error", () =>
      finish(new Error("Unable to read the BrowserOS GreeksSurge session.")),
    );
    socket.once("open", () => {
      socket.send(
        JSON.stringify({
          id: requestId,
          method: "Runtime.evaluate",
          params: {
            expression: "localStorage.getItem('gs_token')",
            returnByValue: true,
          },
        }),
      );
    });
    socket.on("message", (data) => {
      let message: {
        id?: number;
        result?: { result?: { value?: unknown } };
        error?: unknown;
      };
      try {
        message = JSON.parse(data.toString()) as typeof message;
      } catch {
        return;
      }
      if (message.id !== requestId) return;
      if (message.error)
        finish(new Error("Unable to read the BrowserOS GreeksSurge session."));
      else finish(undefined, message.result?.result?.value);
    });
  });
}
