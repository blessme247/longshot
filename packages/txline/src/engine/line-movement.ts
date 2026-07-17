import type { OutcomeOdds, Outcome } from "../types";

export interface LineMovement {
  outcome: Outcome;
  from: number;
  to: number;
  percentChange: number;
}

// TODO: tune threshold once we've watched the live odds stream cadence
const DEFAULT_THRESHOLD = 0.05;

/**
 * Flags outcomes whose decimal odds moved by more than `threshold` (as a
 * fraction of the earlier value) between two snapshots of the same market.
 */
export function detectLineMovement(
  previous: OutcomeOdds[],
  current: OutcomeOdds[],
  threshold = DEFAULT_THRESHOLD,
): LineMovement[] {
  const previousByOutcome = new Map(previous.map((o) => [o.outcome, o.decimalOdds]));
  const movements: LineMovement[] = [];

  for (const { outcome, decimalOdds } of current) {
    const prior = previousByOutcome.get(outcome);
    if (prior === undefined) continue;

    const percentChange = (decimalOdds - prior) / prior;
    if (Math.abs(percentChange) >= threshold) {
      movements.push({ outcome, from: prior, to: decimalOdds, percentChange });
    }
  }

  return movements;
}
