import type { Multiplier, OutcomeOdds } from "../types";
import { toImpliedProbabilities } from "./implied-probability";

/**
 * Derives the fan-facing points multiplier for each outcome: the fair payout
 * (1 / normalized implied probability) at the moment of the quote.
 */
export function toMultipliers(odds: OutcomeOdds[]): Multiplier[] {
  const probabilities = toImpliedProbabilities(odds);
  const probabilityByOutcome = new Map(probabilities.map((p) => [p.outcome, p.probability]));

  return odds.map((o) => {
    const probability = probabilityByOutcome.get(o.outcome);
    if (probability === undefined) {
      throw new Error(`No implied probability computed for outcome ${o.outcome}`);
    }

    return {
      outcome: o.outcome,
      decimalOdds: o.decimalOdds,
      multiplier: 1 / probability,
    };
  });
}
