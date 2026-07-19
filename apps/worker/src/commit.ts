import {
  buildProof,
  buildRoot,
  hashLeaf,
  sortLeafHashes,
  toHex,
  type PickLeaf,
  type ProofStep,
} from "@underdog/commitment";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

import type { Env } from "./env";
import { rosterPicks, type Pick } from "./picks";
import { updateRegistryEntry, type RegistryEntry } from "./registry";

// KV list is eventually consistent (writes can take ~60s to appear in list
// results from other locations). Committing exactly at kickoff could
// silently omit picks locked in the final seconds, breaking their proofs
// forever. The write gate still closes at kickoff exactly (picks.ts); tree
// construction just waits out the consistency window.
const COMMIT_DELAY_MS = 3 * 60 * 1000;
// If the pick index still reads empty this long after kickoff for a
// registered fixture, stop retrying (bounds list usage on a KV anomaly).
const GIVE_UP_MS = 3600 * 1000;

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const MIN_BALANCE_LAMPORTS = 10_000;

export interface CommitmentRecord {
  version: 1;
  fixtureId: number;
  root: string;
  leafCount: number;
  status: "pending" | "committed";
  txSig?: string;
  slot?: number;
  committedAt: number;
}

export function commitmentKey(fixtureId: number): string {
  return `commitment:${fixtureId}`;
}

export function toLeaf(pick: Pick): PickLeaf {
  return {
    fixtureId: pick.fixtureId,
    identity: pick.userId,
    selection: pick.outcome,
    multiplier: pick.multiplier,
    lockedAt: pick.lockedAt,
  };
}

// Only real picks locked strictly before kickoff enter the tree.
export function isCommittable(pick: Pick, fixture: { StartTime: number }): boolean {
  return !pick.demo && pick.lockedAt < fixture.StartTime;
}

export async function committablePicks(
  env: Env,
  fixture: { FixtureId: number; StartTime: number },
): Promise<Pick[]> {
  // Roster + scoped GETs — never a KV list (see picks.ts rosterKey).
  const picks = await rosterPicks(env, fixture.FixtureId);
  return picks.filter((p) => isCommittable(p, fixture));
}

async function sortedLeavesFor(picks: Pick[]): Promise<Uint8Array[]> {
  const hashes = await Promise.all(picks.map((p) => hashLeaf(toLeaf(p))));
  return sortLeafHashes(hashes);
}

// Confirmation against public RPC can time out even when the tx lands, so
// the caller records the txSig immediately after send and re-checks the
// signature status on later runs before ever re-sending.
export async function signatureLanded(
  connection: Connection,
  txSig: string,
): Promise<number | null> {
  // The public RPC intermittently errors on this status check. A failure here
  // must NOT abort the commit — the tx may well have landed. Return null so
  // the caller records it as "sent" and a later run confirms it, rather than
  // throwing (which previously killed the whole commit path).
  try {
    const status = await connection.getSignatureStatuses([txSig], {
      searchTransactionHistory: true,
    });
    const value = status.value[0];
    if (value && !value.err) return value.slot;
  } catch (err) {
    console.error(`signatureLanded: status check failed for ${txSig} (treating as unconfirmed):`, err);
  }
  return null;
}

async function sendRoot(
  env: Env,
  connection: Connection,
  fixtureId: number,
  rootHex: string,
): Promise<string> {
  const keypair = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(env.OPS_KEYPAIR_JSON)));

  const balance = await connection.getBalance(keypair.publicKey);
  if (balance < MIN_BALANCE_LAMPORTS) {
    throw new Error(
      `OPS WALLET BALANCE TOO LOW: ${balance} lamports at ${keypair.publicKey.toBase58()} — fund it or commitments stop`,
    );
  }

  // Kept aligned with the historical leaf prefix (see @underdog/commitment
  // leaf.ts). Protocol identifier, not user-facing branding — stays stable
  // through the Longshot rename so the on-chain memo scheme is consistent.
  const memo = `underdog:v1:${fixtureId}:${rootHex}`;
  const tx = new Transaction().add(
    new TransactionInstruction({
      keys: [],
      programId: MEMO_PROGRAM_ID,
      data: Buffer.from(memo, "utf8"),
    }),
  );

  const latest = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = keypair.publicKey;
  tx.sign(keypair);

  return connection.sendRawTransaction(tx.serialize());
}

// Guarded manual commit for one fixture (admin-triggered when the cron did
// not fire). Self-contained so it cannot disturb the scheduled path; returns
// the exact failure instead of only logging it. Idempotent: a committed
// fixture is reported as-is; a pending send is recovered by signature check.
export async function commitFixtureNow(
  env: Env,
  fixture: { FixtureId: number; StartTime: number },
): Promise<
  | { status: "committed" | "sent"; root: string; txSig: string; slot: number; leafCount: number }
  | { error: string; status: number }
> {
  const recordRaw = await env.PICKS.get(commitmentKey(fixture.FixtureId));
  const existing: CommitmentRecord | null = recordRaw ? JSON.parse(recordRaw) : null;
  if (existing?.status === "committed") {
    await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
    return {
      status: "committed",
      root: existing.root,
      txSig: existing.txSig ?? "",
      slot: existing.slot ?? 0,
      leafCount: existing.leafCount,
    };
  }

  const picks = await committablePicks(env, fixture);
  if (picks.length === 0) return { error: "no committable picks for fixture", status: 409 };

  const root = toHex(await buildRoot(await sortedLeavesFor(picks)));
  if (existing?.status === "pending" && existing.root !== root) {
    return { error: `pending root mismatch (${existing.root} vs ${root})`, status: 409 };
  }

  const connection = new Connection(env.RPC_URL, "confirmed");
  if (existing?.status === "pending" && existing.txSig) {
    const landed = await signatureLanded(connection, existing.txSig);
    if (landed !== null) {
      const committed: CommitmentRecord = { ...existing, status: "committed", slot: landed };
      await env.PICKS.put(commitmentKey(fixture.FixtureId), JSON.stringify(committed));
      await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
      return { status: "committed", root, txSig: existing.txSig, slot: landed, leafCount: picks.length };
    }
  }

  const pending: CommitmentRecord = {
    version: 1,
    fixtureId: fixture.FixtureId,
    root,
    leafCount: picks.length,
    status: "pending",
    committedAt: Date.now(),
  };
  await env.PICKS.put(commitmentKey(fixture.FixtureId), JSON.stringify(pending));

  const txSig = await sendRoot(env, connection, fixture.FixtureId, root);
  await env.PICKS.put(commitmentKey(fixture.FixtureId), JSON.stringify({ ...pending, txSig }));

  const slot = await signatureLanded(connection, txSig);
  if (slot !== null) {
    await env.PICKS.put(
      commitmentKey(fixture.FixtureId),
      JSON.stringify({ ...pending, status: "committed", txSig, slot }),
    );
    await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
    return { status: "committed", root, txSig, slot, leafCount: picks.length };
  }
  return { status: "sent", root, txSig, slot: 0, leafCount: picks.length };
}

// Registry entries are the only work source: one KV GET upstream, no lists
// outside a fixture's action window.
export async function runCommitments(env: Env, entries: RegistryEntry[]): Promise<void> {
  const now = Date.now();
  const due = entries.filter((e) => !e.committed && now >= e.kickoffAt + COMMIT_DELAY_MS);

  for (const entry of due) {
    const fixture = { FixtureId: entry.fixtureId, StartTime: entry.kickoffAt };
    const recordRaw = await env.PICKS.get(commitmentKey(fixture.FixtureId));
    const record: CommitmentRecord | null = recordRaw ? JSON.parse(recordRaw) : null;
    if (record?.status === "committed") {
      await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
      continue;
    }

    try {
      const picks = await committablePicks(env, fixture);
      if (picks.length === 0) {
        if (now >= fixture.StartTime + GIVE_UP_MS) {
          console.error(
            `COMMITMENT: registered fixture ${fixture.FixtureId} still has an empty pick index — giving up`,
          );
          await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
        }
        continue;
      }

      const root = toHex(await buildRoot(await sortedLeavesFor(picks)));

      // Pending record before sending makes re-runs crash-safe. A pending
      // record with a txSig means a send went out but confirmation was not
      // observed — check the chain before ever re-sending.
      if (record?.status === "pending" && record.root !== root) {
        console.error(
          `commitment: fixture ${fixture.FixtureId} pending root mismatch (${record.root} vs ${root}) — picks changed after pending write, investigate`,
        );
        continue;
      }

      const connection = new Connection(env.RPC_URL, "confirmed");

      if (record?.status === "pending" && record.txSig) {
        const slot = await signatureLanded(connection, record.txSig);
        if (slot !== null) {
          await env.PICKS.put(
            commitmentKey(fixture.FixtureId),
            JSON.stringify({ ...record, status: "committed", slot }),
          );
          await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
          console.log(
            `commitment: fixture ${fixture.FixtureId} recovered — earlier tx ${record.txSig} had landed`,
          );
          continue;
        }
      }

      const pending: CommitmentRecord = {
        version: 1,
        fixtureId: fixture.FixtureId,
        root,
        leafCount: picks.length,
        status: "pending",
        committedAt: now,
      };
      await env.PICKS.put(commitmentKey(fixture.FixtureId), JSON.stringify(pending));

      const txSig = await sendRoot(env, connection, fixture.FixtureId, root);
      await env.PICKS.put(
        commitmentKey(fixture.FixtureId),
        JSON.stringify({ ...pending, txSig }),
      );

      const slot = await signatureLanded(connection, txSig);
      if (slot !== null) {
        await env.PICKS.put(
          commitmentKey(fixture.FixtureId),
          JSON.stringify({ ...pending, status: "committed", txSig, slot }),
        );
        await updateRegistryEntry(env, fixture.FixtureId, { committed: true });
        console.log(`commitment: fixture ${fixture.FixtureId} root ${root} committed in ${txSig}`);
      } else {
        console.log(
          `commitment: fixture ${fixture.FixtureId} sent ${txSig}, confirmation pending — next run will verify`,
        );
      }
    } catch (err) {
      console.error(`COMMITMENT FAILED for fixture ${fixture.FixtureId}:`, err);
    }
  }
}

export interface ProofResponse {
  leaf: PickLeaf;
  leafHash: string;
  proof: ProofStep[];
  root: string;
  leafCount: number;
  txSig: string | null;
  explorerUrl: string | null;
}

export async function buildProofResponse(
  env: Env,
  fixture: { FixtureId: number; StartTime: number },
  identity: string,
): Promise<ProofResponse | { error: string; status: number }> {
  const recordRaw = await env.PICKS.get(commitmentKey(fixture.FixtureId));
  const record: CommitmentRecord | null = recordRaw ? JSON.parse(recordRaw) : null;
  if (!record) {
    return { error: "fixture not committed yet", status: 404 };
  }

  const picks = await committablePicks(env, fixture);
  const target = picks.find((p) => p.userId === identity);
  if (!target) {
    return { error: "no committed pick for this identity", status: 404 };
  }

  const hashes = await Promise.all(picks.map((p) => hashLeaf(toLeaf(p))));
  const sorted = sortLeafHashes(hashes);
  const root = toHex(await buildRoot(sorted));
  if (root !== record.root) {
    console.error(
      `PROOF INTEGRITY ERROR: rebuilt root ${root} does not match committed root ${record.root} for fixture ${fixture.FixtureId}`,
    );
    return { error: "stored picks no longer match the committed root", status: 500 };
  }

  const targetHash = toHex(await hashLeaf(toLeaf(target)));
  const index = sorted.findIndex((h) => toHex(h) === targetHash);
  const proof = await buildProof(sorted, index);

  return {
    leaf: toLeaf(target),
    leafHash: targetHash,
    proof,
    root,
    leafCount: record.leafCount,
    txSig: record.txSig ?? null,
    explorerUrl: record.txSig ? `https://solscan.io/tx/${record.txSig}` : null,
  };
}
