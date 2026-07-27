import { z } from "zod";
import type {
  Account,
  EducationArticle,
  EducationListResponse,
  FiltersResponse,
  IdeasResponse,
  PreferencesResponse,
  StatsResponse,
  TradeHistoryResponse,
  WatchlistResponse,
  MarketStatus,
} from "../api/types.js";
import { EDUCATIONAL_NO_ADVICE_DISCLOSURE } from "./disclaimer.js";

const SOURCE_URL = "https://csp.greekssurge.com" as const;
const CONTENT_TEXT_MAX_LENGTH = 20_000;

const boundedString = (max = 2_000) => z.string().max(max);
const optionalString = (max = 2_000) =>
  boundedString(max).nullable().optional();
const ticker = boundedString(24);
const dateString = boundedString(40);
const timestampString = boundedString(80);
const finiteNumber = z.number().finite();
const nullableNumber = finiteNumber.nullable().optional();
const id = z.string().max(128);

const metaValueSchema = z.union([
  boundedString(2_000),
  finiteNumber,
  z.boolean(),
  z.null(),
  z.array(boundedString(500)).max(100),
  z.array(finiteNumber).max(100),
  z.array(z.boolean()).max(100),
]);
const metaSchema = z.record(z.string().max(120), metaValueSchema);

export const toolErrorDataSchema = z
  .object({
    code: boundedString(80),
    message: boundedString(1_000),
  })
  .strict();

export function outputEnvelopeSchema<TData extends z.ZodType>(
  dataSchema: TData,
) {
  return z
    .object({
      source: z.literal(SOURCE_URL),
      retrievedAt: timestampString,
      disclaimer: z.literal(EDUCATIONAL_NO_ADVICE_DISCLOSURE),
      data: z.union([dataSchema, toolErrorDataSchema]),
      meta: metaSchema.optional(),
    })
    .strict();
}

const filterOptionSchema = z
  .object({
    label: boundedString(120),
    value: boundedString(120),
  })
  .strict();

const paginationSchema = z
  .object({
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive().max(100),
    pages: z.number().int().nonnegative(),
  })
  .strict();

const weeklyCalendarItemSchema = z
  .object({
    week: boundedString(40),
    premium: finiteNumber,
    count: z.number().int().nonnegative(),
  })
  .strict();

const topPerformerSchema = z
  .object({
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
  })
  .strict();

const tickerBreakdownItemSchema = z
  .object({
    ticker,
    count: z.number().int().nonnegative(),
    otm: z.number().int().nonnegative(),
    premium: finiteNumber,
    winRate: finiteNumber,
  })
  .strict();

const histogramItemSchema = z
  .object({
    bucket: boundedString(80),
    count: z.number().int().nonnegative(),
  })
  .strict();

const greeksDistributionItemSchema = z
  .object({
    range: boundedString(80),
    count: z.number().int().nonnegative(),
  })
  .strict();

const monthlyPerformanceItemSchema = z
  .object({
    month: boundedString(40),
    winRate: finiteNumber,
    trades: z.number().int().nonnegative(),
    sortKey: boundedString(40),
  })
  .strict();

const settledItemSchema = z
  .object({
    ticker,
    strike: finiteNumber,
    expiry: dateString,
    outcome: boundedString(80),
    roi: finiteNumber,
    profit: nullableNumber,
    premium: finiteNumber,
    daysHeld: z.number().int().nonnegative(),
    closeDate: timestampString,
  })
  .strict();

const performanceSummarySchema = z
  .object({
    total_premium: finiteNumber,
    open_premium: finiteNumber,
    settled: finiteNumber,
    win_rate: finiteNumber,
    weekly_calendar: z.array(weeklyCalendarItemSchema).max(100),
    top_performers: z.array(topPerformerSchema).max(100),
    ticker_breakdown: z.array(tickerBreakdownItemSchema).max(100),
    roi_histogram: z.array(histogramItemSchema).max(100),
    greeks_distribution: z.array(greeksDistributionItemSchema).max(100),
    monthly_performance: z.array(monthlyPerformanceItemSchema).max(100),
    win_streak_current: finiteNumber,
    win_streak_best: finiteNumber,
    max_drawdown: finiteNumber,
    otm_signals: finiteNumber,
    btc_signals: finiteNumber,
    assigned_signals: finiteNumber,
    last_settled: z.array(settledItemSchema).max(100),
  })
  .strict();

const ideaSchema = z
  .object({
    id,
    ticker,
    displaySymbol: boundedString(160),
    companyName: boundedString(200),
    ideaMode: boundedString(80),
    expiry: dateString,
    strike: finiteNumber,
    roi: finiteNumber,
    probOtm: finiteNumber,
    alertPremium: finiteNumber,
    capital: finiteNumber,
    buffer: finiteNumber,
    isFree: z.boolean(),
    isAssigned: z.boolean(),
    outcome: optionalString(80),
    orderStatus: optionalString(80),
    createdAt: timestampString,
  })
  .strict();

const tradeHistoryIdeaSchema = z
  .object({
    id,
    ticker,
    displaySymbol: boundedString(160),
    companyName: boundedString(200),
    ideaMode: boundedString(80),
    expiry: dateString,
    strike: finiteNumber,
    alertPremium: finiteNumber,
    closePrice: nullableNumber,
    roi: finiteNumber,
    realizedRoi: nullableNumber,
    projectedRoi: nullableNumber,
    capital: finiteNumber,
    outcome: boundedString(80),
    premiumCollected: finiteNumber,
    createdAt: timestampString,
    closeDate: optionalString(80),
    daysHeld: z.number().int().nonnegative().nullable().optional(),
  })
  .strict();

const educationPostSchema = z
  .object({
    slug: boundedString(160),
    title: boundedString(200),
    description: boundedString(1_000).optional(),
  })
  .strict();

const educationPillarSchema = z
  .object({
    slug: boundedString(160),
    title: boundedString(200),
    description: boundedString(1_000),
    cluster: boundedString(120),
    clusterTitle: boundedString(200),
    pillar: z.boolean(),
    updated: boundedString(80),
    readMinutes: z.number().int().nonnegative(),
    posts: z.array(educationPostSchema).max(100),
  })
  .strict();

const educationLessonSchema = z
  .object({
    slug: boundedString(160),
    title: boundedString(200),
    order: z.number().int().nonnegative(),
    clusterTitle: boundedString(200),
    icon: boundedString(80).optional(),
    readMinutes: z.number().int().nonnegative(),
    completed: z.boolean(),
  })
  .strict();

const headingSchema = z
  .object({ id: boundedString(160), text: boundedString(300) })
  .strict();
const faqSchema = z
  .object({ q: boundedString(500), a: boundedString(2_000) })
  .strict();
const sourceSchema = z
  .object({ title: boundedString(300), url: boundedString(2_000) })
  .strict();

export const mcpDataSchemas = {
  get_account: z
    .object({
      tier: boundedString(64),
      isLifetimeFree: z.boolean(),
      features: z.array(boundedString(80)).max(100),
      premiumMasked: z.boolean(),
    })
    .strict(),
  get_market_status: z.object({ isMarketOpen: z.boolean() }).strict(),
  list_trade_ideas: z
    .object({
      items: z.array(ideaSchema).max(100),
      summary: performanceSummarySchema,
      lastSettled: z.array(settledItemSchema).max(100),
      pagination: paginationSchema,
      isMarketOpen: z.boolean(),
      source: boundedString(200),
      cached: z.boolean(),
    })
    .strict(),
  get_available_filters: z
    .object({
      expiries: z.array(boundedString(40)).max(300),
      tickers: z.array(ticker).max(500),
      volatilities: z.array(filterOptionSchema).max(200),
      rois: z.array(filterOptionSchema).max(200),
      capitals: z.array(filterOptionSchema).max(200),
      probOtms: z.array(filterOptionSchema).max(200),
      modes: z.array(filterOptionSchema).max(200),
      outcomes: z.array(filterOptionSchema).max(200),
    })
    .strict(),
  get_performance_stats: performanceSummarySchema,
  list_trade_history: z
    .object({
      summary: z
        .object({
          total: finiteNumber,
          winRate: finiteNumber,
          rollingPremium: finiteNumber,
        })
        .strict(),
      page: z.number().int().positive(),
      limit: z.number().int().positive().max(100),
      totalPages: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
      ideas: z.array(tradeHistoryIdeaSchema).max(100),
    })
    .strict(),
  list_education: z
    .object({
      lessons: z.array(educationLessonSchema).max(100),
      total: z.number().int().nonnegative(),
      completedSlugs: z.array(boundedString(160)).max(500),
    })
    .strict(),
  get_education_article: educationPillarSchema
    .omit({ posts: true })
    .extend({
      contentText: boundedString(CONTENT_TEXT_MAX_LENGTH),
      contentTrust: z.literal("untrusted_external_data"),
      contentTextTruncated: z.boolean(),
      headings: z.array(headingSchema).max(200),
      faq: z.array(faqSchema).max(100),
      sources: z.array(sourceSchema).max(100),
      related: z.array(educationPostSchema).max(100),
    })
    .strict(),
  get_watchlist: z.object({ tickers: z.array(ticker).max(500) }).strict(),
  get_preferences: z
    .object({
      watchlistIdeasOnly: z.boolean(),
      watchlistAlertsOnly: z.boolean(),
    })
    .strict(),
} as const;

export type McpToolName = keyof typeof mcpDataSchemas;
export type McpToolData<TName extends McpToolName> = z.infer<
  (typeof mcpDataSchemas)[TName]
>;

export function toAccountData(account: Account): McpToolData<"get_account"> {
  return {
    tier: account.userTier,
    isLifetimeFree: account.isLifetimeFree,
    features: account.features,
    premiumMasked: account.masking.premiumMasked,
  };
}

export function toMarketStatusData(
  status: MarketStatus,
): McpToolData<"get_market_status"> {
  return { isMarketOpen: status.isMarketOpen };
}

export function toTradeIdeasData(
  response: IdeasResponse,
  limit = 100,
): McpToolData<"list_trade_ideas"> {
  return {
    items: capItems(response.ideas, limit).map(toIdeaData),
    summary: toPerformanceSummaryData(response.summary),
    lastSettled: capItems(response.lastSettled).map(toSettledItemData),
    pagination: response.pagination,
    isMarketOpen: response.isMarketOpen,
    source: response.source,
    cached: response.cached,
  };
}

export function toFiltersData(
  response: FiltersResponse,
): McpToolData<"get_available_filters"> {
  return {
    expiries: response.expiries,
    tickers: response.tickers,
    volatilities: response.volatilities.map(toFilterOptionData),
    rois: response.rois.map(toFilterOptionData),
    capitals: response.capitals.map(toFilterOptionData),
    probOtms: response.probOtms.map(toFilterOptionData),
    modes: response.modes.map(toFilterOptionData),
    outcomes: response.outcomes.map(toFilterOptionData),
  };
}

export function toPerformanceStatsData(
  response: StatsResponse,
): McpToolData<"get_performance_stats"> {
  return toPerformanceSummaryData(response);
}

export function toTradeHistoryData(
  response: TradeHistoryResponse,
  limit = 100,
): McpToolData<"list_trade_history"> {
  return {
    summary: response.summary,
    page: response.page,
    limit: response.limit,
    totalPages: response.totalPages,
    total: response.total,
    ideas: capItems(response.ideas, limit).map((item) => ({
      id: item.id,
      ticker: item.ticker,
      displaySymbol: item.displaySymbol,
      companyName: item.companyName,
      ideaMode: item.ideaMode,
      expiry: item.expiry,
      strike: item.strike,
      alertPremium: item.alertPremium,
      closePrice: item.closePrice ?? null,
      roi: item.roi,
      realizedRoi: item.realizedRoi ?? null,
      projectedRoi: item.projectedRoi ?? null,
      capital: item.capital,
      outcome: item.outcome,
      premiumCollected: item.premiumCollected,
      createdAt: item.createdAt,
      closeDate: item.closeDate ?? null,
      daysHeld: item.daysHeld ?? null,
    })),
  };
}

export function toEducationListData(
  response: EducationListResponse,
): McpToolData<"list_education"> {
  return {
    lessons: capItems(response.course).map(toEducationLessonData),
    total: response.courseTotal,
    completedSlugs: capItems(response.completedSlugs),
  };
}

export function toEducationArticleData(
  article: EducationArticle,
): McpToolData<"get_education_article"> {
  const content = htmlToPlainText(article.html, CONTENT_TEXT_MAX_LENGTH);
  return {
    slug: article.slug,
    title: article.title,
    description: article.description,
    cluster: article.cluster,
    clusterTitle: article.clusterTitle,
    pillar: article.pillar,
    updated: article.updated,
    readMinutes: article.readMinutes,
    contentText: content.text,
    contentTrust: "untrusted_external_data",
    contentTextTruncated: content.truncated,
    headings: article.headings.map((heading) => ({
      id: heading.id,
      text: heading.text,
    })),
    faq: article.faq.map((item) => ({ q: item.q, a: item.a })),
    sources: article.sources.map((source) => ({
      title: source.title,
      url: source.url,
    })),
    related: article.related.map(toEducationPostData),
  };
}

export function toWatchlistData(
  response: WatchlistResponse,
): McpToolData<"get_watchlist"> {
  return { tickers: response.tickers };
}

export function toPreferencesData(
  response: PreferencesResponse,
): McpToolData<"get_preferences"> {
  return {
    watchlistIdeasOnly: response.watchlistIdeasOnly,
    watchlistAlertsOnly: response.watchlistAlertsOnly,
  };
}

function toIdeaData(item: IdeasResponse["ideas"][number]) {
  return {
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
  };
}

function toFilterOptionData(option: FiltersResponse["modes"][number]) {
  return { label: option.label, value: option.value };
}

function toPerformanceSummaryData(
  summary: StatsResponse | IdeasResponse["summary"],
) {
  return {
    total_premium: summary.total_premium,
    open_premium: summary.open_premium,
    settled: summary.settled,
    win_rate: summary.win_rate,
    weekly_calendar: capItems(summary.weekly_calendar).map((item) => ({
      week: item.week,
      premium: item.premium,
      count: item.count,
    })),
    top_performers: capItems(summary.top_performers).map((item) => ({
      ticker: item.ticker,
      displaySymbol: item.displaySymbol,
      outcome: item.outcome,
      expiry: item.expiry,
      strike: item.strike,
      alertPremium: item.alertPremium,
      closePrice: item.closePrice ?? null,
      capital: item.capital,
      premiumCollected: item.premiumCollected,
      createdAt: item.createdAt,
      closeDate: item.closeDate,
      daysHeld: item.daysHeld,
      roi: item.roi,
      id: item.id,
    })),
    ticker_breakdown: capItems(summary.ticker_breakdown).map((item) => ({
      ticker: item.ticker,
      count: item.count,
      otm: item.otm,
      premium: item.premium,
      winRate: item.winRate,
    })),
    roi_histogram: capItems(summary.roi_histogram).map((item) => ({
      bucket: item.bucket,
      count: item.count,
    })),
    greeks_distribution: capItems(summary.greeks_distribution).map((item) => ({
      range: item.range,
      count: item.count,
    })),
    monthly_performance: capItems(summary.monthly_performance).map((item) => ({
      month: item.month,
      winRate: item.winRate,
      trades: item.trades,
      sortKey: item.sortKey,
    })),
    win_streak_current: summary.win_streak_current,
    win_streak_best: summary.win_streak_best,
    max_drawdown: summary.max_drawdown,
    otm_signals: summary.otm_signals,
    btc_signals: summary.btc_signals,
    assigned_signals: summary.assigned_signals,
    last_settled: capItems(summary.last_settled).map(toSettledItemData),
  };
}

function toSettledItemData(item: IdeasResponse["lastSettled"][number]) {
  return {
    ticker: item.ticker,
    strike: item.strike,
    expiry: item.expiry,
    outcome: item.outcome,
    roi: item.roi,
    profit: item.profit ?? null,
    premium: item.premium,
    daysHeld: item.daysHeld,
    closeDate: item.closeDate,
  };
}

function toEducationLessonData(
  lesson: EducationListResponse["course"][number],
) {
  return {
    slug: lesson.slug,
    title: lesson.title,
    order: lesson.order,
    clusterTitle: lesson.clusterTitle,
    ...(lesson.icon !== undefined ? { icon: lesson.icon } : {}),
    readMinutes: lesson.readMinutes,
    completed: lesson.completed,
  };
}

function toEducationPostData(post: EducationArticle["related"][number]) {
  return {
    slug: post.slug,
    title: post.title,
    ...(post.description !== undefined
      ? { description: post.description }
      : {}),
  };
}

function capItems<T>(items: T[], limit = 100): T[] {
  return items.slice(0, Math.max(0, Math.min(limit, 100)));
}

function htmlToPlainText(
  html: string,
  maxLength: number,
): { text: string; truncated: boolean } {
  const withoutExecutableBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  const withBreaks = withoutExecutableBlocks
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/(p|div|section|article|h[1-6]|li|tr|blockquote)>/gi, " ");
  const text = decodeHtmlEntities(withBreaks.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
  return text.length > maxLength
    ? { text: text.slice(0, maxLength), truncated: true }
    : { text, truncated: false };
}

function decodeHtmlEntities(text: string): string {
  return text.replace(
    /&(#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi,
    (entity) => {
      const normalized = entity.toLowerCase();
      if (normalized === "&amp;") return "&";
      if (normalized === "&lt;") return "<";
      if (normalized === "&gt;") return ">";
      if (normalized === "&quot;") return '"';
      if (normalized === "&apos;") return "'";
      if (normalized === "&nbsp;") return " ";
      if (normalized.startsWith("&#x")) {
        return decodeCodePoint(
          Number.parseInt(normalized.slice(3, -1), 16),
          entity,
        );
      }
      if (normalized.startsWith("&#")) {
        return decodeCodePoint(
          Number.parseInt(normalized.slice(2, -1), 10),
          entity,
        );
      }
      return entity;
    },
  );
}

function decodeCodePoint(codePoint: number, fallback: string): string {
  if (!Number.isFinite(codePoint)) return fallback;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}
