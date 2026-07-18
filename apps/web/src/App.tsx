import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AccountChip } from "@/components/AccountChip";
import { MyPicks } from "@/components/MyPicks";
import { PickCard } from "@/components/PickCard";
import { PickCardSkeleton } from "@/components/PickCardSkeleton";
import { fetchFixtures, fetchPicks, lockPick, type ApiFixture, type ApiPick, type Outcome } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getUserId } from "@/lib/user";

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
  // Bumped by AccountChip on sign-in/out so identity-derived state recomputes.
  const [identityEpoch, setIdentityEpoch] = useState(0);

  const guestId = getUserId();
  const identity = getSession()?.pubkey ?? guestId;

  const fixtures = useQuery({
    queryKey: ["fixtures"],
    queryFn: fetchFixtures,
    refetchInterval: 15_000,
  });

  const picks = useQuery({
    queryKey: ["picks", identity, identityEpoch],
    queryFn: () => fetchPicks(guestId),
    refetchInterval: 15_000,
  });

  const lock = useMutation({
    mutationFn: (vars: { fixtureId: number; outcome: Outcome }) =>
      lockPick({ userId: guestId, ...vars }),
    onSuccess: (pick) => {
      // Real picks render as locked immediately; replays need the server's
      // reveal data, so they wait for the refetch.
      if (!pick.demo) {
        queryClient.setQueryData<ApiPick[]>(["picks", identity, identityEpoch], (old) => {
          const optimistic: ApiPick = {
            ...pick,
            status: "locked",
            homeGoals: null,
            awayGoals: null,
            creditedPoints: null,
            potentialPoints: Math.round(100 * pick.multiplier),
          };
          const rest = (old ?? []).filter((p) => p.fixtureId !== pick.fixtureId);
          return [optimistic, ...rest];
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["picks"] });
    },
  });

  const lockingFixtureId = lock.isPending ? lock.variables?.fixtureId ?? null : null;

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
      locking={lockingFixtureId === fixture.fixtureId}
      onPick={(outcome) => lock.mutate({ fixtureId: fixture.fixtureId, outcome })}
    />
  );

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col gap-3 px-3 py-4">
      <header className="flex items-start justify-between px-1 pt-1">
        <div>
          <h1 className="font-condensed text-2xl font-bold uppercase tracking-wide">
            Under<span className="text-gold">dog</span>
          </h1>
          <p className="text-xs text-ink-muted">
            Pick results, earn more when the underdog hits.
          </p>
        </div>
        <AccountChip onIdentityChange={() => setIdentityEpoch((e) => e + 1)} />
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
