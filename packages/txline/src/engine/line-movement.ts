import type { OddsQuote, Outcome } from "../types";

export interface LineMovement {
  outcome: Outcome;
  from: OddsQuote;
  to: OddsQuote;
  percentChange: number;
}

// TODO: tune threshold once we've seen real TxLINE odds update frequency/granularity
const DEFAULT_THRESHOLD = 0.05;

/**
 * Flags outcomes whose decimal odds moved by more than `threshold` (as a
 * fraction of the earlier value) between two quote snapshots for the same fixture.
 */
export function detectLineMovement(
  previous: OddsQuote[],
  current: OddsQuote[],
  threshold = DEFAULT_THRESHOLD,
): LineMovement[] {
  const previousByOutcome = new Map(previous.map((quote) => [quote.outcome, quote]));
  const movements: LineMovement[] = [];

  for (const quote of current) {
    const prior = previousByOutcome.get(quote.outcome);
    if (!prior) continue;

    const percentChange = (quote.decimalOdds - prior.decimalOdds) / prior.decimalOdds;
    if (Math.abs(percentChange) >= threshold) {
      movements.push({ outcome: quote.outcome, from: prior, to: quote, percentChange });
    }
  }

  return movements;
}
