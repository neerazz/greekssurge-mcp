import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");
const docs = {
  readme: "README.md",
  security: "SECURITY.md",
  contributing: "CONTRIBUTING.md",
  codeOfConduct: "CODE_OF_CONDUCT.md",
  architecture: "docs/architecture.md",
  troubleshooting: "docs/troubleshooting.md",
};
const clientDocs = [
  "claude-code",
  "codex",
  "gemini",
  "claude-desktop",
  "cursor",
  "vscode",
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

  it("links all six client setup documents from the README", async () => {
    const readme = await read(docs.readme);

    for (const client of clientDocs)
      expect(readme).toContain(`docs/clients/${client}.md`);
  });

  it("discloses v0.1.1 local-only transport and the real remote blocker", async () => {
    const corpus = `${await read(docs.readme)}\n${await read(docs.architecture)}\n${await read(docs.troubleshooting)}`;

    expect(corpus).toMatch(
      /local stdio is the only shipped transport in v0\.1\.1/i,
    );
    expect(corpus).toMatch(/Streamable HTTP\/OAuth[^\n]+not shipped/i);
    expect(corpus).toMatch(
      /csp\.greekssurge\.com[^\n]+lacks[^\n]+OAuth discovery\/backend contract/i,
    );
    expect(corpus).not.toMatch(
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
    const corpus = `${await read(docs.readme)}\n${await read(docs.security)}\n${await read(docs.architecture)}`;

    expect(corpus).toMatch(/read-only/i);
    expect(corpus).toMatch(/no trading/i);
    expect(corpus).toMatch(/not financial advice/i);
    expect(corpus).toMatch(/untrusted external content/i);
    expect(corpus).toMatch(/MIT/i);
    expect(corpus).toMatch(
      /GreeksSurge data and service access[^\n]+GreeksSurge terms/i,
    );
  });

  it("keeps contributor docs and troubleshooting usable before publication", async () => {
    const contributing = await read(docs.contributing);
    const codeOfConduct = await read(docs.codeOfConduct);
    const troubleshooting = await read(docs.troubleshooting);

    expect(contributing).toContain("npm ci");
    expect(contributing).toContain("npm run prepublishOnly");
    expect(codeOfConduct).toContain("Contributor Covenant");
    expect(troubleshooting).toContain("github:neerazz/greekssurge-mcp#v0.1.1");
    expect(troubleshooting).toMatch(/canonical published command/i);
    expect(troubleshooting).toMatch(/fallback-only/i);
  });
});
