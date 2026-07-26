import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import {
  discoverChromiumExecutable,
  waitForDevToolsActivePort,
} from "./browser-paths.js";
import {
  connectCdp,
  findGreeksSurgeTab,
  listTabs,
  readGsTokenFromTab,
} from "./cdp.js";
import type { TokenStore } from "./token-store.js";
import { GreeksSurgeClient } from "../api/client.js";

export interface LaunchedBrowser {
  profileDir: string;
  close(): void;
}

export interface LocalLoginOptions {
  loginUrl: URL;
  store: TokenStore;
  launchBrowser?: (loginUrl: URL) => Promise<LaunchedBrowser>;
  waitForToken?: () => Promise<string | undefined>;
  validateToken?: (token: string) => Promise<{ tier?: string }>;
  timeoutMs?: number;
}

export async function launchInstalledChromium(
  loginUrl: URL,
  executable?: string,
): Promise<LaunchedBrowser> {
  const browser = discoverChromiumExecutable({ override: executable });
  const profileDir = await mkdtemp(join(tmpdir(), "greekssurge-mcp-chromium-"));
  const child = spawn(
    browser,
    [
      `--user-data-dir=${profileDir}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      loginUrl.toString(),
    ],
    { stdio: "ignore", detached: false },
  );
  child.unref();
  await waitForDevToolsActivePort(profileDir);
  return { profileDir, close: () => closeChild(child) };
}

export async function waitForBrowserToken(
  profileDir: string,
  timeoutMs = 120_000,
): Promise<string | undefined> {
  const { port } = await waitForDevToolsActivePort(profileDir);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tab = findGreeksSurgeTab(await listTabs(port));
    if (tab?.webSocketDebuggerUrl) {
      const session = connectCdp(tab.webSocketDebuggerUrl);
      try {
        const token = await readGsTokenFromTab(session, tab.url);
        if (token) return token;
      } finally {
        session.close();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  return undefined;
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
  return { tier: account.tier };
}

export async function runLocalLogin(
  options: LocalLoginOptions,
): Promise<{ status: "authenticated"; tier?: string }> {
  const launchBrowser = options.launchBrowser ?? launchInstalledChromium;
  const browser = await launchBrowser(options.loginUrl);
  try {
    const token = await (
      options.waitForToken ??
      (() => waitForBrowserToken(browser.profileDir, options.timeoutMs))
    )();
    if (!token)
      throw new Error(
        "Login timed out or was cancelled before a GreeksSurge token was available.",
      );
    let validation: { tier?: string };
    try {
      validation = await (
        options.validateToken ?? (async () => ({ tier: undefined }))
      )(token);
    } catch {
      throw new Error(
        "Unable to validate the captured GreeksSurge token. Nothing was stored.",
      );
    }
    await options.store.write(token);
    return { status: "authenticated", tier: validation.tier };
  } finally {
    browser.close();
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

function closeChild(child: ChildProcess): void {
  if (!child.killed) child.kill("SIGTERM");
}
