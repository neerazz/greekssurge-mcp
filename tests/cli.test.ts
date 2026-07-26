import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isCliEntrypoint, runCli } from "../src/cli.js";

async function capture(
  args: string[],
  env: Record<string, string | undefined> = {},
) {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, {
    env: {
      ...env,
      HOME: await mkdtemp(join(tmpdir(), "greekssurge-cli-home-")),
    },
    stdout: (line) => {
      stdout += line;
    },
    stderr: (line) => {
      stderr += line;
    },
  });
  return { code, stdout, stderr };
}

describe("CLI lifecycle", () => {
  it("prints help and version", async () => {
    expect(await capture(["--help"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining("greekssurge-mcp auth login"),
    });
    expect(await capture(["--version"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining("0.1.0"),
    });
  });

  it("rejects invalid flags on stderr", async () => {
    const result = await capture(["--bogus"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown command or flag");
    expect(result.stdout).toBe("");
    expect(await capture(["setup", "--bogus"])).toMatchObject({ code: 2 });
    expect(await capture(["auth", "status", "--bogus"])).toMatchObject({
      code: 2,
    });
    expect(await capture(["auth", "login", "--bogus"])).toMatchObject({
      code: 2,
    });
  });

  it("recognizes npm .bin symlinks by resolved path", () => {
    const resolve = (path: string) =>
      path.includes(".bin") ? "/pkg/dist/cli.js" : path;
    expect(
      isCliEntrypoint(
        "/pkg/dist/cli.js",
        "/pkg/node_modules/.bin/greekssurge-mcp",
        resolve,
      ),
    ).toBe(true);
  });

  it("supports auth status, auth logout, auth login dry-run, and setup dry-run", async () => {
    expect(await capture(["auth", "status"])).toMatchObject({
      code: 1,
      stdout: expect.stringContaining("Not authenticated"),
    });
    expect(await capture(["auth", "logout"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining("Logged out"),
    });
    expect(await capture(["auth", "login", "--dry-run"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining("/api/auth/google"),
    });
    expect(await capture(["setup"])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining("npx -y greekssurge-mcp"),
    });
  });

  it("requires stdio for serve in Phase A and keeps diagnostics off stdout", async () => {
    const http = await capture(["serve", "--transport", "http"]);
    expect(http.code).toBe(2);
    expect(http.stdout).toBe("");
    expect(http.stderr).toContain("HTTP transport is out of Phase A scope");
  });
});
