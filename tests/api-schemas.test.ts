import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  parseUpstream,
  upstreamSchemas,
  toAccountDto,
  toIdeaDtos,
  toStatusDto,
} from "../src/api/schemas.js";

const fixture = async (name: string): Promise<unknown> =>
  JSON.parse(await readFile(`tests/fixtures/api/${name}.json`, "utf8"));

describe("GreeksSurge upstream schemas", () => {
  const cases = [
    ["status", "status"],
    ["authMe", "auth-me"],
    ["ideas", "ideas"],
    ["filters", "filters"],
    ["stats", "stats"],
    ["history", "history"],
    ["tradeHistory", "trade-history"],
    ["educationList", "education"],
    ["educationArticle", "education-article"],
    ["watchlist", "watchlist"],
    ["preferences", "preferences"],
  ] as const;

  it.each(cases)(
    "accepts the sanitized %s fixture",
    async (schemaName, fileName) => {
      const parsed = upstreamSchemas[schemaName].parse(await fixture(fileName));
      expect(parsed).toBeTruthy();
    },
  );

  it("strips undeclared sensitive upstream fields instead of exposing them", async () => {
    const raw = {
      ...(await fixture("auth-me")),
      email: "person@example.com",
      token: "secret-token",
      rawPremiumPayload: "not-for-redistribution",
    };

    const parsed = parseUpstream("authMe", raw);

    expect(JSON.stringify(parsed)).not.toContain("person@example.com");
    expect(JSON.stringify(parsed)).not.toContain("secret-token");
    expect(JSON.stringify(parsed)).not.toContain("not-for-redistribution");
  });

  it("raises endpoint-specific drift errors when required keys change", async () => {
    const raw = await fixture("status");
    delete (raw as Record<string, unknown>).market;

    expect(() => parseUpstream("status", raw)).toThrow(
      /Upstream contract changed for status/,
    );
  });

  it("defines safe DTOs separately from raw upstream shapes", async () => {
    const account = toAccountDto(
      parseUpstream("authMe", await fixture("auth-me")),
    );
    const status = toStatusDto(
      parseUpstream("status", await fixture("status")),
    );
    const ideas = toIdeaDtos(parseUpstream("ideas", await fixture("ideas")));

    expect(account).toEqual({
      tier: "premium",
      subscriptionStatus: "active",
      features: ["ideas", "history"],
      premiumMasked: false,
    });
    expect(status).toMatchObject({
      market: "open",
      source: "https://csp.greekssurge.com",
    });
    expect(ideas[0]).toMatchObject({
      id: "idea_1",
      ticker: "AAPL",
      isMasked: false,
    });
    expect(JSON.stringify({ account, status, ideas })).not.toContain(
      "user_fixture_123",
    );
  });
});
