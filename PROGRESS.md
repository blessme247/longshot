# Progress

Terse changelog, newest first. One entry per meaningful change: what, why, decisions/tradeoffs.

## 2026-07-18 — INCIDENT: France v England mis-settled as 0-0 draw (real result 4-6, England won)

**Impact:** the fixture ended France 4–6 England (away win) in regulation. Our system displayed 0-0 the whole match and settled DRAW as the winning outcome, crediting ~425–427 pts to draw-pickers. For a product whose entire pitch is trustworthy settlement, this is the worst-case failure. No smoothing below.

**Timeline (UTC, reconstructed from the KV settlement record + the raw TxLINE scores snapshot; live `wrangler tail` only shows real-time so past ticks weren't retrievable, but the data sources are conclusive):**
- 21:00:00 kickoff.
- 23:01:30 TxLINE scores feed carries the 4–6 goals (Seq 1189, `Action: goal`).
- 23:01:42 feed emits a `StatusId: 5` record (Seq 1192, `Action: status`) — my `matchEnded()` treated StatusId 5 as "ended", so the settlement gate opened. But those StatusId-5 records carry NO `Score`.
- 23:02:02 **settlement ran and wrote the wrong record.** Earliest-settle was kickoff+105min (22:45); it fired on the first cron tick after StatusId 5 appeared. It read the scores via `getScoresSnapshot(...).at(-1)`.
- 23:06:54 the authoritative `game_finalised` record (Seq 1195, `StatusId: 100`, Total 4–6) arrived — **4+ minutes AFTER we settled**.

**Why it settled at all despite the earlier "quota-blocked until 00:00" report:** the list-free `/api/picks` hotfix deployed ~22:45 stopped the polling from draining the KV list quota, which freed enough headroom that settlement's single `realPicksFor` list succeeded at 23:02. So it ran ~4h earlier than my report assumed, and read bad data.

**Root cause (two compounding bugs):**
1. **`updates.at(-1)` assumed the scores snapshot is ordered newest-last. It is NOT.** The array's last element was a *pre-match* `Action: weather` record (Seq 9, Ts 20:33, `StatusId: 1`) with no `Score` field. The real score records (Seq 455–1195) sit earlier in the array. So both settlement (`goals90`) and live display (`currentGoals`) read a record with no `Score`.
2. **A missing `Score` silently defaulted to 0-0** (`?? 0` on absent goal fields), turning "no data" into a valid-looking draw. Settlement then did `resultFromGoals(0,0) → "draw"` and credited it.
3. Contributing: `matchEnded()` keyed on `StatusId === 5` (which carries no score and precedes finalisation) instead of the authoritative `StatusId === 100` / `game_finalised`; and there was no validation that the score actually parsed before settling.

**The finalised record parses correctly** (France H1 0 + H2 4 = 4; England H1 4 + H2 2 = 6) — the H1+H2 math was fine; it was fed the wrong record.

**Fixes shipped (worker deployed + verified; correction run on prod):**
- **Score pipeline (item 2):** new `latestGoals()` (highest-Seq record that actually carries a Total score — never `.at(-1)`) and `finalResult()` (the `StatusId 100` finalised record only, 90-min = H1+H2, returns null unless it parses). Missing/unparseable score is `null` everywhere; the 0-0 default is gone. Unit-tested against the real incident payload (4-6 away) + the ordering/missing-data cases.
- **Settlement safety rule (item 3):** settle ONLY from `finalResult`. No finalised record or unparseable → do not settle, log loudly, retry next tick. Removed the `StatusId 5` gate, the 4-hour force-settle, and every live-score fallback. Vitest: a tick with no finalised record must not settle.
- **List-free sweep (item 5):** every path now reads a per-fixture `roster:{fixtureId}` key + scoped GETs. `grep -rn "\.list(" apps/worker/src packages/txline/src` → **zero matches.** This removes both the mis-settlement's premature-run enabler and the proof-endpoint 500s.
- **Corrective re-settlement (item 4):** env-gated `POST /api/admin/resettle` (X-Admin-Token). Voided the draw record (kept as `settlement:18257865:voided:1784415722397`), re-settled to away 4-6 from the validated result, rebuilt board rows from the per-identity credited maps. Verified on prod: away pickers GpgSeA5M 419 / Cyt9EyK2 418 (won 1/1), draw & home pickers 0; the draw pick now reads `lost`. Pick records/committed leaves untouched — proofs unaffected.
- **Presentation (item 6):** live picks with no parsed score show "score unavailable" (never 0-0); AHEAD/BEHIND now reflect the real `latestGoals` score; raw "internal error" is mapped to human copy with a retry on the fixtures error.

## 2026-07-18 — Live-match hotfix: /api/picks was 500ing (KV list quota), not stale cache

Diagnosed during France v England via `wrangler tail`: `/api/picks` threw `KV list() limit exceeded for the day` in `picksForIdentity`. The free-tier 1,000/day **list** quota was exhausted by a day of per-request polling (each `/api/picks` did a KV list per identity). The "stale score" symptom was TanStack `keepPreviousData` masking the 500 with the last pre-kickoff payload. Fixes (read-path + UI only; settle.ts/commit.ts untouched, deployed to the existing underdog-* deployments):

- **List-free `/api/picks`:** the client now passes the fixture ids it already has (`?fixtures=…`), and the worker does scoped `GET pick:{id}:{fixtureId}` lookups instead of a KV list. Reads are on the large 100k/day quota; lists are reserved for the (rare) commitment/settlement per-fixture work. This also stops tomorrow's final from hitting the same wall.
- **Adaptive refetch:** both fixtures and picks poll 10s while any fixture is in-play, 60s otherwise.
- **Provisional presentation (item 2):** live picks render AHEAD / BEHIND (muted) with "if it ends now" microcopy; WON / LOST full-colour is settlement-only; replay reveals unchanged.
- Verified on prod: `/api/picks` 200 (was 500), France v England draw pick shows `hitting` 0-0, frontend bundle sends `fixtures=`.

**Settlement status:** the settlement path (`realPicksFor`) also uses a KV list, so it was blocked by the same exhausted quota — it could NOT settle before the **00:00 UTC daily reset**. It's idempotent and the cron retries, so France v England settles automatically just after midnight UTC (it ended 0-0 at 90' → draw wins). Did not touch the settlement path per the hard constraint; it self-heals on reset. Follow-up for later: give settlement/commitment a list-free per-fixture identity index too (same pattern), so the list quota is never the bottleneck.

**Git:** this hotfix is committed on `main` at the pre-rename base; the Longshot rename commit is parked on branch `rename-pending` for the post-settlement cutover (kept separate per instruction).

## 2026-07-18 — Leaderboard UI + won/played (honest status: endpoint pre-existed, page did NOT)

**Did this exist before today?** The `GET /api/leaderboard` endpoint has existed since the settlement work landed (2026-07-18 earlier entry), backed by the `board:v1` composite key. There was **no UI page** — the board's row-reorder animation was deferred twice with "no leaderboard exists yet." Summaries that referenced "the leaderboard" meant the endpoint only. Today closes the gap.

- **Endpoint upgraded:** now returns won/played per row (was points + settledPicks). Board rows store both raw identity and a link-resolved `displayIdentity` stamped at settlement time, so serving the board is one KV GET with pure in-memory grouping (no per-request link lookups, zero lists). `linkGuest` re-stamps existing board rows when a wallet is linked after settling, so late links still fold in.
- **UI page:** new tab nav (Matches / Leaderboard); ranked list with rank 1 in gold, current identity's row highlighted + "you" tag, truncated wallet / "Guest xxxx" labels, won/played line. Framer Motion `layout` on each row = the settlement reorder animation for the video.
- **Backfill audit (real, on prod):** no prior settled *real* picks exist. The two existing prod settlement records (18237038, 18241006) are past/replay fixtures whose picks are all `demo:true` — verified each one's flag; `creditedCount: 0`, correctly zero board rows. France–England (tonight) has confirmed `demo:false` picks (e.g. draw @ 4.25, home @ 1.95) and is in the cron registry, so it will be the **first** board population at settlement (~22:50 UTC). Empty board right now is correct, not a bug.
- Verified locally end-to-end with the new schema: France v Spain 0-2 settled, away pick credited 318 pts (won 1/1), home pick 0 (0/1), re-run idempotent, and a post-settlement guest→wallet link folded the guest's 318 pts under the wallet row. Prod: endpoint returns `[]`, web page deploys and serves.

## 2026-07-18 — Wallet state-machine + optimistic pick regressions (pre-final fixes)

- **Wallet wedge:** the auto sign-in effect depended on the whole mutation object, so it re-fired on any wallet state change — including mid-disconnect renders with a stale adapter, throwing "signMessage is not a function" and freezing the UI in "Retry sign-in". Now: auto-fire gated on connected + pubkey + callable signMessage + no session + at most once per pubkey per connection (ref-tracked); adapter re-checked at call time inside the mutation; any disconnect (button or wallet-side) resets the machine to idle, clears the session, and returns the button to "Connect wallet". "Retry sign-in" renders only on a genuine failed attempt while still connected (e.g. user rejected the prompt).
- **Pick lock now truly optimistic:** moved from onSuccess to onMutate — the pick appears in My Picks synchronously with a gold-pulse "Locking…" row, confirms in place with the server-snapshotted multiplier, rolls back on error (previous list restored, error banner shows). Tap-to-visible is one synchronous render.
- **Prod acceptance:** real pre-match pick reads `locked` (France v England @ 4.25); replay pick locks at kickoff odds (6.43x) with reveal data (3-1 busted); malformed guest UUID rejected 400; registry steady state = 1 GET/tick, zero lists. Both live markets (tonight + final) are currently suspended TxLINE-side ~5h out — same on/off pattern as yesterday; greyed cards cover it and the UI picks up quotes on the next poll. **Not machine-verifiable here:** the wallet connect→sign→disconnect→reconnect cycle and the 100ms tap feel need a human browser pass — do it on the prod URL with Phantom before recording.

## 2026-07-18 — KV free-tier budget fix (zero-list cron) + item-3 UX

**KV budget model (free tier, resets 00:00 UTC):** 1,000 lists/day is the scarce resource — 100k reads and 1k writes are not the constraint. The per-minute cron was listing `pickf:` prefixes per due fixture per tick (~10 lists/min with the 120h lookback) and burned 650 lists before the dashboard alert. Model to keep in mind: **every recurring code path must do zero lists**; lists are reserved for rare, bounded, user-triggered work.

- Step zero (deployed within a minute of the alert): cron widened to `*/5`.
- **Registry (`registry:v1`)**: one small key holding {fixtureId, kickoffAt, committed, settled} per active fixture. Fixtures enroll on their first real pick write and are pruned when both jobs finish. Cron = **1 KV GET per tick, zero lists** outside a fixture's action window; commit/settle jobs read `pickf:` prefixes only inside windows, bounded per fixture with a give-up cap. Commitments no longer need the TxLINE feed at all.
- Rate limiting moved in-memory per isolate (KV writes to protect KV quota was self-defeating); fixtures response cached 10s per isolate; leaderboard now a single `board:v1` composite key maintained at settlement time (was a list per request).
- Tonight-mode crons: `*/5` baseline plus dated per-minute windows 20:55–21:15 and 22:30–23:59 UTC (July 18 only, inert afterwards — remove tomorrow).
- **Ops estimate:** before ≈ 600+ lists/hour from the cron alone; after ≈ 0 lists/hour steady state, ~3–6 lists total inside tonight's two windows, 12–60 reads/hour depending on cron cadence. Remaining list headroom for tonight: ~350 — the new design needs single digits.
- Prod registry seeded with tonight's fixture (existing picks predate enrollment).
- Item-3 UX shipped in the same window: button-level "Locking…" pending + optimistic locked state (3.1), replay rows are reveals — "You'd have won +N pts — real result 2–0" — never a bare status tag (3.2), connect→sign is one continuous flow (3.3), link prompt only appears with guest picks and states the count (3.4).

## 2026-07-18 — Status state machine fix + settlement worker (pre-match deploys for tonight)

- **Status bug (urgent):** pre-match real picks showed "Busted" — pre-match score snapshots contain a fixture-metadata record with no goals, read as 0-0 and compared against the pick. Status is now a pure phase machine (`status.ts`, vitest-covered including the exact regression): pre-kickoff → `locked` (scores never even fetched), live → provisional `hitting`/`busted` (no score yet = genuine 0-0), settled real picks → `won`/`lost` + credited points from the settlement record only, replays → reveal semantics. Verified on prod: France v England pick shows `locked` pre-match.
- **Settlement worker:** same cron, independent failure domain from commitments (`Promise.allSettled`). Waits for the feed's ended phase (StatusId 5; force-settles loudly on last known score after 4h as a fallback), settles the **90-minute market from H1+H2 goal buckets** so knockout extra time never leaks in (Total includes ET) — draw-at-FT is first-class. Crediting is idempotent per pick via a `credited{fixtureId:points}` map inside each `lb:{identity}` record — the single leaderboard write is the atomic crediting act; pick-record settled flags are display-only and healed by re-runs. Settlement records mirror the `commitment:` pattern. Verified locally against the France v Spain replay: settled 0-2 away matching the real result, winner credited 318 pts (100 × 3.18), loser 0, linked guest folded into its wallet's board row, **re-run changed nothing**. `GET /api/leaderboard` added (linked guests fold in at read).
- Known test entrants on tonight's board: guest `00000000-dead-…-0001` (draw @ 4.25, prod acceptance check) — plus whatever the real crowd does.

## 2026-07-18 — Identity + on-chain commitment layer (shipped)

Everything below verified locally end-to-end before deploy: upsert re-snapshots odds; frozen gate 409s; SIWS sign-in with a real ed25519 signature; nonce replay and forged signatures rejected; one-way guest link enforced (409 on relink); commitment cron published a rehearsal root to **mainnet** (memo tx `2Y5mBz…azuB`, fixture 18237038 with seeded test picks, record kept in local KV only) and the served proof re-verified client-side with the shared package. The confirmation-timeout path was exercised for real: a sent-but-unconfirmed tx left a pending record, which motivated storing txSig at send time and checking signature status before any re-send.

RPC note: public `api.*.solana.com` endpoints 403 requests from workerd (client fingerprinting) — switched to `solana-rpc.publicnode.com` (keyless) for both dev and prod.

**Security sweep (checked before deploy):**
- Built web bundle grepped for the TxLINE token, ops keypair bytes, and secret names — clean. Ops keypair and session secret exist only as Worker secrets + gitignored local files; never logged (secret writes piped from files, never echoed).
- All POST bodies and proof query params zod-validated; identity format enforced on every pick write (base58 32-byte pubkey or UUIDv4 — also what keeps the leaf encoding unambiguous).
- CORS locked to ALLOWED_ORIGINS (prod web origin + localhost dev); foreign origins never echoed — verified against prod.
- Unauthenticated writes rate-limited 30/min/IP via KV counters (soft — KV consistency; documented in code). Picks naturally capped at one per identity per fixture; fixtureIds validated against the feed.
- Session tokens are HMAC-SHA256 (WebCrypto) with 7-day expiry; nonces single-use with 300s TTL.

- **Pick rule change:** 409-on-duplicate replaced with upsert-until-kickoff. Every change re-snapshots odds server-side; hard 4xx after kickoff for real picks (immutability foundation for commitments). Replays stay freely editable and are never committed.
- **Sign-In-With-Solana:** wallet-adapter (Phantom/Solflare — embedded provider skipped for deadline reasons, user-approved), nonce + signed message verified server-side (tweetnacl ed25519), stateless HMAC bearer sessions. Users never pay or send transactions.
- **Merkle batch commitments:** per-fixture pick-set roots (leaf contract `underdog.pick.v1`, SHA-256, sorted leaves, odd node promoted) published via memo tx from the ops wallet on a cron at kickoff+3min. The 3-minute delay + a fixture-first KV index (`pickf:{fixtureId}:{identity}`, written synchronously with each pick) work around KV list eventual consistency that could otherwise omit last-second picks from the tree. Filter: `lockedAt < kickoff`, strictly.
- **Identity validation:** every write requires identity = base58 32-byte pubkey or strict UUIDv4 — keeps the pipe-delimited leaf encoding unambiguous.
- **Guest→wallet linking is display-only:** committed leaves embed the original identity forever; `link:` mappings resolve reads, pick records are never rewritten.
- **Naming decision:** a rename to "Giantkiller" was approved during plan review (the leaf prefix bakes the name in permanently) and then reversed before implementation — the brand stays **Underdog**; leaf prefix `underdog.pick.v1`.


## 2026-07-18 — Leaderboard integrity, fixture sections, replay-aware nudge

- Replay picks flagged `demo` server-side at lock (fixture state, never client input) and excluded from any future real leaderboard; UI shows "practice pts". Both KV stores audited: empty, nothing to clean.
- Home page split: "Live & Upcoming" / "Replays" (framed as a feature, REPLAY badge + original date).
- Empty-state nudge only recommends open unplayed markets; falls back to "try a replay" wording.

## 2026-07-18 — Deploys to Cloudflare Workers

- Worker API deployed (`underdog-worker.kamigo.workers.dev`): real KV namespace, `TXLINE_API_TOKEN` as Worker secret, wrangler 4, observability on.
- Web deployed as a Workers static-assets site (`underdog-web.kamigo.workers.dev`), SPA fallback, prod API URL baked at build. Chosen over Pages per current Cloudflare guidance.

## 2026-07-17 — Dark "night match" restyle

- All colors as CSS-variable theme tokens (near-black green-cast base, gold accent reserved for underdog prices/wins); Barlow Condensed for numbers; risk-ramp color util (white→gold by multiplier).
- Three motion moments (framer-motion, reduced-motion respected): odds-tick flash, status-chip crossfade, points count-up. Leaderboard row animation deferred — no leaderboard exists yet.
- Edge states: "Market opens closer to kickoff" greyed cards (worker keeps odds-less upcoming fixtures); biggest-payout nudge.

## 2026-07-17 — Day 1 core loop (live on mainnet data)

- Worker game API: fixtures with multipliers (settled games replay kickoff odds via `asOf` — same code path as live), picks with **server-side odds snapshot at lock** (client never supplies odds), status derived live from scores feed. Guest JWT cached, renewed on 401.
- Web pick flow: "Result after 90 mins" cards, one-tap lock, My Picks with live status. Anonymous localStorage identity pending wallet work.
- Verified with real data: Argentina 1.79x v Switzerland 6.43x; Spain 2-0 France busted a France pick correctly.

## 2026-07-17 — TxLINE mainnet activation (free real-time World Cup tier)

- Dedicated ops keypair generated (main wallet never touches the repo); on-chain `subscribe(12, 4)` on mainnet (~0.002 SOL, level 12 verified price-0 on-chain in the pricing matrix before sending); API token activated and verified.
- Both remaining matches confirmed served live (third-place + final) — the feed's odds markets open/suspend dynamically pre-kickoff.
- Devnet run first proved the whole flow; one tx was burned learning the activation endpoint returns a plain-text token (parsing fixed, documented in scripts/).

## 2026-07-17 — txline package rewritten against live payloads

- All wire types from real responses (numeric ids, epoch-ms, Prices = decimal odds ×1000, Pct pre-demargined; scores in H1/H2/HT/Total buckets; `updates` endpoints are SSE, not JSON).
- Engine: full-time 1X2 extractor, multiplier math (overround-safe), goals/result helpers, line-movement detector. Kept UI-free per architecture rule (trading-track spinoff candidate).

## 2026-07-16 — Scaffold

- pnpm monorepo: `packages/txline` (standalone, UI-free), `apps/web` (Vite/React/Tailwind/shadcn/TanStack Query), `apps/worker` (Cloudflare). TxLINE clients wired to documented endpoints after reading quickstart; auth = guest JWT + X-Api-Token.

## Not yet built (honest gaps)

- Settlement worker against TxLINE's settlement feed (stat-validation Merkle proofs) — status today derives from live scores, which CLAUDE.md forbids for final settlement.
- Leaderboard (and its row-reorder animation), points crediting, cNFT trophies, win-probability strip.
