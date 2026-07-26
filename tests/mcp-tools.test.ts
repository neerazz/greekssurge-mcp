import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { GreeksSurgeApiError } from "../src/api/errors.js";
import { createGreeksSurgeMcpServer } from "../src/mcp/create-server.js";

const source = "https://csp.greekssurge.com";

function liveIdea(index: number) {
  return {
    displaySymbol: `AAPL 2026-08-21 ${150 + index}C`,
    afterHours: false,
    alertPremium: 125.5,
    blockedCapital: 15_000,
    createdAt: "2026-07-26T15:30:00.000Z",
    dislikes: 0,
    expiry: "2026-08-21",
    isAssigned: false,
    isFree: false,
    isLeveraged: false,
    isMarketHours: true,
    likes: index,
    outcome: "OPEN",
    probOtm: 0.72,
    roi: 0.84,
    shares: 100,
    strike: 150 + index,
    symbol: "AAPL",
    triggerPrice: 154.25,
    dateOnly: "2026-07-26",
    ticker: "AAPL",
    id: `idea_${index}`,
    capital: 15_000,
    buffer: 3.5,
    capturedRoi: null,
    realizedRoi: null,
    decayProfit: 42.1,
    companyName: "Example Apple Inc.",
    optionSymbol: "AAPL260821C00150000",
    executiveBrief: "Sanitized educational setup summary.",
    orderStatus: "OPEN",
    ideaMode: "COVERED_CALL",
  };
}

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getAccount: async () => ({
      userTier: "premium",
      isLifetimeFree: false,
      onboarding: { completed: true },
      features: ["ideas"],
      masking: { premiumMasked: false },
    }),
    getMarketStatus: async () => ({ isMarketOpen: true }),
    listTradeIdeas: async () => ({
      ideas: Array.from({ length: 105 }, (_, index) => liveIdea(index)),
      summary: { total: 105 },
      lastSettled: [],
      pagination: { total: 105, page: 1, limit: 100, pages: 2 },
      isMarketOpen: true,
      source: "fixture-sanitized-live-shape",
      cached: false,
    }),
    getAvailableFilters: async () => ({
      expiries: ["2026-08-21"],
      tickers: ["AAPL"],
      volatilities: ["MEDIUM"],
      rois: ["0-1"],
      capitals: ["5000-20000"],
      probOtms: ["70-80"],
      modes: ["COVERED_CALL"],
      outcomes: ["OPEN"],
    }),
    getPerformanceStats: async () => ({
      top_performers: [],
      ticker_breakdown: [],
      roi_histogram: [],
      greeks_distribution: [],
      weekly_calendar: [],
      monthly_performance: [],
      settled: 10,
      total_premium: 1000,
      open_premium: 250,
      win_rate: 0.6,
      win_streak_current: 2,
      win_streak_best: 4,
      max_drawdown: -2.5,
      otm_signals: 8,
      btc_signals: 1,
      assigned_signals: 0,
      last_settled: [],
    }),
    listTradeHistory: async () => ({
      summary: { total: 0, winRate: 0, rollingPremium: 0 },
      page: 1,
      limit: 100,
      totalPages: 0,
      total: 0,
      ideas: [],
    }),
    listEducation: async () => ({ pillars: [] }),
    getEducationArticle: async () => ({
      slug: "covered-calls-basics",
      title: "Covered Calls Basics",
      description: "Sanitized article.",
      cluster: "options-income",
      clusterTitle: "Options Income",
      pillar: "income",
      updated: "2026-07-20",
      readMinutes: 6,
      html: "<p>Body</p>",
      headings: [],
      faq: [],
      sources: [],
      related: [],
    }),
    getWatchlist: async () => ({ tickers: [] }),
    getPreferences: async () => ({
      watchlistIdeasOnly: false,
      watchlistAlertsOnly: false,
    }),
    ...overrides,
  };
}

async function connectedClient(
  options: { token?: string; client?: ReturnType<typeof fakeClient> } = {},
) {
  const server = createGreeksSurgeMcpServer({
    tokenProvider: async () => options.token,
    clientFactory: () => options.client ?? fakeClient(),
  });
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return { client, server };
}

describe("GreeksSurge MCP tools", () => {
  it("lists the read-only transport-neutral tool set with annotations and schemas", async () => {
    const { client, server } = await connectedClient({ token: "token" });

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual(
      [
        "get_account",
        "get_available_filters",
        "get_education_article",
        "get_market_status",
        "get_performance_stats",
        "get_preferences",
        "get_watchlist",
        "list_education",
        "list_trade_history",
        "list_trade_ideas",
      ].sort(),
    );
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.outputSchema?.type).toBe("object");
    }
    expect(client.getInstructions()?.slice(0, 512)).toContain("read-only");
    await client.close();
    await server.close();
  });

  it("returns safe structured content with source, disclaimer, and provenance", async () => {
    const { client, server } = await connectedClient({ token: "token" });

    const result = await client.callTool({
      name: "get_market_status",
      arguments: {},
    });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({
      source,
      disclaimer: expect.stringMatching(/not financial advice/i),
      data: { isMarketOpen: true },
    });
    expect(result.structuredContent?.retrievedAt).toEqual(expect.any(String));
    expect(result.content[0]).toMatchObject({ type: "text" });
    await client.close();
    await server.close();
  });

  it("returns actionable authentication and tier tool errors without throwing transport failures", async () => {
    const auth = await connectedClient();
    const authResult = await auth.client.callTool({
      name: "get_account",
      arguments: {},
    });
    expect(authResult.isError).toBe(true);
    expect(JSON.stringify(authResult)).toContain(
      "npx greekssurge-mcp auth login",
    );
    await auth.client.close();
    await auth.server.close();

    const tier = await connectedClient({
      token: "token",
      client: fakeClient({
        listTradeIdeas: async () => {
          throw new GreeksSurgeApiError("TIER_REQUIRED", "tier required");
        },
      }),
    });
    const tierResult = await tier.client.callTool({
      name: "list_trade_ideas",
      arguments: {},
    });
    expect(tierResult.isError).toBe(true);
    expect(JSON.stringify(tierResult)).toContain("TIER_REQUIRED");
    await tier.client.close();
    await tier.server.close();
  });

  it("caps large result arrays", async () => {
    const { client, server } = await connectedClient({ token: "token" });

    const result = await client.callTool({
      name: "list_trade_ideas",
      arguments: { limit: 100 },
    });

    expect(
      (result.structuredContent?.data as { items: unknown[] }).items,
    ).toHaveLength(100);
    await client.close();
    await server.close();
  });

  it("exposes endpoint-specific query inputs instead of old arbitrary list params", async () => {
    const { client, server } = await connectedClient({ token: "token" });
    const tools = await client.listTools();
    const ideasTool = tools.tools.find(
      (tool) => tool.name === "list_trade_ideas",
    );
    const historyTool = tools.tools.find(
      (tool) => tool.name === "list_trade_history",
    );

    expect(JSON.stringify(ideasTool?.inputSchema)).toContain("betterEntry");
    expect(JSON.stringify(ideasTool?.inputSchema)).not.toContain("strategy");
    expect(JSON.stringify(historyTool?.inputSchema)).toContain("ideaMode");
    expect(JSON.stringify(historyTool?.inputSchema)).not.toContain("ticker");
    await client.close();
    await server.close();
  });
});
