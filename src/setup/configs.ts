export const DEFAULT_SETUP_PACKAGE = "greekssurge-mcp";
export const DEFAULT_SETUP_CLIENT = "all";
export const SETUP_SERVER_NAME = "greekssurge";

export const SUPPORTED_SETUP_CLIENTS = [
  "claude-code",
  "codex",
  "gemini",
  "claude-desktop",
  "cursor",
  "vscode",
] as const;

export type SetupClient = (typeof SUPPORTED_SETUP_CLIENTS)[number];
export type SetupClientSelection = SetupClient | typeof DEFAULT_SETUP_CLIENT;

export interface SetupGuideOptions {
  client?: SetupClientSelection;
  packageSpec?: string;
}

export interface SetupGuideEntry {
  client: SetupClient;
  title: string;
  officialDocs: readonly string[];
  command?: string;
  json?: string;
}

export interface SetupGuide {
  packageSpec: string;
  authCommand: string;
  entries: SetupGuideEntry[];
}

const CLAUDE_DOCS = "https://code.claude.com/docs/en/mcp";
const CODEX_DOCS = "https://developers.openai.com/codex/mcp/";
const MCP_TRANSPORTS_DOCS =
  "https://modelcontextprotocol.io/specification/2025-11-25/basic/transports";
const MCP_SERVER_DOCS =
  "https://modelcontextprotocol.io/docs/develop/build-server";

export function isSetupClient(value: string): value is SetupClientSelection {
  return (
    value === DEFAULT_SETUP_CLIENT ||
    SUPPORTED_SETUP_CLIENTS.includes(value as SetupClient)
  );
}

export function normalizePackageSpec(
  packageSpec = DEFAULT_SETUP_PACKAGE,
): string {
  const spec = packageSpec.trim();
  if (!spec) throw new Error("Package spec is required.");
  if (spec.startsWith("-"))
    throw new Error("Package spec must not start with a dash.");
  if (/\s/.test(spec))
    throw new Error("Package spec must not contain whitespace.");
  if (/\b(?:gs_token|authorization|bearer|api[_-]?key)\b/i.test(spec)) {
    throw new Error("Package spec must not contain token-like values.");
  }

  try {
    const parsed = new URL(spec);
    const isGitSshUser =
      parsed.username === "git" &&
      !parsed.password &&
      (parsed.protocol === "git+ssh:" || parsed.protocol === "ssh:");
    if (parsed.password || (parsed.username && !isGitSshUser)) {
      throw new Error("Package spec must not contain credentials.");
    }
  } catch (error) {
    if (error instanceof Error && /credentials/i.test(error.message)) {
      throw error;
    }
  }

  return spec;
}

export function generateSetupGuide(options: SetupGuideOptions): SetupGuide {
  const client = options.client ?? DEFAULT_SETUP_CLIENT;
  if (!isSetupClient(client))
    throw new Error(`Unsupported setup client: ${client}`);

  const packageSpec = normalizePackageSpec(options.packageSpec);
  const selectedClients =
    client === DEFAULT_SETUP_CLIENT ? SUPPORTED_SETUP_CLIENTS : [client];

  return {
    packageSpec,
    authCommand: `npx -y ${packageSpec} auth login`,
    entries: selectedClients.map((selectedClient) =>
      setupEntryForClient(selectedClient, packageSpec),
    ),
  };
}

export function renderSetupGuide(options: SetupGuideOptions): string {
  const guide = generateSetupGuide(options);
  const lines = [
    "Authenticate first:",
    `  ${guide.authCommand}`,
    "",
    "Then add the read-only local stdio server to your MCP client.",
    "Dry run only: no client configuration was read or modified.",
    "Never paste a GreeksSurge token into client config; local auth stays in the user token store.",
    "",
  ];

  for (const entry of guide.entries) {
    lines.push(`${entry.title}:`);
    lines.push(`  Official docs: ${entry.officialDocs.join(" ")}`);
    if (entry.command) lines.push(`  ${entry.command}`);
    if (entry.json) {
      lines.push("  JSON:");
      lines.push(indent(entry.json, "  "));
    }
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function setupEntryForClient(
  client: SetupClient,
  packageSpec: string,
): SetupGuideEntry {
  switch (client) {
    case "claude-code":
      return {
        client,
        title: "Claude Code",
        officialDocs: [CLAUDE_DOCS],
        command: `claude mcp add --scope user ${SETUP_SERVER_NAME} -- npx -y ${packageSpec}`,
      };
    case "codex":
      return {
        client,
        title: "Codex CLI",
        officialDocs: [CODEX_DOCS],
        command: `codex mcp add ${SETUP_SERVER_NAME} -- npx -y ${packageSpec}`,
      };
    case "gemini":
      return {
        client,
        title: "Gemini CLI",
        officialDocs: [MCP_TRANSPORTS_DOCS, MCP_SERVER_DOCS],
        command: `gemini mcp add --scope user --transport stdio ${SETUP_SERVER_NAME} npx -y ${packageSpec}`,
      };
    case "claude-desktop":
      return {
        client,
        title: "Claude Desktop",
        officialDocs: [CLAUDE_DOCS, MCP_TRANSPORTS_DOCS],
        json: stringifyJsonConfig({
          mcpServers: {
            [SETUP_SERVER_NAME]: stdioJsonServer(packageSpec),
          },
        }),
      };
    case "cursor":
      return {
        client,
        title: "Cursor",
        officialDocs: [MCP_TRANSPORTS_DOCS, MCP_SERVER_DOCS],
        json: stringifyJsonConfig({
          mcpServers: {
            [SETUP_SERVER_NAME]: stdioJsonServer(packageSpec),
          },
        }),
      };
    case "vscode":
      return {
        client,
        title: "VS Code",
        officialDocs: [MCP_TRANSPORTS_DOCS, MCP_SERVER_DOCS],
        json: stringifyJsonConfig({
          servers: {
            [SETUP_SERVER_NAME]: {
              type: "stdio",
              ...stdioJsonServer(packageSpec),
            },
          },
        }),
      };
  }
}

function stdioJsonServer(packageSpec: string) {
  return {
    command: "npx",
    args: ["-y", packageSpec],
  };
}

function stringifyJsonConfig(config: unknown): string {
  return JSON.stringify(config, null, 2);
}

function indent(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
