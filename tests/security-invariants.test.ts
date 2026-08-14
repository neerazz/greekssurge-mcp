import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { registerGreeksSurgePrompts } from "../src/mcp/prompts.js";
import { registerGreeksSurgeTools } from "../src/mcp/tools.js";

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return files.flat();
}

const releaseTrackedFiles = [
  "README.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "package.json",
  ".npmignore",
];
const syntheticMarkers = [
  "synthetic-test-token",
  "site-token",
  "token-like",
  "raw-upstream-secret-must-not-leak",
  "must-be-stripped",
  "compound-client-secret",
  "compound-user-password",
  "compound-session-cookie",
];

describe("security invariants", () => {
  it("confines managed Chromium session import to its package profile, exact origin, and loopback debugger", async () => {
    const corpus = await readFile("src/auth/chromium-session.ts", "utf8");
    const config = await readFile("src/config.ts", "utf8");
    const pkg = JSON.parse(await readFile("package.json", "utf8"));

    expect(corpus).toContain('"https://csp.greekssurge.com"');
    expect(corpus).toContain("localStorage.getItem('gs_token')");
    expect(corpus).toMatch(/127\.0\.0\.1.*localhost.*::1/s);
    expect(corpus).toMatch(/\/devtools\\\/page/);
    expect(corpus).toMatch(/spawn\(|--user-data-dir|--remote-debugging-port/);
    expect(config).toContain("chromium-profile");
    expect(pkg.dependencies).toHaveProperty("ws");
    expect(pkg.dependencies["@puppeteer/browsers"]).toBe("3.2.0");
    expect(pkg.devDependencies).toHaveProperty("@types/ws");
  });

  it("does not require or advertise BrowserOS anywhere in the public login contract", async () => {
    const corpus = (
      await Promise.all(
        [
          "README.md",
          "SECURITY.md",
          "src/cli.ts",
          "src/auth/local-login.ts",
        ].map((path) => readFile(path, "utf8")),
      )
    ).join("\n");

    expect(corpus).not.toMatch(/BrowserOS/i);
  });

  it("does not contain forbidden mutation, admin, billing, or payment endpoint literals", async () => {
    const srcFiles = (await walk("src")).filter((path) => path.endsWith(".ts"));
    const corpus = (
      await Promise.all(srcFiles.map((path) => readFile(path, "utf8")))
    ).join("\n");

    expect(corpus).not.toMatch(
      /requestJson\(\s*["'`](?:POST|PUT|PATCH|DELETE)/,
    );
    expect(corpus).not.toMatch(
      /\/api\/(?:admin|billing|payment|payments|checkout|subscribe|orders?|trades?\/execute)\b/i,
    );
    expect(corpus).not.toMatch(
      /\b(?:placeOrder|executeTrade|createCheckout|cancelSubscription|updateBilling)\b/,
    );
  });

  it("keeps every MCP tool annotated read-only and non-destructive", async () => {
    const registered: Array<{
      name: string;
      config: { annotations?: Record<string, unknown> };
    }> = [];
    registerOnly(registered);

    expect(registered).toHaveLength(11);
    for (const tool of registered) {
      expect(tool.config.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
    }
  });

  it("does not commit token-like release content outside clearly synthetic test markers", async () => {
    // Release-facing docs plus tests. Source is covered separately by
    // `npm run scan:secrets`, which understands code shapes.
    const files = [
      ...releaseTrackedFiles,
      ...(await walk("tests")).filter((path) => path.endsWith(".test.ts")),
    ];
    const tokenPattern =
      /(?:ghp_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|secret|password|bearer|authorization|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,})/i;

    for (const file of files) {
      const text = await readFile(file, "utf8");
      const matches = text.match(new RegExp(tokenPattern.source, "gi")) ?? [];
      for (const match of matches) {
        expect(
          syntheticMarkers.some((marker) => match.includes(marker)) ||
            /token store|token path|auth token|GreeksSurge token|token-like|Authorization header|Bearer token/i.test(
              match,
            ),
        ).toBe(true);
      }
    }
  });

  it("keeps the package publish allowlist narrow and excludes internal specs", async () => {
    const pkg = JSON.parse(await readFile("package.json", "utf8"));
    const npmIgnore = await readFile(".npmignore", "utf8");
    const gitIgnore = await readFile(".gitignore", "utf8");

    expect(pkg.files).toEqual(["dist", "README.md", "LICENSE", "SECURITY.md"]);
    // docs/ is local working material: neither published nor pushed.
    expect(JSON.stringify(pkg.files)).not.toContain("docs");
    expect(gitIgnore).toMatch(/^docs\/$/m);
    for (const denied of [
      "src",
      "tests",
      "docs",
      ".github",
      "scripts",
      "*.tgz",
    ])
      expect(npmIgnore).toContain(denied);
  });

  it("keeps every prompt read-only, guardrailed, and free of injected instructions", () => {
    const registered: Array<{
      name: string;
      config: { title?: string; description?: string };
      text: string;
    }> = [];
    registerGreeksSurgePrompts({
      register: (name, config, handler) => {
        const result = handler({
          ticker: "ASTS",
          topic: "cash-secured-puts",
          outcome: "ASSIGNED",
        });
        registered.push({
          name,
          config,
          text: result.messages.map((m) => m.content.text).join("\n"),
        });
      },
    });

    expect(registered).toHaveLength(11);
    for (const prompt of registered) {
      expect(prompt.config.title).toBeTruthy();
      expect(prompt.config.description).toBeTruthy();
      // Every prompt must restate the read-only and no-advice boundaries.
      expect(prompt.text).toMatch(/read-only/i);
      expect(prompt.text).toMatch(/not financial advice/i);
      expect(prompt.text).toMatch(/untrusted data/i);
      // Prompts must never instruct the model to trade or invent values.
      expect(prompt.text).not.toMatch(
        /\b(?:place|submit|execute|cancel)\s+(?:an?\s+)?(?:order|trade)/i,
      );
      expect(prompt.text).not.toMatch(/gs_token|Authorization:|Bearer /);
    }
  });

  it("scans the complete public source tree rather than only package docs", async () => {
    const scanner = await readFile("scripts/scan-secrets.mjs", "utf8");

    for (const publicRoot of ["src", "tests", "docs"])
      expect(scanner).toContain(`"${publicRoot}"`);
  });
});

function registerOnly(
  registered: Array<{
    name: string;
    config: { annotations?: Record<string, unknown> };
  }>,
) {
  registerGreeksSurgeTools({
    tokenProvider: async () => undefined,
    clientFactory: () => {
      throw new Error(
        "client should not be constructed while registering tools",
      );
    },
    register: (name, config) => registered.push({ name, config }),
  });
}
