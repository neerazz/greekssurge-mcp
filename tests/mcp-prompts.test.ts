import { describe, expect, it } from "vitest";
import {
  registerGreeksSurgePrompts,
  type PromptRegistryOptions,
} from "../src/mcp/prompts.js";
import { SERVER_INSTRUCTIONS } from "../src/mcp/disclaimer.js";
import { registerGreeksSurgeTools } from "../src/mcp/tools.js";

type PromptConfig = Parameters<PromptRegistryOptions["register"]>[1];
type PromptHandler = Parameters<PromptRegistryOptions["register"]>[2];

function promptCatalog() {
  const prompts = new Map<
    string,
    { config: PromptConfig; handler: PromptHandler }
  >();
  registerGreeksSurgePrompts({
    register: (name, config, handler) => {
      prompts.set(name, { config, handler });
    },
  });
  return prompts;
}

function renderPrompt(
  name: string,
  args: Record<string, string | undefined> = {},
): string {
  const prompt = promptCatalog().get(name);
  if (!prompt) throw new Error(`Missing prompt: ${name}`);
  return prompt
    .handler(args)
    .messages.map((message) => message.content.text)
    .join("\n");
}

describe("GreeksSurge MCP prompt routing", () => {
  it("ships a complete novice-to-decision prompt catalog", () => {
    expect([...promptCatalog().keys()].sort()).toEqual(
      [
        "account_overview",
        "assignment_review",
        "cash_secured_put_plan",
        "getting_started",
        "learn_concept",
        "learning_path",
        "performance_retrospective",
        "screen_ideas",
        "ticker_downside_review",
        "watchlist_digest",
        "wheel_strategy_review",
      ].sort(),
    );
  });

  it("turns a cash-secured-put intent into a grounded candidate recommendation", () => {
    const text = renderPrompt("cash_secured_put_plan", {
      ticker: "ASTS",
      capital: "$5k+",
      expiry: "2026-08-21",
    });

    for (const tool of [
      "get_account",
      "get_market_status",
      "get_available_filters",
      "list_trade_ideas",
      "analyze_ticker",
    ]) {
      expect(text).toContain(tool);
    }
    expect(text).toMatch(/recommend one candidate/i);
    expect(text).toMatch(/why this candidate/i);
    expect(text).toMatch(/why not the alternatives/i);
    expect(text).toMatch(/break-even/i);
    expect(text).toMatch(/assignment/i);
    expect(text).toMatch(/do not rank by ROI alone/i);
    expect(text).toMatch(/never place|do not place/i);
    expect(text).toMatch(/limit 100/i);
    expect(text).toMatch(/pagination\.pages/i);
    expect(text).toMatch(/every page/i);
    expect(text).toMatch(/specific (?:idea )?contracts/i);
    for (const field of ["id", "displaySymbol", "expiry", "strike"]) {
      expect(text).toContain(field);
    }
    expect(text).toMatch(/join[\s\S]+by `?id`?/i);
    expect(text).toContain("retrievedAt");
    expect(text).toContain("cached");
    expect(text).toMatch(/triggerPrice[^\n]+not[^\n]+current quote/i);
  });

  it("retains the requested limit when no screen filters are supplied", () => {
    const text = renderPrompt("cash_secured_put_plan");

    expect(text).toMatch(/pass no filter arguments/i);
    expect(text).toMatch(/retain[^\n]+limit/i);
    expect(text).not.toMatch(/call the tool with no arguments/i);
  });

  it("explains the wheel boundary without pretending to have covered-call or brokerage state", () => {
    const text = renderPrompt("wheel_strategy_review", { ticker: "ASTS" });

    expect(text).toContain("analyze_ticker");
    expect(text).toContain("list_trade_history");
    expect(text).toContain("list_education");
    expect(text).toMatch(/first wheel stage/i);
    expect(text).toMatch(/covered-call chain|covered call chain/i);
    expect(text).toMatch(/brokerage position|share ownership/i);
    expect(text).toMatch(/cannot verify|not available/i);
    expect(text).toMatch(/ITM\/assignment-risk proxy/i);
    expect(text).toMatch(/not assignment probability/i);
  });

  it("does not invent tier entitlements in the account overview", () => {
    const text = renderPrompt("account_overview");

    expect(text).toMatch(/report[^\n]+tier[^\n]+features[^\n]+verbatim/i);
    expect(text).toMatch(
      /tool is verified accessible only[\s\S]+tool call succeeds/i,
    );
    expect(text).not.toMatch(/which tools my tier can actually use/i);
  });

  it("validates assignment outcomes against the live filter contract", () => {
    const text = renderPrompt("assignment_review", { outcome: "ASSIGNED" });

    expect(text).toContain("get_available_filters");
    for (const outcome of ["ALL", "OTM", "BTC", "ASSIGNED"]) {
      expect(text).toContain(outcome);
    }
    expect(text).not.toMatch(/e\.g\. ASSIGNED, WIN/i);
  });

  it("does not reintroduce ROI-only ranking for an empty watchlist", () => {
    const text = renderPrompt("watchlist_digest");

    expect(text).not.toMatch(/highest-ROI/i);
    expect(text).toMatch(/probOtm/i);
    expect(text).toMatch(/buffer/i);
    expect(text).toMatch(/ROI as\s+the\s+reward/i);
  });

  it("gives first-time users a capability map and concrete starter requests", () => {
    const text = renderPrompt("getting_started");

    expect(text).toContain("get_account");
    expect(text).toContain("get_available_filters");
    expect(text).toContain("list_education");
    expect(text).toMatch(/cash-secured put/i);
    expect(text).toMatch(/example requests/i);
    expect(text).toMatch(/read-only/i);
  });

  it("does not let the generic screen optimize for ROI alone", () => {
    const text = renderPrompt("screen_ideas", { ticker: "ASTS" });

    expect(text).not.toMatch(/sorted by ROI descending/i);
    expect(text).toMatch(/probOtm/i);
    expect(text).toMatch(/buffer/i);
    expect(text).toMatch(/capital/i);
    expect(text).toMatch(/ROI alone/i);
  });

  it("advertises the user vocabulary that should automatically route to GreeksSurge", () => {
    const corpus = SERVER_INSTRUCTIONS.toLowerCase();
    for (const trigger of [
      "cash-secured put",
      "cash secured put",
      "cash secure put",
      "csp",
      "sell a put",
      "wheel strategy",
      "assignment risk",
      "option premium",
    ]) {
      expect(corpus).toContain(trigger);
    }
    expect(corpus).toMatch(/use greekssurge/i);

    const descriptions: string[] = [];
    registerGreeksSurgeTools({
      tokenProvider: async () => undefined,
      clientFactory: () => {
        throw new Error("registration must not create a client");
      },
      register: (_name, config) => descriptions.push(config.description),
    });
    expect(
      descriptions.every((description) => /use when/i.test(description)),
    ).toBe(true);
    expect(descriptions.join(" ").toLowerCase()).toContain("cash-secured put");
  });
});
