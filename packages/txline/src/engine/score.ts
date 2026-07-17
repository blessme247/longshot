import type { Outcome, ScoreUpdate } from "../types";

export interface GoalsState {
  homeGoals: number;
  awayGoals: number;
  seq: number;
}

/**
 * Reads the current goal totals from a score update. Absent stats are 0.
 */
export function currentGoals(update: ScoreUpdate): GoalsState {
  const p1Goals = update.Score?.Participant1?.Total?.Goals ?? 0;
  const p2Goals = update.Score?.Participant2?.Total?.Goals ?? 0;

  return {
    homeGoals: update.Participant1IsHome ? p1Goals : p2Goals,
    awayGoals: update.Participant1IsHome ? p2Goals : p1Goals,
    seq: update.Seq,
  };
}

export function resultFromGoals(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "home";
  if (awayGoals > homeGoals) return "away";
  return "draw";
}
