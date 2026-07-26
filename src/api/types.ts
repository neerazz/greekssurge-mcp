import type { z } from "zod";
import type { upstreamSchemas } from "./schemas.js";

export type MarketStatus = z.infer<typeof upstreamSchemas.status>;
export type Account = z.infer<typeof upstreamSchemas.authMe>;
export type IdeasResponse = z.infer<typeof upstreamSchemas.ideas>;
export type FiltersResponse = z.infer<typeof upstreamSchemas.filters>;
export type StatsResponse = z.infer<typeof upstreamSchemas.stats>;
export type HistoryResponse = z.infer<typeof upstreamSchemas.history>;
export type TradeHistoryResponse = z.infer<typeof upstreamSchemas.tradeHistory>;
export type EducationListResponse = z.infer<
  typeof upstreamSchemas.educationList
>;
export type EducationArticle = z.infer<typeof upstreamSchemas.educationArticle>;
export type WatchlistResponse = z.infer<typeof upstreamSchemas.watchlist>;
export type PreferencesResponse = z.infer<typeof upstreamSchemas.preferences>;

export interface SourceMetadata {
  source: "https://csp.greekssurge.com";
  retrievedAt: string;
  disclaimer: string;
}

export interface AccountDto {
  tier: string;
  isLifetimeFree: boolean;
  onboarding: Record<string, string | number | boolean | null>;
  features: string[];
  premiumMasked: boolean;
}

export interface MarketStatusDto extends SourceMetadata {
  isMarketOpen: boolean;
}

export interface IdeaDto extends SourceMetadata {
  id: string;
  ticker: string;
  displaySymbol: string;
  companyName: string;
  ideaMode: string;
  expiry: string;
  strike: number;
  roi: number;
  probOtm: number;
  alertPremium: number;
  capital: number;
  buffer: number;
  isFree: boolean;
  isAssigned: boolean;
  outcome: string | null;
  orderStatus: string;
  createdAt: string;
}
