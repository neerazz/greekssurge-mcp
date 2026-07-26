import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readJson = async (path: string) =>
  JSON.parse(await readFile(path, "utf8"));

describe("package metadata", () => {
  it("defines the publishable ESM package contract", async () => {
    const pkg = await readJson("package.json");

    expect(pkg.name).toBe("greekssurge-mcp");
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
        "stdio",
        "read-only",
      ]),
    );
    expect(pkg.files).toEqual([
      "dist",
      "README.md",
      "LICENSE",
      "SECURITY.md",
      "docs/clients/*.md",
    ]);
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
    expect(pkg.scripts.prepublishOnly).toBe(
      "npm run format:check && npm run lint && npm run check && npm run test && npm run build && npm run audit:runtime && npm run scan:secrets && npm run pack:check",
    );
    expect(pkg.scripts["scan:secrets"]).toBe("node scripts/scan-secrets.mjs");
    expect(pkg.scripts["pack:check"]).toBe("node scripts/verify-package.mjs");
    expect(pkg.scripts["audit:runtime"]).toBe(
      "npm audit --omit=dev --audit-level=high",
    );
    expect(pkg.dependencies?.["@modelcontextprotocol/sdk"]).toBe("1.29.0");
    expect(pkg.dependencies?.zod).toMatch(/^\^4\./);
    expect(pkg.dependencies?.ws).toMatch(/^\^8\./);
    expect(pkg.dependencies).not.toHaveProperty("express");
    expect(pkg.dependencies).not.toHaveProperty("express-rate-limit");
  });

  it("keeps source and tests out of the npm tarball", async () => {
    const npmIgnore = await readFile(".npmignore", "utf8");

    expect(npmIgnore).toContain("src");
    expect(npmIgnore).toContain("tests");
    expect(npmIgnore).toContain("coverage");
    expect(npmIgnore).toContain("docs/superpowers");
    expect(npmIgnore).toContain(".github");
    expect(npmIgnore).toContain("scripts");
    expect(npmIgnore).toContain("*.tgz");
  });

  it("defines CI, CodeQL, and Dependabot without any publish workflow", async () => {
    const ci = await readFile(".github/workflows/ci.yml", "utf8");
    const codeql = await readFile(".github/workflows/codeql.yml", "utf8");
    const dependabot = await readFile(".github/dependabot.yml", "utf8");

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
    expect(codeql).toContain("github/codeql-action/init@v3");
    expect(codeql).toContain("language: [javascript-typescript]");
    expect(dependabot).toContain("package-ecosystem: npm");
    expect(dependabot).toContain("package-ecosystem: github-actions");
  });

  it("pins LF line endings so Windows CI evaluates the committed bytes", async () => {
    const attributes = await readFile(".gitattributes", "utf8");

    expect(attributes).toContain("* text=auto eol=lf");
  });

  it("invokes npm through the Windows command shim in package verification", async () => {
    const verifier = await readFile("scripts/verify-package.mjs", "utf8");

    expect(verifier).toContain('command === "npm"');
    expect(verifier).toContain('"npm.cmd"');
  });
});
