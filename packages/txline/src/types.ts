export type Outcome = "home" | "draw" | "away";

export interface Fixture {
  id: string;
  kickoffAt: string;
  home: string;
  away: string;
  // Raw TxLINE game-state string from /api/fixtures/snapshot; not yet mapped
  // to a closed enum since the doc excerpt didn't enumerate its values.
  gameState: string;
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

// App-level settlement record, derived from a verified StatValidationResponse
// (see clients/settlement.ts) once we implement the proof -> outcome mapping.
export interface Settlement {
  fixtureId: string;
  market: "90min_result";
  result: Outcome;
  settledAt: string;
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
