import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";
import type { ScoreUpdate } from "../types";

// Returns the score-event history up to asOf (epoch ms) or now. The last
// entry carries the current Seq (needed for stat-validation) and Score totals.
export async function getScoresSnapshot(
  config: TxLineConfig,
  fixtureId: number,
  asOf?: number,
): Promise<ScoreUpdate[]> {
  const url = new URL(`${config.baseUrl}/api/scores/snapshot/${fixtureId}`);
  if (asOf !== undefined) url.searchParams.set("asOf", String(asOf));

  const res = await fetch(url, { headers: txLineHeaders(config) });
  if (!res.ok) {
    throw new Error(`TxLINE scores request failed: ${res.status}`);
  }

  return res.json();
}

// {baseUrl}/api/scores/updates/{fixtureId} is an SSE stream
// (content-type: text/event-stream), not JSON — consume it with an
// EventSource-style client, same auth headers as above.
