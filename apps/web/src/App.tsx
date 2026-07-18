import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { MyPicks } from "@/components/MyPicks";
import { PickCard } from "@/components/PickCard";
import { PickCardSkeleton } from "@/components/PickCardSkeleton";
import { fetchFixtures, fetchPicks, lockPick, type ApiFixture, type Outcome } from "@/lib/api";
import { getUserId } from "@/lib/user";

const userId = getUserId();

interface Nudge {
  team: string;
  multiplier: number;
  replay: boolean;
}

function biggestPayout(fixtures: ApiFixture[], replay: boolean): Nudge | null {
  let best: Nudge | null = null;
  for (const f of fixtures) {
    if (!f.multipliers || f.demo !== replay) continue;
    const options = [
      { team: f.home, multiplier: f.multipliers.home },
      { team: "the draw", multiplier: f.multipliers.draw },
      { team: f.away, multiplier: f.multipliers.away },
    ];
    for (const o of options) {
      if (!best || o.multiplier > best.multiplier) best = { ...o, replay };
    }
  }
  return best;
}

function SectionHeader({ title, tagline }: { title: string; tagline?: string }) {
  return (
    <div className="px-1 pt-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
        {title}
      </h2>
      {tagline && <p className="text-xs text-ink-faint">{tagline}</p>}
    </div>
  );
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

  const liveUpcoming = (fixtures.data ?? []).filter((f) => !f.demo);
  const replays = (fixtures.data ?? []).filter((f) => f.demo);

  const nudge =
    picks.isSuccess && picks.data.length === 0 && fixtures.data
      ? (biggestPayout(fixtures.data, false) ?? biggestPayout(fixtures.data, true))
      : null;

  const renderCard = (fixture: ApiFixture) => (
    <PickCard
      key={fixture.fixtureId}
      fixture={fixture}
      pickedOutcome={pickedByFixture.get(fixture.fixtureId) ?? null}
      locking={lock.isPending}
      onPick={(outcome) => lock.mutate({ fixtureId: fixture.fixtureId, outcome })}
    />
  );

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
          {nudge.replay ? "No live markets open yet — try a replay: " : "No picks yet — today's biggest payout is "}
          <span className="font-condensed text-sm font-bold tabular-nums text-gold">
            {nudge.multiplier.toFixed(2)}x
          </span>{" "}
          on {nudge.team}.
        </p>
      )}

      {fixtures.isLoading &&
        [0, 1, 2, 3].map((i) => <PickCardSkeleton key={i} />)}
      {fixtures.isError && (
        <p className="rounded-lg border border-loss-muted/40 bg-surface px-3 py-2.5 text-xs text-loss">
          Could not load fixtures. Check your internet connectivity!
        </p>
      )}
      {lock.isError && (
        <p className="rounded-lg border border-loss-muted/40 bg-surface px-3 py-2.5 text-xs text-loss">
          {(lock.error as Error).message}
        </p>
      )}

      {liveUpcoming.length > 0 && <SectionHeader title="Live & Upcoming" />}
      {liveUpcoming.map(renderCard)}

      {replays.length > 0 && (
        <SectionHeader
          title="Replays"
          tagline="Missed the tournament? Lock picks at real historical odds."
        />
      )}
      {replays.map(renderCard)}
    </div>
  );
}
