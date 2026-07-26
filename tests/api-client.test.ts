import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GreeksSurgeApiError } from "../src/api/errors.js";
import { GreeksSurgeClient } from "../src/api/client.js";

type Handler = (
  req: IncomingMessage,
  res: ServerResponse,
) => void | Promise<void>;

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(`tests/fixtures/api/${name}.json`, "utf8"));
}

async function withServer(handler: Handler) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("missing test server address");
  return {
    baseUrl: new URL(`http://127.0.0.1:${address.port}`),
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

function json(
  res: ServerResponse,
  code: number,
  payload: unknown,
  headers: Record<string, string> = {},
) {
  res.writeHead(code, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(payload));
}

describe("GreeksSurgeClient", () => {
  let cleanups: Array<() => Promise<void>> = [];
  beforeEach(() => {
    cleanups = [];
  });
  afterEach(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()));
  });

  it("sends JSON headers, user agent, and bearer token when available", async () => {
    let authHeader: string | undefined;
    let userAgent: string | undefined;
    const server = await withServer(async (req, res) => {
      authHeader = req.headers.authorization;
      userAgent = req.headers["user-agent"];
      json(res, 200, await fixture("auth-me"));
    });
    cleanups.push(server.close);

    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      tokenProvider: async () => "site-token",
      minIntervalMs: 0,
    });
    const account = await client.getAccount();

    expect(authHeader).toBe("Bearer site-token");
    expect(userAgent).toMatch(/^greekssurge-mcp\/0\.1\.0/);
    expect(account.userTier).toBe("premium");
    expect(JSON.stringify(account)).not.toContain(
      "fixture-token-must-not-be-exposed",
    );
  });

  it("omits Authorization when no token is present", async () => {
    let authHeader: string | undefined;
    const server = await withServer(async (req, res) => {
      authHeader = req.headers.authorization;
      json(res, 200, await fixture("status"));
    });
    cleanups.push(server.close);

    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      minIntervalMs: 0,
    });
    await client.getMarketStatus();

    expect(authHeader).toBeUndefined();
  });

  it("aborts slow upstream requests", async () => {
    const server = await withServer((_req, res) => {
      setTimeout(() => json(res, 200, { ok: true }), 100);
    });
    cleanups.push(server.close);
    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      timeoutMs: 10,
      minIntervalMs: 0,
    });

    await expect(client.getMarketStatus()).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
    });
  });

  it.each([
    [401, "AUTH_REQUIRED"],
    [403, "TIER_REQUIRED"],
    [429, "RATE_LIMITED"],
    [503, "UPSTREAM_UNAVAILABLE"],
  ] as const)(
    "maps HTTP %s without leaking response bodies",
    async (status, code) => {
      const server = await withServer((_req, res) =>
        json(res, status, {
          token: "secret-token",
          email: "person@example.com",
        }),
      );
      cleanups.push(server.close);
      const client = new GreeksSurgeClient({
        baseUrl: server.baseUrl,
        minIntervalMs: 0,
      });

      await expect(client.getMarketStatus()).rejects.toMatchObject({ code });
      await expect(client.getMarketStatus()).rejects.not.toThrow(
        /secret-token|person@example.com/,
      );
    },
  );

  it("maps malformed JSON and schema drift to safe errors", async () => {
    const malformed = await withServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{bad");
    });
    cleanups.push(malformed.close);
    await expect(
      new GreeksSurgeClient({
        baseUrl: malformed.baseUrl,
        minIntervalMs: 0,
      }).getMarketStatus(),
    ).rejects.toMatchObject({ code: "UPSTREAM_CONTRACT_CHANGED" });

    const drift = await withServer((_req, res) =>
      json(res, 200, { market: "open", asOf: "2026-07-26T00:00:00.000Z" }),
    );
    cleanups.push(drift.close);
    await expect(
      new GreeksSurgeClient({
        baseUrl: drift.baseUrl,
        minIntervalMs: 0,
      }).getMarketStatus(),
    ).rejects.toMatchObject({ code: "UPSTREAM_CONTRACT_CHANGED" });
  });

  it("caches public GETs for a short TTL and reuses ETag metadata", async () => {
    let calls = 0;
    let ifNoneMatch: string | undefined;
    const server = await withServer(async (req, res) => {
      calls += 1;
      ifNoneMatch = req.headers["if-none-match"];
      json(res, 200, await fixture("status"), { etag: 'W/"status"' });
    });
    cleanups.push(server.close);
    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      minIntervalMs: 0,
      publicCacheTtlMs: 30_000,
    });

    await client.getMarketStatus();
    await client.getMarketStatus();

    expect(calls).toBe(1);
    expect(ifNoneMatch).toBeUndefined();
  });

  it("uses production ideas query parameters, caps limit, and rejects arbitrary keys", async () => {
    let url = "";
    const server = await withServer(async (req, res) => {
      url = req.url ?? "";
      json(res, 200, await fixture("ideas"));
    });
    cleanups.push(server.close);
    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      minIntervalMs: 0,
    });

    await client.listTradeIdeas({
      page: 2,
      limit: 500,
      ticker: "aapl",
      mode: "COVERED_CALL",
      expiry: "2026-08-21",
      iv: "MEDIUM",
      roi: "0-1",
      capital: "5000-20000",
      pop: "70-80",
      purpose: "income",
      symbol: "aapl",
      betterEntry: true,
    } as never);

    expect(url).toBe(
      "/api/ideas?page=2&limit=100&ticker=AAPL&mode=COVERED_CALL&expiry=2026-08-21&iv=MEDIUM&roi=0-1&capital=5000-20000&pop=70-80&purpose=income&symbol=AAPL&betterEntry=true",
    );
    await expect(
      client.listTradeIdeas({ strategy: "fictional" } as never),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("uses production trade-history query parameters separately from ideas", async () => {
    let url = "";
    const server = await withServer(async (req, res) => {
      url = req.url ?? "";
      json(res, 200, await fixture("trade-history"));
    });
    cleanups.push(server.close);
    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      minIntervalMs: 0,
    });

    await client.listTradeHistory({
      page: 3,
      limit: 101,
      ideaMode: "CASH_SECURED_PUT",
      outcome: "WIN",
      symbol: "msft",
      from: "2026-07-01",
      to: "2026-07-31",
    } as never);

    expect(url).toBe(
      "/api/trade-history?page=3&limit=100&ideaMode=CASH_SECURED_PUT&outcome=WIN&symbol=MSFT&from=2026-07-01&to=2026-07-31",
    );
    await expect(
      client.listTradeHistory({ ticker: "AAPL" } as never),
    ).rejects.toMatchObject({ code: "INVALID_QUERY" });
  });

  it("uses the production user endpoint paths for watchlist and preferences", async () => {
    const urls: string[] = [];
    const server = await withServer(async (req, res) => {
      urls.push(req.url ?? "");
      if (req.url === "/api/user/watchlist") {
        json(res, 200, await fixture("watchlist"));
        return;
      }
      if (req.url === "/api/user/preferences") {
        json(res, 200, await fixture("preferences"));
        return;
      }
      json(res, 404, {});
    });
    cleanups.push(server.close);
    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      minIntervalMs: 0,
    });

    await expect(client.getWatchlist()).resolves.toEqual({
      tickers: ["AAPL", "MSFT"],
    });
    await expect(client.getPreferences()).resolves.toMatchObject({
      watchlistIdeasOnly: true,
      watchlistAlertsOnly: false,
    });
    expect(urls).toEqual(["/api/user/watchlist", "/api/user/preferences"]);
  });

  it("does not retry non-idempotent requests", async () => {
    let calls = 0;
    const server = await withServer((_req, res) => {
      calls += 1;
      json(res, 500, { error: "boom" });
    });
    cleanups.push(server.close);
    const client = new GreeksSurgeClient({
      baseUrl: server.baseUrl,
      minIntervalMs: 0,
    });

    await expect(
      client.requestJson("POST", "/api/auth/me", undefined, "authMe"),
    ).rejects.toBeInstanceOf(GreeksSurgeApiError);
    expect(calls).toBe(1);
  });
});
