import { getSession } from "./auth";

export type Outcome = "home" | "draw" | "away";

export interface ApiFixture {
  fixtureId: number;
  home: string;
  away: string;
  kickoffAt: number;
  demo: boolean;
  multipliers: { home: number; draw: number; away: number } | null;
}

export interface ApiPick {
  userId: string;
  fixtureId: number;
  outcome: Outcome;
  multiplier: number;
  lockedAt: number;
  demo: boolean;
  home: string;
  away: string;
  kickoffAt: number;
  status: "locked" | "hitting" | "busted" | "won" | "lost";
  creditedPoints: number | null;
  homeGoals: number | null;
  awayGoals: number | null;
  potentialPoints: number;
  // Client-only marker for in-flight optimistic rows; never sent by the API.
  optimistic?: boolean;
}

export interface ProofStep {
  hash: string;
  position: "left" | "right";
}

export interface ApiProof {
  leaf: {
    fixtureId: number;
    identity: string;
    selection: Outcome;
    multiplier: number;
    lockedAt: number;
  };
  leafHash: string;
  proof: ProofStep[];
  root: string;
  leafCount: number;
  txSig: string | null;
  explorerUrl: string | null;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const session = getSession();
  const headers = new Headers(init?.headers);
  if (session) headers.set("Authorization", `Bearer ${session.token}`);

  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchFixtures(): Promise<ApiFixture[]> {
  return request("/api/fixtures");
}

export function fetchPicks(guestId: string): Promise<ApiPick[]> {
  return request(`/api/picks?userId=${encodeURIComponent(guestId)}`);
}

export function lockPick(body: {
  userId: string;
  fixtureId: number;
  outcome: Outcome;
}): Promise<ApiPick> {
  return request("/api/picks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function fetchNonce(): Promise<{ nonce: string; message: string }> {
  return request("/api/auth/nonce");
}

export function verifySignIn(body: {
  pubkey: string;
  signature: string;
  nonce: string;
}): Promise<{ token: string; pubkey: string }> {
  return request("/api/auth/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function linkGuest(guestId: string): Promise<{ linked: true }> {
  return request("/api/auth/link", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guestId }),
  });
}

export function fetchProof(fixtureId: number, identity: string): Promise<ApiProof> {
  return request(`/api/proof?fixtureId=${fixtureId}&identity=${encodeURIComponent(identity)}`);
}
