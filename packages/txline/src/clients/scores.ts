import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";

// Docs: https://txline-docs.txodds.com/documentation/scores/overview,
// https://txline-docs.txodds.com/documentation/examples/streaming-data
// Confirmed fields on historical score records: seq, ts, gameState (see
// stat-keys.ts for GAME_PHASE_ENDED). Per-stat values are not enumerated in
// the doc excerpt, so the payload stays loosely typed until inspected live.
export interface RawScoreUpdate {
  seq: number;
  ts: string;
  gameState: number;
  [key: string]: unknown;
}

export async function getScoreSnapshot(config: TxLineConfig, fixtureId: string): Promise<RawScoreUpdate> {
  const res = await fetch(`${config.baseUrl}/api/scores/snapshot/${fixtureId}`, {
    headers: txLineHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`TxLINE score snapshot request failed: ${res.status}`);
  }

  return res.json();
}

export async function getScoreUpdates(config: TxLineConfig, fixtureId: string): Promise<RawScoreUpdate[]> {
  const res = await fetch(`${config.baseUrl}/api/scores/updates/${fixtureId}`, {
    headers: txLineHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`TxLINE score updates request failed: ${res.status}`);
  }

  return res.json();
}
