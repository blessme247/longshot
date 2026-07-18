const TOKEN_KEY = "underdog:session";
const PUBKEY_KEY = "underdog:pubkey";
const LINK_OFFERED_KEY = "underdog:linkOffered";

export function getSession(): { token: string; pubkey: string } | null {
  const token = localStorage.getItem(TOKEN_KEY);
  const pubkey = localStorage.getItem(PUBKEY_KEY);
  return token && pubkey ? { token, pubkey } : null;
}

export function storeSession(token: string, pubkey: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(PUBKEY_KEY, pubkey);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PUBKEY_KEY);
}

export function linkAlreadyOffered(): boolean {
  return localStorage.getItem(LINK_OFFERED_KEY) === "1";
}

export function markLinkOffered(): void {
  localStorage.setItem(LINK_OFFERED_KEY, "1");
}

export function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
