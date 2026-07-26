import { lstat, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { FileTokenStore } from "../src/auth/token-store.js";

async function tempTokenPath() {
  const root = await mkdtemp(join(tmpdir(), "greekssurge-token-test-"));
  return join(root, "config", "greekssurge-mcp", "token.json");
}

describe("FileTokenStore", () => {
  it("prefers an environment token without writing it to disk", async () => {
    const tokenPath = await tempTokenPath();
    const store = new FileTokenStore({
      tokenPath,
      env: { GREEKSSURGE_TOKEN: "env-token" },
    });

    expect(await store.read()).toBe("env-token");
    await expect(readFile(tokenPath, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("returns undefined when no token exists", async () => {
    const store = new FileTokenStore({
      tokenPath: await tempTokenPath(),
      env: {},
    });
    await expect(store.read()).resolves.toBeUndefined();
  });

  it("writes atomically with POSIX 0600 permissions where supported", async () => {
    const tokenPath = await tempTokenPath();
    const store = new FileTokenStore({ tokenPath, env: {} });

    await store.write("site-token");

    expect(JSON.parse(await readFile(tokenPath, "utf8"))).toEqual({
      token: "site-token",
    });
    if (process.platform !== "win32") {
      const stat = await lstat(tokenPath);
      expect(stat.mode & 0o777).toBe(0o600);
    }
  });

  it("recovers from malformed store files without leaking token-like contents", async () => {
    const tokenPath = await tempTokenPath();
    await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
    await writeFile(tokenPath, '{"token":"secret-token"', { mode: 0o600 });
    const store = new FileTokenStore({ tokenPath, env: {} });

    await expect(store.read()).rejects.not.toThrow(/secret-token/);
  });

  it("clears the stored token on logout", async () => {
    const tokenPath = await tempTokenPath();
    const store = new FileTokenStore({ tokenPath, env: {} });
    await store.write("site-token");

    await store.clear();

    await expect(readFile(tokenPath, "utf8")).rejects.toThrow(/ENOENT/);
    await expect(store.read()).resolves.toBeUndefined();
  });

  it("rejects symlink token targets", async () => {
    const tokenPath = await tempTokenPath();
    await mkdir(dirname(tokenPath), { recursive: true, mode: 0o700 });
    await symlink("/tmp/elsewhere", tokenPath);
    const store = new FileTokenStore({ tokenPath, env: {} });

    await expect(store.write("site-token")).rejects.toThrow(/symlink/i);
  });
});
