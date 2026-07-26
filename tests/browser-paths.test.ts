import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  discoverChromiumExecutable,
  parseDevToolsActivePort,
} from "../src/auth/browser-paths.js";

const exists = (paths: string[]) => (path: string) => paths.includes(path);

describe("browser path discovery", () => {
  it("uses explicit executable override first", () => {
    expect(
      discoverChromiumExecutable({
        override: "/custom/chrome",
        exists: exists(["/custom/chrome"]),
      }),
    ).toBe("/custom/chrome");
  });

  it("discovers Chrome, Edge, and Brave candidates across platforms", () => {
    expect(
      discoverChromiumExecutable({
        platform: "darwin",
        exists: exists([
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        ]),
      }),
    ).toContain("Google Chrome");
    expect(
      discoverChromiumExecutable({
        platform: "win32",
        exists: exists([
          "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        ]),
      }),
    ).toContain("msedge.exe");
    expect(
      discoverChromiumExecutable({
        platform: "linux",
        exists: exists(["/usr/bin/brave-browser"]),
      }),
    ).toContain("brave-browser");
  });

  it("throws actionable missing browser guidance", () => {
    expect(() =>
      discoverChromiumExecutable({ platform: "linux", exists: () => false }),
    ).toThrow(/Install Google Chrome, Chromium, Edge, or Brave/);
  });

  it("parses DevToolsActivePort", async () => {
    const dir = await mkdtemp(join(tmpdir(), "cdp-port-"));
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, "DevToolsActivePort"),
      "54321\n/devtools/browser/abc\n",
    );

    await expect(parseDevToolsActivePort(dir)).resolves.toEqual({
      port: 54321,
      browserPath: "/devtools/browser/abc",
    });
  });
});
