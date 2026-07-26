import { access, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface BrowserDiscoveryOptions {
  override?: string;
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
}

const candidates: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  win32: [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  ],
  linux: [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/microsoft-edge",
    "/usr/bin/brave-browser",
  ],
};

export function discoverChromiumExecutable(
  options: BrowserDiscoveryOptions = {},
): string {
  const exists = options.exists ?? existsSync;
  if (options.override) {
    if (!exists(options.override))
      throw new Error(
        `Configured browser executable does not exist: ${options.override}`,
      );
    return options.override;
  }

  const platform = options.platform ?? process.platform;
  for (const candidate of candidates[platform] ?? candidates.linux) {
    if (exists(candidate)) return candidate;
  }
  throw new Error(
    "Install Google Chrome, Chromium, Edge, or Brave, or set BROWSER_EXECUTABLE to its full path.",
  );
}

export interface DevToolsActivePort {
  port: number;
  browserPath: string;
}

export async function parseDevToolsActivePort(
  profileDir: string,
): Promise<DevToolsActivePort> {
  const raw = await readFile(join(profileDir, "DevToolsActivePort"), "utf8");
  const [portLine, browserPath] = raw.trim().split(/\r?\n/);
  const port = Number.parseInt(portLine ?? "", 10);
  if (!Number.isInteger(port) || port <= 0 || !browserPath)
    throw new Error("Browser did not expose a valid DevToolsActivePort file.");
  return { port, browserPath };
}

export async function waitForDevToolsActivePort(
  profileDir: string,
  timeoutMs = 10_000,
): Promise<DevToolsActivePort> {
  const deadline = Date.now() + timeoutMs;
  const file = join(profileDir, "DevToolsActivePort");
  while (Date.now() < deadline) {
    try {
      await access(file);
      return await parseDevToolsActivePort(profileDir);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error("Timed out waiting for Chromium DevToolsActivePort.");
}
