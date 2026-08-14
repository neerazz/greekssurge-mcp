#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GreeksSurgeClient } from "./api/client.js";
import { FileTokenStore } from "./auth/token-store.js";
import { runLocalLogin, validateTokenWithApi } from "./auth/local-login.js";
import { readBrowserOsToken } from "./auth/browseros-session.js";
import { createGreeksSurgeMcpServer } from "./mcp/create-server.js";
import { loadConfig } from "./config.js";
import { createLogger } from "./logger.js";
import {
  DEFAULT_SETUP_CLIENT,
  DEFAULT_SETUP_PACKAGE,
  isSetupClient,
  normalizePackageSpec,
  renderSetupGuide,
  type SetupClientSelection,
} from "./setup/configs.js";
import { serveStdio } from "./transports/stdio.js";

export interface CliIO {
  env?: Record<string, string | undefined>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const VERSION = "0.2.1";
const HELP = `greekssurge-mcp ${VERSION}

Commands:
  greekssurge-mcp [serve]              Start the read-only MCP stdio server
  greekssurge-mcp auth login           Import the current signed-in GreeksSurge BrowserOS session
  greekssurge-mcp auth status          Show whether a local GreeksSurge token is stored
  greekssurge-mcp auth logout          Delete the local GreeksSurge token
  greekssurge-mcp setup                Print client setup guidance

Examples:
  npx -y greekssurge-mcp auth login
  npx -y greekssurge-mcp
`;

export async function runCli(
  args = process.argv.slice(2),
  io: CliIO = {},
): Promise<number> {
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));

  if (args.length === 0) return serveCommand(env, stderr);
  if (args.length === 1 && (args[0] === "--help" || args[0] === "help")) {
    stdout(HELP);
    return 0;
  }
  if (args.length === 1 && args[0] === "--version") {
    stdout(`${VERSION}\n`);
    return 0;
  }

  const [command, ...commandArgs] = args;
  const subcommand = commandArgs[0];
  const rest = commandArgs.slice(1);
  try {
    if (command === "serve") {
      if (
        commandArgs.length !== 0 &&
        !(
          commandArgs.length === 2 &&
          commandArgs[0] === "--transport" &&
          commandArgs[1]
        )
      ) {
        stderr("Unknown serve flag. Run `greekssurge-mcp --help`.\n");
        return 2;
      }
      const transport = valueAfter(commandArgs, "--transport") ?? "stdio";
      if (transport !== "stdio") {
        stderr("HTTP transport is out of Phase A scope. Use stdio locally.\n");
        return 2;
      }
      return serveCommand(env, stderr);
    }

    if (command === "auth")
      return await authCommand(subcommand, rest, env, stdout, stderr);
    if (command === "setup") {
      const setupArgs = parseSetupArgs(commandArgs);
      if (!setupArgs.ok) {
        stderr(`${setupArgs.message} Run \`greekssurge-mcp --help\`.\n`);
        return 2;
      }
      stdout(renderSetupGuide(setupArgs.options));
      return 0;
    }
  } catch (error) {
    stderr(
      `${error instanceof Error ? error.message : "CLI command failed"}\n`,
    );
    return 1;
  }

  stderr("Unknown command or flag. Run `greekssurge-mcp --help`.\n");
  return 2;
}

async function serveCommand(
  env: Record<string, string | undefined>,
  stderr: (text: string) => void,
): Promise<number> {
  const config = loadConfig(env);
  const logger = createLogger({ component: "cli" });
  const store = new FileTokenStore({ tokenPath: config.tokenPath, env });
  const server = createGreeksSurgeMcpServer({
    tokenProvider: () => store.read(),
    clientFactory: () =>
      new GreeksSurgeClient({
        baseUrl: config.apiBaseUrl,
        tokenProvider: () => store.read(),
      }),
  });
  try {
    await serveStdio(server);
    return 0;
  } catch (error) {
    logger.error("stdio server failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    stderr("Failed to start stdio server.\n");
    return 1;
  }
}

async function authCommand(
  subcommand: string | undefined,
  args: string[],
  env: Record<string, string | undefined>,
  stdout: (text: string) => void,
  stderr: (text: string) => void,
): Promise<number> {
  const config = loadConfig(env);
  const store = new FileTokenStore({ tokenPath: config.tokenPath, env });
  if (subcommand === "status") {
    if (args.length > 0) return rejectAuthFlags(stderr);
    const token = await store.read();
    stdout(token ? "Authenticated\n" : "Not authenticated\n");
    return token ? 0 : 1;
  }
  if (subcommand === "logout") {
    if (args.length > 0) return rejectAuthFlags(stderr);
    await store.clear();
    stdout("Logged out; local GreeksSurge token removed.\n");
    return 0;
  }
  if (subcommand === "login") {
    if (
      args.some((arg) => arg !== "--dry-run") ||
      args.filter((arg) => arg === "--dry-run").length > 1
    )
      return rejectAuthFlags(stderr);
    if (args.includes("--dry-run")) {
      stdout(
        "Dry run: would import the existing signed-in GreeksSurge session from an exact-origin BrowserOS tab, validate it through /api/auth/me, and store it locally with owner-only permissions.\n",
      );
      return 0;
    }
    const result = await runLocalLogin({
      store,
      readBrowserToken: () => readBrowserOsToken(),
      validateToken: (token) => validateTokenWithApi(config.apiBaseUrl, token),
    });
    stdout(`Authenticated${result.tier ? ` as ${result.tier}` : ""}.\n`);
    return 0;
  }
  stderr(
    "Unknown auth command. Use auth login, auth status, or auth logout.\n",
  );
  return 2;
}

function rejectAuthFlags(stderr: (text: string) => void): number {
  stderr("Unknown auth flag. Run `greekssurge-mcp --help`.\n");
  return 2;
}

type ParsedSetupArgs =
  | {
      ok: true;
      options: {
        client: SetupClientSelection;
        packageSpec: string;
      };
    }
  | { ok: false; message: string };

function parseSetupArgs(args: string[]): ParsedSetupArgs {
  let client: SetupClientSelection = DEFAULT_SETUP_CLIENT;
  let packageSpec = DEFAULT_SETUP_PACKAGE;
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (flag !== "--client" && flag !== "--package") {
      return {
        ok: false,
        message: flag.startsWith("--")
          ? `Unknown setup flag: ${flag}.`
          : `Unknown setup argument: ${flag}.`,
      };
    }
    if (seen.has(flag)) {
      return { ok: false, message: `Duplicate setup flag: ${flag}.` };
    }
    seen.add(flag);

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      return { ok: false, message: `Missing value for setup flag: ${flag}.` };
    }

    if (flag === "--client") {
      if (!isSetupClient(value)) {
        return { ok: false, message: `Unsupported setup client: ${value}.` };
      }
      client = value;
      continue;
    }

    try {
      packageSpec = normalizePackageSpec(value);
    } catch (error) {
      return {
        ok: false,
        message: `Invalid setup package: ${error instanceof Error ? error.message : "Package spec is invalid."}`,
      };
    }
  }

  return { ok: true, options: { client, packageSpec } };
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

export function isCliEntrypoint(
  modulePath: string,
  argvPath: string | undefined,
  resolvePath: (path: string) => string = realpathSync,
): boolean {
  if (!argvPath) return false;
  try {
    return resolvePath(modulePath) === resolvePath(argvPath);
  } catch {
    return modulePath === argvPath;
  }
}

const isEntrypoint = isCliEntrypoint(
  fileURLToPath(import.meta.url),
  process.argv[1],
);
if (isEntrypoint) {
  runCli().then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
