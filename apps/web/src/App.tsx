import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MyPicks } from "@/components/MyPicks";
import { PickCard } from "@/components/PickCard";
import { fetchFixtures, fetchPicks, lockPick, type Outcome } from "@/lib/api";
import { getUserId } from "@/lib/user";

const userId = getUserId();

export function App() {
  const queryClient = useQueryClient();

  const fixtures = useQuery({
    queryKey: ["fixtures"],
    queryFn: fetchFixtures,
    refetchInterval: 15_000,
  });

  const picks = useQuery({
    queryKey: ["picks", userId],
    queryFn: () => fetchPicks(userId),
    refetchInterval: 15_000,
  });

  const lock = useMutation({
    mutationFn: (vars: { fixtureId: number; outcome: Outcome }) =>
      lockPick({ userId, ...vars }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["picks", userId] }),
  });

  const pickedByFixture = new Map(
    (picks.data ?? []).map((p) => [p.fixtureId, p.outcome]),
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">Underdog</h1>
        <p className="text-sm text-neutral-500">
          Pick results, earn more when the underdog hits.
        </p>
      </header>

      <MyPicks picks={picks.data ?? []} />

      {fixtures.isPending && <p className="text-sm text-neutral-500">Loading fixtures…</p>}
      {fixtures.isError && (
        <p className="text-sm text-red-600">Could not load fixtures. Is the worker running?</p>
      )}
      {lock.isError && (
        <p className="text-sm text-red-600">{(lock.error as Error).message}</p>
      )}

      {(fixtures.data ?? []).map((fixture) => (
        <PickCard
          key={fixture.fixtureId}
          fixture={fixture}
          pickedOutcome={pickedByFixture.get(fixture.fixtureId) ?? null}
          locking={lock.isPending}
          onPick={(outcome) => lock.mutate({ fixtureId: fixture.fixtureId, outcome })}
        />
      ))}
    </div>
  );
}
