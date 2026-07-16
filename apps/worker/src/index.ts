import { toMultipliers } from "@underdog/txline";

export default {
  async fetch(): Promise<Response> {
    const sample = toMultipliers([
      { fixtureId: "health", market: "90min_result", outcome: "home", decimalOdds: 1.3, observedAt: new Date().toISOString() },
      { fixtureId: "health", market: "90min_result", outcome: "draw", decimalOdds: 4.5, observedAt: new Date().toISOString() },
      { fixtureId: "health", market: "90min_result", outcome: "away", decimalOdds: 6.2, observedAt: new Date().toISOString() },
    ]);

    return Response.json({ status: "ok", sample });
  },
};
