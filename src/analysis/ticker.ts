/**
 * Derived cash-secured-put analysis.
 *
 * GreeksSurge shows a headline number per idea (ROI, probability OTM, buffer).
 * It does not reconcile those against what actually happened to that ticker in
 * the connected account, and it does not surface the arithmetic behind them.
 * This module does both, deterministically, so the numbers do not depend on a
 * model doing mental math over twenty rows.
 *
 * Nothing here is a recommendation. It reports measurements and named risk
 * factors with the formula used for each, so the reader can disagree with the
 * measurement rather than trust a verdict.
 */
import type {
  IdeasResponse,
  StatsResponse,
  TradeHistoryResponse,
} from "../api/types.js";

type Idea = IdeasResponse["ideas"][number];
type TickerBreakdownRow = StatsResponse["ticker_breakdown"][number];
type SettledTrade = TradeHistoryResponse["ideas"][number];

export type FactorSeverity = "high" | "medium" | "info";

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  unit: "percent" | "usd" | "days" | "ratio" | "count";
  /** The formula, so the measurement is auditable rather than magic. */
  basis: string;
}

export interface DownsideFactor {
  key: string;
  severity: FactorSeverity;
  detail: string;
}

export interface OpenIdeaAnalysis {
  id: string;
  displaySymbol: string;
  expiry: string;
  strike: number;
  spot: number | null;
  premiumPerShare: number;
  breakEven: number;
  daysToExpiry: number | null;
  bufferToStrikePct: number | null;
  bufferToBreakEvenPct: number | null;
  probOtmPct: number;
  /** 100 - probOtm: an ITM/assignment-risk proxy, not assignment probability. */
  assignmentRiskPct: number;
  roiPct: number;
  annualizedRoiPct: number | null;
  premiumPerRiskUnit: number | null;
  capitalAtRisk: number;
  isLeveraged: boolean;
  ideaMode: string;
}

export interface TickerHistory {
  /** From performance stats, which nets assignment losses into `netPremium`. */
  trades: number;
  winRatePct: number | null;
  assignmentRatePct: number | null;
  netPremium: number | null;
  avgPremiumPerTrade: number | null;
  /** From trade history, a separate endpoint with its own window. */
  sampledRows: number;
  sampledAssignments: number;
  /**
   * Deepest observed assignment, as the closing option price over the strike.
   * A put assigned with a $9.60 close against a $77 strike was roughly 12% in
   * the money, which is the closest thing the API exposes to loss magnitude.
   */
  deepestAssignmentDepthPct: number | null;
}

export interface PortfolioContext {
  portfolioAssignmentRatePct: number | null;
  portfolioWinRatePct: number | null;
  settledTradeCount: number | null;
}

export interface TickerAnalysis {
  ticker: string;
  companyName: string | null;
  openIdeaCount: number;
  openIdeas: OpenIdeaAnalysis[];
  history: TickerHistory;
  portfolioContext: PortfolioContext;
  indicators: Indicator[];
  downsideFactors: DownsideFactor[];
  limitations: string[];
}

const MS_PER_DAY = 86_400_000;
/** Below this cushion to break-even, a routine pullback reaches assignment. */
const THIN_BUFFER_PCT = 10;
/** GreeksSurge's own top ROI bucket. High premium prices a large expected move. */
const ELEVATED_ROI_PCT = 4;
/** Below GreeksSurge's lowest published probability-OTM band. */
const LOW_PROB_OTM_PCT = 80;
/** A high win rate paired with a net loss is the asymmetry worth naming. */
const ASYMMETRY_WIN_RATE_PCT = 70;
const SMALL_SAMPLE_TRADES = 5;
const SHORT_DTE_DAYS = 7;

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function safeDivide(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}

/** Whole days between the idea's own date stamp and its expiry. */
export function daysToExpiry(fromDate: string, expiry: string): number | null {
  const start = Date.parse(`${fromDate}T00:00:00.000Z`);
  const end = Date.parse(`${expiry}T00:00:00.000Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const days = Math.round((end - start) / MS_PER_DAY);
  return days >= 0 ? days : null;
}

export function analyzeOpenIdea(idea: Idea): OpenIdeaAnalysis {
  const spot = Number.isFinite(idea.triggerPrice ?? Number.NaN)
    ? (idea.triggerPrice as number)
    : null;
  const premiumPerShare = idea.alertPremium;
  const breakEven = round(idea.strike - premiumPerShare);
  const dte = daysToExpiry(idea.dateOnly, idea.expiry);
  const assignmentRiskPct = round(100 - idea.probOtm);

  const bufferToStrikePct =
    spot === null ? null : round(((spot - idea.strike) / spot) * 100);
  const bufferToBreakEvenPct =
    spot === null ? null : round(((spot - breakEven) / spot) * 100);

  const annualized =
    dte === null || dte === 0 ? null : safeDivide(idea.roi * 365, dte);
  const perRisk = safeDivide(idea.roi, assignmentRiskPct);

  return {
    id: idea.id,
    displaySymbol: idea.displaySymbol,
    expiry: idea.expiry,
    strike: idea.strike,
    spot,
    premiumPerShare,
    breakEven,
    daysToExpiry: dte,
    bufferToStrikePct,
    bufferToBreakEvenPct,
    probOtmPct: idea.probOtm,
    assignmentRiskPct,
    roiPct: idea.roi,
    annualizedRoiPct: annualized === null ? null : round(annualized),
    premiumPerRiskUnit: perRisk === null ? null : round(perRisk, 3),
    capitalAtRisk: idea.blockedCapital,
    isLeveraged: idea.isLeveraged,
    ideaMode: idea.ideaMode,
  };
}

function isAssigned(trade: SettledTrade): boolean {
  return trade.outcome.trim().toUpperCase() === "ASSIGNED";
}

function summarizeHistory(
  row: TickerBreakdownRow | undefined,
  settled: SettledTrade[],
): TickerHistory {
  const assignments = settled.filter(isAssigned);
  // premiumCollected is always positive, even on a loss, so it cannot express a
  // worst outcome. Assignment depth can.
  const deepest = assignments.reduce<number | null>((deepestSoFar, trade) => {
    const close = trade.closePrice;
    if (close === null || close === undefined) return deepestSoFar;
    const depth = safeDivide(close * 100, trade.strike);
    if (depth === null) return deepestSoFar;
    return deepestSoFar === null || depth > deepestSoFar ? depth : deepestSoFar;
  }, null);

  const shared = {
    sampledRows: settled.length,
    sampledAssignments: assignments.length,
    deepestAssignmentDepthPct: deepest === null ? null : round(deepest),
  };

  if (!row) {
    return {
      trades: 0,
      winRatePct: null,
      assignmentRatePct: null,
      netPremium: null,
      avgPremiumPerTrade: null,
      ...shared,
    };
  }

  const assignmentRate = safeDivide(assignments.length * 100, settled.length);
  const avgPremium = safeDivide(row.premium, row.count);
  return {
    trades: row.count,
    winRatePct: row.winRate,
    assignmentRatePct: assignmentRate === null ? null : round(assignmentRate),
    netPremium: round(row.premium),
    avgPremiumPerTrade: avgPremium === null ? null : round(avgPremium),
    ...shared,
  };
}

function portfolioContextFrom(stats: StatsResponse): PortfolioContext {
  const otm = stats.otm_signals;
  const btc = stats.btc_signals;
  const assigned = stats.assigned_signals;
  const settledCount = otm + btc + assigned;
  const assignmentRate = safeDivide(assigned * 100, settledCount);
  return {
    portfolioAssignmentRatePct:
      assignmentRate === null ? null : round(assignmentRate),
    portfolioWinRatePct: stats.win_rate,
    settledTradeCount: Number.isFinite(settledCount) ? settledCount : null,
  };
}

/** Median so one outlier strike does not define "thin" for the whole ticker. */
function median(values: number[]): number | null {
  const sorted = [...values.filter(Number.isFinite)].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2
    : (sorted[middle] as number);
}

function buildIndicators(
  ideas: OpenIdeaAnalysis[],
  history: TickerHistory,
): Indicator[] {
  const medianBufferToBreakEven = median(
    ideas
      .map((idea) => idea.bufferToBreakEvenPct)
      .filter((value): value is number => value !== null),
  );
  const medianProbOtm = median(ideas.map((idea) => idea.probOtmPct));
  const medianRoi = median(ideas.map((idea) => idea.roiPct));
  const medianAnnualized = median(
    ideas
      .map((idea) => idea.annualizedRoiPct)
      .filter((value): value is number => value !== null),
  );
  const medianPerRisk = median(
    ideas
      .map((idea) => idea.premiumPerRiskUnit)
      .filter((value): value is number => value !== null),
  );
  const totalCapital = ideas.reduce((sum, idea) => sum + idea.capitalAtRisk, 0);

  return [
    {
      key: "buffer_to_break_even",
      label: "Median cushion to break-even",
      value:
        medianBufferToBreakEven === null
          ? null
          : round(medianBufferToBreakEven),
      unit: "percent",
      basis: "(spot - (strike - premiumPerShare)) / spot * 100",
    },
    {
      key: "probability_otm",
      label: "Median probability of expiring out of the money",
      value: medianProbOtm === null ? null : round(medianProbOtm),
      unit: "percent",
      basis: "GreeksSurge probOtm, as published per idea",
    },
    {
      key: "assignment_risk",
      label: "Median ITM / assignment-risk proxy",
      value: medianProbOtm === null ? null : round(100 - medianProbOtm),
      unit: "percent",
      basis: "100 - probOtm; proxy only, not probability of assignment",
    },
    {
      key: "roi",
      label: "Median ROI on blocked capital",
      value: medianRoi === null ? null : round(medianRoi),
      unit: "percent",
      basis: "GreeksSurge roi, as published per idea",
    },
    {
      key: "annualized_roi",
      label: "Median annualized ROI",
      value: medianAnnualized === null ? null : round(medianAnnualized),
      unit: "percent",
      basis: "roi * 365 / daysToExpiry, so different expiries compare",
    },
    {
      key: "premium_per_risk_unit",
      label: "Median premium per point of ITM-risk proxy",
      value: medianPerRisk === null ? null : round(medianPerRisk, 3),
      unit: "ratio",
      basis:
        "roi / (100 - probOtm); higher means better paid for the same risk",
    },
    {
      key: "capital_at_risk",
      label: "Capital blocked across open ideas",
      value: round(totalCapital),
      unit: "usd",
      basis: "sum of blockedCapital across the ticker's open ideas",
    },
    {
      key: "historical_assignment_rate",
      label: "Observed assignment rate in sampled trade history",
      value: history.assignmentRatePct,
      unit: "percent",
      basis: "explicit ASSIGNED rows / sampled trade-history rows * 100",
    },
    {
      key: "net_premium_per_trade",
      label: "Net premium per settled trade",
      value: history.avgPremiumPerTrade,
      unit: "usd",
      basis:
        "net premium / settled count; negative means the ticker lost money",
    },
    {
      key: "settled_trades",
      label: "Settled trades on this ticker",
      value: history.trades,
      unit: "count",
      basis: "count from performance stats ticker breakdown",
    },
  ];
}

function buildDownsideFactors(
  ticker: string,
  ideas: OpenIdeaAnalysis[],
  history: TickerHistory,
  portfolio: PortfolioContext,
): DownsideFactor[] {
  const factors: DownsideFactor[] = [];

  // The signal the dashboard hides: frequent small wins, rare large losses.
  if (
    history.netPremium !== null &&
    history.netPremium < 0 &&
    history.winRatePct !== null &&
    history.winRatePct >= ASYMMETRY_WIN_RATE_PCT
  ) {
    factors.push({
      key: "loss_asymmetry",
      severity: "high",
      detail: `${ticker} wins ${history.winRatePct}% of the time yet is net ${history.netPremium} across ${history.trades} settled trades. Losses on this ticker are larger than the wins, so the win rate overstates how it has actually performed.`,
    });
  } else if (history.netPremium !== null && history.netPremium < 0) {
    factors.push({
      key: "negative_net_premium",
      severity: "high",
      detail: `${ticker} is net ${history.netPremium} across ${history.trades} settled trades.`,
    });
  }

  if (
    history.assignmentRatePct !== null &&
    history.sampledRows === history.trades &&
    portfolio.portfolioAssignmentRatePct !== null &&
    history.assignmentRatePct > portfolio.portfolioAssignmentRatePct
  ) {
    factors.push({
      key: "assignment_rate_above_portfolio",
      severity: "medium",
      detail: `Explicitly assigned on ${history.assignmentRatePct}% of the complete sampled ${ticker} history versus ${portfolio.portfolioAssignmentRatePct}% across the whole account.`,
    });
  }

  if (ideas.some((idea) => idea.isLeveraged)) {
    factors.push({
      key: "leveraged_instrument",
      severity: "high",
      detail: `${ticker} is flagged leveraged, so the underlying moves a multiple of its index. A normal index pullback reaches the strike faster than the buffer implies.`,
    });
  }

  const thin = ideas.filter(
    (idea) =>
      idea.bufferToBreakEvenPct !== null &&
      idea.bufferToBreakEvenPct < THIN_BUFFER_PCT,
  );
  if (thin.length > 0) {
    factors.push({
      key: "thin_buffer",
      severity: "medium",
      detail: `${thin.length} of ${ideas.length} open ideas sit within ${THIN_BUFFER_PCT}% of break-even: ${thin
        .map((idea) => `${idea.displaySymbol} (${idea.bufferToBreakEvenPct}%)`)
        .join(", ")}.`,
    });
  }

  const elevated = ideas.filter((idea) => idea.roiPct >= ELEVATED_ROI_PCT);
  if (elevated.length > 0) {
    factors.push({
      key: "elevated_premium",
      severity: "medium",
      detail: `${elevated.length} open idea(s) pay ${ELEVATED_ROI_PCT}%+ ROI. Premium that size is the market pricing a large expected move, not free yield; it is compensation for the chance the stock falls through the strike.`,
    });
  }

  const lowProb = ideas.filter((idea) => idea.probOtmPct < LOW_PROB_OTM_PCT);
  if (lowProb.length > 0) {
    factors.push({
      key: "low_probability_otm",
      severity: "medium",
      detail: `${lowProb.length} open idea(s) below ${LOW_PROB_OTM_PCT}% probability of expiring out of the money.`,
    });
  }

  const shortAndThin = ideas.filter(
    (idea) =>
      idea.daysToExpiry !== null &&
      idea.daysToExpiry <= SHORT_DTE_DAYS &&
      idea.bufferToBreakEvenPct !== null &&
      idea.bufferToBreakEvenPct < THIN_BUFFER_PCT,
  );
  if (shortAndThin.length > 0) {
    factors.push({
      key: "short_dated_thin_buffer",
      severity: "medium",
      detail: `${shortAndThin.length} open idea(s) expire within ${SHORT_DTE_DAYS} days with under ${THIN_BUFFER_PCT}% cushion, leaving little time to recover from a gap down.`,
    });
  }

  if (history.deepestAssignmentDepthPct !== null) {
    factors.push({
      key: "assignment_depth",
      severity: history.deepestAssignmentDepthPct >= 10 ? "high" : "medium",
      detail: `When ${ticker} was assigned, the deepest close put the option about ${history.deepestAssignmentDepthPct}% of strike in the money. Assignment on this ticker has not been marginal, so the loss is not limited to a few cents past the strike.`,
    });
  }

  // Assigned rows come back with roi 0 rather than a negative ROI, so any
  // ROI-based average silently treats a loss as a break-even trade.
  if (history.sampledAssignments > 0) {
    factors.push({
      key: "roi_understates_assigned_losses",
      severity: "high",
      detail: `${history.sampledAssignments} of the ${history.sampledRows} sampled ${ticker} rows are assignments, and GreeksSurge records those with roi 0 rather than a negative ROI. Averaging ROI over settled trades therefore counts each assignment as break-even and understates the real loss; net premium is the only field that reflects it.`,
    });
  }

  // The two endpoints keep separate windows and can disagree for one ticker.
  if (
    history.trades > 0 &&
    history.sampledRows > 0 &&
    history.trades !== history.sampledRows
  ) {
    factors.push({
      key: "source_count_disagreement",
      severity: "info",
      detail: `Performance stats report ${history.trades} settled ${ticker} trades while trade history returned ${history.sampledRows} rows. The two endpoints use different windows, so treat the per-ticker figures as window-dependent rather than absolute.`,
    });
  }

  if (history.trades === 0) {
    factors.push({
      key: "no_settled_history",
      severity: "info",
      detail: `No settled ${ticker} trades in this account, so none of the historical indicators above are grounded for this ticker.`,
    });
  } else if (history.trades < SMALL_SAMPLE_TRADES) {
    factors.push({
      key: "small_sample",
      severity: "info",
      detail: `Only ${history.trades} settled ${ticker} trades. Win rate and sampled assignment rate are not yet meaningful at that sample size.`,
    });
  }

  return factors;
}

export interface AnalyzeTickerInput {
  ticker: string;
  ideas: Idea[];
  stats: StatsResponse;
  settled: SettledTrade[];
}

export function analyzeTicker(input: AnalyzeTickerInput): TickerAnalysis {
  const ticker = input.ticker.trim().toUpperCase();
  const matches = input.ideas.filter((idea) => idea.ticker === ticker);
  const openIdeas = matches.map(analyzeOpenIdea);
  const row = input.stats.ticker_breakdown.find(
    (candidate) => candidate.ticker === ticker,
  );
  const settled = input.settled.filter((trade) => trade.ticker === ticker);
  const history = summarizeHistory(row, settled);
  const portfolioContext = portfolioContextFrom(input.stats);

  const limitations: string[] = [
    "Derived from GreeksSurge data only: current open ideas, the account's settled history, and published probability/ROI figures.",
    "No implied volatility, delta, earnings date, news, or price history is available per idea, so nothing here models why the stock might fall - only how much cushion exists and how this ticker has behaved before.",
    "Assignment loss magnitude is not published. Assigned rows carry roi 0 and premiumCollected stays positive, so depth is approximated from the closing option price over the strike.",
    "Forward-looking assignmentRiskPct is 100 - probOtm, an ITM/assignment-risk proxy rather than a probability of assignment; positions may be closed before expiry.",
    "Ticker assignment rate uses only explicit ASSIGNED outcomes in the returned trade-history sample and is omitted when no sampled rows exist.",
    "Performance stats and trade history keep separate windows and can report different counts for the same ticker; both are shown rather than reconciled.",
    "Measurements and named risk factors only. Not a recommendation and not financial advice.",
  ];
  if (openIdeas.length === 0) {
    limitations.push(
      `No open ideas for ${ticker} right now, so forward-looking indicators are empty and only settled history applies.`,
    );
  }

  return {
    ticker,
    companyName: matches[0]?.companyName ?? null,
    openIdeaCount: openIdeas.length,
    openIdeas,
    history,
    portfolioContext,
    indicators: buildIndicators(openIdeas, history),
    downsideFactors: buildDownsideFactors(
      ticker,
      openIdeas,
      history,
      portfolioContext,
    ),
    limitations,
  };
}
