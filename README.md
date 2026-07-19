# Longshot

Longshot is a free-to-play World Cup prediction game where live betting odds are the gameplay mechanic. Before each match you pick the 90-minute result (home, draw, or away); every option shows a points multiplier derived from TxLINE's implied probability, so backing the underdog pays more. The odds and blockchain machinery stay invisible to players — but every pick is provably locked before kickoff on Solana, and every result is settled strictly from TxLINE's verified data.

Live: **https://longshot-web.kamigo.workers.dev** · API: `https://longshot-worker.kamigo.workers.dev` · Build log: [PROGRESS.md](PROGRESS.md)

Built for the TxODDS World Cup Hackathon. The thesis: TxLINE makes sports data tamper-evident; Longshot makes the fans tamper-evident too. Most fan-track entries use only scores — Longshot showcases the odds feed, TxODDS' crown-jewel product, as a consumer game mechanic.

## Core mechanic

Odds become multipliers. TxLINE's demargined `1X2_PARTICIPANT_RESULT` market gives an implied probability for each outcome; the multiplier is the fair payout `1 / probability` (a 1.3x favourite vs. a 6.4x longshot). When a player locks a pick, the multiplier is frozen from that instant's odds.

The lock is authoritative on the server, never the client. The browser sends only `{ identity, fixtureId, outcome }`. The worker re-fetches the odds, recomputes the multiplier itself, and stores that — a tampered client cannot award itself a better price. Picks are editable (each edit re-snapshots the odds) right up to kickoff, then they freeze.

## Trust architecture

The product's premise is that leaderboard positions are provably not retro-edited. Three properties deliver that.

**Picks freeze at kickoff.** A real pick made before kickoff can be changed until kickoff and then never again (hard rejection). This immutability is what the on-chain proof rests on. Picks made after kickoff are "replays" — practice picks at historical odds, excluded from the real leaderboard and never committed.

**Pick sets are Merkle-batched on Solana.** A few minutes after each kickoff (a delay that outruns KV's eventual consistency), a scheduled worker freezes the fixture's real pick set, builds a Merkle tree, and publishes the root in a single Solana memo transaction from an operator wallet. The leaf encoding is a fixed, versioned public contract:

```
leaf = SHA-256( "underdog.pick.v1|{fixtureId}|{identity}|{selection}|{multiplier.toFixed(2)}|{lockedAt}" )
```

Leaves are sorted lexicographically by hex hash (deterministic regardless of storage order); an odd node at any level is promoted unchanged; a parent is `SHA-256(left || right)`. The domain prefix also separates leaf preimages from internal-node preimages. The prefix is `underdog.pick.v1` — the product was named Underdog when the first commitments were published, and the prefix is permanent in those on-chain hashes; a future `v2` will realign it. Players never pay or sign a transaction: the wallet is identity only.

**Anyone can verify a pick.** `GET /api/proof` returns the leaf fields, its Merkle proof path, the published root, and the commitment transaction signature. The web app recomputes the leaf hash and folds the proof back to the root **in the browser** using the same `@underdog/commitment` code the worker used, then links the memo on an explorer. The claim it proves: *this pick provably existed, at this multiplier, before kickoff.*

**Settlement is strict, and refuses to guess.** Settlement reads only TxLINE's validated finalised result — the `game_finalised` record (status 100), with the 90-minute score taken from the first- and second-half buckets so extra time never leaks into the market. If a fixture has not finalised, or the result does not parse into an unambiguous score, the worker does not settle: it logs and retries on the next tick. There is no live-score fallback, no time-based force-settle, and no defaulting of missing data to 0-0 — **no data, no settlement.** (This rule was hardened after a real mis-settlement during the third-place match; the full post-mortem is in [PROGRESS.md](PROGRESS.md).) Points are credited from the multiplier snapshotted at lock, idempotently — re-running settlement never double-credits.

## TxLINE integration

The TxLINE layer is a standalone, UI-free package (`packages/txline`) so it can be reused — it is roughly 80% of a potential trading-track spinoff (an odds-movement alert agent). It holds the API clients and a pure engine: implied-probability and multiplier math, line-movement detection, and the score parsers (`latestGoals`, `finalResult`) that back live status and settlement.

- **Auth.** Every data request carries two credentials: a guest JWT (`POST /auth/guest/start`, 30-day) and an activated API token (`X-Api-Token`). The worker caches the JWT per isolate and renews it once on a 401.
- **Tier + activation.** Longshot runs on the free real-time World Cup tier (service level 12, mainnet). Activation is a one-time on-chain flow from the operator wallet — `subscribe(serviceLevelId, weeks)` against the TxLINE program, then a signed activation message exchanged for the API token — scripted in `scripts/txline-setup`. The tier is free; the wallet only needs a little SOL for transaction fees.
- **Endpoints used.** `/api/fixtures/snapshot` (World Cup competition), `/api/odds/snapshot/{fixtureId}` (prices are decimal odds ×1000, pre-demargined), and `/api/scores/snapshot/{fixtureId}` (live status and the finalised settlement record). TxLINE also exposes `/api/scores/stat-validation`, which returns Merkle-proof-backed stat values anchored on Solana — the natural next step for fully on-chain-verified settlement (see roadmap).

## Stack and layout

A pnpm monorepo. Frontend: React + TypeScript + Vite + Tailwind + TanStack Query, Solana wallet-adapter for Sign-In-With-Solana, Framer Motion for the settlement moments. Backend: a single Cloudflare Worker (game API + cron for commitment and settlement) with KV for storage. Solana via `@solana/web3.js`, Merkle hashing via WebCrypto so the exact same code runs in the worker and the browser.

```
packages/
  txline/        TxLINE clients + odds/score engine (UI-free, reusable)
  commitment/    Merkle leaf/tree/proof — shared by worker and browser
apps/
  web/           React app: pick flow, wallet identity, verify panel, leaderboard
  worker/        Cloudflare Worker: /api, commitment + settlement cron, KV
scripts/
  txline-setup/  ops-wallet keypair generation, subscription + activation
```

A note on storage design: KV's free-tier **list** quota is tiny, so no request or cron path performs a list. Each fixture keeps a small roster key of its pick identities; commitment, settlement, proof, and the leaderboard all read one key plus scoped point-reads. A per-fixture registry key lets the cron do one read per tick and nothing more outside a fixture's action window.

## Running locally

Requires Node 20+, pnpm, and (for wallet sign-in) a Phantom or Solflare browser wallet.

```
pnpm install

# apps/worker/.dev.vars  (gitignored) — obtain a token via scripts/txline-setup
TXLINE_BASE_URL=https://txline.txodds.com
TXLINE_API_TOKEN=...
SESSION_SECRET=...        # any 32-byte hex
OPS_KEYPAIR_JSON=[...]    # a Solana secret-key array (funded only for on-chain commits)
ADMIN_TOKEN=...           # gates the corrective re-settlement endpoint

pnpm dev:worker           # wrangler dev on :8787
pnpm dev:web              # vite on :5173
pnpm --filter @underdog/worker test   # settlement/score-pipeline unit tests
```

The worker's `TXLINE_API_TOKEN` and `OPS_KEYPAIR_JSON` come from a one-time subscription: `scripts/txline-setup/generate-keypair.mjs` creates the operator wallet, then `activate.mjs` subscribes and activates. Credentials live only in `.dev.vars` locally and as Wrangler secrets in production — never in the repo, enforced by a pre-commit secret scan.

## Limitations and roadmap

Honest current limits:

- **Settlement source.** Settlement uses TxLINE's finalised scores record, validated but not yet the Merkle-proof-anchored `stat-validation` feed. Moving to that endpoint would make settlement itself cryptographically verifiable end to end, closing the loop with the pick commitments.
- **90-minute market only.** Knockout games that go to extra time or penalties settle on the regulation result. A "winner including ET/penalties" market is a natural second market.
- **Leaderboard.** A single composite record, correct and list-free but single-region; a larger board would move to D1.
- **Wallet onboarding.** Standard wallet-adapter (extension required), not an embedded/social wallet — chosen for a self-contained build.

Roadmap:

- **Projected live standings** — a win-probability strip that shows, in-play, how the leaderboard would move on the current score.
- **Private leagues** — invite-only boards over the same commitment and settlement rails.
- **Sponsored trustless prize pools** — because picks are committed and settlement is verifiable, a sponsor can fund a pool that pays out against provable results with no trusted operator.
- **Merkle-verified settlement** — settle from `stat-validation` proofs so results are as tamper-evident as the picks.

The full chronological build log, including the settlement post-mortem and the security audit, is in [PROGRESS.md](PROGRESS.md).
