import { mkdtemp, rm } from "node:fs/promises";
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
  close(): void | Promise<void>;
}

export interface LocalLoginOptions {
  loginUrl: URL;
  store: TokenStore;
  launchBrowser?: (loginUrl: URL) => Promise<LaunchedBrowser>;
  waitForToken?: () => Promise<string | undefined>;
  validateToken: (token: string) => Promise<{ tier?: string }>;
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
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      loginUrl.toString(),
    ],
    { stdio: "ignore", detached: false },
  );
  try {
    await waitForDevToolsActivePort(profileDir);
    return { profileDir, close: () => closeChild(child, profileDir) };
  } catch (error) {
    await closeChild(child, profileDir);
    throw error;
  }
}

export async function waitForBrowserToken(
  profileDir: string,
  timeoutMs = 120_000,
): Promise<string | undefined> {
  const { port } = await waitForDevToolsActivePort(profileDir);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    let session: Awaited<ReturnType<typeof connectCdp>> | undefined;
    try {
      const tab = findGreeksSurgeTab(await listTabs(port));
      if (tab?.webSocketDebuggerUrl) {
        session = await connectCdp(tab.webSocketDebuggerUrl);
        const token = await readGsTokenFromTab(session, tab.url);
        if (token) return token;
      }
    } catch {
      // Authentication redirects replace CDP targets; retry within the deadline.
    } finally {
      session?.close();
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
  return { tier: account.userTier };
}

export async function runLocalLogin(
  options: LocalLoginOptions,
): Promise<{ status: "authenticated"; tier?: string }> {
  const launchBrowser = options.launchBrowser ?? launchInstalledChromium;
  const browser = await launchBrowser(options.loginUrl);
  let browserClosed = false;
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
      validation = await options.validateToken(token);
    } catch {
      throw new Error(
        "Unable to validate the captured GreeksSurge token. Nothing was stored.",
      );
    }
    await browser.close();
    browserClosed = true;
    await options.store.write(token);
    return { status: "authenticated", tier: validation.tier };
  } finally {
    if (!browserClosed) await browser.close();
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

async function closeChild(
  child: ChildProcess,
  profileDir: string,
): Promise<void> {
  if (!hasExited(child)) {
    const terminated = await signalAndWait(child, "SIGTERM", 2_000);
    if (!terminated) {
      const killed = await signalAndWait(child, "SIGKILL", 2_000);
      if (!killed)
        throw new Error(
          "Unable to terminate the Chromium process launched for login.",
        );
    }
  }
  await rm(profileDir, { recursive: true, force: true });
}

function hasExited(child: ChildProcess): boolean {
  return child.exitCode !== null || child.signalCode !== null;
}

async function signalAndWait(
  child: ChildProcess,
  signal: NodeJS.Signals,
  timeoutMs: number,
): Promise<boolean> {
  if (hasExited(child)) return true;
  return new Promise<boolean>((resolve) => {
    const onExit = () => finish(true);
    const timeout = setTimeout(() => finish(hasExited(child)), timeoutMs);
    const finish = (exited: boolean) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    child.once("exit", onExit);
    if (!child.kill(signal) && !hasExited(child)) finish(false);
  });
}
