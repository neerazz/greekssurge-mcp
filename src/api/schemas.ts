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
const primitive = z.union([
  z.string().max(2_000),
  finiteNumber,
  z.boolean(),
  z.null(),
]);
const boundedRecord = z
  .record(z.string().min(1).max(80), primitive)
  .refine((value) => Object.keys(value).length <= 80, "too many keys");

const pagination = z.object({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive().max(100),
  pages: z.number().int().nonnegative(),
});

const authUser = z.object({
  userTier: boundedString(64),
  isLifetimeFree: booleanDefaultFalse,
  onboarding: boundedRecord.default({}),
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
  optionSymbol: boundedString(80),
  executiveBrief: z.string().max(5_000).nullable().optional(),
  orderStatus: boundedString(80),
  ideaMode: boundedString(80),
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
  pillar: boundedString(120),
  updated: boundedString(80),
  readMinutes: z.number().int().nonnegative(),
  posts: z.array(educationPost).max(100),
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
    summary: boundedRecord,
    lastSettled: z.array(boundedRecord).max(100),
    pagination,
    isMarketOpen: z.boolean(),
    source: boundedString(200),
    cached: z.boolean(),
  }),
  filters: z.object({
    expiries: z.array(boundedString(40)).max(300),
    tickers: z.array(ticker).max(500),
    volatilities: z.array(boundedString(80)).max(200),
    rois: z.array(boundedString(80)).max(200),
    capitals: z.array(boundedString(80)).max(200),
    probOtms: z.array(boundedString(80)).max(200),
    modes: z.array(boundedString(80)).max(200),
    outcomes: z.array(boundedString(80)).max(200),
  }),
  stats: z.object({
    top_performers: z.array(boundedRecord).max(500),
    ticker_breakdown: z.array(boundedRecord).max(500),
    roi_histogram: z.array(boundedRecord).max(500),
    greeks_distribution: z.array(boundedRecord).max(500),
    weekly_calendar: z.array(boundedRecord).max(500),
    monthly_performance: z.array(boundedRecord).max(500),
    settled: finiteNumber,
    total_premium: finiteNumber,
    open_premium: finiteNumber,
    win_rate: finiteNumber,
    win_streak_current: finiteNumber,
    win_streak_best: finiteNumber,
    max_drawdown: finiteNumber,
    otm_signals: finiteNumber,
    btc_signals: finiteNumber,
    assigned_signals: finiteNumber,
    last_settled: z.array(boundedRecord).max(500),
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
  educationList: z.object({ pillars: z.array(educationPillar).max(100) }),
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
    sources: z
      .array(
        z.object({
          title: boundedString(300),
          url: z.string().url().max(2_000),
        }),
      )
      .max(100),
    related: z.array(educationPost).max(100),
  }),
  watchlist: z.object({
    tickers: z.array(ticker).max(500),
  }),
  preferences: z
    .object({
      watchlistIdeasOnly: z.boolean(),
      watchlistAlertsOnly: z.boolean(),
    })
    .passthrough(),
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
    onboarding: account.onboarding,
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
    orderStatus: item.orderStatus,
    createdAt: item.createdAt,
  }));
}
