#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { GreeksSurgeClient } from './api/client.js';
import { FileTokenStore } from './auth/token-store.js';
import { runLocalLogin, validateTokenWithApi } from './auth/local-login.js';
import { createGreeksSurgeMcpServer } from './mcp/create-server.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { serveStdio } from './transports/stdio.js';

export interface CliIO {
  env?: Record<string, string | undefined>;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
}

const VERSION = '0.1.0';
const HELP = `greekssurge-mcp ${VERSION}

Commands:
  greekssurge-mcp [serve]              Start the read-only MCP stdio server
  greekssurge-mcp auth login           Open GreeksSurge Google login in an isolated installed Chromium profile
  greekssurge-mcp auth status          Show whether a local GreeksSurge token is stored
  greekssurge-mcp auth logout          Delete the local GreeksSurge token
  greekssurge-mcp setup                Print client setup guidance

Examples:
  npx -y greekssurge-mcp auth login
  npx -y greekssurge-mcp
`;

export async function runCli(args = process.argv.slice(2), io: CliIO = {}): Promise<number> {
  const env = io.env ?? process.env;
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));

  if (args.length === 0) return serveCommand(env, stderr);
  if (args.includes('--help') || args[0] === 'help') {
    stdout(HELP);
    return 0;
  }
  if (args.includes('--version')) {
    stdout(`${VERSION}\n`);
    return 0;
  }

  const [command, ...commandArgs] = args;
  const subcommand = commandArgs[0];
  const rest = commandArgs.slice(1);
  try {
    if (command === 'serve') {
      const transport = valueAfter(commandArgs, '--transport') ?? 'stdio';
      if (transport !== 'stdio') {
        stderr('HTTP transport is out of Phase A scope. Use stdio locally.\n');
        return 2;
      }
      return serveCommand(env, stderr);
    }

    if (command === 'auth') return authCommand(subcommand, rest, env, stdout, stderr);
    if (command === 'setup') {
      stdout(`Add this MCP server to local clients with command: npx -y greekssurge-mcp\nNo GreeksSurge token is written to client configuration; auth stays in the user token store.\n`);
      return 0;
    }
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : 'CLI command failed'}\n`);
    return 1;
  }

  stderr('Unknown command or flag. Run `greekssurge-mcp --help`.\n');
  return 2;
}

async function serveCommand(env: Record<string, string | undefined>, stderr: (text: string) => void): Promise<number> {
  const config = loadConfig(env);
  const logger = createLogger({ component: 'cli' });
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
    logger.error('stdio server failed', { error: error instanceof Error ? error.message : String(error) });
    stderr('Failed to start stdio server.\n');
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
  if (subcommand === 'status') {
    const token = await store.read();
    stdout(token ? 'Authenticated\n' : 'Not authenticated\n');
    return token ? 0 : 1;
  }
  if (subcommand === 'logout') {
    await store.clear();
    stdout('Logged out; local GreeksSurge token removed.\n');
    return 0;
  }
  if (subcommand === 'login') {
    if (args.includes('--dry-run')) {
      stdout('Dry run: would open an installed Chromium browser to complete GreeksSurge Google login. Google credentials are never collected.\n');
      return 0;
    }
    const result = await runLocalLogin({
      loginUrl: new URL('/login', config.apiBaseUrl),
      store,
      launchBrowser: undefined,
      waitForToken: undefined,
      validateToken: (token) => validateTokenWithApi(config.apiBaseUrl, token),
    });
    stdout(`Authenticated${result.tier ? ` as ${result.tier}` : ''}.\n`);
    return 0;
  }
  stderr('Unknown auth command. Use auth login, auth status, or auth logout.\n');
  return 2;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

const isEntrypoint = process.argv[1] ? fileURLToPath(import.meta.url) === process.argv[1] : false;
if (isEntrypoint) {
  runCli().then((code) => {
    if (code !== 0) process.exitCode = code;
  });
}
