export { runCli } from "./cli.js";
export type { CliIO } from "./cli.js";
export { serveStdio } from "./transports/stdio.js";
export {
  authLogout,
  authStatus,
  runLocalLogin,
  validateTokenWithApi,
} from "./auth/local-login.js";
export type { LocalLoginOptions } from "./auth/local-login.js";
export {
  findGreeksSurgeBrowserOsPage,
  readBrowserOsToken,
} from "./auth/browseros-session.js";
export type {
  BrowserOsPage,
  ReadBrowserOsTokenOptions,
} from "./auth/browseros-session.js";
export { FileTokenStore } from "./auth/token-store.js";
export type { FileTokenStoreOptions, TokenStore } from "./auth/token-store.js";
export { GreeksSurgeClient } from "./api/client.js";
export type { GreeksSurgeClientOptions } from "./api/client.js";
export { GreeksSurgeApiError, mapHttpStatus } from "./api/errors.js";
export type { GreeksSurgeErrorCode } from "./api/errors.js";
export {
  buildIdeasQuery,
  buildListQuery,
  buildTradeHistoryQuery,
} from "./api/query.js";
export type { IdeasQuery, ListQuery, TradeHistoryQuery } from "./api/query.js";
export { createGreeksSurgeMcpServer } from "./mcp/create-server.js";
export type { CreateGreeksSurgeMcpServerOptions } from "./mcp/create-server.js";
export {
  EDUCATIONAL_NO_ADVICE_DISCLOSURE,
  SERVER_INSTRUCTIONS,
} from "./mcp/disclaimer.js";
export { capArray, envelope, textSummary, toolError } from "./mcp/result.js";
export { registerGreeksSurgeTools } from "./mcp/tools.js";
export type {
  ToolClient,
  ToolRegistryOptions,
  ToolRegistration,
  ToolResult,
} from "./mcp/tools.js";
export { defaultTokenPath, loadConfig } from "./config.js";
export type { AppConfig } from "./config.js";
export { createLogger, redactSecrets } from "./logger.js";
export type { Logger, LogLevel } from "./logger.js";
export {
  EDUCATIONAL_DISCLAIMER,
  SOURCE_URL,
  parseUpstream,
  sourceMetadata,
  toAccountDto,
  toIdeaDtos,
  toStatusDto,
  upstreamSchemas,
} from "./api/schemas.js";
export type { UpstreamSchemaName } from "./api/schemas.js";
export type * from "./api/types.js";
export const packageName = "greekssurge-mcp";
export const packageVersion = "0.1.2";
