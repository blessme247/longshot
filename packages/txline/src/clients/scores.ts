import type { TxLineConfig } from "../config";
import type { LiveScore } from "../types";

// TODO: real endpoint path + response mapping once quickstart is read
export async function getLiveScore(config: TxLineConfig, fixtureId: string): Promise<LiveScore> {
  const res = await fetch(`${config.baseUrl}/fixtures/${fixtureId}/score`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`TxLINE score request failed: ${res.status}`);
  }

  return res.json();
}
