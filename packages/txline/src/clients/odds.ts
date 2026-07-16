import type { TxLineConfig } from "../config";
import type { OddsQuote } from "../types";

// TODO: real endpoint path + response mapping once quickstart is read
export async function getLiveOdds(config: TxLineConfig, fixtureId: string): Promise<OddsQuote[]> {
  const res = await fetch(`${config.baseUrl}/fixtures/${fixtureId}/odds`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`TxLINE odds request failed: ${res.status}`);
  }

  return res.json();
}
