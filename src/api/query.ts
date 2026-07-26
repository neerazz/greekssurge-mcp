import { GreeksSurgeApiError } from "./errors.js";

export interface IdeasQuery {
  page?: number;
  limit?: number;
  ticker?: string;
  mode?: string;
  expiry?: string;
  iv?: string;
  roi?: string;
  capital?: string;
  pop?: string;
  purpose?: string;
  symbol?: string;
  betterEntry?: boolean;
}

export interface TradeHistoryQuery {
  page?: number;
  limit?: number;
  ideaMode?: string;
  outcome?: string;
  symbol?: string;
  from?: string;
  to?: string;
}

export type ListQuery = IdeasQuery;

const ideasKeys = new Set([
  "page",
  "limit",
  "ticker",
  "mode",
  "expiry",
  "iv",
  "roi",
  "capital",
  "pop",
  "purpose",
  "symbol",
  "betterEntry",
]);
const tradeHistoryKeys = new Set([
  "page",
  "limit",
  "ideaMode",
  "outcome",
  "symbol",
  "from",
  "to",
]);
const tickerPattern = /^[A-Z][A-Z0-9.]{0,9}$/;
const allowedValues = {
  mode: new Set(["ALL", "WEEKLY", "MONTHLY"]),
  iv: new Set(["ALL", "0-75", "75-100", "100+"]),
  roi: new Set(["ALL", "<2%", "2-4%", "4%+"]),
  capital: new Set(["ALL", "< $2k", "$2-$5k", "$5k+"]),
  pop: new Set(["ALL", "< 80%", "80-90%"]),
  purpose: new Set(["CARDS"]),
  ideaMode: new Set(["ALL", "WEEKLY", "MONTHLY"]),
  outcome: new Set(["ALL", "OTM", "BTC", "ASSIGNED"]),
};

export function buildIdeasQuery(input: IdeasQuery = {}): URLSearchParams {
  rejectUnsupportedKeys(input as Record<string, unknown>, ideasKeys);
  const params = new URLSearchParams();
  appendPageLimit(params, input.page, input.limit);
  appendTicker(params, "ticker", input.ticker);
  appendEnum(params, "mode", input.mode);
  appendDate(params, "expiry", input.expiry);
  appendEnum(params, "iv", input.iv);
  appendEnum(params, "roi", input.roi);
  appendEnum(params, "capital", input.capital);
  appendEnum(params, "pop", input.pop);
  appendEnum(params, "purpose", input.purpose);
  appendTicker(params, "symbol", input.symbol);
  if (input.betterEntry !== undefined)
    params.set("betterEntry", String(input.betterEntry));
  return params;
}

export function buildTradeHistoryQuery(
  input: TradeHistoryQuery = {},
): URLSearchParams {
  rejectUnsupportedKeys(input as Record<string, unknown>, tradeHistoryKeys);
  const params = new URLSearchParams();
  appendPageLimit(params, input.page, input.limit);
  appendEnum(params, "ideaMode", input.ideaMode);
  appendEnum(params, "outcome", input.outcome);
  appendTicker(params, "symbol", input.symbol);
  appendDate(params, "from", input.from);
  appendDate(params, "to", input.to);
  return params;
}

export function buildListQuery(input: IdeasQuery = {}): URLSearchParams {
  return buildIdeasQuery(input);
}

function rejectUnsupportedKeys(
  input: Record<string, unknown>,
  allowedKeys: Set<string>,
) {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key))
      throw new GreeksSurgeApiError(
        "INVALID_QUERY",
        `Unsupported query key: ${key}`,
      );
  }
}

function appendPageLimit(
  params: URLSearchParams,
  page: number | undefined,
  limit: number | undefined,
) {
  if (page !== undefined) {
    const normalized = Math.trunc(page);
    if (!Number.isFinite(normalized) || normalized < 1)
      throw new GreeksSurgeApiError("INVALID_QUERY", "Invalid page.");
    params.set("page", String(normalized));
  }
  if (limit !== undefined) {
    if (!Number.isFinite(limit))
      throw new GreeksSurgeApiError("INVALID_QUERY", "Invalid limit.");
    params.set("limit", String(Math.min(Math.max(Math.trunc(limit), 1), 100)));
  }
}

function appendTicker(
  params: URLSearchParams,
  key: "ticker" | "symbol",
  value: string | undefined,
) {
  if (!value) return;
  const normalized = value.toUpperCase();
  if (!tickerPattern.test(normalized))
    throw new GreeksSurgeApiError("INVALID_QUERY", `Invalid ${key}.`);
  params.set(key, normalized);
}

function appendEnum(
  params: URLSearchParams,
  key: keyof typeof allowedValues,
  value: string | undefined,
) {
  if (!value) return;
  const normalized = value.trim();
  if (!allowedValues[key].has(normalized))
    throw new GreeksSurgeApiError("INVALID_QUERY", `Invalid ${key}.`);
  params.set(key, normalized);
}

function appendDate(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  if (!value) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealCalendarDate(value)) {
    throw new GreeksSurgeApiError("INVALID_QUERY", `Invalid ${key}.`);
  }
  params.set(key, value);
}

function isRealCalendarDate(value: string): boolean {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day!));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}
