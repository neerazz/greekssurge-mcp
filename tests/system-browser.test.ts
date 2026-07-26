import { EventEmitter } from "node:events";
import type { ChildProcess, SpawnOptions } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import {
  browserOpenCommand,
  openSystemBrowser,
} from "../src/auth/system-browser.js";

const loginUrl = new URL(
  "https://csp.greekssurge.com/api/auth/mcp/authorize?state=test",
);

function fakeChild() {
  const child = new EventEmitter() as EventEmitter &
    Pick<ChildProcess, "once" | "unref">;
  child.unref = vi.fn();
  return child;
}

describe("system browser launcher", () => {
  it.each([
    ["darwin", "open"],
    ["win32", "explorer.exe"],
    ["linux", "xdg-open"],
  ] as const)(
    "uses the operating system default browser on %s",
    (platform, command) => {
      expect(browserOpenCommand(loginUrl, platform)).toEqual({
        command,
        args: [loginUrl.toString()],
      });
    },
  );

  it("rejects unsupported platforms instead of guessing a browser", () => {
    expect(() => browserOpenCommand(loginUrl, "freebsd")).toThrow(
      /unsupported platform/i,
    );
  });

  it("keeps shell metacharacters percent-encoded inside one Windows argv element", () => {
    const url = new URL(
      "https://csp.greekssurge.com/api/auth/mcp/authorize?state=a%26b%25c&redirect_uri=http%3A%2F%2F127.0.0.1%3A45678%2Fcallback",
    );

    expect(browserOpenCommand(url, "win32")).toEqual({
      command: "explorer.exe",
      args: [url.toString()],
    });
  });

  it("resolves only after the browser launcher exits successfully", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn(
      (_command: string, _args: readonly string[], _options: SpawnOptions) =>
        child as ChildProcess,
    );

    const launched = openSystemBrowser(loginUrl, {
      platform: "darwin",
      spawnProcess,
    });
    child.emit("spawn");
    child.emit("exit", 0, null);
    await launched;

    expect(spawnProcess).toHaveBeenCalledWith(
      "open",
      [loginUrl.toString()],
      expect.objectContaining({
        detached: true,
        shell: false,
        stdio: "ignore",
        windowsHide: true,
      }),
    );
    expect(child.unref).toHaveBeenCalledOnce();
  });

  it("reports browser-launch failures without swallowing them", async () => {
    const child = fakeChild();
    const spawnProcess = vi.fn(() => child as ChildProcess);

    const launched = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess,
    });
    child.emit("error", new Error("xdg-open missing"));

    await expect(launched).rejects.toThrow(/default browser/i);
  });

  it("rejects a launcher that spawns and then exits nonzero", async () => {
    const child = fakeChild();
    const launched = openSystemBrowser(loginUrl, {
      platform: "linux",
      spawnProcess: () => child as ChildProcess,
    });

    child.emit("spawn");
    child.emit("exit", 3, null);

    await expect(launched).rejects.toThrow(/default browser/i);
  });
});
