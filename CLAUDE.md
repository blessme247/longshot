# Underdog — Odds-Weighted World Cup Prediction Game

## Context
Solo 3-day build for the TxODDS World Cup Hackathon on Superteam Earn.
- Primary track: **Consumer & Fan Experiences** (16k USDT pool, 10k 1st) — https://superteam.fun/earn/listing/consumer-and-fan-experiences
- Secondary (optional, day 3 decision): **Trading Tools & Agents** — extract the TxLINE data layer into an odds-movement alert agent as a second submission.
- Deadline: **July 19, 2026** (World Cup final day). Remaining live matches: third-place match (July 18) and the final (July 19). Use these for the demo video; use settled fixtures for backfilled/demo data.
- Judge: TxODDS. Integration depth with their TxLINE API is the implicit rubric.
- TxLINE docs: https://txline-docs.txodds.com/documentation/quickstart — hackathon access is free. Support: https://t.me/TxLINEChat
- TxLINE provides fixtures, live odds, live scores, and verified settlement data; every data point is anchored on Solana via Merkle proofs.

## Product
Free-to-play prediction game. Live odds are the gameplay mechanic; all odds/blockchain machinery stays invisible to users.

Core loop:
1. Before kickoff, user picks a 90-minute result (home/draw/away). Every option shows a live points multiplier derived from TxLINE implied probability (e.g. underdog 6.2x vs favourite 1.3x). Label every pick card "Result after 90 mins" — knockout games can go to extra time/penalties and copy must be unambiguous.
2. On lock: freeze the multiplier at that moment's odds, and commit a hash of the pick on-chain (Solana memo tx or PDA) so leaderboard positions are provably not retro-edited. Wallet must be one-tap/embedded — no seed-phrase friction for casual fans.
3. During the match: provisional "currently hitting / currently busted" state from TxLINE live scores, with potential points swinging in real time.
4. Full time: settle ONLY against TxLINE's settlement feed (never the live scoreboard). Credit points, update global leaderboard. Fast on-screen settlement is a demo-video moment.
5. Trophies: mint streak/final-rank as compressed NFTs.

## Winning narrative (for README + demo video)
"TxLINE makes the data tamper-evident; we make the fans tamper-evident." Verifiable picks + verified settlement mirrors TxLINE's own trustlessness pitch. Most fan-track entries will use only scores; we showcase the odds feed — TxODDS' crown-jewel product — as a consumer game mechanic.

## Architecture rules
- **The TxLINE integration layer MUST be a standalone package** (`packages/txline` or similar): fixtures/odds/scores/settlement clients, implied-probability + multiplier engine, line-movement detection. This is 80% of the potential trading-track spinoff — keep it UI-free and reusable.
- Frontend: React + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query (`keepPreviousData` for time-sensitive queries). Monorepo with pnpm.
- Solana: @solana/wallet-adapter patterns; prefer an embedded-wallet option for onboarding. Mainnet if TxLINE anchoring requires it, otherwise devnet is acceptable for pick commitments — decide after reading TxLINE docs.
- Backend: minimal. Cloudflare Workers (wrangler) preferred for polling TxLINE, snapshotting odds at lock time, settlement processing, and leaderboard storage (KV/D1). Server is the source of truth for locked multipliers — never trust client-supplied odds.
- Settlement definition: 90-minute result market only for v1.

## 3-day plan
- **Day 1:** TxLINE access + quickstart; standalone data package (fixtures, live odds, scores); pick flow UI; odds-snapshot scoring engine.
- **Day 2:** Wallet connect; on-chain pick commitment; settlement worker against TxLINE settlement feed; leaderboard; "verify this pick" view linking the on-chain proof.
- **Day 3:** cNFT trophies; live win-probability strip; polish; demo video; submission writeup. Decide on trading-track spinoff (~half day: chat/alert agent over the shared data package).

## Open unknowns (resolve first)
1. TxLINE hackathon auth flow and exact endpoint shapes — read quickstart before writing any client code.
2. Whether TxLINE exposes Merkle-proof verification endpoints usable in the "verify this pick" view.
3. Remaining-match coverage: confirm the feed serves the July 18–19 fixtures live under hackathon access.

## Conventions
- Production-grade, maintainable code. No unnecessary comments. No over-engineering.
- Plan before implementing; small verifiable steps; commit frequently — there is no slack in this timeline.