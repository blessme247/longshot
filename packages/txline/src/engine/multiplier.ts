import type { Multiplier, OddsQuote } from "../types";
import { toImpliedProbabilities } from "./implied-probability";

/**
 * Derives the fan-facing points multiplier for each outcome from a set of
 * live decimal-odds quotes. Multiplier is the fair payout (1 / normalized
 * implied probability) for the picked outcome at the moment of the quote.
 */
export function toMultipliers(quotes: OddsQuote[]): Multiplier[] {
  const probabilities = toImpliedProbabilities(quotes);
  const probabilityByOutcome = new Map(probabilities.map((p) => [p.outcome, p.probability]));

  return quotes.map((quote) => {
    const probability = probabilityByOutcome.get(quote.outcome);
    if (probability === undefined) {
      throw new Error(`No implied probability computed for outcome ${quote.outcome}`);
    }

    return {
      outcome: quote.outcome,
      decimalOdds: quote.decimalOdds,
      multiplier: 1 / probability,
    };
  });
}
