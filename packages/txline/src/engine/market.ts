import type { OddsEntry, OutcomeOdds } from "../types";

const FULL_TIME_1X2 = "1X2_PARTICIPANT_RESULT";

/**
 * Picks the latest full-match 1X2 entry from an odds snapshot and maps it to
 * home/draw/away decimal odds. MarketPeriod null = full match ("half=1" etc.
 * are period markets); Prices are decimal odds x1000; part1/part2 map to
 * home/away via participant1IsHome from the fixture.
 */
export function fullTime1x2(
  entries: OddsEntry[],
  participant1IsHome: boolean,
): OutcomeOdds[] | null {
  const candidates = entries.filter(
    (e) =>
      e.SuperOddsType === FULL_TIME_1X2 &&
      e.MarketPeriod === null &&
      e.MarketParameters === null,
  );
  if (candidates.length === 0) return null;

  const latest = candidates.reduce((a, b) => (b.Ts > a.Ts ? b : a));

  const priceFor = (name: string): number | null => {
    const i = latest.PriceNames.indexOf(name);
    const price = i === -1 ? undefined : latest.Prices[i];
    return price === undefined ? null : price / 1000;
  };

  const part1 = priceFor("part1");
  const draw = priceFor("draw");
  const part2 = priceFor("part2");
  if (part1 === null || draw === null || part2 === null) return null;

  return [
    { outcome: "home", decimalOdds: participant1IsHome ? part1 : part2 },
    { outcome: "draw", decimalOdds: draw },
    { outcome: "away", decimalOdds: participant1IsHome ? part2 : part1 },
  ];
}
