import type { TxLineConfig } from "../config";
import type { Settlement } from "../types";

// TODO: real endpoint path + Merkle-proof field mapping once quickstart is read
// (open unknown: does TxLINE expose a proof-verification endpoint, or only the proof itself?)
export async function getSettlement(config: TxLineConfig, fixtureId: string): Promise<Settlement> {
  const res = await fetch(`${config.baseUrl}/fixtures/${fixtureId}/settlement`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`TxLINE settlement request failed: ${res.status}`);
  }

  return res.json();
}
