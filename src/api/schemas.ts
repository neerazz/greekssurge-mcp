import { z, ZodError } from "zod";
import type { AccountDto, IdeaDto, MarketStatusDto } from "./types.js";

export const SOURCE_URL = "https://csp.greekssurge.com" as const;
export const EDUCATIONAL_DISCLAIMER =
  "GreeksSurge content is educational information only, not financial advice. Verify market facts independently.";

const boundedString = (max = 2_000) => z.string().min(1).max(max);
const optionalString = (max = 2_000) =>
  z.string().max(max).nullable().optional();
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timestampString = z.string().min(1).max(80);
const ticker = z.string().regex(/^[A-Z][A-Z0-9.]{0,9}$/);
const finiteNumber = z.number().finite();
const nullableNumber = finiteNumber.nullable().optional();
const booleanDefaultFalse = z.boolean().default(false);
const id = z.union([boundedString(128), z.number().int()]).transform(String);
const filterOption = z.object({
  label: boundedString(120),
  value: boundedString(120),
});

const pagination = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  pages: z.number().int().nonnegative(),
});

const authUser = z.object({
  userTier: boundedString(64),
  isLifetimeFree: booleanDefaultFalse,
  features: z.array(boundedString(80)).max(100).default([]),
  masking: z
    .object({
      premiumMasked: booleanDefaultFalse,
    })
    .default({ premiumMasked: false }),
});

const idea = z.object({
  displaySymbol: boundedString(160),
  afterHours: z.boolean(),
  alertPremium: finiteNumber,
  blockedCapital: finiteNumber,
  createdAt: timestampString,
  dislikes: z.number().int().nonnegative(),
  expiry: dateString,
  isAssigned: z.boolean(),
  isFree: z.boolean(),
  isLeveraged: z.boolean(),
  isMarketHours: z.boolean(),
  likes: z.number().int().nonnegative(),
  outcome: optionalString(64),
  probOtm: finiteNumber,
  roi: finiteNumber,
  shares: finiteNumber,
  strike: finiteNumber,
  symbol: boundedString(24),
  triggerPrice: nullableNumber,
  dateOnly: dateString,
  ticker,
  id,
  capital: finiteNumber,
  buffer: finiteNumber,
  capturedRoi: nullableNumber,
  realizedRoi: nullableNumber,
  decayProfit: nullableNumber,
  companyName: boundedString(200),
  // Upstream stopped sending optionSymbol; it is never surfaced through any MCP
  // tool, so accept its absence rather than failing the whole ideas payload.
  optionSymbol: boundedString(80).optional(),
  executiveBrief: z
    .union([
      z.string().max(5_000),
      z.object({
        rationale: z.string().max(5_000),
        technicalContext: z.string().max(5_000),
        entryWindowLow: finiteNumber,
        entryWindowHigh: finiteNumber,
        score: finiteNumber,
        rank: z.number().int().nonnegative(),
      }),
    ])
    .nullable()
    .optional(),
  orderStatus: optionalString(80),
  ideaMode: boundedString(80),
});

const weeklyCalendarItem = z.object({
  week: boundedString(40),
  premium: finiteNumber,
  count: z.number().int().nonnegative(),
});
const topPerformer = z.object({
  ticker,
  displaySymbol: boundedString(160),
  outcome: boundedString(80),
  expiry: dateString,
  strike: finiteNumber,
  alertPremium: finiteNumber,
  closePrice: nullableNumber,
  capital: finiteNumber,
  premiumCollected: finiteNumber,
  createdAt: timestampString,
  closeDate: timestampString,
  daysHeld: z.number().int().nonnegative(),
  roi: finiteNumber,
  id,
});
const tickerBreakdownItem = z.object({
  ticker,
  count: z.number().int().nonnegative(),
  otm: z.number().int().nonnegative(),
  premium: finiteNumber,
  winRate: finiteNumber,
});
const histogramItem = z.object({
  bucket: boundedString(80),
  count: z.number().int().nonnegative(),
});
const greeksDistributionItem = z.object({
  range: boundedString(80),
  count: z.number().int().nonnegative(),
});
const monthlyPerformanceItem = z.object({
  month: boundedString(40),
  winRate: finiteNumber,
  trades: z.number().int().nonnegative(),
  sortKey: boundedString(40),
});
const settledItem = z.object({
  ticker,
  strike: finiteNumber,
  expiry: dateString,
  outcome: boundedString(80),
  roi: finiteNumber,
  profit: nullableNumber,
  premium: finiteNumber,
  daysHeld: z.number().int().nonnegative(),
  closeDate: timestampString,
});
const performanceSummary = z.object({
  total_premium: finiteNumber,
  open_premium: finiteNumber,
  settled: finiteNumber,
  win_rate: finiteNumber,
  weekly_calendar: z.array(weeklyCalendarItem).max(500),
  top_performers: z.array(topPerformer).max(500),
  ticker_breakdown: z.array(tickerBreakdownItem).max(500),
  roi_histogram: z.array(histogramItem).max(500),
  greeks_distribution: z.array(greeksDistributionItem).max(500),
  monthly_performance: z.array(monthlyPerformanceItem).max(500),
  win_streak_current: finiteNumber,
  win_streak_best: finiteNumber,
  max_drawdown: finiteNumber,
  otm_signals: finiteNumber,
  btc_signals: finiteNumber,
  assigned_signals: finiteNumber,
  last_settled: z.array(settledItem).max(100),
});

const tradeHistoryIdea = z.object({
  ticker,
  displaySymbol: boundedString(160),
  ideaMode: boundedString(80),
  strike: finiteNumber,
  expiry: dateString,
  alertPremium: finiteNumber,
  closePrice: nullableNumber,
  roi: finiteNumber,
  realizedRoi: nullableNumber,
  projectedRoi: nullableNumber,
  capital: finiteNumber,
  outcome: boundedString(80),
  premiumCollected: finiteNumber,
  createdAt: timestampString,
  closeDate: timestampString.nullable().optional(),
  daysHeld: z.number().int().nonnegative().nullable().optional(),
  companyName: boundedString(200),
  id,
});

const educationPost = z.object({
  slug: boundedString(160),
  title: boundedString(200),
  description: z.string().max(1_000).optional(),
});

const educationPillar = z.object({
  slug: boundedString(160),
  title: boundedString(200),
  description: boundedString(1_000),
  cluster: boundedString(120),
  clusterTitle: boundedString(200),
  pillar: z.boolean(),
  updated: boundedString(80),
  readMinutes: z.number().int().nonnegative(),
  posts: z.array(educationPost).max(100),
});

// /api/education now returns an ordered course of lessons instead of a
// pillar/post tree.
const educationLesson = z.object({
  slug: boundedString(160),
  title: boundedString(200),
  order: z.number().int().nonnegative(),
  clusterTitle: boundedString(200),
  icon: boundedString(80).optional(),
  readMinutes: z.number().int().nonnegative(),
  completed: booleanDefaultFalse,
});

export const upstreamSchemas = {
  status: z.object({
    isMarketOpen: z.boolean(),
  }),
  authMe: z.preprocess((payload) => {
    if (payload && typeof payload === "object" && "user" in payload) {
      return (payload as { user?: unknown }).user;
    }
    return payload;
  }, authUser),
  ideas: z.object({
    ideas: z.array(idea).max(100),
    summary: performanceSummary,
    lastSettled: z.array(settledItem).max(100),
    pagination,
    isMarketOpen: z.boolean(),
    source: boundedString(200),
    cached: z.boolean(),
  }),
  filters: z.object({
    expiries: z.array(boundedString(40)).max(300),
    tickers: z.array(ticker).max(500),
    volatilities: z.array(filterOption).max(200),
    rois: z.array(filterOption).max(200),
    capitals: z.array(filterOption).max(200),
    probOtms: z.array(filterOption).max(200),
    modes: z.array(filterOption).max(200),
    outcomes: z.array(filterOption).max(200),
  }),
  stats: performanceSummary.omit({ total_premium: true }).extend({
    total_premium: finiteNumber,
  }),
  history: z.array(
    z.object({
      date: dateString,
      otm: finiteNumber,
      itm: finiteNumber,
      premium: finiteNumber,
    }),
  ),
  tradeHistory: z.object({
    summary: z.object({
      total: finiteNumber,
      winRate: finiteNumber,
      rollingPremium: finiteNumber,
    }),
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(100),
    totalPages: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    ideas: z.array(tradeHistoryIdea).max(100),
  }),
  educationList: z.object({
    course: z.array(educationLesson).max(100),
    courseTotal: z.number().int().nonnegative().default(0),
    completedSlugs: z.array(boundedString(160)).max(500).default([]),
  }),
  educationArticle: educationPillar.omit({ posts: true }).extend({
    html: z.string().min(1).max(100_000),
    headings: z
      .array(
        z.object({
          id: boundedString(160),
          text: boundedString(300),
        }),
      )
      .max(200),
    faq: z
      .array(
        z.object({
          q: boundedString(500),
          a: boundedString(2_000),
        }),
      )
      .max(100),
    // Upstream no longer ships a sources list on articles; treat it as absent
    // rather than a contract break.
    sources: z
      .array(
        z.object({
          title: boundedString(300),
          url: z.string().url().max(2_000),
        }),
      )
      .max(100)
      .default([]),
    related: z.array(educationPost).max(100),
  }),
  watchlist: z.object({
    tickers: z.array(ticker).max(500),
  }),
  preferences: z.object({
    watchlistIdeasOnly: z.boolean(),
    watchlistAlertsOnly: z.boolean(),
  }),
} as const;

export type UpstreamSchemaName = keyof typeof upstreamSchemas;
export type ParsedUpstream<TName extends UpstreamSchemaName> = z.infer<
  (typeof upstreamSchemas)[TName]
>;

export function parseUpstream<TName extends UpstreamSchemaName>(
  schemaName: TName,
  payload: unknown,
): ParsedUpstream<TName> {
  try {
    return upstreamSchemas[schemaName].parse(payload) as ParsedUpstream<TName>;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(
        `Upstream contract changed for ${schemaName}: ${error.issues[0]?.message ?? "invalid payload"}`,
        { cause: error },
      );
    }
    throw error;
  }
}

export function sourceMetadata(retrievedAt = new Date().toISOString()) {
  return {
    source: SOURCE_URL,
    retrievedAt,
    disclaimer: EDUCATIONAL_DISCLAIMER,
  } as const;
}

export function toAccountDto(account: ParsedUpstream<"authMe">): AccountDto {
  return {
    tier: account.userTier,
    isLifetimeFree: account.isLifetimeFree,
    features: account.features,
    premiumMasked: account.masking.premiumMasked,
  };
}

export function toStatusDto(
  status: ParsedUpstream<"status">,
  retrievedAt?: string,
): MarketStatusDto {
  return {
    ...sourceMetadata(retrievedAt),
    isMarketOpen: status.isMarketOpen,
  };
}

export function toIdeaDtos(
  ideas: ParsedUpstream<"ideas">,
  retrievedAt?: string,
): IdeaDto[] {
  return ideas.ideas.map((item) => ({
    ...sourceMetadata(retrievedAt),
    id: item.id,
    ticker: item.ticker,
    displaySymbol: item.displaySymbol,
    companyName: item.companyName,
    ideaMode: item.ideaMode,
    expiry: item.expiry,
    strike: item.strike,
    roi: item.roi,
    probOtm: item.probOtm,
    alertPremium: item.alertPremium,
    capital: item.capital,
    buffer: item.buffer,
    isFree: item.isFree,
    isAssigned: item.isAssigned,
    outcome: item.outcome ?? null,
    orderStatus: item.orderStatus ?? null,
    createdAt: item.createdAt,
  }));
}
