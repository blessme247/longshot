/**
 * PUBLIC VERIFICATION CONTRACT — leaf encoding v1. Changing anything here
 * (prefix, field order, separators, number formatting) breaks every
 * previously published commitment; treat as a breaking version bump.
 *
 * The pipe-delimited encoding is unambiguous because the server rejects any
 * identity that is not a base58 32-byte pubkey or a UUIDv4 (neither can
 * contain "|"), and the remaining fields are server-generated numbers/enums.
 * The domain prefix also provides domain separation between leaf hashes and
 * internal node hashes (internal nodes hash raw 64-byte concatenations,
 * which can never collide with a prefixed UTF-8 leaf preimage).
 */
export interface PickLeaf {
  fixtureId: number;
  identity: string;
  selection: "home" | "draw" | "away";
  multiplier: number;
  lockedAt: number;
}

const LEAF_PREFIX = "underdog.pick.v1";

export function encodeLeaf(leaf: PickLeaf): Uint8Array {
  const canonical = [
    LEAF_PREFIX,
    leaf.fixtureId,
    leaf.identity,
    leaf.selection,
    leaf.multiplier.toFixed(2),
    leaf.lockedAt,
  ].join("|");
  return new TextEncoder().encode(canonical);
}

export async function hashLeaf(leaf: PickLeaf): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", encodeLeaf(leaf) as BufferSource);
  return new Uint8Array(digest);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
