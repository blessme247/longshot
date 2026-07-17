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
  status: "pending" | "hitting" | "busted";
  homeGoals: number | null;
  awayGoals: number | null;
  potentialPoints: number;
}

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchFixtures(): Promise<ApiFixture[]> {
  return request("/api/fixtures");
}

export function fetchPicks(userId: string): Promise<ApiPick[]> {
  return request(`/api/picks?userId=${encodeURIComponent(userId)}`);
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
