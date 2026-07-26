import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { describe, expect, it } from 'vitest';
import { GreeksSurgeApiError } from '../src/api/errors.js';
import { createGreeksSurgeMcpServer } from '../src/mcp/create-server.js';

const source = 'https://csp.greekssurge.com';

function fakeClient(overrides: Record<string, unknown> = {}) {
  return {
    getAccount: async () => ({ userId: 'fixture-user', tier: 'premium', subscriptionStatus: 'active', features: ['ideas'], masking: { premiumMasked: false } }),
    getMarketStatus: async () => ({ market: 'open', asOf: '2026-07-26T15:30:00.000Z', timezone: 'America/New_York' }),
    listTradeIdeas: async () => ({ items: Array.from({ length: 105 }, (_, index) => ({ id: `idea_${index}`, ticker: 'AAPL', strategy: 'covered_call', title: 'Idea', summary: 'Summary', publishedAt: '2026-07-26T15:30:00.000Z', tier: 'premium', isMasked: false })), nextCursor: null }),
    getAvailableFilters: async () => ({ tickers: ['AAPL'], strategies: ['covered_call'], expirations: ['2026-08-21'], updatedAt: '2026-07-26T15:30:00.000Z' }),
    getPerformanceStats: async () => ({ asOf: '2026-07-26T15:30:00.000Z', period: 'all_time', winRate: 0.6, averageReturnPct: 2.5, tradeCount: 10 }),
    listTradeHistory: async () => ({ items: [], nextCursor: null }),
    listEducation: async () => ({ items: [] }),
    getEducationArticle: async () => ({ id: 'edu_1', slug: 'covered-calls-basics', title: 'Covered Calls Basics', body: 'Body', publishedAt: '2026-01-01T00:00:00.000Z', tier: 'free' }),
    getWatchlist: async () => ({ items: [], updatedAt: '2026-07-26T15:30:00.000Z' }),
    getPreferences: async () => ({ updatedAt: '2026-07-26T15:30:00.000Z' }),
    ...overrides,
  };
}

async function connectedClient(options: { token?: string; client?: ReturnType<typeof fakeClient> } = {}) {
  const server = createGreeksSurgeMcpServer({
    tokenProvider: async () => options.token,
    clientFactory: () => options.client ?? fakeClient(),
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, server };
}

describe('GreeksSurge MCP tools', () => {
  it('lists the read-only transport-neutral tool set with annotations and schemas', async () => {
    const { client, server } = await connectedClient({ token: 'token' });

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
      'get_account',
      'get_available_filters',
      'get_education_article',
      'get_market_status',
      'get_performance_stats',
      'get_preferences',
      'get_watchlist',
      'list_education',
      'list_trade_history',
      'list_trade_ideas',
    ].sort());
    for (const tool of tools.tools) {
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema?.type).toBe('object');
    }
    expect(client.getInstructions()?.slice(0, 512)).toContain('read-only');
    await client.close();
    await server.close();
  });

  it('returns safe structured content with source, disclaimer, and provenance', async () => {
    const { client, server } = await connectedClient({ token: 'token' });

    const result = await client.callTool({ name: 'get_market_status', arguments: {} });

    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ source, disclaimer: expect.stringMatching(/not financial advice/i), data: { market: 'open' } });
    expect(result.structuredContent?.retrievedAt).toEqual(expect.any(String));
    expect(result.content[0]).toMatchObject({ type: 'text' });
    await client.close();
    await server.close();
  });

  it('returns actionable authentication and tier tool errors without throwing transport failures', async () => {
    const auth = await connectedClient();
    const authResult = await auth.client.callTool({ name: 'get_account', arguments: {} });
    expect(authResult.isError).toBe(true);
    expect(JSON.stringify(authResult)).toContain('npx greekssurge-mcp auth login');
    await auth.client.close();
    await auth.server.close();

    const tier = await connectedClient({ token: 'token', client: fakeClient({ listTradeIdeas: async () => { throw new GreeksSurgeApiError('TIER_REQUIRED', 'tier required'); } }) });
    const tierResult = await tier.client.callTool({ name: 'list_trade_ideas', arguments: {} });
    expect(tierResult.isError).toBe(true);
    expect(JSON.stringify(tierResult)).toContain('TIER_REQUIRED');
    await tier.client.close();
    await tier.server.close();
  });

  it('caps large result arrays', async () => {
    const { client, server } = await connectedClient({ token: 'token' });

    const result = await client.callTool({ name: 'list_trade_ideas', arguments: { limit: 100 } });

    expect((result.structuredContent?.data as { items: unknown[] }).items).toHaveLength(100);
    await client.close();
    await server.close();
  });
});
