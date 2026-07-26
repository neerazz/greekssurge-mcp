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
    "accepts the sanitized production-shaped %s fixture",
    async (schemaName, fileName) => {
      const parsed = upstreamSchemas[schemaName].parse(await fixture(fileName));
      expect(parsed).toBeTruthy();
    },
  );

  it("accepts either wrapped or direct auth user payloads without exposing token or email", async () => {
    const wrapped = parseUpstream("authMe", await fixture("auth-me"));
    const direct = parseUpstream("authMe", {
      userTier: "premium",
      isLifetimeFree: true,
      onboarding: { completed: true },
      email: "direct-user@example.invalid",
      token: "direct-token",
    });

    expect(toAccountDto(wrapped)).toMatchObject({
      tier: "premium",
      isLifetimeFree: false,
    });
    expect(toAccountDto(direct)).toMatchObject({
      tier: "premium",
      isLifetimeFree: true,
    });
    expect(JSON.stringify({ wrapped, direct })).not.toContain(
      "@example.invalid",
    );
    expect(JSON.stringify({ wrapped, direct })).not.toContain("token");
  });

  it("rejects the fictional Phase A fixture shapes that used to keep tests green", async () => {
    const fiction = (await fixture("fictional-phase-a")) as Record<
      string,
      unknown
    >;
    const fictionCases = [
      ["status", "status"],
      ["authMe", "authMe"],
      ["ideas", "ideas"],
      ["filters", "filters"],
      ["stats", "stats"],
      ["history", "history"],
      ["tradeHistory", "tradeHistory"],
      ["educationList", "educationList"],
      ["educationArticle", "educationArticle"],
      ["watchlist", "watchlist"],
      ["preferences", "preferences"],
    ] as const;

    for (const [schemaName, key] of fictionCases) {
      expect(() => parseUpstream(schemaName, fiction[key])).toThrow(
        new RegExp(`Upstream contract changed for ${schemaName}`),
      );
    }
  });

  it("raises endpoint-specific drift errors when production core keys change", async () => {
    const raw = await fixture("status");
    delete (raw as Record<string, unknown>).isMarketOpen;

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
      isLifetimeFree: false,
      onboarding: { completed: true },
      features: ["ideas", "history"],
      premiumMasked: false,
    });
    expect(status).toMatchObject({
      isMarketOpen: true,
      source: "https://csp.greekssurge.com",
    });
    expect(ideas[0]).toMatchObject({
      id: "idea_fixture_1",
      ticker: "AAPL",
      ideaMode: "COVERED_CALL",
      isFree: false,
    });
    expect(JSON.stringify({ account, status, ideas })).not.toContain(
      "fixture-token-must-not-be-exposed",
    );
    expect(JSON.stringify({ account, status, ideas })).not.toContain(
      "fixture-user@example.invalid",
    );
  });
});
