import { describe, expect, it } from "vitest";
import type { ScoreUpdate } from "@underdog/txline";

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

function scoreUpdate(h1Home: number, h1Away: number): ScoreUpdate {
  return {
    FixtureId: 1,
    GameState: "scheduled",
    StartTime: KICKOFF,
    CompetitionId: 72,
    Participant1IsHome: true,
    Action: "action_amend",
    Id: 1,
    Ts: KICKOFF,
    Seq: 10,
    StatusId: 4,
    Type: "Soccer",
    Score: {
      Participant1: { Total: { Goals: h1Home } },
      Participant2: { Total: { Goals: h1Away } },
    },
  };
}

function settlement(result: SettlementRecord["result"]): SettlementRecord {
  return {
    version: 1,
    fixtureId: 1,
    result,
    homeGoals: result === "home" ? 2 : 0,
    awayGoals: result === "away" ? 2 : 0,
    settledAt: KICKOFF + 7_000_000,
    forced: false,
    creditedCount: 1,
  };
}

describe("deriveStatus", () => {
  it("pre-kickoff real pick with NO score data is locked, never busted (regression)", () => {
    const derived = deriveStatus(realPick(), KICKOFF - 60_000, null, null);
    expect(derived.status).toBe("locked");
    expect(derived.homeGoals).toBeNull();
    expect(derived.awayGoals).toBeNull();
  });

  it("pre-kickoff real pick ignores a metadata score record that reads as 0-0", () => {
    // The bug: pre-match snapshots contain fixture metadata with no goals,
    // which used to be read as a 0-0 draw and busted every non-draw pick.
    const derived = deriveStatus(realPick(), KICKOFF - 60_000, scoreUpdate(0, 0), null);
    expect(derived.status).toBe("locked");
  });

  it("live pick with no score yet is provisional 0-0", () => {
    const derived = deriveStatus(realPick({ outcome: "draw" }), KICKOFF + 60_000, null, null);
    expect(derived.status).toBe("hitting");
    expect(derived.homeGoals).toBe(0);
  });

  it("live pick flips on the live score", () => {
    const derived = deriveStatus(realPick(), KICKOFF + 60_000, scoreUpdate(1, 0), null);
    expect(derived.status).toBe("hitting");
    const busted = deriveStatus(realPick(), KICKOFF + 60_000, scoreUpdate(0, 1), null);
    expect(busted.status).toBe("busted");
  });

  it("settled real pick is won/lost with credited points from the settlement record", () => {
    const won = deriveStatus(realPick(), KICKOFF + 8_000_000, scoreUpdate(0, 9), settlement("home"));
    expect(won.status).toBe("won");
    expect(won.creditedPoints).toBe(250);
    expect(won.homeGoals).toBe(2);

    const lost = deriveStatus(realPick(), KICKOFF + 8_000_000, null, settlement("away"));
    expect(lost.status).toBe("lost");
    expect(lost.creditedPoints).toBe(0);
  });

  it("replay pick reveals would-have outcome and never settles", () => {
    const pick = realPick({ demo: true });
    const derived = deriveStatus(pick, KICKOFF + 8_000_000, scoreUpdate(2, 0), settlement("home"));
    expect(derived.status).toBe("hitting");
    expect(derived.creditedPoints).toBeNull();
  });
});
