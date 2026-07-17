export type Outcome = "home" | "draw" | "away";

export const WORLD_CUP_COMPETITION_ID = 72;

// Wire types below mirror TxLINE payloads exactly (PascalCase, epoch-ms
// timestamps, numeric ids), captured from live devnet responses 2026-07-17.

// GET /api/fixtures/snapshot
export interface Fixture {
  FixtureId: number;
  Ts: number;
  StartTime: number;
  Competition: string;
  CompetitionId: number;
  FixtureGroupId: number;
  Participant1Id: number;
  Participant1: string;
  Participant2Id: number;
  Participant2: string;
  Participant1IsHome: boolean;
  GameState?: number;
}

// GET /api/odds/snapshot/{fixtureId}. Prices are decimal odds x1000; the
// TXLineStablePriceDemargined bookmaker feed is already demargined, so Pct
// (implied probability strings) sums to ~100 per market.
export interface OddsEntry {
  FixtureId: number;
  MessageId: string;
  Ts: number;
  Bookmaker: string;
  BookmakerId: number;
  SuperOddsType: string;
  GameState: unknown;
  InRunning: boolean;
  MarketParameters: string | null;
  MarketPeriod: string | null;
  PriceNames: string[];
  Prices: number[];
  Pct: string[];
}

// GET /api/scores/snapshot/{fixtureId}. A stat absent from a StatMap is 0.
export interface StatMap {
  Goals?: number;
  Corners?: number;
  YellowCards?: number;
  RedCards?: number;
}

export interface ScorePeriods {
  H1?: StatMap;
  HT?: StatMap;
  H2?: StatMap;
  Total?: StatMap;
}

export interface ScoreUpdate {
  FixtureId: number;
  GameState: string;
  StartTime: number;
  CompetitionId: number;
  Participant1IsHome: boolean;
  Action: string;
  Id: number;
  Ts: number;
  Seq: number;
  StatusId: number;
  Type: string;
  Clock?: { Running: boolean; Seconds: number };
  Score?: {
    Participant1?: ScorePeriods;
    Participant2?: ScorePeriods;
  };
  Data?: unknown;
}

// Derived domain types (not wire formats).
export interface OutcomeOdds {
  outcome: Outcome;
  decimalOdds: number;
}

export interface ImpliedProbability {
  outcome: Outcome;
  probability: number;
}

export interface Multiplier {
  outcome: Outcome;
  decimalOdds: number;
  multiplier: number;
}

export interface Settlement {
  fixtureId: number;
  market: "90min_result";
  result: Outcome;
  settledAt: number;
}
