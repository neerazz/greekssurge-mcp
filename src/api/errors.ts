export type GreeksSurgeErrorCode =
  | 'AUTH_REQUIRED'
  | 'TIER_REQUIRED'
  | 'RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_CONTRACT_CHANGED'
  | 'INVALID_QUERY';

export class GreeksSurgeApiError extends Error {
  constructor(
    public readonly code: GreeksSurgeErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'GreeksSurgeApiError';
  }
}

export function mapHttpStatus(status: number, retryAfter?: string | null): GreeksSurgeApiError | undefined {
  if (status === 401) return new GreeksSurgeApiError('AUTH_REQUIRED', 'GreeksSurge authentication is required.');
  if (status === 403) return new GreeksSurgeApiError('TIER_REQUIRED', 'This GreeksSurge account tier cannot access the requested data.');
  if (status === 429) {
    const parsed = retryAfter ? Number.parseInt(retryAfter, 10) : undefined;
    return new GreeksSurgeApiError(
      'RATE_LIMITED',
      'GreeksSurge rate limit reached. Retry later.',
      Number.isFinite(parsed) ? parsed : undefined,
    );
  }
  if (status >= 500) return new GreeksSurgeApiError('UPSTREAM_UNAVAILABLE', 'GreeksSurge is temporarily unavailable.');
  return undefined;
}
