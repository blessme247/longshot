import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";
import type { OddsEntry } from "../types";

// Without asOf the API returns only currently-active odds (empty for
// finished fixtures); pass an epoch-ms timestamp for a point-in-time view.
export async function getOddsSnapshot(
  config: TxLineConfig,
  fixtureId: number,
  asOf?: number,
): Promise<OddsEntry[]> {
  const url = new URL(`${config.baseUrl}/api/odds/snapshot/${fixtureId}`);
  if (asOf !== undefined) url.searchParams.set("asOf", String(asOf));

  const res = await fetch(url, { headers: txLineHeaders(config) });
  if (!res.ok) {
    throw new Error(`TxLINE odds request failed: ${res.status}`);
  }

  return res.json();
}

// Live odds are also available as an SSE stream at {baseUrl}/api/odds/stream
// (Authorization + X-Api-Token headers, Accept-Encoding: deflate). Consumed
// by the worker's polling/streaming layer, not modeled here.
