import {
  currentGoals,
  fullTime1x2,
  getOddsSnapshot,
  getScoresSnapshot,
  resultFromGoals,
  toMultipliers,
  type Outcome,
  type TxLineConfig,
} from "@underdog/txline";

import { linkedGuestIds } from "./auth";
import type { Env } from "./env";
import { getFixtureById } from "./fixtures";
import { isValidIdentity } from "./identity";

export interface Pick {
  userId: string;
  fixtureId: number;
  outcome: Outcome;
  multiplier: number;
  decimalOdds: number;
  lockedAt: number;
  demo: boolean;
  home: string;
  away: string;
  kickoffAt: number;
}

export type PickStatus = "pending" | "hitting" | "busted";

export interface ApiPick extends Pick {
  status: PickStatus;
  homeGoals: number | null;
  awayGoals: number | null;
  potentialPoints: number;
}

const BASE_POINTS = 100;

export function pickKey(identity: string, fixtureId: number): string {
  return `pick:${identity}:${fixtureId}`;
}

// Fixture-first index so the commitment job reads one prefix per fixture
// instead of scanning every identity-first key (KV list is eventually
// consistent; commit.ts explains the timing this pairs with). Written
// synchronously with the pick in the same request.
export function pickIndexKey(fixtureId: number, identity: string): string {
  return `pickf:${fixtureId}:${identity}`;
}

export async function upsertPick(
  env: Env,
  config: TxLineConfig,
  identity: string,
  body: { fixtureId: number; outcome: Outcome },
): Promise<{ pick: Pick } | { error: string; status: number }> {
  const { fixtureId, outcome } = body;

  if (!isValidIdentity(identity)) {
    return { error: "identity must be a wallet pubkey or guest UUID", status: 400 };
  }

  const fixture = await getFixtureById(config, fixtureId);
  if (!fixture) {
    return { error: "unknown fixture", status: 404 };
  }

  const kickedOff = fixture.StartTime <= Date.now();
  const existingRaw = await env.PICKS.get(pickKey(identity, fixtureId));
  const existing: Pick | null = existingRaw ? JSON.parse(existingRaw) : null;

  // Real picks freeze at kickoff — this gate is what makes the committed
  // Merkle leaves immutable. Replay (demo) picks never enter a commitment,
  // so they stay editable.
  if (kickedOff && existing && !existing.demo) {
    return { error: "pick is frozen — fixture has kicked off", status: 409 };
  }

  const demo = kickedOff;

  // Every create/change re-snapshots odds server-side at this moment; a
  // stale multiplier is never carried across a change and the client never
  // supplies odds.
  const odds = await getOddsSnapshot(config, fixtureId, demo ? fixture.StartTime : undefined);
  const market = fullTime1x2(odds, fixture.Participant1IsHome);
  if (!market) {
    return { error: "no odds available for this fixture", status: 409 };
  }

  const multiplier = toMultipliers(market).find((m) => m.outcome === outcome);
  if (!multiplier) {
    return { error: "no odds for that outcome", status: 409 };
  }

  const pick: Pick = {
    userId: identity,
    fixtureId,
    outcome,
    multiplier: Number(multiplier.multiplier.toFixed(2)),
    decimalOdds: multiplier.decimalOdds,
    lockedAt: Date.now(),
    demo,
    home: fixture.Participant1IsHome ? fixture.Participant1 : fixture.Participant2,
    away: fixture.Participant1IsHome ? fixture.Participant2 : fixture.Participant1,
    kickoffAt: fixture.StartTime,
  };

  const json = JSON.stringify(pick);
  await Promise.all([
    env.PICKS.put(pickKey(identity, fixtureId), json),
    env.PICKS.put(pickIndexKey(fixtureId, identity), json),
  ]);
  return { pick };
}

async function withStatus(config: TxLineConfig, pick: Pick): Promise<ApiPick> {
  const asOf = pick.demo ? pick.kickoffAt + 3 * 3600 * 1000 : undefined;

  let status: PickStatus = "pending";
  let homeGoals: number | null = null;
  let awayGoals: number | null = null;

  try {
    const scores = await getScoresSnapshot(config, pick.fixtureId, asOf);
    const last = scores.at(-1);
    if (last) {
      const goals = currentGoals(last);
      homeGoals = goals.homeGoals;
      awayGoals = goals.awayGoals;
      status = resultFromGoals(goals.homeGoals, goals.awayGoals) === pick.outcome ? "hitting" : "busted";
    }
  } catch {
    // Scores unavailable — leave the pick pending rather than failing the list.
  }

  return {
    ...pick,
    status,
    homeGoals,
    awayGoals,
    potentialPoints: Math.round(BASE_POINTS * pick.multiplier),
  };
}

async function picksForIdentity(env: Env, identity: string): Promise<Pick[]> {
  const listed = await env.PICKS.list({ prefix: `pick:${identity}:` });
  const picks: Pick[] = [];
  for (const key of listed.keys) {
    const raw = await env.PICKS.get(key.name);
    if (raw) picks.push(JSON.parse(raw));
  }
  return picks;
}

// Authenticated reads merge linked guest picks with the wallet's own
// (display-only linking — records keep their original identity forever).
// One pick per fixture in the response; the wallet's own pick wins.
export async function listPicks(
  env: Env,
  config: TxLineConfig,
  identity: string,
  includeLinked: boolean,
): Promise<ApiPick[]> {
  const identities = includeLinked
    ? [...(await linkedGuestIds(env, identity)), identity]
    : [identity];

  const byFixture = new Map<number, Pick>();
  for (const id of identities) {
    for (const pick of await picksForIdentity(env, id)) {
      byFixture.set(pick.fixtureId, pick);
    }
  }

  const withStatuses = await Promise.all([...byFixture.values()].map((p) => withStatus(config, p)));
  return withStatuses.sort((a, b) => b.lockedAt - a.lockedAt);
}
