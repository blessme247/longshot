import type { ImpliedProbability, OutcomeOdds } from "../types";

/**
 * Converts decimal odds for one market into normalized implied probabilities
 * (overround removed so the set sums to 1). The TxLINE demargined feed has
 * overround ~1 already; this keeps the engine correct for any book.
 */
export function toImpliedProbabilities(odds: OutcomeOdds[]): ImpliedProbability[] {
  if (odds.length === 0) {
    throw new Error("toImpliedProbabilities requires at least one entry");
  }

  const raw = odds.map((o) => ({ outcome: o.outcome, raw: 1 / o.decimalOdds }));
  const overround = raw.reduce((sum, { raw: r }) => sum + r, 0);

  return raw.map(({ outcome, raw: r }) => ({ outcome, probability: r / overround }));
}
