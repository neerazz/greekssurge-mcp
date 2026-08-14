import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETUP_CLIENT,
  DEFAULT_SETUP_PACKAGE,
  SUPPORTED_SETUP_CLIENTS,
  generateSetupGuide,
  renderSetupGuide,
} from "../src/setup/configs.js";

function entryFor(
  guide: ReturnType<typeof generateSetupGuide>,
  client: (typeof SUPPORTED_SETUP_CLIENTS)[number],
) {
  const entry = guide.entries.find((candidate) => candidate.client === client);
  expect(entry).toBeDefined();
  return entry!;
}

describe("local stdio setup config generator", () => {
  it("defaults to all clients and the published npm package", () => {
    const guide = generateSetupGuide({});

    expect(DEFAULT_SETUP_CLIENT).toBe("all");
    expect(DEFAULT_SETUP_PACKAGE).toBe("greekssurge-mcp");
    expect(guide.packageSpec).toBe("greekssurge-mcp");
    expect(guide.authCommand).toBe("npx -y greekssurge-mcp auth login");
    expect(guide.entries.map((entry) => entry.client)).toEqual(
      SUPPORTED_SETUP_CLIENTS,
    );
  });

  it("generates the current official local stdio CLI commands", () => {
    const packageSpec = "github:neerazz/greekssurge-mcp#ba5907a";
    const guide = generateSetupGuide({ client: "all", packageSpec });

    expect(entryFor(guide, "claude-code").command).toBe(
      `claude mcp add --scope user greekssurge -- npx -y ${packageSpec}`,
    );
    expect(entryFor(guide, "codex").command).toBe(
      `codex mcp add greekssurge -- npx -y ${packageSpec}`,
    );
    expect(entryFor(guide, "gemini").command).toBe(
      `gemini mcp add --scope user --transport stdio greekssurge npx -y ${packageSpec}`,
    );
  });

  it("allows npm and git package specs without shell expansion", () => {
    const gitSpec = "git+ssh://git@github.com/neerazz/greekssurge-mcp.git";
    const guide = generateSetupGuide({ client: "codex", packageSpec: gitSpec });

    expect(guide.authCommand).toBe(`npx -y ${gitSpec} auth login`);
    expect(entryFor(guide, "codex").command).toBe(
      `codex mcp add greekssurge -- npx -y ${gitSpec}`,
    );
  });

  it("generates parseable token-free JSON for JSON-configured clients", () => {
    const packageSpec = "@neerazz/greekssurge-mcp@0.3.0";
    const guide = generateSetupGuide({ client: "all", packageSpec });

    for (const client of ["claude-desktop", "cursor"] as const) {
      const parsed = JSON.parse(entryFor(guide, client).json!);
      expect(parsed).toEqual({
        mcpServers: {
          greekssurge: {
            command: "npx",
            args: ["-y", packageSpec],
          },
        },
      });
    }

    const vscode = JSON.parse(entryFor(guide, "vscode").json!);
    expect(vscode).toEqual({
      servers: {
        greekssurge: {
          type: "stdio",
          command: "npx",
          args: ["-y", packageSpec],
        },
      },
    });

    const serialized = JSON.stringify(guide);
    expect(serialized).not.toMatch(
      /gs_token|authorization|bearer|api[_-]?key/i,
    );
  });

  it("renders the auth command before any client setup instruction", () => {
    const output = renderSetupGuide({ client: "codex" });

    expect(output.indexOf("npx -y greekssurge-mcp auth login")).toBeLessThan(
      output.indexOf("codex mcp add greekssurge"),
    );
    expect(output).toContain(
      "Dry run only: no client configuration was read or modified.",
    );
    expect(output).not.toMatch(/gs_token|authorization|bearer/i);
  });

  it("rejects unsafe package specs before they can be rendered into config", () => {
    expect(() =>
      generateSetupGuide({ packageSpec: "https://token@example.com/pkg.git" }),
    ).toThrow(/Package spec must not contain credentials/i);
    expect(() => generateSetupGuide({ packageSpec: "--package" })).toThrow(
      /Package spec must not start with a dash/i,
    );
    expect(() =>
      generateSetupGuide({ packageSpec: "pkg with spaces" }),
    ).toThrow(/Package spec must not contain whitespace/i);
    for (const packageSpec of ["pkg;touch-x", "pkg$(id)", "pkg`id`", "pkg|id"])
      expect(() => generateSetupGuide({ packageSpec })).toThrow(
        /Package spec contains unsupported characters/i,
      );
  });

  it("links each client to its current official MCP setup documentation", () => {
    const guide = generateSetupGuide({ client: "all" });
    const expected = {
      "claude-code": "https://code.claude.com/docs/en/mcp",
      codex: "https://developers.openai.com/codex/mcp/",
      gemini: "https://geminicli.com/docs/tools/mcp-server/",
      "claude-desktop":
        "https://modelcontextprotocol.io/docs/develop/connect-local-servers",
      cursor: "https://cursor.com/docs/mcp",
      vscode:
        "https://code.visualstudio.com/docs/agents/reference/mcp-configuration",
    } as const;

    for (const client of SUPPORTED_SETUP_CLIENTS)
      expect(entryFor(guide, client).officialDocs).toContain(expected[client]);
  });
});

// Client setup used to live in docs/clients/*.md. That tree is now local-only and
// unpublished, so the shipped surfaces are `greekssurge-mcp setup` and README.md.
// Asserting against files that never reach a fresh clone passed locally and broke CI.
describe("client setup guidance ships without docs/", () => {
  it("renders auth, install and a grounded official URL for every supported client", () => {
    const output = renderSetupGuide({ client: "all" });
    const guide = generateSetupGuide({ client: "all" });

    expect(output).toContain("npx -y greekssurge-mcp auth login");
    expect(output).toMatch(/never paste a GreeksSurge token/i);

    for (const client of SUPPORTED_SETUP_CLIENTS) {
      const entry = entryFor(guide, client);
      // Each client is reachable from the rendered guide by title.
      expect(output).toContain(entry.title);
      // …with at least one grounded https documentation URL.
      expect(entry.officialDocs.length).toBeGreaterThan(0);
      for (const url of entry.officialDocs) {
        expect(url).toMatch(/^https:\/\//);
        expect(output).toContain(url);
      }
      // …and a concrete way to install it.
      const install = entry.command ?? entry.json ?? "";
      expect(install).toContain("greekssurge-mcp");
      expect(output).toContain("npx");
    }
  });

  it("keeps every supported client documented in the self-contained README", async () => {
    const readme = await readFile(join(process.cwd(), "README.md"), "utf8");
    const titles = generateSetupGuide({ client: "all" }).entries.map(
      (entry) => entry.title,
    );

    for (const title of titles) expect(readme).toContain(title);
    expect(readme).not.toContain("docs/clients");
  });
});
