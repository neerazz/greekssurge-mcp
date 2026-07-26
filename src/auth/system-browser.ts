import {
  spawn,
  type ChildProcess,
  type SpawnOptions,
} from "node:child_process";

export interface BrowserOpenCommand {
  command: string;
  args: string[];
}

export type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface OpenSystemBrowserOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: SpawnProcess;
}

export function browserOpenCommand(
  url: URL,
  platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand {
  if (url.protocol !== "https:")
    throw new Error("The browser authorization URL must use HTTPS.");

  switch (platform) {
    case "darwin":
      return { command: "open", args: [url.toString()] };
    case "win32":
      return { command: "explorer.exe", args: [url.toString()] };
    case "linux":
      return { command: "xdg-open", args: [url.toString()] };
    default:
      throw new Error(`Unsupported platform for default browser: ${platform}`);
  }
}

export async function openSystemBrowser(
  url: URL,
  options: OpenSystemBrowserOptions = {},
): Promise<void> {
  const { command, args } = browserOpenCommand(url, options.platform);
  const spawnProcess = options.spawnProcess ?? spawn;

  await new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnProcess(command, args, {
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      reject(new Error("Unable to open the operating system default browser."));
      return;
    }

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      child.off("error", onError);
      child.off("spawn", onSpawn);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const failure = () =>
      new Error("Unable to open the operating system default browser.");
    const onError = () => finish(failure());
    const onSpawn = () => {
      child.unref();
    };
    const onExit = (code: number | null) =>
      code === 0 ? finish() : finish(failure());

    child.once("error", onError);
    child.once("spawn", onSpawn);
    child.once("exit", onExit);
  });
}
