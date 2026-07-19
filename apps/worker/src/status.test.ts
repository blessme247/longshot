import { describe, expect, it } from "vitest";
import { finalResult, latestGoals, type GoalsState, type ScoreUpdate } from "@underdog/txline";

import type { Pick } from "./picks";
import type { SettlementRecord } from "./settle";
import { deriveStatus } from "./status";

const KICKOFF = 1_784_000_000_000;

function realPick(overrides: Partial<Pick> = {}): Pick {
  return {
    userId: "11111111-2222-4333-8444-555566667777",
    fixtureId: 1,
    outcome: "home",
    multiplier: 2.5,
    decimalOdds: 2.5,
    lockedAt: KICKOFF - 3600_000,
    demo: false,
    home: "France",
    away: "England",
    kickoffAt: KICKOFF,
    ...overrides,
  };
}

function goals(home: number, away: number): GoalsState {
  return { homeGoals: home, awayGoals: away, seq: 1 };
}

function settlement(result: SettlementRecord["result"], h = 0, a = 0): SettlementRecord {
  return { version: 1, fixtureId: 1, result, homeGoals: h, awayGoals: a, settledAt: KICKOFF + 7_000_000, creditedCount: 1 };
}

describe("deriveStatus", () => {
  it("pre-kickoff real pick with NO score is locked, never busted (regression)", () => {
    const d = deriveStatus(realPick(), KICKOFF - 60_000, null, null);
    expect(d.status).toBe("locked");
    expect(d.homeGoals).toBeNull();
  });

  it("LIVE pick with NO parsed score stays locked with null goals — never 0-0 (incident regression)", () => {
    // The 2026-07-18 mis-settlement: absent score was read as 0-0. A live
    // pick with no parsed score must be unknown, not a 0-0 draw verdict.
    const d = deriveStatus(realPick({ outcome: "draw" }), KICKOFF + 60_000, null, null);
    expect(d.status).toBe("locked");
    expect(d.homeGoals).toBeNull();
    expect(d.awayGoals).toBeNull();
  });

  it("live pick flips on the real parsed score", () => {
    expect(deriveStatus(realPick(), KICKOFF + 60_000, goals(1, 0), null).status).toBe("hitting");
    expect(deriveStatus(realPick(), KICKOFF + 60_000, goals(0, 1), null).status).toBe("busted");
  });

  it("settled real pick is won/lost from the settlement record only", () => {
    const won = deriveStatus(realPick({ outcome: "away" }), KICKOFF + 8e6, null, settlement("away", 4, 6));
    expect(won.status).toBe("won");
    expect(won.creditedPoints).toBe(250);
    expect(won.awayGoals).toBe(6);
    const lost = deriveStatus(realPick({ outcome: "draw" }), KICKOFF + 8e6, null, settlement("away", 4, 6));
    expect(lost.status).toBe("lost");
    expect(lost.creditedPoints).toBe(0);
  });
});

// --- settlement safety: no finalised result => no settlement ---
function update(partial: Partial<ScoreUpdate>): ScoreUpdate {
  return {
    FixtureId: 1, GameState: "x", StartTime: KICKOFF, CompetitionId: 72,
    Participant1IsHome: true, Action: "x", Id: 1, Ts: KICKOFF, Seq: 1,
    StatusId: 4, Type: "Soccer", ...partial,
  };
}

describe("finalResult / latestGoals (settlement + live safety)", () => {
  it("returns null when there is no finalised (StatusId 100) record — a cron tick must NOT settle", () => {
    const updates = [
      update({ Seq: 9, Action: "weather", StatusId: 1 }), // pre-match, no Score
      update({ Seq: 1189, Action: "goal", StatusId: 4, Score: { Participant1: { H1: {}, H2: { Goals: 4 } }, Participant2: { H1: { Goals: 4 }, H2: { Goals: 2 } } } }),
      update({ Seq: 1192, Action: "status", StatusId: 5 }), // "ended" marker, no Score
    ];
    expect(finalResult(updates)).toBeNull();
  });

  it("parses the finalised record's 90-minute result (H1+H2), regardless of array order", () => {
    const updates = [
      update({ Seq: 1195, Action: "game_finalised", StatusId: 100, Score: { Participant1: { H1: { Corners: 2 }, H2: { Goals: 4 } }, Participant2: { H1: { Goals: 4 }, H2: { Goals: 2 } } } }),
      update({ Seq: 9, Action: "weather", StatusId: 1 }), // unordered: pre-match record last
    ];
    expect(finalResult(updates)).toEqual({ homeGoals: 4, awayGoals: 6 });
  });

  it("latestGoals ignores score-less records and never returns 0-0 for missing data", () => {
    expect(latestGoals([update({ Seq: 9, Action: "weather", StatusId: 1 })])).toBeNull();
    expect(latestGoals([update({ Seq: 5, Score: { Participant1: { Total: { Goals: 1 } }, Participant2: { Total: { Goals: 2 } } } })]))
      .toEqual({ homeGoals: 1, awayGoals: 2, seq: 5 });
  });
});
