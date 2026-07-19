import {
  finalResult,
  getScoresSnapshot,
  resultFromGoals,
  type Outcome,
  type TxLineConfig,
} from "@underdog/txline";

import type { Env } from "./env";
import { pickIndexKey, pickKey, rosterPicks, type Pick } from "./picks";
import { updateRegistryEntry, type RegistryEntry } from "./registry";
import { pointsFor } from "./status";

// Don't even look before 90+ minutes have elapsed. Actual settlement waits
// for TxLINE's validated finalised result (see finalResult); there is NO
// time-based force-settle and NO fallback to live scores — no data, no
// settlement. Independent failure domain from commitments.
const EARLIEST_SETTLE_MS = 105 * 60 * 1000;
const BOARD_KEY = "board:v1";

export interface SettlementRecord {
  version: 1;
  fixtureId: number;
  result: Outcome;
  homeGoals: number;
  awayGoals: number;
  settledAt: number;
  creditedCount: number;
  // Set on a record that a correction superseded; kept in KV for audit.
  voided?: boolean;
  voidedReason?: string;
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

async function realPicksFor(env: Env, fixtureId: number): Promise<Pick[]> {
  return (await rosterPicks(env, fixtureId)).filter((p) => !p.demo);
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
// Rows are keyed by raw identity with the link-resolved display identity
// stamped at settlement time (and re-stamped by linkGuest on late links),
// so serving the board never aggregates KV keys per request.
export interface BoardRow {
  identity: string;
  displayIdentity: string;
  points: number;
  won: number;
  played: number;
}

export async function readBoardRows(env: Env): Promise<BoardRow[]> {
  const raw = await env.PICKS.get(BOARD_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function writeBoardRows(env: Env, rows: BoardRow[]): Promise<void> {
  await env.PICKS.put(BOARD_KEY, JSON.stringify(rows));
}

async function mergeBoard(env: Env, updated: LeaderboardRecord[]): Promise<void> {
  if (updated.length === 0) return;
  const rows = await readBoardRows(env);
  const byIdentity = new Map(rows.map((r) => [r.identity, r]));

  for (const record of updated) {
    const linkedWallet = await env.PICKS.get(`link:${record.identity}`);
    const creditedValues = Object.values(record.credited);
    byIdentity.set(record.identity, {
      identity: record.identity,
      displayIdentity: linkedWallet ?? record.identity,
      points: record.points,
      won: creditedValues.filter((p) => p > 0).length,
      played: creditedValues.length,
    });
  }

  await writeBoardRows(env, [...byIdentity.values()].slice(0, 200));
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

      // The ONLY settlement source: TxLINE's validated finalised 90-minute
      // result. If the fixture hasn't finalised, or the result doesn't parse
      // into an unambiguous score, do not settle — log and retry next tick.
      // No live-score fallback, no time-based force, no 0-0 default.
      const final = finalResult(updates);
      if (!final) {
        console.error(
          `SETTLEMENT: fixture ${fixtureId} not finalised / unparseable result — leaving unsettled, will retry`,
        );
        continue;
      }

      const { homeGoals, awayGoals } = final;
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

// Guarded correction (item 4): void an incorrect settlement, re-settle from
// the validated finalised result, and rebuild the affected leaderboard rows
// from the per-identity credited maps. Idempotent — re-running with the same
// result produces zero deltas. Env-gated at the router, never public. Pick
// records and committed leaves are never touched, so proofs are unaffected.
export async function resettleFixture(
  env: Env,
  config: TxLineConfig,
  fixtureId: number,
): Promise<{ result: Outcome; homeGoals: number; awayGoals: number; corrected: number } | { error: string; status: number }> {
  const updates = await getScoresSnapshot(config, fixtureId);
  const final = finalResult(updates);
  if (!final) return { error: "fixture not finalised — cannot re-settle", status: 409 };
  const result = resultFromGoals(final.homeGoals, final.awayGoals);

  const oldRaw = await env.PICKS.get(settlementKey(fixtureId));
  if (oldRaw) {
    const old: SettlementRecord = JSON.parse(oldRaw);
    if (!(old.result === result && old.homeGoals === final.homeGoals && old.awayGoals === final.awayGoals)) {
      await env.PICKS.put(
        `settlement:${fixtureId}:voided:${old.settledAt}`,
        JSON.stringify({ ...old, voided: true, voidedReason: `superseded by correction to ${final.homeGoals}-${final.awayGoals} (${result})` }),
      );
    }
  }

  const picks = await realPicksFor(env, fixtureId);
  const field = String(fixtureId);
  const updatedRecords: LeaderboardRecord[] = [];
  let creditedCount = 0;
  for (const pick of picks) {
    const key = leaderboardKey(pick.userId);
    const raw = await env.PICKS.get(key);
    const record: LeaderboardRecord = raw
      ? JSON.parse(raw)
      : { identity: pick.userId, points: 0, credited: {} };
    const oldPoints = record.credited[field] ?? 0;
    const newPoints = result === pick.outcome ? pointsFor(pick) : 0;
    record.points += newPoints - oldPoints;
    record.credited[field] = newPoints;
    await env.PICKS.put(key, JSON.stringify(record));
    updatedRecords.push(record);
    if (newPoints > 0) creditedCount++;

    // Correct the display flag on the pick record (leaf fields untouched).
    const settledPick = { ...pick, settled: true, creditedPoints: newPoints };
    const json = JSON.stringify(settledPick);
    await env.PICKS.put(pickKey(pick.userId, fixtureId), json);
    await env.PICKS.put(pickIndexKey(fixtureId, pick.userId), json);
  }
  await mergeBoard(env, updatedRecords);

  const record: SettlementRecord = {
    version: 1,
    fixtureId,
    result,
    homeGoals: final.homeGoals,
    awayGoals: final.awayGoals,
    settledAt: Date.now(),
    creditedCount,
  };
  await env.PICKS.put(settlementKey(fixtureId), JSON.stringify(record));
  await updateRegistryEntry(env, fixtureId, { settled: true });
  console.log(`RESETTLE: fixture ${fixtureId} corrected to ${final.homeGoals}-${final.awayGoals} (${result}), ${creditedCount} winners`);

  return { result, homeGoals: final.homeGoals, awayGoals: final.awayGoals, corrected: picks.length };
}

export interface LeaderboardEntry {
  identity: string;
  points: number;
  won: number;
  played: number;
}

// One KV GET per request, full stop. Rows already carry their resolved
// display identity; grouping linked guest + wallet rows is pure in-memory.
export async function leaderboard(env: Env): Promise<LeaderboardEntry[]> {
  const stored = await readBoardRows(env);

  const rows = new Map<string, LeaderboardEntry>();
  for (const row of stored) {
    const entry = rows.get(row.displayIdentity) ?? {
      identity: row.displayIdentity,
      points: 0,
      won: 0,
      played: 0,
    };
    entry.points += row.points;
    entry.won += row.won;
    entry.played += row.played;
    rows.set(row.displayIdentity, entry);
  }

  return [...rows.values()].sort((a, b) => b.points - a.points).slice(0, 50);
}
