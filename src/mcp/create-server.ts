import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GreeksSurgeClient } from '../api/client.js';
import { SERVER_INSTRUCTIONS } from './disclaimer.js';
import { registerGreeksSurgeTools, type ToolClient } from './tools.js';

export interface CreateGreeksSurgeMcpServerOptions {
  clientFactory: () => GreeksSurgeClient | ToolClient;
  tokenProvider: () => Promise<string | undefined>;
}

export function createGreeksSurgeMcpServer(options: CreateGreeksSurgeMcpServerOptions): McpServer {
  const server = new McpServer(
    { name: 'greekssurge-mcp', version: '0.1.0' },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerGreeksSurgeTools({
    clientFactory: () => options.clientFactory() as ToolClient,
    tokenProvider: options.tokenProvider,
    register: (name, config, handler) => {
      server.registerTool(name, config, async (args) => handler((args ?? {}) as Record<string, unknown>));
    },
  });
  return server;
}
