import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";

// Docs: https://txline-docs.txodds.com/documentation/examples/onchain-validation
// GET /api/scores/stat-validation returns the Merkle proof for one or more
// stats on a fixture, provable against the on-chain daily_scores_roots PDA
// (["daily_scores_roots", epochDay u16 LE]). `seq` is the score record
// sequence number and must be >= 1.
export interface StatValidationRequest {
  fixtureId: number;
  seq: number;
  statKeys: number[];
}

// Field names are as described in the docs, not yet confirmed against a live
// response — verify casing once we have an activated API token.
export interface StatValidationResponse {
  fixtureId: number;
  updateCount: number;
  eventSubtreeRoot: string;
  proofNodes: Array<{ hash: string; isLeftSibling: boolean }>;
  statsToProve: Array<{ statKey: number; value: number }>;
}

export async function getStatValidation(
  config: TxLineConfig,
  request: StatValidationRequest,
): Promise<StatValidationResponse> {
  const url = new URL(`${config.baseUrl}/api/scores/stat-validation`);
  url.searchParams.set("fixtureId", String(request.fixtureId));
  url.searchParams.set("seq", String(request.seq));
  url.searchParams.set("statKeys", request.statKeys.join(","));

  const res = await fetch(url, { headers: txLineHeaders(config) });

  if (!res.ok) {
    throw new Error(`TxLINE stat-validation request failed: ${res.status}`);
  }

  return res.json();
}
