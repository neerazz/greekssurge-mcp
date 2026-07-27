import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");
const docs = {
  readme: "README.md",
  security: "SECURITY.md",
  contributing: "CONTRIBUTING.md",
  codeOfConduct: "CODE_OF_CONDUCT.md",
};

// `docs/` is local-only working material: gitignored and unpublished. Everything an
// end user needs must therefore be reachable from README.md alone.
const clientSetups = [
  [
    "Claude Code",
    "claude mcp add --scope user greekssurge -- npx -y greekssurge-mcp",
  ],
  ["Codex CLI", "codex mcp add greekssurge -- npx -y greekssurge-mcp"],
  [
    "Gemini CLI",
    "gemini mcp add --scope user --transport stdio greekssurge npx -y greekssurge-mcp",
  ],
  ["Claude Desktop", "claude_desktop_config.json"],
  ["Cursor", "~/.cursor/mcp.json"],
  ["VS Code", '"servers"'],
] as const;

const promptNames = [
  "account_overview",
  "screen_ideas",
  "performance_retrospective",
  "assignment_review",
  "watchlist_digest",
  "learn_concept",
  "learning_path",
] as const;

const toolNames = [
  "get_account",
  "get_market_status",
  "list_trade_ideas",
  "get_available_filters",
  "get_performance_stats",
  "list_trade_history",
  "list_education",
  "get_education_article",
  "get_watchlist",
  "get_preferences",
] as const;

describe("public release documentation", () => {
  it("starts with the shortest supported local stdio path and explicit GitHub fallback", async () => {
    const readme = await read(docs.readme);

    expect(readme).toContain("Node.js 20+");
    expect(readme).toContain("npx -y greekssurge-mcp auth login");
    expect(readme).toContain("npx -y greekssurge-mcp");
    expect(readme).toMatch(/verify[^\n]+get_account/i);
    expect(readme).toContain("github:neerazz/greekssurge-mcp#v0.1.1");
    expect(readme).toMatch(/published on npm/i);
    expect(readme).toMatch(/fallback-only/i);
    expect(readme).toContain("https://github.com/neerazz/greekssurge-mcp");
  });

  it("shows build and npm status badges that point at real workflows and the package", async () => {
    const readme = await read(docs.readme);
    const pkg = JSON.parse(await readFile("package.json", "utf8")) as {
      name: string;
    };

    // Build status must reference workflows that actually exist in this repo.
    for (const workflow of ["ci.yml", "codeql.yml"]) {
      expect(readme).toContain(
        `https://github.com/neerazz/greekssurge-mcp/actions/workflows/${workflow}/badge.svg`,
      );
      await expect(
        readFile(`.github/workflows/${workflow}`, "utf8"),
      ).resolves.toBeTruthy();
    }

    // npm badges must track the package this repo actually publishes.
    expect(readme).toContain(`https://img.shields.io/npm/v/${pkg.name}`);
    expect(readme).toContain(`https://www.npmjs.com/package/${pkg.name}`);
    expect(readme).toMatch(/img\.shields\.io\/npm\/l\//);

    // Badges must be markdown images wired to a link, not bare text.
    expect(readme).toMatch(/\[!\[CI\]\([^)]+badge\.svg\)\]\(https:\/\/[^)]+\)/);
  });

  it("carries setup for every supported client inline, with no links into gitignored docs/", async () => {
    const readme = await read(docs.readme);

    for (const [client, marker] of clientSetups) {
      expect(readme).toContain(client);
      expect(readme).toContain(marker);
    }
    // docs/ is not published, so the README must never send a reader there.
    expect(readme).not.toMatch(/\]\(docs\//);
    expect(readme).not.toMatch(/docs\/clients/);
    expect(readme).not.toMatch(
      /docs\/architecture\.md|docs\/troubleshooting\.md/,
    );
  });

  it("documents every tool and every prompt an end user can invoke", async () => {
    const readme = await read(docs.readme);

    for (const tool of toolNames) expect(readme).toContain(`\`${tool}\``);
    for (const prompt of promptNames) expect(readme).toContain(`\`${prompt}\``);
    expect(readme).toMatch(/##\s+Prompts/);
    expect(readme).toMatch(/##\s+Troubleshooting/);
  });

  it("discloses v0.1.1 local-only transport and the real remote blocker", async () => {
    const readme = await read(docs.readme);

    expect(readme).toMatch(
      /local stdio is the only shipped transport in v0\.1\.1/i,
    );
    expect(readme).toMatch(/Streamable HTTP\/OAuth[^\n]+not shipped/i);
    expect(readme).toMatch(
      /csp\.greekssurge\.com[^\n]+lacks[^\n]+OAuth discovery\/backend contract/i,
    );
    expect(readme).not.toMatch(
      /hosted[^\n]+ready|remote[^\n]+works|Streamable HTTP[^\n]+available/i,
    );
  });

  it("documents privacy, token handling, revocation, and incident response", async () => {
    const security = await read(docs.security);

    for (const required of [
      "No Google password collection",
      "BrowserOS",
      "loopback-only DevTools endpoint",
      "localStorage.gs_token",
      "/api/auth/me",
      "macOS: ~/Library/Application Support/greekssurge-mcp/token.json",
      "Linux: ${XDG_CONFIG_HOME:-~/.config}/greekssurge-mcp/token.json",
      "Windows: %APPDATA%\\greekssurge-mcp\\token.json",
      "POSIX 0600",
      "Windows ACL",
      "auth logout",
      "revoke",
      "leak response",
    ]) {
      expect(security).toContain(required);
    }
    expect(security).toMatch(
      /No token is accepted through CLI arguments, stdout, logs, clipboard, or manual paste/i,
    );
  });

  it("states read-only boundaries, untrusted-content handling, and licensing split", async () => {
    const corpus = `${await read(docs.readme)}\n${await read(docs.security)}`;

    expect(corpus).toMatch(/read-only/i);
    expect(corpus).toMatch(/no trading/i);
    expect(corpus).toMatch(/not financial advice/i);
    expect(corpus).toMatch(/untrusted external content/i);
    expect(corpus).toMatch(/MIT/i);
    expect(corpus).toMatch(
      /GreeksSurge data and service access[^\n]+GreeksSurge terms/,
    );
  });

  it("keeps end-user troubleshooting in the README and contributor docs usable", async () => {
    const readme = await read(docs.readme);
    const contributing = await read(docs.contributing);
    const codeOfConduct = await read(docs.codeOfConduct);

    expect(contributing).toContain("npm ci");
    expect(contributing).toContain("npm run prepublishOnly");
    expect(codeOfConduct).toContain("Contributor Covenant");

    // Troubleshooting used to live in docs/troubleshooting.md; it must survive in the README.
    expect(readme).toContain("github:neerazz/greekssurge-mcp#v0.1.1");
    expect(readme).toMatch(/canonical published command/i);
    expect(readme).toMatch(/auth logout/);
    expect(readme).toMatch(/premiumMasked/);
  });
});
