// Docs: https://txline-docs.txodds.com/documentation/scores/soccer-feed
// Stats are encoded as `period_prefix + base_key`; prefix 0 = full game total,
// used for settlement/on-chain validation of the 90-minute result market.
export const SOCCER_STAT_KEY = {
  participant1Goals: 1,
  participant2Goals: 2,
  participant1YellowCards: 3,
  participant2YellowCards: 4,
  participant1RedCards: 5,
  participant2RedCards: 6,
  participant1Corners: 7,
  participant2Corners: 8,
} as const;

export const FULL_GAME_STAT_PERIOD_PREFIX = 0;

// Game phase ID 5 = "Ended (finished)" — the signal that a fixture's
// full-time stats are final and safe to settle against.
export const GAME_PHASE_ENDED = 5;
