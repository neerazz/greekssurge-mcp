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

export function buildIdeasQuery(input: IdeasQuery = {}): URLSearchParams {
  rejectUnsupportedKeys(input as Record<string, unknown>, ideasKeys);
  const params = new URLSearchParams();
  appendPageLimit(params, input.page, input.limit);
  appendTicker(params, "ticker", input.ticker);
  appendToken(params, "mode", input.mode, 80);
  appendDate(params, "expiry", input.expiry);
  appendToken(params, "iv", input.iv, 80);
  appendToken(params, "roi", input.roi, 80);
  appendToken(params, "capital", input.capital, 80);
  appendToken(params, "pop", input.pop, 80);
  appendToken(params, "purpose", input.purpose, 80);
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
  appendToken(params, "ideaMode", input.ideaMode, 80);
  appendToken(params, "outcome", input.outcome, 80);
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

function appendToken(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
  maxLength: number,
) {
  if (!value) return;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength || /[\r\n]/.test(normalized))
    throw new GreeksSurgeApiError("INVALID_QUERY", `Invalid ${key}.`);
  params.set(key, normalized);
}

function appendDate(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  if (!value) return;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))
  ) {
    throw new GreeksSurgeApiError("INVALID_QUERY", `Invalid ${key}.`);
  }
  params.set(key, value);
}
