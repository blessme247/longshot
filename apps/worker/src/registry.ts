import type { Env } from "./env";

// Single small key the cron reads once per tick. KV lists are the scarce
// free-tier resource (1k/day) — steady-state cron work must never list.
// Fixtures enter the registry on their first real pick write and leave once
// both jobs are done, so ticks outside an action window cost exactly one GET.
const REGISTRY_KEY = "registry:v1";

export interface RegistryEntry {
  fixtureId: number;
  kickoffAt: number;
  committed: boolean;
  settled: boolean;
}

interface Registry {
  version: 1;
  fixtures: RegistryEntry[];
}

export async function getRegistry(env: Env): Promise<RegistryEntry[]> {
  const raw = await env.PICKS.get(REGISTRY_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as Registry).fixtures;
}

async function putRegistry(env: Env, fixtures: RegistryEntry[]): Promise<void> {
  await env.PICKS.put(REGISTRY_KEY, JSON.stringify({ version: 1, fixtures } satisfies Registry));
}

export async function registerFixture(
  env: Env,
  fixtureId: number,
  kickoffAt: number,
): Promise<void> {
  const fixtures = await getRegistry(env);
  if (fixtures.some((f) => f.fixtureId === fixtureId)) return;
  fixtures.push({ fixtureId, kickoffAt, committed: false, settled: false });
  await putRegistry(env, fixtures);
}

export async function updateRegistryEntry(
  env: Env,
  fixtureId: number,
  patch: Partial<Pick<RegistryEntry, "committed" | "settled">>,
): Promise<void> {
  const fixtures = await getRegistry(env);
  const entry = fixtures.find((f) => f.fixtureId === fixtureId);
  if (!entry) return;
  Object.assign(entry, patch);
  const remaining = fixtures.filter((f) => !(f.committed && f.settled));
  await putRegistry(env, remaining);
}
