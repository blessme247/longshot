import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";
import type { Fixture } from "../types";

// Docs: https://txline-docs.txodds.com/documentation/examples/fetching-snapshots
interface RawFixture {
  FixtureId: string;
  Participant1: string;
  Participant2: string;
  Participant1IsHome: boolean;
  StartTime: string;
  GameState: string;
}

function toFixture(raw: RawFixture): Fixture {
  return {
    id: raw.FixtureId,
    kickoffAt: raw.StartTime,
    home: raw.Participant1IsHome ? raw.Participant1 : raw.Participant2,
    away: raw.Participant1IsHome ? raw.Participant2 : raw.Participant1,
    gameState: raw.GameState,
  };
}

export async function getFixtures(config: TxLineConfig, competitionId?: string): Promise<Fixture[]> {
  const url = new URL(`${config.baseUrl}/api/fixtures/snapshot`);
  if (competitionId) url.searchParams.set("competitionId", competitionId);

  const res = await fetch(url, { headers: txLineHeaders(config) });

  if (!res.ok) {
    throw new Error(`TxLINE fixtures request failed: ${res.status}`);
  }

  const raw: RawFixture[] = await res.json();
  return raw.map(toFixture);
}
