import { toMultipliers } from "@underdog/txline";

export default {
  async fetch(): Promise<Response> {
    const sample = toMultipliers([
      { outcome: "home", decimalOdds: 1.3 },
      { outcome: "draw", decimalOdds: 4.5 },
      { outcome: "away", decimalOdds: 6.2 },
    ]);

    return Response.json({ status: "ok", sample });
  },
};
