import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GreeksSurgeApiError } from "../api/errors.js";
import type { ListQuery } from "../api/query.js";
import { toAccountDto, toIdeaDtos, toStatusDto } from "../api/schemas.js";
import type {
  Account,
  EducationArticle,
  EducationListResponse,
  FiltersResponse,
  PreferencesResponse,
  StatsResponse,
  TradeHistoryResponse,
  WatchlistResponse,
} from "../api/types.js";
import { capArray, envelope, textSummary, toolError } from "./result.js";

export interface ToolClient {
  getAccount(): Promise<Account>;
  getMarketStatus(): Promise<unknown>;
  listTradeIdeas(
    query?: ListQuery,
  ): Promise<{ items: unknown[]; nextCursor?: string | null }>;
  getAvailableFilters(): Promise<FiltersResponse>;
  getPerformanceStats(): Promise<StatsResponse>;
  listTradeHistory(query?: ListQuery): Promise<TradeHistoryResponse>;
  listEducation(): Promise<EducationListResponse>;
  getEducationArticle(slug: string): Promise<EducationArticle>;
  getWatchlist(): Promise<WatchlistResponse>;
  getPreferences(): Promise<PreferencesResponse>;
}

export interface ToolRegistryOptions {
  register: (
    name: string,
    config: ToolRegistration,
    handler: (args: Record<string, unknown>) => Promise<ToolResult>,
  ) => void;
  clientFactory: () => ToolClient;
  tokenProvider: () => Promise<string | undefined>;
}

export interface ToolRegistration {
  title: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  annotations: {
    readOnlyHint: true;
    destructiveHint: false;
    idempotentHint: true;
    openWorldHint: true;
  };
}

export type ToolResult = CallToolResult;

const annotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const emptyInput = z.object({});
const listInput = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(256).optional(),
  ticker: z.string().min(1).max(10).optional(),
  strategy: z.string().min(1).max(64).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
const articleInput = z.object({ slug: z.string().min(1).max(160) });
const outputSchema = z.object({
  source: z.string(),
  retrievedAt: z.string(),
  disclaimer: z.string(),
  data: z.unknown(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export function registerGreeksSurgeTools(options: ToolRegistryOptions): void {
  const add = (
    name: string,
    description: string,
    inputSchema: z.ZodType,
    authenticated: boolean,
    handler: (
      client: ToolClient,
      args: Record<string, unknown>,
    ) => Promise<unknown>,
  ) => {
    options.register(
      name,
      { title: name, description, inputSchema, outputSchema, annotations },
      async (args) => runTool(name, authenticated, options, args, handler),
    );
  };

  add(
    "get_account",
    "Read the connected GreeksSurge account tier and feature flags.",
    emptyInput,
    true,
    async (client) => toAccountDto(await client.getAccount()),
  );
  add(
    "get_market_status",
    "Read the current GreeksSurge market status.",
    emptyInput,
    false,
    async (client) =>
      toStatusDto(
        (await client.getMarketStatus()) as Parameters<typeof toStatusDto>[0],
      ),
  );
  add(
    "list_trade_ideas",
    "List tier-scoped GreeksSurge trade ideas.",
    listInput,
    true,
    async (client, args) => {
      const response = await client.listTradeIdeas(args as ListQuery);
      const ideas = toIdeaDtos(response as Parameters<typeof toIdeaDtos>[0]);
      return {
        items: capArray(ideas, Number(args.limit ?? 100)),
        nextCursor: response.nextCursor ?? null,
      };
    },
  );
  add(
    "get_available_filters",
    "Read available GreeksSurge filter values.",
    emptyInput,
    false,
    async (client) => client.getAvailableFilters(),
  );
  add(
    "get_performance_stats",
    "Read tier-scoped GreeksSurge performance statistics.",
    emptyInput,
    true,
    async (client) => client.getPerformanceStats(),
  );
  add(
    "list_trade_history",
    "List settled tier-scoped GreeksSurge trade history.",
    listInput,
    true,
    async (client, args) => {
      const response = await client.listTradeHistory(args as ListQuery);
      return {
        ...response,
        items: capArray(response.items, Number(args.limit ?? 100)),
      };
    },
  );
  add(
    "list_education",
    "List GreeksSurge education articles.",
    emptyInput,
    false,
    async (client) => client.listEducation(),
  );
  add(
    "get_education_article",
    "Read one GreeksSurge education article.",
    articleInput,
    false,
    async (client, args) => client.getEducationArticle(String(args.slug)),
  );
  add(
    "get_watchlist",
    "Read the connected account watchlist.",
    emptyInput,
    true,
    async (client) => client.getWatchlist(),
  );
  add(
    "get_preferences",
    "Read the connected account preferences.",
    emptyInput,
    true,
    async (client) => client.getPreferences(),
  );
}

async function runTool(
  name: string,
  authenticated: boolean,
  options: ToolRegistryOptions,
  args: Record<string, unknown>,
  handler: (
    client: ToolClient,
    args: Record<string, unknown>,
  ) => Promise<unknown>,
): Promise<ToolResult> {
  try {
    if (authenticated && !(await options.tokenProvider())) {
      return toolError(
        "AUTH_REQUIRED",
        "Run `npx greekssurge-mcp auth login` to connect your GreeksSurge account.",
      );
    }
    const data = await handler(options.clientFactory(), args);
    const structuredContent = envelope(data);
    return {
      content: [
        { type: "text", text: textSummary(name, structuredContent.data) },
      ],
      structuredContent,
    };
  } catch (error) {
    if (error instanceof GreeksSurgeApiError)
      return toolError(error.code, error.message);
    return toolError(
      "UPSTREAM_UNAVAILABLE",
      "GreeksSurge tool call failed without exposing upstream response details.",
    );
  }
}
