import { spawn } from "node:child_process";
import { constants } from "node:fs";
import {
  access as fsAccess,
  mkdir as fsMkdir,
  readFile as fsReadFile,
  unlink as fsUnlink,
} from "node:fs/promises";
import { join, posix, win32 } from "node:path";
import {
  Browser,
  BrowserTag,
  detectBrowserPlatform,
  install,
  resolveBuildId,
} from "@puppeteer/browsers";
import WebSocket from "ws";

const GREEKSSURGE_ORIGIN = "https://csp.greekssurge.com";
const LOGIN_URL = `${GREEKSSURGE_ORIGIN}/login`;
const MAX_TOKEN_LENGTH = 16_384;
const MAX_PAGE_LIST_LENGTH = 1_048_576;
const DEFAULT_LOGIN_TIMEOUT_MS = 5 * 60_000;
const POLL_INTERVAL_MS = 500;

type Env = Record<string, string | undefined>;
type Access = (path: string, mode?: number) => Promise<void>;
type Sleep = (milliseconds: number) => Promise<void>;

export interface ChromiumPage {
  type?: string;
  url?: string;
  webSocketDebuggerUrl?: string;
}

export interface ChromiumExecutable {
  executablePath: string;
  source: "system" | "downloaded";
}

interface BrowserChild {
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface EnsureChromiumOptions {
  candidates: string[];
  access?: Access;
  download: () => Promise<string>;
}

export interface ReadChromiumTokenFromCdpOptions {
  port: number;
  fetchImpl?: typeof fetch;
  evaluateToken?: (webSocketDebuggerUrl: string) => Promise<unknown>;
  timeoutMs?: number;
}

export interface LaunchChromiumForTokenOptions {
  executablePath: string;
  profileDir: string;
  spawnBrowser?: (executablePath: string, args: string[]) => BrowserChild;
  mkdir?: (path: string) => Promise<unknown>;
  unlink?: (path: string) => Promise<unknown>;
  readFile?: (path: string) => Promise<string>;
  sleep?: Sleep;
  readToken?: (port: number) => Promise<string>;
  timeoutMs?: number;
}

export interface ReadChromiumTokenOptions {
  profileDir: string;
  cacheDir: string;
  platform?: NodeJS.Platform;
  env?: Env;
  candidates?: string[];
  access?: Access;
  download?: () => Promise<string>;
  launch?: (options: LaunchChromiumForTokenOptions) => Promise<string>;
  timeoutMs?: number;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function pathCandidates(
  pathValue: string | undefined,
  names: string[],
  platform: NodeJS.Platform,
): string[] {
  if (!pathValue) return [];
  const path = platform === "win32" ? win32 : posix;
  const separator = platform === "win32" ? ";" : ":";
  return pathValue
    .split(separator)
    .filter(Boolean)
    .flatMap((directory) => names.map((name) => path.join(directory, name)));
}

export function chromiumExecutableCandidates(
  platform: NodeJS.Platform = process.platform,
  env: Env = process.env,
): string[] {
  if (platform === "darwin") {
    return unique([
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      ...pathCandidates(
        env.PATH,
        [
          "chromium",
          "chromium-browser",
          "google-chrome",
          "brave-browser",
          "microsoft-edge",
        ],
        platform,
      ),
    ]);
  }
  if (platform === "linux") {
    return unique([
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/brave-browser",
      "/usr/bin/microsoft-edge",
      ...pathCandidates(
        env.PATH,
        [
          "chromium",
          "chromium-browser",
          "google-chrome",
          "google-chrome-stable",
          "brave-browser",
          "microsoft-edge",
        ],
        platform,
      ),
    ]);
  }
  if (platform === "win32") {
    const roots = unique([
      env.LOCALAPPDATA ?? "",
      env.PROGRAMFILES ?? "",
      env["PROGRAMFILES(X86)"] ?? "",
    ]);
    return unique([
      ...roots.flatMap((root) => [
        win32.join(root, "Chromium", "Application", "chrome.exe"),
        win32.join(root, "Google", "Chrome", "Application", "chrome.exe"),
        win32.join(
          root,
          "BraveSoftware",
          "Brave-Browser",
          "Application",
          "brave.exe",
        ),
        win32.join(root, "Microsoft", "Edge", "Application", "msedge.exe"),
      ]),
      ...pathCandidates(
        env.PATH,
        ["chromium.exe", "chrome.exe", "brave.exe", "msedge.exe"],
        platform,
      ),
    ]);
  }
  return [];
}

export async function ensureChromiumExecutable(
  options: EnsureChromiumOptions,
): Promise<ChromiumExecutable> {
  const access = options.access ?? fsAccess;
  for (const candidate of options.candidates) {
    try {
      await access(candidate, constants.X_OK);
      return { executablePath: candidate, source: "system" };
    } catch {
      // Try the next known Chromium-family executable.
    }
  }
  const executablePath = await options.download();
  await access(executablePath, constants.X_OK);
  return { executablePath, source: "downloaded" };
}

export async function downloadStableChromium(
  cacheDir: string,
): Promise<string> {
  const platform = detectBrowserPlatform();
  if (!platform)
    throw new Error(
      "Automatic Chromium download is unsupported on this platform.",
    );
  await fsMkdir(cacheDir, { recursive: true, mode: 0o700 });
  const buildId = await resolveBuildId(
    Browser.CHROME,
    platform,
    BrowserTag.STABLE,
  );
  const installed = await install({
    browser: Browser.CHROME,
    buildId,
    buildIdAlias: BrowserTag.STABLE,
    cacheDir,
    platform,
    downloadProgressCallback: "default",
  });
  return installed.executablePath;
}

export function findGreeksSurgeChromiumPage(
  pages: ChromiumPage[],
): ChromiumPage | undefined {
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

export async function readChromiumTokenFromCdp(
  options: ReadChromiumTokenFromCdpOptions,
): Promise<string> {
  if (
    !Number.isInteger(options.port) ||
    options.port < 1 ||
    options.port > 65_535
  )
    throw new Error("Chromium returned an invalid DevTools port.");
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 5_000,
  );
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(
      `http://127.0.0.1:${options.port}/json/list`,
      { signal: controller.signal },
    );
  } catch {
    throw new Error("Chromium DevTools is not reachable yet.");
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok)
    throw new Error("Chromium did not return its current tabs.");
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (contentLength > MAX_PAGE_LIST_LENGTH)
    throw new Error("Chromium returned an invalid tab list.");
  const text = await response.text();
  if (text.length > MAX_PAGE_LIST_LENGTH)
    throw new Error("Chromium returned an invalid tab list.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Chromium returned an invalid tab list.");
  }
  if (!Array.isArray(parsed))
    throw new Error("Chromium returned an invalid tab list.");
  const page = findGreeksSurgeChromiumPage(parsed as ChromiumPage[]);
  if (!page?.webSocketDebuggerUrl)
    throw new Error("Complete the GreeksSurge sign-in in the Chromium window.");
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
      "Chromium does not contain a valid GreeksSurge session. Complete sign-in and try again.",
    );
  return value;
}

function defaultSpawnBrowser(
  executablePath: string,
  args: string[],
): BrowserChild {
  return spawn(executablePath, args, {
    stdio: "ignore",
    windowsHide: false,
  });
}

const defaultSleep: Sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function parseDevToolsPort(value: string): number {
  const port = Number(value.split(/\r?\n/, 1)[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535)
    throw new Error("Chromium returned an invalid DevTools port.");
  return port;
}

export async function launchChromiumForToken(
  options: LaunchChromiumForTokenOptions,
): Promise<string> {
  const mkdir =
    options.mkdir ??
    ((path) => fsMkdir(path, { recursive: true, mode: 0o700 }));
  const unlink = options.unlink ?? fsUnlink;
  const readFile = options.readFile ?? ((path) => fsReadFile(path, "utf8"));
  const sleep = options.sleep ?? defaultSleep;
  const readToken =
    options.readToken ?? ((port) => readChromiumTokenFromCdp({ port }));
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOGIN_TIMEOUT_MS;
  const activePortPath = join(options.profileDir, "DevToolsActivePort");

  await mkdir(options.profileDir);
  try {
    await unlink(activePortPath);
  } catch {
    // No stale DevTools port file is the normal first-run state.
  }

  const child = (options.spawnBrowser ?? defaultSpawnBrowser)(
    options.executablePath,
    [
      "--remote-debugging-port=0",
      `--user-data-dir=${options.profileDir}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--new-window",
      LOGIN_URL,
    ],
  );
  const deadline = Date.now() + timeoutMs;
  try {
    let port: number | undefined;
    while (Date.now() < deadline && port === undefined) {
      try {
        port = parseDevToolsPort(await readFile(activePortPath));
      } catch {
        await sleep(POLL_INTERVAL_MS);
      }
    }
    if (port === undefined)
      throw new Error("Chromium did not start its DevTools endpoint in time.");

    while (Date.now() < deadline) {
      try {
        return await readToken(port);
      } catch {
        await sleep(POLL_INTERVAL_MS);
      }
    }
    throw new Error(
      "Chromium login timed out. Complete the GreeksSurge sign-in and run auth login again.",
    );
  } finally {
    child.kill();
  }
}

export async function readChromiumToken(
  options: ReadChromiumTokenOptions,
): Promise<string> {
  const executable = await ensureChromiumExecutable({
    candidates:
      options.candidates ??
      chromiumExecutableCandidates(options.platform, options.env),
    access: options.access,
    download:
      options.download ?? (() => downloadStableChromium(options.cacheDir)),
  });
  return (options.launch ?? launchChromiumForToken)({
    executablePath: executable.executablePath,
    profileDir: options.profileDir,
    timeoutMs: options.timeoutMs,
  });
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
      () => finish(new Error("Chromium session read timed out.")),
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
      finish(new Error("Unable to read the Chromium GreeksSurge session.")),
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
        finish(new Error("Unable to read the Chromium GreeksSurge session."));
      else finish(undefined, message.result?.result?.value);
    });
  });
}
