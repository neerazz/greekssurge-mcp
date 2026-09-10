import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  GetPromptRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { GreeksSurgeClient } from "../api/client.js";
import { SERVER_INSTRUCTIONS } from "./disclaimer.js";
import {
  registerGreeksSurgePrompts,
  type PromptRegistryOptions,
} from "./prompts.js";
import { registerGreeksSurgeTools, type ToolClient } from "./tools.js";

export interface CreateGreeksSurgeMcpServerOptions {
  clientFactory: () => GreeksSurgeClient | ToolClient;
  tokenProvider: () => Promise<string | undefined>;
}

export function createGreeksSurgeMcpServer(
  options: CreateGreeksSurgeMcpServerOptions,
): McpServer {
  const server = new McpServer(
    { name: "greekssurge-mcp", version: "0.4.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );
  registerGreeksSurgeTools({
    clientFactory: () => options.clientFactory() as ToolClient,
    tokenProvider: options.tokenProvider,
    register: (name, config, handler) => {
      server.registerTool(name, config, async (args) =>
        handler((args ?? {}) as Record<string, unknown>),
      );
    },
  });
  type PromptResult = ReturnType<
    Parameters<PromptRegistryOptions["register"]>[2]
  >;
  const promptRenderers = new Map<string, (args: unknown) => PromptResult>();
  registerGreeksSurgePrompts({
    register: (name, config, handler) => {
      const registered = server.registerPrompt(name, config, (args) =>
        handler((args ?? {}) as Record<string, string | undefined>),
      );
      const schema = z.object(config.argsSchema ?? {});
      promptRenderers.set(name, (args) => {
        if (!registered.enabled)
          throw new McpError(ErrorCode.InvalidParams, "Prompt is disabled.");
        const parsed = schema.safeParse(args ?? {});
        if (!parsed.success)
          throw new McpError(
            ErrorCode.InvalidParams,
            "Invalid prompt arguments.",
          );
        return handler(parsed.data as Record<string, string | undefined>);
      });
    },
  });
  // SDK 1.30 validates undefined against its generated object schema before
  // invoking the callback. Normalize omitted optional arguments at that boundary.
  server.server.setRequestHandler(GetPromptRequestSchema, (request) => {
    const render = promptRenderers.get(request.params.name);
    if (!render)
      throw new McpError(ErrorCode.InvalidParams, "Prompt not found.");
    return render(request.params.arguments);
  });
  return server;
}
