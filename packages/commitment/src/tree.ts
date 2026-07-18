import { fromHex, toHex } from "./leaf";

export interface ProofStep {
  hash: string;
  position: "left" | "right";
}

async function hashPair(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  const joined = new Uint8Array(left.length + right.length);
  joined.set(left, 0);
  joined.set(right, left.length);
  const digest = await crypto.subtle.digest("SHA-256", joined as BufferSource);
  return new Uint8Array(digest);
}

/**
 * Leaves are sorted lexicographically by hex before building, so the tree is
 * deterministic regardless of KV listing order. An odd node at any level is
 * promoted unchanged to the next level (no duplication). A single leaf is its
 * own root. Callers must not pass an empty array.
 */
export function sortLeafHashes(leafHashes: Uint8Array[]): Uint8Array[] {
  return [...leafHashes].sort((a, b) => toHex(a).localeCompare(toHex(b)));
}

export async function buildRoot(sortedLeaves: Uint8Array[]): Promise<Uint8Array> {
  if (sortedLeaves.length === 0) {
    throw new Error("cannot build a Merkle root over zero leaves");
  }

  let level = sortedLeaves;
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      next.push(await hashPair(level[i]!, level[i + 1]!));
    }
    if (level.length % 2 === 1) {
      next.push(level[level.length - 1]!);
    }
    level = next;
  }
  return level[0]!;
}

export async function buildProof(
  sortedLeaves: Uint8Array[],
  leafIndex: number,
): Promise<ProofStep[]> {
  if (leafIndex < 0 || leafIndex >= sortedLeaves.length) {
    throw new Error("leaf index out of range");
  }

  const proof: ProofStep[] = [];
  let level = sortedLeaves;
  let index = leafIndex;

  while (level.length > 1) {
    const isLeft = index % 2 === 0;
    const siblingIndex = isLeft ? index + 1 : index - 1;

    const next: Uint8Array[] = [];
    for (let i = 0; i + 1 < level.length; i += 2) {
      next.push(await hashPair(level[i]!, level[i + 1]!));
    }

    if (siblingIndex < level.length) {
      proof.push({
        hash: toHex(level[siblingIndex]!),
        position: isLeft ? "right" : "left",
      });
      index = Math.floor(index / 2);
    } else {
      // Odd node promoted unchanged: no sibling at this level, index maps to
      // the promoted slot in the next level.
      index = next.length;
    }

    if (level.length % 2 === 1) {
      next.push(level[level.length - 1]!);
    }
    level = next;
  }

  return proof;
}

export async function verifyProof(
  leafHash: Uint8Array,
  proof: ProofStep[],
  expectedRootHex: string,
): Promise<boolean> {
  let current = leafHash;
  for (const step of proof) {
    const sibling = fromHex(step.hash);
    current =
      step.position === "right"
        ? await hashPair(current, sibling)
        : await hashPair(sibling, current);
  }
  return toHex(current) === expectedRootHex;
}
