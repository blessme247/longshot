import { resultFromGoals, type Outcome, type ScoreUpdate } from "@underdog/txline";
import { currentGoals } from "@underdog/txline";

import type { Pick } from "./picks";
import type { SettlementRecord } from "./settle";

export type PickStatus = "locked" | "hitting" | "busted" | "won" | "lost";

export interface DerivedStatus {
  status: PickStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  creditedPoints: number | null;
}

const BASE_POINTS = 100;

export function pointsFor(pick: Pick): number {
  return Math.round(BASE_POINTS * pick.multiplier);
}

/**
 * Phase is derived from kickoff time and settlement state — never from the
 * presence or absence of a score record. A missing score pre-match means
 * "locked", not 0-0.
 */
export function deriveStatus(
  pick: Pick,
  now: number,
  lastScore: ScoreUpdate | null,
  settlement: SettlementRecord | null,
): DerivedStatus {
  // Settled real picks: final verdict from the settlement record only.
  if (settlement && !pick.demo) {
    const won = settlement.result === pick.outcome;
    return {
      status: won ? "won" : "lost",
      homeGoals: settlement.homeGoals,
      awayGoals: settlement.awayGoals,
      creditedPoints: won ? pointsFor(pick) : 0,
    };
  }

  // Replay picks always reference a finished match: reveal what would have
  // happened (UI frames this as a reveal, not a verdict).
  if (pick.demo) {
    if (!lastScore) return { status: "hitting", homeGoals: null, awayGoals: null, creditedPoints: null };
    const goals = currentGoals(lastScore);
    const result: Outcome = resultFromGoals(goals.homeGoals, goals.awayGoals);
    return {
      status: result === pick.outcome ? "hitting" : "busted",
      homeGoals: goals.homeGoals,
      awayGoals: goals.awayGoals,
      creditedPoints: null,
    };
  }

  // Real pick, fixture not kicked off: locked, no score, no verdict.
  if (now < pick.kickoffAt) {
    return { status: "locked", homeGoals: null, awayGoals: null, creditedPoints: null };
  }

  // Live: provisional status from the live score; no score yet = 0-0.
  const goals = lastScore ? currentGoals(lastScore) : { homeGoals: 0, awayGoals: 0 };
  const provisional: Outcome = resultFromGoals(goals.homeGoals, goals.awayGoals);
  return {
    status: provisional === pick.outcome ? "hitting" : "busted",
    homeGoals: goals.homeGoals,
    awayGoals: goals.awayGoals,
    creditedPoints: null,
  };
}
