export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, metadata?: Record<string, unknown>): void;
  info(message: string, metadata?: Record<string, unknown>): void;
  warn(message: string, metadata?: Record<string, unknown>): void;
  error(message: string, metadata?: Record<string, unknown>): void;
}

const JWT_PATTERN = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const AUTH_PATTERN = /(Authorization\s*[:=]\s*)(?:Bearer\s+)?[^\s,"}]+/gi;
const QUERY_TOKEN_PATTERN =
  /([?&](?:access_token|token|gs_token|id_token|refresh_token)=)[^&\s]+/gi;
const KV_TOKEN_PATTERN =
  /\b((?:gs_token|access_token|refresh_token|id_token|token)\s*[=:]\s*)[^&\s,"}]+/gi;

export function redactSecrets(input: unknown): string {
  return String(input)
    .replace(JWT_PATTERN, "[JWT_REDACTED]")
    .replace(AUTH_PATTERN, "$1[REDACTED]")
    .replace(QUERY_TOKEN_PATTERN, "$1[REDACTED]")
    .replace(KV_TOKEN_PATTERN, "$1[REDACTED]")
    .replace(EMAIL_PATTERN, "[EMAIL_REDACTED]");
}

function redactObject(value: unknown): unknown {
  if (typeof value === "string") return redactSecrets(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null)
    return value;
  if (Array.isArray(value)) return value.map(redactObject);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
        if (/authorization|token|cookie|secret|password/i.test(key)) {
          return [key, "[REDACTED]"];
        }
        return [key, redactObject(entry)];
      }),
    );
  }
  return undefined;
}

export function createLogger(context: Record<string, string> = {}): Logger {
  const write = (
    level: LogLevel,
    message: string,
    metadata: Record<string, unknown> = {},
  ) => {
    const record = {
      timestamp: new Date().toISOString(),
      level,
      ...context,
      message: redactSecrets(message),
      metadata: redactObject(metadata),
    };
    process.stderr.write(`${JSON.stringify(record)}\n`);
  };

  return {
    debug: (message, metadata) => write("debug", message, metadata),
    info: (message, metadata) => write("info", message, metadata),
    warn: (message, metadata) => write("warn", message, metadata),
    error: (message, metadata) => write("error", message, metadata),
  };
}
