import { ChildProcess } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  browserOpenCommand,
  openSystemBrowser,
  type SpawnProcess,
} from "../src/auth/system-browser.js";

const loginUrl = "https://csp.greekssurge.com/login";

function windowsScript(url: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  $url = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${Buffer.from(url, "utf8").toString("base64")}'))`,
    "  Start-Process -FilePath $url -ErrorAction Stop",
    "  exit 0",
    "} catch { exit 1 }",
  ].join("\n");
}

describe("OS-default browser commands", () => {
  it.each([
    ["darwin", "open"],
    ["linux", "xdg-open"],
  ] as const)(
    "uses the %s default handler without choosing a browser",
    (platform, command) => {
      expect(browserOpenCommand(new URL(loginUrl), platform)).toEqual({
        command,
        args: [loginUrl],
      });
    },
  );

  it("uses Windows Start-Process with encoded data, not interpolated URL syntax", () => {
    const { command, args } = browserOpenCommand(loginUrl, "win32");
    expect(command).toBe("powershell.exe");
    expect(args.slice(0, -1)).toEqual([
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-EncodedCommand",
    ]);
    expect(Buffer.from(args.at(-1)!, "base64").toString("utf16le")).toBe(
      windowsScript(loginUrl),
    );
  });

  it.each(["darwin", "linux", "win32"] as const)(
    "keeps shell metacharacters literal on %s",
    (platform) => {
      const url =
        "https://example.test/a'\";$(touch%20/tmp/nope)`&|<>^()%!%20‘’/?q=$env:PATH#fragment";
      const { args } = browserOpenCommand(url, platform);
      if (platform === "win32") {
        expect(Buffer.from(args.at(-1)!, "base64").toString("utf16le")).toBe(
          windowsScript(url),
        );
      } else {
        expect(args).toEqual([url]);
      }
    },
  );

  it.each([
    "http://127.0.0.1:49152/login?state=synthetic-state",
    "http://127.0.0.1:80/login",
    "http://127.0.0.1:1/",
    "http://127.0.0.1:65535/",
    "https://example.test/",
    "https://example.test:8443/login",
  ])("accepts a bounded browser URL: %s", (url) => {
    expect(browserOpenCommand(url, "darwin").args).toEqual([url]);
  });

  it.each([
    "javascript:alert(1)",
    "file:///etc/passwd",
    "data:text/html,<script>alert(1)</script>",
    "ftp://example.test/",
    "http://example.test:3000/",
    "http://localhost:3000/",
    "http://[::1]:3000/",
    "http://127.0.0.2:3000/",
    "http://127.1:3000/",
    "http://2130706433:3000/",
    "http://0x7f000001:3000/",
    "http://127.0.0.1./",
    "http://127.0.0.1:3000.example.test/",
    "http://127.0.0.1/",
    "http://127.0.0.1:/",
    "http://127.0.0.1:0/",
    "http://127.0.0.1:65536/",
    "http://127.0.0.1:-1/",
    "http://127.0.0.1:80junk/",
    "http://127.0.0.1:3000@evil.test/",
    "http://user@127.0.0.1:3000/",
    "https://user:secret@example.test/",
    "https://user@example.test/",
    "https://@example.test/",
    "https://:secret@example.test/",
    "https://user%40example.test@evil.test/",
    "https:///example.test/",
    "https:example.test/",
    "https:\\example.test\\login",
    "https://example.test\\@evil.test/",
    " https://example.test/",
    "https://example.test/\n",
    "https://exa\tmple.test/",
    "https://example.test/\0",
    "https://example.test/\u007f",
    "https://example.test/\u0085",
    "https://example.test/%00",
    "https://example.test/?q=%0a",
    "https://example.test/%0D",
    "https://example.test/%1f",
    "https://example.test/%7f",
    "not a URL",
    "",
  ])("rejects unsafe or malformed URLs without echoing input: %j", (url) => {
    expect(() => browserOpenCommand(url, "darwin")).toThrow(
      "Invalid browser authorization URL.",
    );
  });

  it("rejects userinfo in URL objects too", () => {
    expect(() =>
      browserOpenCommand(new URL("https://user:secret@example.test/"), "linux"),
    ).toThrow("Invalid browser authorization URL.");
  });

  it("rejects unsupported platforms without echoing untrusted values", () => {
    expect(() => browserOpenCommand(loginUrl, "freebsd")).toThrow(
      "Unsupported platform for the operating system default browser.",
    );
  });

  it("bounds encoded command size by limiting URLs to 4096 UTF-8 bytes", () => {
    const prefix = "https://example.test/";
    const atLimit = prefix + "a".repeat(4096 - Buffer.byteLength(prefix));
    expect(browserOpenCommand(atLimit, "win32").command).toBe("powershell.exe");
    expect(() => browserOpenCommand(atLimit + "a", "win32")).toThrow(
      "Invalid browser authorization URL.",
    );
    expect(() =>
      browserOpenCommand(prefix + "é".repeat(3000), "win32"),
    ).toThrow("Invalid browser authorization URL.");
  });
});

function launcher() {
  const child = new ChildProcess();
  const kill = vi.spyOn(child, "kill").mockReturnValue(true);
  const unref = vi.spyOn(child, "unref").mockImplementation(() => undefined);
  const spawnProcess = vi.fn<SpawnProcess>(() => child);
  return { child, kill, unref, spawnProcess };
}

describe("OS-default browser launcher", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(["darwin", "linux", "win32"] as const)(
    "spawns the %s launcher without a shell and waits for successful exit",
    async (platform) => {
      const { child, kill, unref, spawnProcess } = launcher();
      let settled = false;
      const result = openSystemBrowser(loginUrl, { platform, spawnProcess });
      void result.then(() => {
        settled = true;
      });
      const { command, args } = browserOpenCommand(loginUrl, platform);
      expect(spawnProcess).toHaveBeenCalledExactlyOnceWith(command, args, {
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      });
      child.emit("spawn");
      await Promise.resolve();
      expect(settled).toBe(false);
      expect(unref).not.toHaveBeenCalled();
      child.emit("exit", 0, null);
      await expect(result).resolves.toBeUndefined();
      expect(kill).not.toHaveBeenCalled();
      child.emit("close", 0, null);
      expect(child.listenerCount("exit")).toBe(0);
      expect(child.listenerCount("error")).toBe(0);
      expect(child.listenerCount("close")).toBe(0);
    },
  );

  it.each([
    [1, null],
    [42, null],
    [null, "SIGTERM"],
    [0, "SIGTERM"],
  ] as const)("rejects launcher status %s / %s", async (code, signal) => {
    const { child, spawnProcess } = launcher();
    const result = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess,
    });
    child.emit("exit", code, signal);
    await expect(result).rejects.toThrow(
      "Unable to open the operating system default browser.",
    );
    child.emit("close", code, signal);
    expect(child.listenerCount("error")).toBe(0);
  });

  it("redacts synchronous spawn exceptions", async () => {
    const spawnProcess = vi.fn<SpawnProcess>(() => {
      throw new Error(`spawn failed for ${loginUrl}?secret=synthetic`);
    });
    await expect(
      openSystemBrowser(loginUrl, { platform: "darwin", spawnProcess }),
    ).rejects.toThrow("Unable to open the operating system default browser.");
  });

  it("redacts asynchronous launcher errors and drains later errors until close", async () => {
    const { child, spawnProcess } = launcher();
    const result = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess,
    });
    child.emit("error", new Error(`ENOENT ${loginUrl}?secret=synthetic`));
    await expect(result).rejects.toThrow(
      "Unable to open the operating system default browser.",
    );
    expect(() => child.emit("error", new Error("late error"))).not.toThrow();
    child.emit("close", -2, null);
    expect(child.listenerCount("error")).toBe(0);
  });

  it("rejects invalid URLs before spawning anything", async () => {
    const { spawnProcess } = launcher();
    await expect(
      openSystemBrowser("http://evil.test:3000/", { spawnProcess }),
    ).rejects.toThrow("Invalid browser authorization URL.");
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("rejects unsupported platforms before spawning anything", async () => {
    const { spawnProcess } = launcher();
    await expect(
      openSystemBrowser(loginUrl, { platform: "freebsd", spawnProcess }),
    ).rejects.toThrow(
      "Unsupported platform for the operating system default browser.",
    );
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, NaN, Infinity, 60_001, 2 ** 31])(
    "rejects invalid timeout %s before spawning",
    async (timeoutMs) => {
      const { spawnProcess } = launcher();
      await expect(
        openSystemBrowser(loginUrl, {
          platform: "darwin",
          spawnProcess,
          timeoutMs,
        }),
      ).rejects.toThrow("Invalid default browser launcher timeout.");
      expect(spawnProcess).not.toHaveBeenCalled();
    },
  );

  it("times out, stops only its launcher, and drains errors from termination", async () => {
    vi.useFakeTimers();
    const { child, kill, unref, spawnProcess } = launcher();
    const result = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess,
      timeoutMs: 25,
    });
    const rejection = expect(result).rejects.toThrow(
      "Timed out opening the operating system default browser.",
    );
    await vi.advanceTimersByTimeAsync(24);
    expect(kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(kill).toHaveBeenCalledExactlyOnceWith("SIGTERM");
    expect(unref).toHaveBeenCalledOnce();
    expect(() => child.emit("error", new Error("kill failed"))).not.toThrow();
    child.emit("exit", 0, null);
    child.emit("close", 0, null);
    expect(child.listenerCount("error")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses a ten-second timeout when none is specified", async () => {
    vi.useFakeTimers();
    const { child, kill, spawnProcess } = launcher();
    const result = openSystemBrowser(loginUrl, {
      platform: "darwin",
      spawnProcess,
    });
    const rejection = expect(result).rejects.toThrow(
      "Timed out opening the operating system default browser.",
    );
    await vi.advanceTimersByTimeAsync(9_999);
    expect(kill).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(kill).toHaveBeenCalledOnce();
    child.emit("close", null, "SIGTERM");
  });

  it("still settles the timeout when terminating the launcher throws", async () => {
    vi.useFakeTimers();
    const { child, kill, unref, spawnProcess } = launcher();
    kill.mockImplementation(() => {
      throw new Error("synthetic kill failure");
    });
    const result = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess,
      timeoutMs: 1,
    });
    const rejection = expect(result).rejects.toThrow(
      "Timed out opening the operating system default browser.",
    );
    await vi.advanceTimersByTimeAsync(1);
    await rejection;
    expect(unref).toHaveBeenCalledOnce();
    child.emit("close", null, "SIGTERM");
  });

  it("clears the timer after a successful exit", async () => {
    vi.useFakeTimers();
    const { child, kill, spawnProcess } = launcher();
    const result = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess,
      timeoutMs: 1,
    });
    child.emit("exit", 0, null);
    child.emit("close", 0, null);
    await expect(result).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(10);
    expect(kill).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
