import { PublicKey } from "@solana/web3.js";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Every stored identity must be one of these two formats. This is what keeps
// the pipe-delimited leaf encoding in @underdog/commitment unambiguous:
// neither format can contain "|".
export function isWalletIdentity(identity: string): boolean {
  try {
    return new PublicKey(identity).toBytes().length === 32;
  } catch {
    return false;
  }
}

export function isGuestIdentity(identity: string): boolean {
  return UUID_V4.test(identity);
}

export function isValidIdentity(identity: string): boolean {
  return isGuestIdentity(identity) || isWalletIdentity(identity);
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
