import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

export interface AppConfig {
  apiBaseUrl: URL;
  authIssuerUrl: URL;
  transport: 'stdio' | 'http';
  host: string;
  port: number;
  allowedHosts: string[];
  tokenPath: string;
  browserExecutable?: string;
}

type Env = Record<string, string | undefined>;

const httpsUrl = (name: string, allowLocalHttp = false) =>
  z
    .string()
    .default('https://csp.greekssurge.com')
    .transform((value, ctx) => {
      try {
        const url = new URL(value);
        const localHttp =
          allowLocalHttp &&
          url.protocol === 'http:' &&
          ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !localHttp) {
          ctx.addIssue({ code: 'custom', message: `${name} must be an HTTPS URL` });
          return z.NEVER;
        }
        if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
        return url;
      } catch {
        ctx.addIssue({ code: 'custom', message: `${name} must be a valid HTTPS URL` });
        return z.NEVER;
      }
    });

const envSchema = z.object({
  GREEKSSURGE_API_BASE_URL: httpsUrl('GREEKSSURGE_API_BASE_URL', true),
  GREEKSSURGE_AUTH_ISSUER: httpsUrl('GREEKSSURGE_AUTH_ISSUER'),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3333),
  ALLOWED_HOSTS: z
    .string()
    .default('127.0.0.1,localhost')
    .transform((value) =>
      value
        .split(',')
        .map((host) => host.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().min(1)).min(1)),
  GREEKSSURGE_TOKEN_PATH: z.string().optional(),
  BROWSER_EXECUTABLE: z.string().optional(),
  XDG_CONFIG_HOME: z.string().optional(),
  HOME: z.string().optional(),
});

export function defaultTokenPath(env: Env = process.env): string {
  const configRoot = env.XDG_CONFIG_HOME ?? join(env.HOME ?? homedir(), '.config');
  return join(configRoot, 'greekssurge-mcp', 'token.json');
}

export function loadConfig(env: Env = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'config'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid GreeksSurge MCP configuration: ${message}`);
  }

  const data = parsed.data;
  return {
    apiBaseUrl: data.GREEKSSURGE_API_BASE_URL,
    authIssuerUrl: data.GREEKSSURGE_AUTH_ISSUER,
    transport: data.MCP_TRANSPORT,
    host: data.HOST,
    port: data.PORT,
    allowedHosts: data.ALLOWED_HOSTS,
    tokenPath: data.GREEKSSURGE_TOKEN_PATH ?? defaultTokenPath(env),
    browserExecutable: data.BROWSER_EXECUTABLE,
  };
}
