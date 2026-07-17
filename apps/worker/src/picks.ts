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

import type { Env } from "./env";
import { getFixtureById } from "./fixtures";

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
const OUTCOMES: Outcome[] = ["home", "draw", "away"];

function pickKey(userId: string, fixtureId: number): string {
  return `pick:${userId}:${fixtureId}`;
}

export async function lockPick(
  env: Env,
  config: TxLineConfig,
  body: { userId: string; fixtureId: number; outcome: Outcome },
): Promise<{ pick: Pick } | { error: string; status: number }> {
  const { userId, fixtureId, outcome } = body;
  if (!userId || !Number.isInteger(fixtureId) || !OUTCOMES.includes(outcome)) {
    return { error: "userId, fixtureId and outcome (home|draw|away) required", status: 400 };
  }

  const existing = await env.PICKS.get(pickKey(userId, fixtureId));
  if (existing) {
    return { error: "pick already locked for this fixture", status: 409 };
  }

  const fixture = await getFixtureById(config, fixtureId);
  if (!fixture) {
    return { error: "unknown fixture", status: 404 };
  }

  const demo = fixture.StartTime <= Date.now();
  if (!demo && fixture.StartTime <= Date.now()) {
    return { error: "fixture already kicked off", status: 409 };
  }

  // Server-side odds snapshot at lock time is the source of truth — the
  // client never supplies odds. Demo replays settled fixtures at kickoff.
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
    userId,
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

  await env.PICKS.put(pickKey(userId, fixtureId), JSON.stringify(pick));
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

export async function listPicks(
  env: Env,
  config: TxLineConfig,
  userId: string,
): Promise<ApiPick[]> {
  const listed = await env.PICKS.list({ prefix: `pick:${userId}:` });
  const picks: Pick[] = [];
  for (const key of listed.keys) {
    const raw = await env.PICKS.get(key.name);
    if (raw) picks.push(JSON.parse(raw));
  }

  const withStatuses = await Promise.all(picks.map((p) => withStatus(config, p)));
  return withStatuses.sort((a, b) => b.lockedAt - a.lockedAt);
}
