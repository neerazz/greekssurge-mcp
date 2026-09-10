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
  timeoutMs?: number;
}

export function browserOpenCommand(
  url: string | URL,
  platform: NodeJS.Platform = process.platform,
): BrowserOpenCommand {
  const target = validateBrowserUrl(url);
  switch (platform) {
    case "darwin":
      return { command: "open", args: [target] };
    case "linux":
      return { command: "xdg-open", args: [target] };
    case "win32": {
      // Encode URL data separately so quotes, backticks and PowerShell syntax
      // can never become executable script, including Unicode quote characters.
      const encodedUrl = Buffer.from(target, "utf8").toString("base64");
      const script = [
        "$ErrorActionPreference = 'Stop'",
        "try {",
        `  $url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${encodedUrl}'))`,
        "  Start-Process -FilePath $url -ErrorAction Stop",
        "  exit 0",
        "} catch { exit 1 }",
      ].join("\n");
      return {
        command: "powershell.exe",
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-EncodedCommand",
          Buffer.from(script, "utf16le").toString("base64"),
        ],
      };
    }
    default:
      throw new Error(
        "Unsupported platform for the operating system default browser.",
      );
  }
}

function validateBrowserUrl(url: string | URL): string {
  const invalid = () => new Error("Invalid browser authorization URL.");
  try {
    const target = typeof url === "string" ? url : url.href;
    if (
      Buffer.byteLength(target, "utf8") > 4_096 ||
      target.trim() !== target ||
      /[\\\p{Cc}]/u.test(target) ||
      /%(?:[01][\da-f]|7f)|%c2%[89][\da-f]/i.test(target)
    ) {
      throw invalid();
    }
    const authority = /^https?:\/\/([^/?#]+)/i.exec(target)?.[1];
    const parsed = new URL(target);
    if (
      !authority ||
      authority.includes("@") ||
      parsed.username ||
      parsed.password
    ) {
      throw invalid();
    }
    if (parsed.protocol === "https:") return target;
    const port = /^127\.0\.0\.1:(\d+)$/.exec(authority)?.[1];
    if (
      parsed.protocol !== "http:" ||
      parsed.hostname !== "127.0.0.1" ||
      !port ||
      Number(port) < 1 ||
      Number(port) > 65_535
    ) {
      throw invalid();
    }
    return target;
  } catch {
    // URL parser failures can contain the input, which may carry auth state.
    throw invalid();
  }
}

export async function openSystemBrowser(
  url: string | URL,
  options: OpenSystemBrowserOptions = {},
): Promise<void> {
  const { command, args } = browserOpenCommand(url, options.platform);
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("Invalid default browser launcher timeout.");
  }
  const spawnProcess = options.spawnProcess ?? spawn;
  const failure = () =>
    new Error("Unable to open the operating system default browser.");

  await new Promise<void>((resolve, reject) => {
    let child: ChildProcess;
    try {
      child = spawnProcess(command, args, {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      reject(failure());
      return;
    }

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.off("exit", onExit);
      if (error) reject(error);
      else resolve();
    };
    const onError = () => finish(failure());
    const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
      finish(code === 0 && signal === null ? undefined : failure());
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      onExit(code, signal);
      child.off("error", onError);
    };
    const timer = setTimeout(() => {
      finish(
        new Error("Timed out opening the operating system default browser."),
      );
      try {
        // Signal only our launcher PID, never a browser or its process group.
        child.kill("SIGTERM");
      } catch {
        // A failed signal must not prevent the bounded promise from settling.
      }
      child.unref();
    }, timeoutMs);

    // A failed kill can emit an error asynchronously. Keep the error listener
    // until close, even after the promise has settled, to avoid an uncaught error.
    child.on("error", onError);
    child.once("exit", onExit);
    child.once("close", onClose);
  });
}
