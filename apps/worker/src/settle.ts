import {
  WORLD_CUP_COMPETITION_ID,
  getFixturesSnapshot,
  getScoresSnapshot,
  resultFromGoals,
  type Fixture,
  type Outcome,
  type ScoreUpdate,
  type TxLineConfig,
} from "@underdog/txline";

import type { Env } from "./env";
import { pickIndexKey, pickKey, type Pick } from "./picks";
import { pointsFor } from "./status";

// Settlement waits for the feed to mark the match ended (game phase 5) and
// never reads a score before 90+ minutes have elapsed. Independent from the
// commitment job: either can fail without affecting the other.
const EARLIEST_SETTLE_MS = 105 * 60 * 1000;
// If the feed never emits the ended phase, settle on its last state after
// this long — loudly, since it means trusting a stale final score.
const FORCE_SETTLE_MS = 4 * 3600 * 1000;
const LOOKBACK_MS = 120 * 3600 * 1000;
const WORLD_CUP_START_EPOCH_DAY = 20624;
const GAME_PHASE_ENDED = 5;

export interface SettlementRecord {
  version: 1;
  fixtureId: number;
  result: Outcome;
  homeGoals: number;
  awayGoals: number;
  settledAt: number;
  forced: boolean;
  creditedCount: number;
}

export interface LeaderboardRecord {
  identity: string;
  points: number;
  // fixtureId -> credited points. The presence of a key is the idempotency
  // guard: re-running settlement can never double-credit a fixture.
  credited: Record<string, number>;
}

export function settlementKey(fixtureId: number): string {
  return `settlement:${fixtureId}`;
}

export function leaderboardKey(identity: string): string {
  return `lb:${identity}`;
}

// 90-minute result: sum the half buckets so extra time in knockout games
// never leaks into the market (Total includes ET periods). Falls back to
// Total only when the update has no half buckets at all.
export function goals90(update: ScoreUpdate): { homeGoals: number; awayGoals: number } {
  const p1 = update.Score?.Participant1;
  const p2 = update.Score?.Participant2;

  const hasHalves = Boolean(p1?.H1 ?? p1?.H2 ?? p2?.H1 ?? p2?.H2);
  const p1Goals = hasHalves
    ? (p1?.H1?.Goals ?? 0) + (p1?.H2?.Goals ?? 0)
    : (p1?.Total?.Goals ?? 0);
  const p2Goals = hasHalves
    ? (p2?.H1?.Goals ?? 0) + (p2?.H2?.Goals ?? 0)
    : (p2?.Total?.Goals ?? 0);

  return update.Participant1IsHome
    ? { homeGoals: p1Goals, awayGoals: p2Goals }
    : { homeGoals: p2Goals, awayGoals: p1Goals };
}

function matchEnded(updates: ScoreUpdate[]): boolean {
  return updates.some((u) => u.StatusId === GAME_PHASE_ENDED);
}

async function realPicksFor(env: Env, fixtureId: number): Promise<Pick[]> {
  const listed = await env.PICKS.list({ prefix: `pickf:${fixtureId}:` });
  const picks: Pick[] = [];
  for (const key of listed.keys) {
    const raw = await env.PICKS.get(key.name);
    if (!raw) continue;
    const pick: Pick = JSON.parse(raw);
    if (!pick.demo) picks.push(pick);
  }
  return picks;
}

async function creditPick(env: Env, pick: Pick, result: Outcome): Promise<boolean> {
  const points = result === pick.outcome ? pointsFor(pick) : 0;
  const key = leaderboardKey(pick.userId);
  const raw = await env.PICKS.get(key);
  const record: LeaderboardRecord = raw
    ? JSON.parse(raw)
    : { identity: pick.userId, points: 0, credited: {} };

  const fixtureField = String(pick.fixtureId);
  if (record.credited[fixtureField] === undefined) {
    record.points += points;
    record.credited[fixtureField] = points;
    await env.PICKS.put(key, JSON.stringify(record));
  }

  // Display flag on the pick itself; leaf fields are untouched so committed
  // proofs still verify. Healed by re-runs if a crash lands between writes.
  if (!("settled" in pick) || !(pick as Pick & { settled?: boolean }).settled) {
    const settledPick = { ...pick, settled: true, creditedPoints: points };
    const json = JSON.stringify(settledPick);
    await Promise.all([
      env.PICKS.put(pickKey(pick.userId, pick.fixtureId), json),
      env.PICKS.put(pickIndexKey(pick.fixtureId, pick.userId), json),
    ]);
  }
  return points > 0;
}

export async function runSettlements(env: Env, config: TxLineConfig): Promise<void> {
  const now = Date.now();
  const fixtures = await getFixturesSnapshot(config, {
    competitionId: WORLD_CUP_COMPETITION_ID,
    startEpochDay: WORLD_CUP_START_EPOCH_DAY,
  });

  const due = fixtures.filter(
    (f: Fixture) =>
      now >= f.StartTime + EARLIEST_SETTLE_MS && now - f.StartTime < LOOKBACK_MS,
  );

  for (const fixture of due) {
    try {
      const existing = await env.PICKS.get(settlementKey(fixture.FixtureId));
      if (existing) continue;

      const updates = await getScoresSnapshot(config, fixture.FixtureId);
      const last = updates.at(-1);
      if (!last) {
        console.error(`SETTLEMENT: fixture ${fixture.FixtureId} has no score data past due time`);
        continue;
      }

      const ended = matchEnded(updates);
      const forced = !ended && now >= fixture.StartTime + FORCE_SETTLE_MS;
      if (!ended && !forced) continue;
      if (forced) {
        console.error(
          `SETTLEMENT: fixture ${fixture.FixtureId} never reported ended phase — force-settling on last known score`,
        );
      }

      const { homeGoals, awayGoals } = goals90(last);
      const result = resultFromGoals(homeGoals, awayGoals);

      const picks = await realPicksFor(env, fixture.FixtureId);
      let creditedCount = 0;
      for (const pick of picks) {
        if (await creditPick(env, pick, result)) creditedCount++;
      }

      const record: SettlementRecord = {
        version: 1,
        fixtureId: fixture.FixtureId,
        result,
        homeGoals,
        awayGoals,
        settledAt: now,
        forced,
        creditedCount,
      };
      await env.PICKS.put(settlementKey(fixture.FixtureId), JSON.stringify(record));
      console.log(
        `settlement: fixture ${fixture.FixtureId} ${homeGoals}-${awayGoals} (${result}), ${picks.length} picks, ${creditedCount} winners credited`,
      );
    } catch (err) {
      console.error(`SETTLEMENT FAILED for fixture ${fixture.FixtureId}:`, err);
    }
  }
}

export interface LeaderboardEntry {
  identity: string;
  points: number;
  settledPicks: number;
}

// Linked guests fold into their wallet's row at read time (display-only
// linking — stored records keep their original identity).
export async function leaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const listed = await env.PICKS.list({ prefix: "lb:" });
  const rows = new Map<string, LeaderboardEntry>();

  for (const key of listed.keys) {
    const raw = await env.PICKS.get(key.name);
    if (!raw) continue;
    const record: LeaderboardRecord = JSON.parse(raw);

    const linkedWallet = await env.PICKS.get(`link:${record.identity}`);
    const displayIdentity = linkedWallet ?? record.identity;

    const row = rows.get(displayIdentity) ?? {
      identity: displayIdentity,
      points: 0,
      settledPicks: 0,
    };
    row.points += record.points;
    row.settledPicks += Object.keys(record.credited).length;
    rows.set(displayIdentity, row);
  }

  return [...rows.values()].sort((a, b) => b.points - a.points).slice(0, 50);
}
