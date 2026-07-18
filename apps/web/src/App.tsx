import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MyPicks } from "@/components/MyPicks";
import { PickCard } from "@/components/PickCard";
import { PickCardSkeleton } from "@/components/PickCardSkeleton";
import { fetchFixtures, fetchPicks, lockPick, type ApiFixture, type Outcome } from "@/lib/api";
import { getUserId } from "@/lib/user";

const userId = getUserId();

function biggestPayout(fixtures: ApiFixture[]): { team: string; multiplier: number } | null {
  let best: { team: string; multiplier: number } | null = null;
  for (const f of fixtures) {
    if (!f.multipliers) continue;
    const options = [
      { team: f.home, multiplier: f.multipliers.home },
      { team: "the draw", multiplier: f.multipliers.draw },
      { team: f.away, multiplier: f.multipliers.away },
    ];
    for (const o of options) {
      if (!best || o.multiplier > best.multiplier) best = o;
    }
  }
  return best;
}

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

  const nudge =
    picks.isSuccess && picks.data.length === 0 && fixtures.data
      ? biggestPayout(fixtures.data)
      : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-3 px-3 py-4">
      <header className="px-1 pt-1">
        <h1 className="font-condensed text-2xl font-bold uppercase tracking-wide">
          Under<span className="text-gold">dog</span>
        </h1>
        <p className="text-xs text-ink-muted">
          Pick results, earn more when the underdog hits.
        </p>
      </header>

      <MyPicks picks={picks.data ?? []} />

      {nudge && (
        <p className="rounded-lg border border-line bg-surface px-3 py-2.5 text-xs text-ink-muted">
          No picks yet — today's biggest payout is{" "}
          <span className="font-condensed text-sm font-bold tabular-nums text-gold">
            {nudge.multiplier.toFixed(2)}x
          </span>{" "}
          on {nudge.team}.
        </p>
      )}

      {fixtures.isPending &&
        [0, 1, 2, 3].map((i) => <PickCardSkeleton key={i} />)}
      {fixtures.isError && (
        <p className="rounded-lg border border-loss-muted/40 bg-surface px-3 py-2.5 text-xs text-loss">
          Could not load fixtures. Is the worker running?
        </p>
      )}
      {lock.isError && (
        <p className="rounded-lg border border-loss-muted/40 bg-surface px-3 py-2.5 text-xs text-loss">
          {(lock.error as Error).message}
        </p>
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
