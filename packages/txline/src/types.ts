export type Outcome = "home" | "draw" | "away";

export interface Fixture {
  id: string;
  competition: string;
  kickoffAt: string;
  home: string;
  away: string;
}

export interface OddsQuote {
  fixtureId: string;
  market: "90min_result";
  outcome: Outcome;
  decimalOdds: number;
  observedAt: string;
}

export interface LiveScore {
  fixtureId: string;
  homeGoals: number;
  awayGoals: number;
  minute: number;
  observedAt: string;
}

export interface Settlement {
  fixtureId: string;
  market: "90min_result";
  result: Outcome;
  settledAt: string;
  merkleProof?: string;
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
