import { GreeksSurgeApiError, mapHttpStatus } from "./errors.js";
import {
  buildIdeasQuery,
  buildTradeHistoryQuery,
  type IdeasQuery,
  type TradeHistoryQuery,
} from "./query.js";
import {
  parseUpstream,
  type ParsedUpstream,
  type UpstreamSchemaName,
} from "./schemas.js";

export interface GreeksSurgeClientOptions {
  baseUrl: URL;
  fetchImpl?: typeof fetch;
  tokenProvider?: () => Promise<string | undefined>;
  timeoutMs?: number;
  minIntervalMs?: number;
  publicCacheTtlMs?: number;
}

interface CacheEntry {
  expiresAt: number;
  etag?: string;
  value: unknown;
}

const USER_AGENT =
  "greekssurge-mcp/0.1.3 (+https://github.com/neerazz/greekssurge-mcp)";
const ALLOWED_STATIC_PATHS = new Set([
  "/api/status",
  "/api/auth/me",
  "/api/ideas",
  "/api/filters",
  "/api/stats",
  "/api/history",
  "/api/trade-history",
  "/api/education",
  "/api/user/watchlist",
  "/api/user/preferences",
]);
const nextRequestAtByOrigin = new Map<string, number>();
const publicCacheByUrl = new Map<string, CacheEntry>();

export class GreeksSurgeClient {
  private readonly fetchImpl: typeof fetch;
  private readonly tokenProvider: () => Promise<string | undefined>;
  private readonly timeoutMs: number;
  private readonly minIntervalMs: number;
  private readonly publicCacheTtlMs: number;

  constructor(private readonly options: GreeksSurgeClientOptions) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.tokenProvider = options.tokenProvider ?? (async () => undefined);
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.minIntervalMs = options.minIntervalMs ?? 1_000;
    this.publicCacheTtlMs = options.publicCacheTtlMs ?? 30_000;
  }

  async getMarketStatus(): Promise<ParsedUpstream<"status">> {
    return this.#requestJson("GET", "/api/status", undefined, "status", {
      publicCache: true,
    });
  }

  async getAccount(): Promise<ParsedUpstream<"authMe">> {
    return this.#requestJson("GET", "/api/auth/me", undefined, "authMe");
  }

  async listTradeIdeas(
    query: IdeasQuery = {},
  ): Promise<ParsedUpstream<"ideas">> {
    return this.#requestJson(
      "GET",
      "/api/ideas",
      buildIdeasQuery(query),
      "ideas",
    );
  }

  async getAvailableFilters(): Promise<ParsedUpstream<"filters">> {
    return this.#requestJson("GET", "/api/filters", undefined, "filters", {
      publicCache: true,
    });
  }

  async getPerformanceStats(): Promise<ParsedUpstream<"stats">> {
    return this.#requestJson("GET", "/api/stats", undefined, "stats");
  }

  async listHistory(): Promise<ParsedUpstream<"history">> {
    return this.#requestJson("GET", "/api/history", undefined, "history");
  }

  async listTradeHistory(
    query: TradeHistoryQuery = {},
  ): Promise<ParsedUpstream<"tradeHistory">> {
    return this.#requestJson(
      "GET",
      "/api/trade-history",
      buildTradeHistoryQuery(query),
      "tradeHistory",
    );
  }

  async listEducation(): Promise<ParsedUpstream<"educationList">> {
    return this.#requestJson(
      "GET",
      "/api/education",
      undefined,
      "educationList",
      { publicCache: true },
    );
  }

  async getEducationArticle(
    slug: string,
  ): Promise<ParsedUpstream<"educationArticle">> {
    if (!/^[a-z0-9-]{1,160}$/.test(slug))
      throw new GreeksSurgeApiError(
        "INVALID_QUERY",
        "Invalid education article slug.",
      );
    return this.#requestJson(
      "GET",
      `/api/education/${slug}`,
      undefined,
      "educationArticle",
      { publicCache: true },
    );
  }

  async getWatchlist(): Promise<ParsedUpstream<"watchlist">> {
    return this.#requestJson(
      "GET",
      "/api/user/watchlist",
      undefined,
      "watchlist",
    );
  }

  async getPreferences(): Promise<ParsedUpstream<"preferences">> {
    return this.#requestJson(
      "GET",
      "/api/user/preferences",
      undefined,
      "preferences",
    );
  }

  async #requestJson<TName extends UpstreamSchemaName>(
    method: "GET",
    path: string,
    query: URLSearchParams | undefined,
    schemaName: TName,
    requestOptions: { publicCache?: boolean } = {},
  ): Promise<ParsedUpstream<TName>> {
    const url = this.buildUrl(path, query);
    const cacheKey = `${method} ${url.toString()}`;
    const now = Date.now();
    const cached = requestOptions.publicCache
      ? publicCacheByUrl.get(cacheKey)
      : undefined;
    if (cached && cached.expiresAt > now)
      return cached.value as ParsedUpstream<TName>;

    await this.throttle();

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const token = await this.tokenProvider();
    const headers = new Headers({
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (cached?.etag) headers.set("If-None-Match", cached.etag);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers,
        signal: controller.signal,
      });
    } catch {
      throw new GreeksSurgeApiError(
        "UPSTREAM_UNAVAILABLE",
        "Unable to reach GreeksSurge.",
      );
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 304 && cached)
      return cached.value as ParsedUpstream<TName>;
    const mapped = mapHttpStatus(
      response.status,
      response.headers.get("retry-after"),
    );
    if (mapped) throw mapped;
    if (!response.ok)
      throw new GreeksSurgeApiError(
        "UPSTREAM_UNAVAILABLE",
        `GreeksSurge returned HTTP ${response.status}.`,
      );

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new GreeksSurgeApiError(
        "UPSTREAM_CONTRACT_CHANGED",
        `GreeksSurge returned malformed JSON for ${schemaName}.`,
      );
    }

    try {
      const parsed = parseUpstream(schemaName, body);
      if (requestOptions.publicCache) {
        publicCacheByUrl.set(cacheKey, {
          value: parsed,
          etag: response.headers.get("etag") ?? undefined,
          expiresAt: Date.now() + this.publicCacheTtlMs,
        });
      }
      return parsed;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Upstream contract changed")
      ) {
        throw new GreeksSurgeApiError(
          "UPSTREAM_CONTRACT_CHANGED",
          error.message,
        );
      }
      throw error;
    }
  }

  private buildUrl(path: string, query?: URLSearchParams): URL {
    const allowedEducationArticle = /^\/api\/education\/[a-z0-9-]{1,160}$/.test(
      path,
    );
    if (!ALLOWED_STATIC_PATHS.has(path) && !allowedEducationArticle) {
      throw new GreeksSurgeApiError(
        "INVALID_QUERY",
        "Unsupported GreeksSurge API path.",
      );
    }
    const url = new URL(path.replace(/^\//, ""), this.options.baseUrl);
    if (query) url.search = query.toString();
    return url;
  }

  private async throttle(): Promise<void> {
    if (this.minIntervalMs <= 0) return;
    const now = Date.now();
    const origin = this.options.baseUrl.origin;
    const slot = Math.max(now, nextRequestAtByOrigin.get(origin) ?? now);
    nextRequestAtByOrigin.set(origin, slot + this.minIntervalMs);
    const waitMs = slot - now;
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}
