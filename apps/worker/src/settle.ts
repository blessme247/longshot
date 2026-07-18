import {
  getScoresSnapshot,
  resultFromGoals,
  type Outcome,
  type ScoreUpdate,
  type TxLineConfig,
} from "@underdog/txline";

import type { Env } from "./env";
import { pickIndexKey, pickKey, type Pick } from "./picks";
import { updateRegistryEntry, type RegistryEntry } from "./registry";
import { pointsFor } from "./status";

// Settlement waits for the feed to mark the match ended (game phase 5) and
// never reads a score before 90+ minutes have elapsed. Independent from the
// commitment job: either can fail without affecting the other.
const EARLIEST_SETTLE_MS = 105 * 60 * 1000;
// If the feed never emits the ended phase, settle on its last state after
// this long — loudly, since it means trusting a stale final score.
const FORCE_SETTLE_MS = 4 * 3600 * 1000;
const GAME_PHASE_ENDED = 5;
const BOARD_KEY = "board:v1";

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

async function creditPick(env: Env, pick: Pick, result: Outcome): Promise<LeaderboardRecord> {
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
  return record;
}

// The public board is one composite key (single GET to serve, zero lists);
// lb:{identity} records stay the per-identity crediting source of truth.
async function mergeBoard(env: Env, updated: LeaderboardRecord[]): Promise<void> {
  if (updated.length === 0) return;
  const raw = await env.PICKS.get(BOARD_KEY);
  const rows: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];
  const byIdentity = new Map(rows.map((r) => [r.identity, r]));

  for (const record of updated) {
    byIdentity.set(record.identity, {
      identity: record.identity,
      points: record.points,
      settledPicks: Object.keys(record.credited).length,
    });
  }

  const merged = [...byIdentity.values()].sort((a, b) => b.points - a.points).slice(0, 100);
  await env.PICKS.put(BOARD_KEY, JSON.stringify(merged));
}

// Registry entries are the only work source — no fixture-feed scans, no
// KV lists outside a due fixture's settlement window.
export async function runSettlements(
  env: Env,
  config: TxLineConfig,
  entries: RegistryEntry[],
): Promise<void> {
  const now = Date.now();
  const due = entries.filter((e) => !e.settled && now >= e.kickoffAt + EARLIEST_SETTLE_MS);

  for (const entry of due) {
    const fixtureId = entry.fixtureId;
    try {
      const existing = await env.PICKS.get(settlementKey(fixtureId));
      if (existing) {
        await updateRegistryEntry(env, fixtureId, { settled: true });
        continue;
      }

      const updates = await getScoresSnapshot(config, fixtureId);
      const last = updates.at(-1);
      if (!last) {
        console.error(`SETTLEMENT: fixture ${fixtureId} has no score data past due time`);
        continue;
      }

      const ended = matchEnded(updates);
      const forced = !ended && now >= entry.kickoffAt + FORCE_SETTLE_MS;
      if (!ended && !forced) continue;
      if (forced) {
        console.error(
          `SETTLEMENT: fixture ${fixtureId} never reported ended phase — force-settling on last known score`,
        );
      }

      const { homeGoals, awayGoals } = goals90(last);
      const result = resultFromGoals(homeGoals, awayGoals);

      const picks = await realPicksFor(env, fixtureId);
      const updatedRecords: LeaderboardRecord[] = [];
      let creditedCount = 0;
      for (const pick of picks) {
        const record = await creditPick(env, pick, result);
        updatedRecords.push(record);
        if ((record.credited[String(fixtureId)] ?? 0) > 0) creditedCount++;
      }
      await mergeBoard(env, updatedRecords);

      const record: SettlementRecord = {
        version: 1,
        fixtureId,
        result,
        homeGoals,
        awayGoals,
        settledAt: now,
        forced,
        creditedCount,
      };
      await env.PICKS.put(settlementKey(fixtureId), JSON.stringify(record));
      await updateRegistryEntry(env, fixtureId, { settled: true });
      console.log(
        `settlement: fixture ${fixtureId} ${homeGoals}-${awayGoals} (${result}), ${picks.length} picks, ${creditedCount} winners credited`,
      );
    } catch (err) {
      console.error(`SETTLEMENT FAILED for fixture ${fixtureId}:`, err);
    }
  }
}

export interface LeaderboardEntry {
  identity: string;
  points: number;
  settledPicks: number;
}

// One GET for the board plus one link lookup per row (reads are cheap on
// the free tier; lists are not — this endpoint performs zero lists).
// Linked guests fold into their wallet's row at read time.
export async function leaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const raw = await env.PICKS.get(BOARD_KEY);
  const stored: LeaderboardEntry[] = raw ? JSON.parse(raw) : [];

  const rows = new Map<string, LeaderboardEntry>();
  for (const entry of stored) {
    const linkedWallet = await env.PICKS.get(`link:${entry.identity}`);
    const displayIdentity = linkedWallet ?? entry.identity;
    const row = rows.get(displayIdentity) ?? { identity: displayIdentity, points: 0, settledPicks: 0 };
    row.points += entry.points;
    row.settledPicks += entry.settledPicks;
    rows.set(displayIdentity, row);
  }

  return [...rows.values()].sort((a, b) => b.points - a.points).slice(0, 50);
}
