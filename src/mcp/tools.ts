import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { analyzeTicker } from "../analysis/ticker.js";
import { GreeksSurgeApiError } from "../api/errors.js";
import type { IdeasQuery, TradeHistoryQuery } from "../api/query.js";
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
import {
  mcpDataSchemas,
  outputEnvelopeSchema,
  toAccountData,
  toEducationArticleData,
  toEducationListData,
  toFiltersData,
  toMarketStatusData,
  toPerformanceStatsData,
  toPreferencesData,
  toTickerAnalysisData,
  toTradeHistoryData,
  toTradeIdeasData,
  toWatchlistData,
} from "./dtos.js";
import { envelope, textSummary, toolError } from "./result.js";

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
const analyzeTickerInput = z
  .object({ ticker: z.string().min(1).max(10) })
  .strict();

export function registerGreeksSurgeTools(options: ToolRegistryOptions): void {
  const add = <TData>(
    name: string,
    description: string,
    inputSchema: z.ZodType,
    dataSchema: z.ZodType<TData>,
    authenticated: boolean,
    handler: (
      client: ToolClient,
      args: Record<string, unknown>,
    ) => Promise<TData>,
  ) => {
    options.register(
      name,
      {
        title: name,
        description,
        inputSchema,
        outputSchema: outputEnvelopeSchema(dataSchema),
        annotations,
      },
      async (args) =>
        runTool(name, authenticated, options, args, dataSchema, handler),
    );
  };

  add(
    "get_account",
    "Read the connected GreeksSurge account tier and feature flags.",
    emptyInput,
    mcpDataSchemas.get_account,
    true,
    async (client) => toAccountData(await client.getAccount()),
  );
  add(
    "get_market_status",
    "Read the current GreeksSurge market status.",
    emptyInput,
    mcpDataSchemas.get_market_status,
    false,
    async (client) => toMarketStatusData(await client.getMarketStatus()),
  );
  add(
    "list_trade_ideas",
    "List tier-scoped GreeksSurge trade ideas.",
    ideasInput,
    mcpDataSchemas.list_trade_ideas,
    true,
    async (client, args) => {
      const response = await client.listTradeIdeas(args as IdeasQuery);
      return toTradeIdeasData(response, Number(args.limit ?? 100));
    },
  );
  add(
    "get_available_filters",
    "Read available GreeksSurge filter values.",
    emptyInput,
    mcpDataSchemas.get_available_filters,
    false,
    async (client) => toFiltersData(await client.getAvailableFilters()),
  );
  add(
    "get_performance_stats",
    "Read tier-scoped GreeksSurge performance statistics.",
    emptyInput,
    mcpDataSchemas.get_performance_stats,
    true,
    async (client) =>
      toPerformanceStatsData(await client.getPerformanceStats()),
  );
  add(
    "list_trade_history",
    "List settled tier-scoped GreeksSurge trade history.",
    tradeHistoryInput,
    mcpDataSchemas.list_trade_history,
    true,
    async (client, args) => {
      const response = await client.listTradeHistory(args as TradeHistoryQuery);
      return toTradeHistoryData(response, Number(args.limit ?? 100));
    },
  );
  add(
    "list_education",
    "List GreeksSurge education articles.",
    emptyInput,
    mcpDataSchemas.list_education,
    false,
    async (client) => toEducationListData(await client.listEducation()),
  );
  add(
    "get_education_article",
    "Read one GreeksSurge education article.",
    articleInput,
    mcpDataSchemas.get_education_article,
    false,
    async (client, args) =>
      toEducationArticleData(
        await client.getEducationArticle(String(args.slug)),
      ),
  );
  add(
    "analyze_ticker",
    "Derive cash-secured-put indicators and downside risk factors for one ticker, " +
      "combining its open ideas with how that ticker has actually settled in this " +
      "account. Reports measurements and named risk factors with the formula for " +
      "each; it does not rank or recommend trades.",
    analyzeTickerInput,
    mcpDataSchemas.analyze_ticker,
    true,
    async (client, args) => {
      const ticker = String(args.ticker);
      // Upstream filters are best-effort, so analyzeTicker re-filters by ticker.
      const [ideas, stats, settled] = await Promise.all([
        client.listTradeIdeas({ ticker, limit: 100 } as IdeasQuery),
        client.getPerformanceStats(),
        client.listTradeHistory({ symbol: ticker, limit: 100 }),
      ]);
      return toTickerAnalysisData(
        analyzeTicker({
          ticker,
          ideas: ideas.ideas,
          stats,
          settled: settled.ideas,
        }),
      );
    },
  );
  add(
    "get_watchlist",
    "Read the connected account watchlist.",
    emptyInput,
    mcpDataSchemas.get_watchlist,
    true,
    async (client) => toWatchlistData(await client.getWatchlist()),
  );
  add(
    "get_preferences",
    "Read the connected account preferences.",
    emptyInput,
    mcpDataSchemas.get_preferences,
    true,
    async (client) => toPreferencesData(await client.getPreferences()),
  );
}

async function runTool<TData>(
  name: string,
  authenticated: boolean,
  options: ToolRegistryOptions,
  args: Record<string, unknown>,
  dataSchema: z.ZodType<TData>,
  handler: (
    client: ToolClient,
    args: Record<string, unknown>,
  ) => Promise<TData>,
): Promise<ToolResult> {
  try {
    if (authenticated && !(await options.tokenProvider())) {
      return toolError(
        "AUTH_REQUIRED",
        "Run `npx greekssurge-mcp auth login` to connect your GreeksSurge account.",
      );
    }
    const data = dataSchema.parse(await handler(options.clientFactory(), args));
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
