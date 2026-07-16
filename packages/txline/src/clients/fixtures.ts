import type { TxLineConfig } from "../config";
import type { Fixture } from "../types";

// TODO: real endpoint path + response mapping once quickstart is read
export async function getFixtures(config: TxLineConfig): Promise<Fixture[]> {
  const res = await fetch(`${config.baseUrl}/fixtures`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`TxLINE fixtures request failed: ${res.status}`);
  }

  return res.json();
}
