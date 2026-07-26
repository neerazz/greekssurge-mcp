import { z, ZodError } from 'zod';
import type { AccountDto, IdeaDto, MarketStatusDto } from './types.js';

export const SOURCE_URL = 'https://csp.greekssurge.com' as const;
export const EDUCATIONAL_DISCLAIMER =
  'GreeksSurge content is educational information only, not financial advice. Verify market facts independently.';

const isoDate = z.string().datetime({ offset: true });
const cursor = z.string().min(1).max(256).nullable().optional();
const ticker = z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/);
const tier = z.enum(['free', 'basic', 'premium', 'pro', 'unknown']).or(z.string().min(1).max(64));
const strategy = z.string().min(1).max(64);

const paged = <T extends z.ZodType>(item: T, max = 100) =>
  z.object({
    items: z.array(item).max(max),
    nextCursor: cursor,
  });

const idea = z.object({
  id: z.string().min(1).max(128),
  ticker,
  strategy,
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2_000),
  publishedAt: isoDate,
  expiresAt: isoDate.optional(),
  tier,
  isMasked: z.boolean().default(false),
});

const historyItem = z.object({
  id: z.string().min(1).max(128),
  ticker,
  strategy,
  openedAt: isoDate,
  closedAt: isoDate.nullable().optional(),
  outcome: z.string().min(1).max(64).optional(),
  returnPct: z.number().finite().optional(),
});

const tradeHistoryItem = z.object({
  id: z.string().min(1).max(128),
  ticker,
  strategy,
  openedAt: isoDate,
  closedAt: isoDate.nullable().optional(),
  status: z.string().min(1).max(64),
  pnlPct: z.number().finite().optional(),
});

const educationSummary = z.object({
  id: z.string().min(1).max(128),
  slug: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(1_000),
  publishedAt: isoDate,
  tier,
});

export const upstreamSchemas = {
  status: z.object({
    market: z.string().min(1).max(64),
    asOf: isoDate,
    timezone: z.string().min(1).max(80),
    disclaimer: z.string().min(1).max(1_000).optional(),
  }),
  authMe: z.object({
    userId: z.string().min(1).max(256),
    tier,
    subscriptionStatus: z.string().min(1).max(64),
    features: z.array(z.string().min(1).max(80)).max(100).default([]),
    masking: z
      .object({
        premiumMasked: z.boolean().default(false),
      })
      .default({ premiumMasked: false }),
  }),
  ideas: paged(idea, 100),
  filters: z.object({
    tickers: z.array(ticker).max(500),
    strategies: z.array(strategy).max(100),
    expirations: z.array(z.string().min(1).max(40)).max(200),
    updatedAt: isoDate,
  }),
  stats: z.object({
    asOf: isoDate,
    period: z.string().min(1).max(64),
    winRate: z.number().min(0).max(1),
    averageReturnPct: z.number().finite(),
    tradeCount: z.number().int().nonnegative(),
  }),
  history: paged(historyItem, 100),
  tradeHistory: paged(tradeHistoryItem, 100),
  educationList: z.object({ items: z.array(educationSummary).max(100) }),
  educationArticle: educationSummary.extend({
    summary: z.string().min(1).max(1_000).optional(),
    body: z.string().min(1).max(50_000),
    updatedAt: isoDate.optional(),
  }),
  watchlist: z.object({
    items: z
      .array(
        z.object({
          ticker,
          addedAt: isoDate,
          notes: z.string().max(1_000).optional(),
        }),
      )
      .max(500),
    updatedAt: isoDate,
  }),
  preferences: z.object({
    emailNotifications: z.boolean().optional(),
    defaultStrategy: z.string().min(1).max(64).optional(),
    riskLevel: z.string().min(1).max(64).optional(),
    updatedAt: isoDate,
  }),
} as const;

export type UpstreamSchemaName = keyof typeof upstreamSchemas;
export type ParsedUpstream<TName extends UpstreamSchemaName> = z.infer<(typeof upstreamSchemas)[TName]>;

export function parseUpstream<TName extends UpstreamSchemaName>(
  schemaName: TName,
  payload: unknown,
): ParsedUpstream<TName> {
  try {
    return upstreamSchemas[schemaName].parse(payload) as ParsedUpstream<TName>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(`Upstream contract changed for ${schemaName}: ${error.issues[0]?.message ?? 'invalid payload'}`);
    }
    throw error;
  }
}

export function sourceMetadata(retrievedAt = new Date().toISOString()) {
  return { source: SOURCE_URL, retrievedAt, disclaimer: EDUCATIONAL_DISCLAIMER } as const;
}

export function toAccountDto(account: ParsedUpstream<'authMe'>): AccountDto {
  return {
    tier: account.tier,
    subscriptionStatus: account.subscriptionStatus,
    features: account.features,
    premiumMasked: account.masking.premiumMasked,
  };
}

export function toStatusDto(
  status: ParsedUpstream<'status'>,
  retrievedAt?: string,
): MarketStatusDto {
  return {
    ...sourceMetadata(retrievedAt),
    market: status.market,
    asOf: status.asOf,
    timezone: status.timezone,
  };
}

export function toIdeaDtos(ideas: ParsedUpstream<'ideas'>, retrievedAt?: string): IdeaDto[] {
  return ideas.items.map((item) => ({
    ...sourceMetadata(retrievedAt),
    id: item.id,
    ticker: item.ticker,
    strategy: item.strategy,
    title: item.title,
    summary: item.summary,
    publishedAt: item.publishedAt,
    expiresAt: item.expiresAt,
    tier: item.tier,
    isMasked: item.isMasked,
  }));
}
