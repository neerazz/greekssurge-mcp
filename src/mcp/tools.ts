import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GreeksSurgeApiError } from "../api/errors.js";
import type { IdeasQuery, TradeHistoryQuery } from "../api/query.js";
import { toAccountDto, toIdeaDtos, toStatusDto } from "../api/schemas.js";
import type {
  Account,
  EducationArticle,
  EducationListResponse,
  FiltersResponse,
  IdeasResponse,
  MarketStatus,
  PreferencesResponse,
  StatsResponse,
  TradeHistoryResponse,
  WatchlistResponse,
} from "../api/types.js";
import { capArray, envelope, textSummary, toolError } from "./result.js";

export interface ToolClient {
  getAccount(): Promise<Account>;
  getMarketStatus(): Promise<MarketStatus>;
  listTradeIdeas(query?: IdeasQuery): Promise<IdeasResponse>;
  getAvailableFilters(): Promise<FiltersResponse>;
  getPerformanceStats(): Promise<StatsResponse>;
  listTradeHistory(query?: TradeHistoryQuery): Promise<TradeHistoryResponse>;
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

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const emptyInput = z.object({}).strict();
const ideasInput = z
  .object({
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    ticker: z.string().min(1).max(10).optional(),
    mode: z.string().min(1).max(80).optional(),
    expiry: dateInput.optional(),
    iv: z.string().min(1).max(80).optional(),
    roi: z.string().min(1).max(80).optional(),
    capital: z.string().min(1).max(80).optional(),
    pop: z.string().min(1).max(80).optional(),
    purpose: z.string().min(1).max(80).optional(),
    symbol: z.string().min(1).max(10).optional(),
    betterEntry: z.boolean().optional(),
  })
  .strict();
const tradeHistoryInput = z
  .object({
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
    ideaMode: z.string().min(1).max(80).optional(),
    outcome: z.string().min(1).max(80).optional(),
    symbol: z.string().min(1).max(10).optional(),
    from: dateInput.optional(),
    to: dateInput.optional(),
  })
  .strict();
const articleInput = z.object({ slug: z.string().min(1).max(160) }).strict();
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
    async (client) => toStatusDto(await client.getMarketStatus()),
  );
  add(
    "list_trade_ideas",
    "List tier-scoped GreeksSurge trade ideas.",
    ideasInput,
    true,
    async (client, args) => {
      const response = await client.listTradeIdeas(args as IdeasQuery);
      return {
        items: capArray(toIdeaDtos(response), Number(args.limit ?? 100)),
        summary: response.summary,
        lastSettled: response.lastSettled,
        pagination: response.pagination,
        isMarketOpen: response.isMarketOpen,
        source: response.source,
        cached: response.cached,
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
    tradeHistoryInput,
    true,
    async (client, args) => {
      const response = await client.listTradeHistory(args as TradeHistoryQuery);
      return {
        ...response,
        ideas: capArray(response.ideas, Number(args.limit ?? 100)),
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
