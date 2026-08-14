import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8"));

describe("package metadata", () => {
  it("defines the publishable ESM package contract", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.name).toBe("greekssurge-mcp");
    expect(pkg.version).toBe("0.2.0");
    expect(pkg.description).toMatch(/read-only Model Context Protocol server/i);
    expect(pkg.type).toBe("module");
    expect(pkg.engines?.node).toBe(">=20");
    expect(pkg.bin?.["greekssurge-mcp"]).toBe("dist/cli.js");
    expect(pkg.exports?.["."]).toBe("./dist/index.js");
    expect(pkg.repository).toEqual({
      type: "git",
      url: "git+https://github.com/neerazz/greekssurge-mcp.git",
    });
    expect(pkg.homepage).toBe(
      "https://github.com/neerazz/greekssurge-mcp#readme",
    );
    expect(pkg.bugs).toEqual({
      url: "https://github.com/neerazz/greekssurge-mcp/issues",
    });
    expect(pkg.keywords).toEqual(
      expect.arrayContaining([
        "mcp",
        "model-context-protocol",
        "greekssurge",
        "options",
        "cash-secured-put",
        "csp",
        "wheel-strategy",
        "stdio",
        "read-only",
      ]),
    );
    expect(pkg.files).toEqual(["dist", "README.md", "LICENSE", "SECURITY.md"]);
  });

  it("keeps every public version surface aligned", async () => {
    const expected = "0.2.0";
    const pkg = await readJson("package.json");
    const lock = await readJson("package-lock.json");
    const cli = await readFile("src/cli.ts", "utf8");
    const index = await readFile("src/index.ts", "utf8");
    const server = await readFile("src/mcp/create-server.ts", "utf8");
    const verifier = await readFile("scripts/verify-package.mjs", "utf8");

    expect(pkg.version).toBe(expected);
    expect(lock.version).toBe(expected);
    expect(lock.packages[""].version).toBe(expected);
    for (const source of [cli, index, server, verifier]) {
      expect(source).toContain(expected);
      expect(source).not.toContain("0.1.3");
    }
  });

  it("has the expected development scripts and dependency pins", async () => {
    const pkg = await readJson("package.json");

    expect(Object.keys(pkg.scripts)).toEqual(
      expect.arrayContaining([
        "build",
        "check",
        "test",
        "test:coverage",
        "lint",
        "format",
        "format:check",
        "pack:check",
        "scan:secrets",
        "audit:runtime",
        "prepare",
        "prepublishOnly",
        "start",
      ]),
    );
    expect(pkg.scripts.prepare).toBe("npm run build");
    expect(pkg.scripts.build).toBe(
      "node scripts/clean-dist.mjs && tsc -p tsconfig.json",
    );
    expect(pkg.scripts.prepublishOnly).toBe(
      "npm run format:check && npm run lint && npm run check && npm run test && npm run build && npm run audit:runtime && npm run scan:secrets && npm run pack:check",
    );
    expect(pkg.scripts["scan:secrets"]).toBe("node scripts/scan-secrets.mjs");
    expect(pkg.scripts["pack:check"]).toBe("node scripts/verify-package.mjs");
    expect(pkg.scripts["audit:runtime"]).toBe(
      "npm audit --omit=dev --audit-level=high",
    );
    expect(pkg.dependencies?.["@modelcontextprotocol/sdk"]).toBe("1.30.0");
    expect(pkg.dependencies?.zod).toMatch(/^\^4\./);
    expect(pkg.dependencies?.ws).toMatch(/^\^8\./);
    expect(pkg.devDependencies?.["@types/ws"]).toMatch(/^\^8\./);
    expect(pkg.dependencies).not.toHaveProperty("express");
    expect(pkg.dependencies).not.toHaveProperty("express-rate-limit");
  });

  it("keeps typescript inside the peer range typescript-eslint actually allows", async () => {
    const pkg = await readJson("package.json");
    const lock = await readJson("package-lock.json");

    const resolved = (
      lock.packages as Record<string, { version?: string } | undefined>
    )["node_modules/typescript"]?.version;
    expect(resolved).toBeTruthy();

    const declaredMajor = Number(
      /(\d+)/.exec(String(pkg.devDependencies.typescript))?.[1],
    );
    const resolvedMajor = Number(/(\d+)/.exec(String(resolved))?.[1]);

    // typescript-eslint 8.x declares peer typescript ">=4.8.4 <6.1.0". Anything
    // at or above 7 makes `npm ci` unresolvable, which is an install-time
    // failure no later gate can catch.
    expect(declaredMajor).toBeLessThan(7);
    expect(resolvedMajor).toBeLessThan(7);
    expect(declaredMajor).toBe(resolvedMajor);
  });

  it("keeps source and tests out of the npm tarball", async () => {
    const npmIgnore = await readFile(".npmignore", "utf8");

    expect(npmIgnore).toContain("src");
    expect(npmIgnore).toContain("tests");
    expect(npmIgnore).toContain("coverage");
    expect(npmIgnore).toContain("docs");
    expect(npmIgnore).toContain(".github");
    expect(npmIgnore).toContain("scripts");
    expect(npmIgnore).toContain("*.tgz");
  });

  it("defines CI, CodeQL, Dependabot, and secretless npm trusted publishing", async () => {
    const ci = await readFile(".github/workflows/ci.yml", "utf8");
    const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
    const dependabot = await readFile(".github/dependabot.yml", "utf8");
    const publish = await readFile(".github/workflows/publish.yml", "utf8");

    expect(ci).toContain("os: [ubuntu-latest, macos-latest, windows-latest]");
    expect(ci).toContain("node-version: [20.x, 22.x]");
    for (const command of [
      "npm ci",
      "npm run format:check",
      "npm run lint",
      "npm run check",
      "npm run test",
      "npm run build",
      "npm run audit:runtime",
      "npm run scan:secrets",
      "npm run pack:check",
    ])
      expect(ci).toContain(command);
    expect(ci).not.toMatch(/npm publish|NODE_AUTH_TOKEN|id-token: write/i);
    expect(ci).toContain("actions/checkout@v7");
    expect(ci).toContain("actions/setup-node@v7");
    expect(codeql).toContain("actions/checkout@v7");
    expect(codeql).toContain("github/codeql-action/init@v4");
    expect(codeql).toContain("language: [javascript-typescript]");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("package-ecosystem: github-actions");
    // A TypeScript major is unresolvable while typescript-eslint caps its peer
    // range below it: npm ci dies at install and CI never reaches a test.
    // Merging that bump is exactly how main went red.
    expect(dependabot).toContain("dependency-name: typescript");
    expect(dependabot).toContain("version-update:semver-major");
    expect(publish).toContain("types: [published]");
    expect(publish).toContain("id-token: write");
    expect(publish).toContain("contents: read");
    expect(publish).toContain("node-version: 24.x");
    expect(publish).toContain("registry-url: https://registry.npmjs.org");
    expect(publish).toContain("package-manager-cache: false");
    expect(publish).toContain("npm publish --access public");
    expect(publish).not.toMatch(/NODE_AUTH_TOKEN|NPM_TOKEN|secrets\./i);
  });

  it("pins LF line endings so Windows CI evaluates the committed bytes", async () => {
    const attributes = await readFile(".gitattributes", "utf8");

    expect(attributes).toContain("* text=auto eol=lf");
  });

  it("invokes npm through its JavaScript entrypoint on Windows", async () => {
    const verifier = await readFile("scripts/verify-package.mjs", "utf8");

    expect(verifier).toContain('command === "npm"');
    expect(verifier).toContain("process.env.npm_execpath");
    expect(verifier).toContain(".split(/\\r?\\n/)");
    expect(verifier).not.toContain('"npm.cmd"');
    expect(verifier).toContain("package/dist/auth/cdp");
    expect(verifier).toContain("package/dist/auth/browser-paths");
  });
});
