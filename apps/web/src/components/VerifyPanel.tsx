import { fromHex, hashLeaf, toHex, verifyProof } from "@underdog/commitment";
import { useQuery } from "@tanstack/react-query";

import { fetchProof, type ApiPick } from "@/lib/api";
import { truncateAddress } from "@/lib/auth";

export function VerifyPanel({ pick, identity }: { pick: ApiPick; identity: string }) {
  const proof = useQuery({
    queryKey: ["proof", pick.fixtureId, identity],
    queryFn: () => fetchProof(pick.fixtureId, identity),
    staleTime: Infinity,
    retry: false,
  });

  // The whole point: the proof is re-verified in this browser, not trusted
  // from the server. Leaf is re-hashed from the served fields and folded
  // through the proof path locally.
  const verified = useQuery({
    queryKey: ["proof-verify", proof.data?.leafHash],
    enabled: proof.isSuccess,
    staleTime: Infinity,
    queryFn: async () => {
      const data = proof.data!;
      const localLeafHash = await hashLeaf(data.leaf);
      if (toHex(localLeafHash) !== data.leafHash) return false;
      return verifyProof(fromHex(data.leafHash), data.proof, data.root);
    },
  });

  if (proof.isPending) {
    return <p className="px-3 py-2 text-[11px] text-ink-faint">Loading proof…</p>;
  }
  if (proof.isError) {
    return (
      <p className="px-3 py-2 text-[11px] text-ink-faint">
        {(proof.error as Error).message}
      </p>
    );
  }

  const data = proof.data;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-pitch/60 px-3 py-2.5 text-[11px]">
      <p className="text-ink-muted">
        This pick provably existed before kickoff — its hash is one of {data.leafCount} leaves
        under a Merkle root published on Solana at kickoff.
      </p>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[10px] text-ink-muted">
        <dt className="text-ink-faint">identity</dt>
        <dd className="truncate">{truncateAddress(data.leaf.identity)}</dd>
        <dt className="text-ink-faint">selection</dt>
        <dd>
          {data.leaf.selection} @ {data.leaf.multiplier.toFixed(2)}x
        </dd>
        <dt className="text-ink-faint">locked</dt>
        <dd>{new Date(data.leaf.lockedAt).toISOString()}</dd>
        <dt className="text-ink-faint">leaf</dt>
        <dd className="truncate">{data.leafHash}</dd>
        <dt className="text-ink-faint">root</dt>
        <dd className="truncate">{data.root}</dd>
        <dt className="text-ink-faint">path</dt>
        <dd>{data.proof.length} node{data.proof.length === 1 ? "" : "s"}</dd>
      </dl>

      <div className="flex items-center justify-between">
        <span
          className={
            verified.data === true
              ? "font-semibold uppercase tracking-widest text-win"
              : verified.data === false
                ? "font-semibold uppercase tracking-widest text-loss"
                : "text-ink-faint"
          }
        >
          {verified.data === true
            ? "✓ verified in your browser"
            : verified.data === false
              ? "✗ proof does not verify"
              : "verifying…"}
        </span>
        {data.explorerUrl && (
          <a
            href={data.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-gold underline underline-offset-2"
          >
            commitment tx ↗
          </a>
        )}
      </div>
    </div>
  );
}
