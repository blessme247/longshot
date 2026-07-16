import type { ImpliedProbability, OddsQuote } from "../types";

/**
 * Converts a full set of decimal-odds quotes for one market into normalized
 * implied probabilities (overround removed so the set sums to 1).
 */
export function toImpliedProbabilities(quotes: OddsQuote[]): ImpliedProbability[] {
  if (quotes.length === 0) {
    throw new Error("toImpliedProbabilities requires at least one quote");
  }

  const raw = quotes.map((quote) => ({
    outcome: quote.outcome,
    raw: 1 / quote.decimalOdds,
  }));

  const overround = raw.reduce((sum, { raw: r }) => sum + r, 0);

  return raw.map(({ outcome, raw: r }) => ({
    outcome,
    probability: r / overround,
  }));
}
