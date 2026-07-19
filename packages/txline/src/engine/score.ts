import type { Outcome, ScorePeriods, ScoreUpdate } from "../types";

export interface GoalsState {
  homeGoals: number;
  awayGoals: number;
  seq: number;
}

// TxLINE marks a fixture's authoritative final result with this status.
// StatusId 5 is an in-flight "ended" marker that carries no Score and can
// precede finalisation — never settle on it.
const STATUS_FINALISED = 100;

function hasTotalGoals(update: ScoreUpdate): boolean {
  return (
    typeof update.Score?.Participant1?.Total?.Goals === "number" &&
    typeof update.Score?.Participant2?.Total?.Goals === "number"
  );
}

function orientation(update: ScoreUpdate, p1: number, p2: number): { homeGoals: number; awayGoals: number } {
  return update.Participant1IsHome
    ? { homeGoals: p1, awayGoals: p2 }
    : { homeGoals: p2, awayGoals: p1 };
}

/**
 * The current running score = the highest-Seq update that actually carries a
 * Total goal count. The snapshot array is NOT chronologically ordered (its
 * last element can be a pre-match record), so callers must never use
 * `.at(-1)`. Returns null when no update carries a score — the caller must
 * treat that as "unknown", never 0-0.
 */
export function latestGoals(updates: ScoreUpdate[]): GoalsState | null {
  let best: ScoreUpdate | null = null;
  for (const u of updates) {
    if (!hasTotalGoals(u)) continue;
    if (!best || u.Seq > best.Seq) best = u;
  }
  if (!best) return null;

  const { homeGoals, awayGoals } = orientation(
    best,
    best.Score!.Participant1!.Total!.Goals!,
    best.Score!.Participant2!.Total!.Goals!,
  );
  return { homeGoals, awayGoals, seq: best.Seq };
}

function ninetyMinuteGoals(periods: ScorePeriods | undefined): number | null {
  // Regulation only: sum the two halves so extra time never leaks into the
  // 90-minute market. Requires both half objects to be present; an absent
  // Goals field within a present half is a legitimate 0.
  if (!periods?.H1 || !periods?.H2) return null;
  return (periods.H1.Goals ?? 0) + (periods.H2.Goals ?? 0);
}

/**
 * The validated 90-minute result for settlement, taken ONLY from TxLINE's
 * finalised record (StatusId 100). Returns null unless a finalised record
 * exists AND both sides' regulation halves parse into numbers — the caller
 * must not settle on null.
 */
export function finalResult(updates: ScoreUpdate[]): { homeGoals: number; awayGoals: number } | null {
  let finalised: ScoreUpdate | null = null;
  for (const u of updates) {
    if (u.StatusId !== STATUS_FINALISED || !u.Score) continue;
    if (!finalised || u.Seq > finalised.Seq) finalised = u;
  }
  if (!finalised) return null;

  const p1 = ninetyMinuteGoals(finalised.Score?.Participant1);
  const p2 = ninetyMinuteGoals(finalised.Score?.Participant2);
  if (p1 === null || p2 === null) return null;

  return orientation(finalised, p1, p2);
}

export function resultFromGoals(homeGoals: number, awayGoals: number): Outcome {
  if (homeGoals > awayGoals) return "home";
  if (awayGoals > homeGoals) return "away";
  return "draw";
}
