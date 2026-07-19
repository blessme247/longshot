import { resultFromGoals, type GoalsState } from "@underdog/txline";

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
 * presence or absence of a score record. `latest` is the parsed running
 * score or null when no score has been reported/parsed; a null score is
 * "unknown" and never becomes 0-0. A live pick with an unknown score stays
 * "locked" (the frontend renders it as "score unavailable", distinguished
 * from a pre-kickoff lock by comparing kickoff to now).
 */
export function deriveStatus(
  pick: Pick,
  now: number,
  latest: GoalsState | null,
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

  const unknown: DerivedStatus = {
    status: "locked",
    homeGoals: null,
    awayGoals: null,
    creditedPoints: null,
  };

  // Real pick, fixture not kicked off: locked, no score, no verdict.
  if (!pick.demo && now < pick.kickoffAt) return unknown;

  // Replay reveal or live provisional both need a parsed score. Without one
  // there is no verdict to show — stay "unknown", never assume 0-0.
  if (!latest) return unknown;

  const result = resultFromGoals(latest.homeGoals, latest.awayGoals);
  return {
    status: result === pick.outcome ? "hitting" : "busted",
    homeGoals: latest.homeGoals,
    awayGoals: latest.awayGoals,
    creditedPoints: null,
  };
}
