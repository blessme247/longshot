import {
  WORLD_CUP_COMPETITION_ID,
  fullTime1x2,
  getFixturesSnapshot,
  getOddsSnapshot,
  toMultipliers,
  type Fixture,
  type TxLineConfig,
} from "@underdog/txline";

// First World Cup epoch day with fixtures under the hackathon feed.
const WORLD_CUP_START_EPOCH_DAY = 20624;
const DEMO_FIXTURE_COUNT = 8;

export interface ApiFixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffAt: number;
  demo: boolean;
  multipliers: { home: number; draw: number; away: number } | null;
}

function homeAway(f: Fixture): { home: string; away: string } {
  return f.Participant1IsHome
    ? { home: f.Participant1, away: f.Participant2 }
    : { home: f.Participant2, away: f.Participant1 };
}

async function toApiFixture(
  config: TxLineConfig,
  fixture: Fixture,
  demo: boolean,
): Promise<ApiFixture> {
  // Demo replay of settled fixtures: quote odds as they stood at kickoff.
  // Live fixtures use current odds (no asOf).
  const odds = await getOddsSnapshot(
    config,
    fixture.FixtureId,
    demo ? fixture.StartTime : undefined,
  );
  const market = fullTime1x2(odds, fixture.Participant1IsHome);

  let multipliers: ApiFixture["multipliers"] = null;
  if (market) {
    const byOutcome = Object.fromEntries(
      toMultipliers(market).map((m) => [m.outcome, Number(m.multiplier.toFixed(2))]),
    );
    multipliers = {
      home: byOutcome.home ?? 0,
      draw: byOutcome.draw ?? 0,
      away: byOutcome.away ?? 0,
    };
  }

  return {
    fixtureId: fixture.FixtureId,
    ...homeAway(fixture),
    kickoffAt: fixture.StartTime,
    demo,
    multipliers,
  };
}

export async function listFixtures(config: TxLineConfig): Promise<ApiFixture[]> {
  const fixtures = await getFixturesSnapshot(config, {
    competitionId: WORLD_CUP_COMPETITION_ID,
    startEpochDay: WORLD_CUP_START_EPOCH_DAY,
  });

  const now = Date.now();
  const upcoming = fixtures
    .filter((f) => f.StartTime > now)
    .sort((a, b) => a.StartTime - b.StartTime);
  const settled = fixtures
    .filter((f) => f.StartTime <= now)
    .sort((a, b) => b.StartTime - a.StartTime)
    .slice(0, DEMO_FIXTURE_COUNT);

  const results = await Promise.all([
    ...upcoming.map((f) => toApiFixture(config, f, false)),
    ...settled.map((f) => toApiFixture(config, f, true)),
  ]);

  return results.filter((f) => f.multipliers !== null);
}

export async function getFixtureById(
  config: TxLineConfig,
  fixtureId: number,
): Promise<Fixture | null> {
  const fixtures = await getFixturesSnapshot(config, {
    competitionId: WORLD_CUP_COMPETITION_ID,
    startEpochDay: WORLD_CUP_START_EPOCH_DAY,
  });
  return fixtures.find((f) => f.FixtureId === fixtureId) ?? null;
}
