import { GreeksSurgeApiError } from './errors.js';

export interface ListQuery {
  limit?: number;
  cursor?: string;
  ticker?: string;
  strategy?: string;
  startDate?: string;
  endDate?: string;
}

const allowedKeys = new Set(['limit', 'cursor', 'ticker', 'strategy', 'startDate', 'endDate']);
const tickerPattern = /^[A-Z][A-Z0-9.]{0,9}$/;

export function buildListQuery(input: ListQuery = {}): URLSearchParams {
  for (const key of Object.keys(input)) {
    if (!allowedKeys.has(key)) throw new GreeksSurgeApiError('INVALID_QUERY', `Unsupported query key: ${key}`);
  }

  const params = new URLSearchParams();
  const limit = input.limit === undefined ? undefined : Math.min(Math.max(Math.trunc(input.limit), 1), 100);
  if (limit !== undefined) params.set('limit', String(limit));
  if (input.cursor) params.set('cursor', input.cursor.slice(0, 256));
  if (input.ticker) {
    const normalized = input.ticker.toUpperCase();
    if (!tickerPattern.test(normalized)) throw new GreeksSurgeApiError('INVALID_QUERY', 'Invalid ticker.');
    params.set('ticker', normalized);
  }
  if (input.strategy) params.set('strategy', input.strategy.slice(0, 64));
  if (input.startDate) params.set('startDate', validateDate(input.startDate, 'startDate'));
  if (input.endDate) params.set('endDate', validateDate(input.endDate, 'endDate'));
  return params;
}

function validateDate(value: string, name: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new GreeksSurgeApiError('INVALID_QUERY', `Invalid ${name}.`);
  }
  return value;
}
