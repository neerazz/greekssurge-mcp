import { describe, expect, it } from "vitest";
import {
  analyzeOpenIdea,
  analyzeTicker,
  daysToExpiry,
} from "../src/analysis/ticker.js";
import type {
  IdeasResponse,
  StatsResponse,
  TradeHistoryResponse,
} from "../src/api/types.js";

type Idea = IdeasResponse["ideas"][number];
type SettledTrade = TradeHistoryResponse["ideas"][number];

function idea(overrides: Partial<Idea> = {}): Idea {
  return {
    displaySymbol: "$ASTS 2026-08-07 $50 PUT",
    afterHours: false,
    alertPremium: 1.13,
    blockedCapital: 4887,
    createdAt: "2026-07-27T13:47:03.967Z",
    dislikes: 0,
    expiry: "2026-08-07",
    isAssigned: false,
    isFree: true,
    isLeveraged: false,
    isMarketHours: true,
    likes: 0,
    outcome: "PENDING",
    probOtm: 81.3,
    roi: 2.31,
    shares: 0,
    strike: 50,
    symbol: "ASTS",
    triggerPrice: 58.16,
    dateOnly: "2026-07-27",
    ticker: "ASTS",
    id: "idea_1",
    capital: 4887,
    buffer: 14.03,
    capturedRoi: 0,
    realizedRoi: 0,
    decayProfit: 0,
    companyName: "AST SPACEMOBILE INC Class A",
    ideaMode: "WEEKLY",
    ...overrides,
  } as Idea;
}

function settled(overrides: Partial<SettledTrade> = {}): SettledTrade {
  return {
    ticker: "ASTS",
    displaySymbol: "$ASTS 2026-07-17 $60 PUT",
    ideaMode: "WEEKLY",
    strike: 60,
    expiry: "2026-07-17",
    alertPremium: 1.2,
    closePrice: 0.1,
    roi: 1.2,
    realizedRoi: 1.2,
    projectedRoi: 1.2,
    capital: 6000,
    outcome: "BTC",
    premiumCollected: 120,
    createdAt: "2026-07-10T16:00:00.000Z",
    closeDate: "2026-07-17T16:00:00.000Z",
    daysHeld: 7,
    companyName: "AST SPACEMOBILE INC Class A",
    id: "settled_1",
    ...overrides,
  } as SettledTrade;
}

function stats(overrides: Partial<StatsResponse> = {}): StatsResponse {
  return {
    total_premium: 1000,
    open_premium: 100,
    settled: 900,
    win_rate: 89.55,
    weekly_calendar: [],
    top_performers: [],
    ticker_breakdown: [],
    roi_histogram: [],
    greeks_distribution: [],
    monthly_performance: [],
    win_streak_current: 2,
    win_streak_best: 62,
    max_drawdown: 0.37,
    otm_signals: 22,
    btc_signals: 278,
    assigned_signals: 35,
    last_settled: [],
    ...overrides,
  } as StatsResponse;
}

const factorKeys = (analysis: ReturnType<typeof analyzeTicker>) =>
  analysis.downsideFactors.map((factor) => factor.key);
const indicator = (analysis: ReturnType<typeof analyzeTicker>, key: string) =>
  analysis.indicators.find((entry) => entry.key === key);

describe("days to expiry", () => {
  it("counts whole days and rejects inverted or unparseable dates", () => {
    expect(daysToExpiry("2026-07-27", "2026-08-07")).toBe(11);
    expect(daysToExpiry("2026-07-27", "2026-07-27")).toBe(0);
    expect(daysToExpiry("2026-08-07", "2026-07-27")).toBeNull();
    expect(daysToExpiry("not-a-date", "2026-07-27")).toBeNull();
  });
});

describe("open idea derivation", () => {
  it("puts break-even below the strike and measures cushion to it", () => {
    const analysis = analyzeOpenIdea(idea());

    // The strike is not the loss point; break-even is a premium lower.
    expect(analysis.breakEven).toBe(48.87);
    expect(analysis.breakEven).toBeLessThan(analysis.strike);
    // (58.16 - 50) / 58.16 = 14.03%, matching the published buffer.
    expect(analysis.bufferToStrikePct).toBe(14.03);
    // Cushion to break-even is strictly larger than cushion to strike.
    expect(analysis.bufferToBreakEvenPct).toBe(15.97);
    expect(analysis.bufferToBreakEvenPct).toBeGreaterThan(
      analysis.bufferToStrikePct as number,
    );
  });

  it("annualizes ROI so different expiries compare, and prices risk per unit", () => {
    const analysis = analyzeOpenIdea(idea());

    expect(analysis.daysToExpiry).toBe(11);
    // 2.31 * 365 / 11
    expect(analysis.annualizedRoiPct).toBe(76.65);
    expect(analysis.assignmentRiskPct).toBe(18.7);
    // 2.31 / 18.7
    expect(analysis.premiumPerRiskUnit).toBe(0.124);
  });

  it("returns nulls instead of guessing when the expiry cannot be dated", () => {
    const analysis = analyzeOpenIdea(idea({ dateOnly: "2026-09-01" }));

    expect(analysis.daysToExpiry).toBeNull();
    expect(analysis.annualizedRoiPct).toBeNull();
  });
});

describe("downside factors", () => {
  it("names loss asymmetry when a high win rate hides a net loss", () => {
    const analysis = analyzeTicker({
      ticker: "ASTS",
      ideas: [idea()],
      stats: stats({
        ticker_breakdown: [
          { ticker: "ASTS", count: 8, otm: 6, premium: -175.5, winRate: 75 },
        ],
      }),
      settled: [],
    });

    expect(factorKeys(analysis)).toContain("loss_asymmetry");
    const asymmetry = analysis.downsideFactors.find(
      (factor) => factor.key === "loss_asymmetry",
    );
    expect(asymmetry?.severity).toBe("high");
    expect(asymmetry?.detail).toContain("75%");
    expect(asymmetry?.detail).toContain("-175.5");
    // A plain negative ticker should not double-report.
    expect(factorKeys(analysis)).not.toContain("negative_net_premium");
    expect(indicator(analysis, "net_premium_per_trade")?.value).toBe(-21.94);
    expect(indicator(analysis, "historical_assignment_rate")?.value).toBeNull();
  });

  it("flags that assigned rows carry roi 0 and understate the loss", () => {
    const analysis = analyzeTicker({
      ticker: "ASTS",
      ideas: [idea()],
      stats: stats({
        ticker_breakdown: [
          { ticker: "ASTS", count: 8, otm: 6, premium: -175.5, winRate: 75 },
        ],
      }),
      settled: [
        settled(),
        settled({
          id: "settled_2",
          outcome: "ASSIGNED",
          roi: 0,
          realizedRoi: 0,
          closePrice: 7.66,
          strike: 60,
          premiumCollected: 140,
        }),
      ],
    });

    expect(factorKeys(analysis)).toContain("roi_understates_assigned_losses");
    // 7.66 / 60 = 12.77% of strike in the money.
    expect(analysis.history.deepestAssignmentDepthPct).toBe(12.77);
    expect(analysis.history.sampledAssignments).toBe(1);
    expect(factorKeys(analysis)).toContain("assignment_depth");
  });

  it("does not count bought-to-close outcomes as historical assignments", () => {
    const outcomes = ["OTM", "OTM", "OTM", "OTM", "OTM", "OTM", "BTC", "BTC"];
    const analysis = analyzeTicker({
      ticker: "ASTS",
      ideas: [idea()],
      stats: stats({
        ticker_breakdown: [
          { ticker: "ASTS", count: 8, otm: 6, premium: 400, winRate: 100 },
        ],
      }),
      settled: outcomes.map((outcome, index) =>
        settled({ id: `settled_${index}`, outcome }),
      ),
    });

    expect(analysis.history.sampledAssignments).toBe(0);
    expect(analysis.history.assignmentRatePct).toBe(0);
    expect(indicator(analysis, "historical_assignment_rate")?.value).toBe(0);
    expect(factorKeys(analysis)).not.toContain(
      "assignment_rate_above_portfolio",
    );
  });

  it("reports when performance stats and trade history disagree on count", () => {
    const analysis = analyzeTicker({
      ticker: "ASTS",
      ideas: [],
      stats: stats({
        ticker_breakdown: [
          { ticker: "ASTS", count: 8, otm: 6, premium: 10, winRate: 75 },
        ],
      }),
      settled: [settled(), settled({ id: "s2" })],
    });

    const disagreement = analysis.downsideFactors.find(
      (factor) => factor.key === "source_count_disagreement",
    );
    expect(disagreement?.detail).toContain("8");
    expect(disagreement?.detail).toContain("2");
  });

  it("flags leverage, thin cushion, and elevated premium from the open ideas", () => {
    const analysis = analyzeTicker({
      ticker: "SOXL",
      ideas: [
        idea({
          ticker: "SOXL",
          symbol: "SOXL",
          isLeveraged: true,
          triggerPrice: 30,
          strike: 29,
          alertPremium: 0.5,
          roi: 4.5,
          probOtm: 72,
          dateOnly: "2026-07-27",
          expiry: "2026-07-31",
          displaySymbol: "$SOXL 2026-07-31 $29 PUT",
        }),
      ],
      stats: stats(),
      settled: [],
    });

    const keys = factorKeys(analysis);
    expect(keys).toContain("leveraged_instrument");
    expect(keys).toContain("thin_buffer");
    expect(keys).toContain("elevated_premium");
    expect(keys).toContain("low_probability_otm");
    expect(keys).toContain("short_dated_thin_buffer");
    expect(keys).toContain("no_settled_history");
  });

  it("says so plainly when a ticker has no history rather than implying safety", () => {
    const analysis = analyzeTicker({
      ticker: "NEWCO",
      ideas: [],
      stats: stats(),
      settled: [],
    });

    expect(analysis.openIdeaCount).toBe(0);
    expect(analysis.history.trades).toBe(0);
    expect(analysis.history.winRatePct).toBeNull();
    expect(factorKeys(analysis)).toContain("no_settled_history");
    expect(analysis.limitations.join(" ")).toMatch(/No open ideas for NEWCO/);
  });

  it("keeps a small sample from being read as a track record", () => {
    const analysis = analyzeTicker({
      ticker: "ASTS",
      ideas: [],
      stats: stats({
        ticker_breakdown: [
          { ticker: "ASTS", count: 2, otm: 2, premium: 40, winRate: 100 },
        ],
      }),
      settled: [],
    });

    expect(factorKeys(analysis)).toContain("small_sample");
  });
});

describe("analysis contract", () => {
  it("normalizes the ticker, ignores other tickers, and never advises", () => {
    const analysis = analyzeTicker({
      ticker: " asts ",
      ideas: [idea(), idea({ id: "other", ticker: "NBIS", symbol: "NBIS" })],
      stats: stats(),
      settled: [settled(), settled({ id: "x", ticker: "NBIS" })],
    });

    expect(analysis.ticker).toBe("ASTS");
    expect(analysis.openIdeaCount).toBe(1);
    expect(analysis.history.sampledRows).toBe(1);
    expect(analysis.limitations.join(" ")).toMatch(/not financial advice/i);
    // Every indicator must publish the formula behind it.
    for (const entry of analysis.indicators) expect(entry.basis).toBeTruthy();
  });
});
