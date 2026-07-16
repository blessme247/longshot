import type { TxLineConfig } from "../config";
import { txLineHeaders } from "../config";

// Docs: https://txline-docs.txodds.com/documentation/odds/overview,
// https://txline-docs.txodds.com/documentation/odds/odds-coverage
// The docs explicitly warn not to assume market/field names ("SuperOddsType")
// without inspecting a live response, so this stays untyped until we've hit
// the endpoint with a real API token and can model the actual payload.
export type RawOddsSnapshot = unknown;

export async function getOddsSnapshot(config: TxLineConfig, fixtureId: string): Promise<RawOddsSnapshot> {
  const res = await fetch(`${config.baseUrl}/api/odds/snapshot/${fixtureId}`, {
    headers: txLineHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`TxLINE odds request failed: ${res.status}`);
  }

  return res.json();
}

// epochDay/hourOfDay/interval windowing for historical odds-movement backfill.
export async function getOddsUpdates(
  config: TxLineConfig,
  epochDay: number,
  hourOfDay: number,
  interval: number,
): Promise<RawOddsSnapshot> {
  const res = await fetch(`${config.baseUrl}/api/odds/updates/${epochDay}/${hourOfDay}/${interval}`, {
    headers: txLineHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`TxLINE odds updates request failed: ${res.status}`);
  }

  return res.json();
}
