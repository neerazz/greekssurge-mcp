import { describe, expect, it, vi } from "vitest";
import {
  chromiumExecutableCandidates,
  ensureChromiumExecutable,
  findGreeksSurgeChromiumPage,
  launchChromiumForToken,
  readChromiumTokenFromCdp,
  type ChromiumPage,
} from "../src/auth/chromium-session.js";

const exactPage: ChromiumPage = {
  type: "page",
  url: "https://csp.greekssurge.com/dashboard",
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/synthetic-page-id",
};

describe("managed Chromium discovery", () => {
  it("discovers Chromium-family browsers across supported OS paths", () => {
    expect(
      chromiumExecutableCandidates("darwin", {
        PATH: "/custom/bin",
      }),
    ).toEqual(
      expect.arrayContaining([
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
        "/custom/bin/chromium",
      ]),
    );
    expect(
      chromiumExecutableCandidates("linux", { PATH: "/bin:/opt/bin" }),
    ).toEqual(
      expect.arrayContaining(["/bin/chromium", "/opt/bin/google-chrome"]),
    );
    expect(
      chromiumExecutableCandidates("win32", {
        LOCALAPPDATA: "C:\\Users\\person\\AppData\\Local",
        PROGRAMFILES: "C:\\Program Files",
        "PROGRAMFILES(X86)": "C:\\Program Files (x86)",
        PATH: "C:\\Tools",
      }),
    ).toEqual(
      expect.arrayContaining([
        "C:\\Users\\person\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Tools\\chrome.exe",
      ]),
    );
  });

  it("uses an installed browser before attempting a download", async () => {
    const download = vi.fn(async () => "/cache/chrome");
    const result = await ensureChromiumExecutable({
      candidates: ["/missing", "/installed/chrome"],
      access: vi.fn(async (path) => {
        if (path !== "/installed/chrome") throw new Error("ENOENT");
      }),
      download,
    });

    expect(result).toEqual({
      executablePath: "/installed/chrome",
      source: "system",
    });
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads a managed Chromium browser only when none is installed", async () => {
    const download = vi.fn(async () => "/cache/chrome-for-testing");
    const result = await ensureChromiumExecutable({
      candidates: ["/missing"],
      access: vi.fn(async (path) => {
        if (path !== "/cache/chrome-for-testing") throw new Error("ENOENT");
      }),
      download,
    });

    expect(result).toEqual({
      executablePath: "/cache/chrome-for-testing",
      source: "downloaded",
    });
    expect(download).toHaveBeenCalledOnce();
  });
});

describe("managed Chromium CDP session", () => {
  it("selects only an exact GreeksSurge page with a loopback DevTools endpoint", () => {
    expect(
      findGreeksSurgeChromiumPage([
        { ...exactPage, url: "https://csp.greekssurge.com.attacker.test/" },
        {
          ...exactPage,
          webSocketDebuggerUrl:
            "ws://attacker.test:9222/devtools/page/synthetic-page-id",
        },
        exactPage,
      ]),
    ).toEqual(exactPage);
  });

  it("reads only the exact-origin token through loopback CDP", async () => {
    const fetchImpl = vi.fn(async () => Response.json([exactPage]));
    const evaluateToken = vi.fn(async () => "synthetic-test-token");

    await expect(
      readChromiumTokenFromCdp({
        port: 9222,
        fetchImpl: fetchImpl as typeof fetch,
        evaluateToken,
      }),
    ).resolves.toBe("synthetic-test-token");
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:9222/json/list",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(evaluateToken).toHaveBeenCalledWith(exactPage.webSocketDebuggerUrl);
  });

  it("launches with a package-owned profile and closes only its child process", async () => {
    const argsSeen: string[] = [];
    const kill = vi.fn(() => true);
    const spawnBrowser = vi.fn((_executable: string, args: string[]) => {
      argsSeen.push(...args);
      return { kill };
    });
    let reads = 0;

    const token = await launchChromiumForToken({
      executablePath: "/installed/chrome",
      profileDir: "/private/greekssurge/chromium-profile",
      spawnBrowser,
      mkdir: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
      readFile: vi.fn(async () => {
        reads += 1;
        if (reads === 1) throw new Error("ENOENT");
        return "9222\n/devtools/browser/synthetic";
      }),
      sleep: vi.fn(async () => undefined),
      readToken: vi.fn(async (port) => {
        expect(port).toBe(9222);
        return "synthetic-test-token";
      }),
      timeoutMs: 1_000,
    });

    expect(token).toBe("synthetic-test-token");
    expect(argsSeen).toEqual(
      expect.arrayContaining([
        "--remote-debugging-port=0",
        "--user-data-dir=/private/greekssurge/chromium-profile",
        "https://csp.greekssurge.com/login",
      ]),
    );
    expect(argsSeen.some((arg) => /Default|User Data/.test(arg))).toBe(false);
    expect(kill).toHaveBeenCalledOnce();
  });

  it("fails closed on invalid ports and captured values", async () => {
    const fetchImpl = vi.fn(async () => Response.json([exactPage]));
    await expect(
      readChromiumTokenFromCdp({
        port: 0,
        fetchImpl: fetchImpl as typeof fetch,
        evaluateToken: vi.fn(),
      }),
    ).rejects.toThrow(/Chromium/i);
    await expect(
      readChromiumTokenFromCdp({
        port: 9222,
        fetchImpl: fetchImpl as typeof fetch,
        evaluateToken: vi.fn(async () => "contains whitespace"),
      }),
    ).rejects.toThrow(/valid GreeksSurge session/i);
  });
});
