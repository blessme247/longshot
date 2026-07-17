import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";
import type { Fixture } from "../types";

export interface FixturesQuery {
  competitionId?: number;
  startEpochDay?: number;
}

export async function getFixturesSnapshot(
  config: TxLineConfig,
  query: FixturesQuery = {},
): Promise<Fixture[]> {
  const url = new URL(`${config.baseUrl}/api/fixtures/snapshot`);
  if (query.competitionId !== undefined) {
    url.searchParams.set("competitionId", String(query.competitionId));
  }
  if (query.startEpochDay !== undefined) {
    url.searchParams.set("startEpochDay", String(query.startEpochDay));
  }

  const res = await fetch(url, { headers: txLineHeaders(config) });
  if (!res.ok) {
    throw new Error(`TxLINE fixtures request failed: ${res.status}`);
  }

  return res.json();
}
