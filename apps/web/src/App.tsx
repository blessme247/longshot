import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { AccountChip } from "@/components/AccountChip";
import { Leaderboard } from "@/components/Leaderboard";
import { MyPicks } from "@/components/MyPicks";
import { PickCard } from "@/components/PickCard";
import { PickCardSkeleton } from "@/components/PickCardSkeleton";
import { fetchFixtures, fetchPicks, lockPick, type ApiFixture, type ApiPick, type Outcome } from "@/lib/api";
import { getSession } from "@/lib/auth";
import { getUserId } from "@/lib/user";
import { cn } from "@/lib/utils";

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

// Never surface raw server strings like "internal error" on a card.
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("frozen")) return "This match has kicked off — picks are locked.";
  if (m.includes("no odds")) return "Odds aren't open for this match yet. Try again shortly.";
  if (m.includes("rate")) return "You're going a bit fast — give it a second and retry.";
  if (m.includes("internal") || m.includes("failed") || m.includes("500")) {
    return "Something went wrong locking that pick. Please try again.";
  }
  return message;
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
  const [view, setView] = useState<"picks" | "board">("picks");

  const guestId = getUserId();
  const identity = getSession()?.pubkey ?? guestId;

  // Poll fast while a fixture is in-play (live scores), slow otherwise.
  const LIVE_WINDOW_MS = 2.5 * 3600 * 1000;
  const anyLive = (list: ApiFixture[]) =>
    list.some((f) => f.kickoffAt <= Date.now() && Date.now() < f.kickoffAt + LIVE_WINDOW_MS);

  const fixtures = useQuery({
    queryKey: ["fixtures"],
    queryFn: fetchFixtures,
    refetchInterval: (query) => (anyLive(query.state.data ?? []) ? 10_000 : 60_000),
  });

  const fixtureIds = (fixtures.data ?? []).map((f) => f.fixtureId);
  const fixtureIdsCsv = fixtureIds.join(",");
  const pollMs = anyLive(fixtures.data ?? []) ? 10_000 : 60_000;

  const picksKey = ["picks", identity, identityEpoch, fixtureIdsCsv];

  const picks = useQuery({
    queryKey: picksKey,
    queryFn: () => fetchPicks(guestId, fixtureIds),
    enabled: fixtureIds.length > 0,
    refetchInterval: pollMs,
  });

  // Fully optimistic: the pick lands in My Picks synchronously on tap
  // (in-flight style), confirms with the server-snapshotted multiplier, and
  // rolls back visibly on failure. Nothing blocks on the round-trip.
  const lock = useMutation({
    mutationFn: (vars: { fixtureId: number; outcome: Outcome }) =>
      lockPick({ userId: guestId, ...vars }),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey: ["picks"] });
      const previous = queryClient.getQueryData<ApiPick[]>(picksKey);
      const fixture = fixtures.data?.find((f) => f.fixtureId === vars.fixtureId);
      const multiplier = fixture?.multipliers?.[vars.outcome] ?? 0;
      const optimistic: ApiPick = {
        userId: identity,
        fixtureId: vars.fixtureId,
        outcome: vars.outcome,
        multiplier,
        lockedAt: Date.now(),
        demo: fixture?.demo ?? false,
        home: fixture?.home ?? "",
        away: fixture?.away ?? "",
        kickoffAt: fixture?.kickoffAt ?? 0,
        status: "locked",
        homeGoals: null,
        awayGoals: null,
        creditedPoints: null,
        potentialPoints: Math.round(100 * multiplier),
        optimistic: true,
      };
      queryClient.setQueryData<ApiPick[]>(picksKey, (old) => [
        optimistic,
        ...(old ?? []).filter((p) => p.fixtureId !== vars.fixtureId),
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(picksKey, context.previous);
    },
    onSuccess: (pick) => {
      queryClient.setQueryData<ApiPick[]>(picksKey, (old) =>
        (old ?? []).map((p) =>
          p.fixtureId === pick.fixtureId
            ? {
                ...p,
                ...pick,
                status: pick.demo ? p.status : "locked",
                potentialPoints: Math.round(100 * pick.multiplier),
                optimistic: false,
              }
            : p,
        ),
      );
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["picks"] }),
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
            Long<span className="text-gold">shot</span>
          </h1>
          <p className="text-xs text-ink-muted">
            Pick results, earn more when the longshot lands.
          </p>
        </div>
        <AccountChip onIdentityChange={() => setIdentityEpoch((e) => e + 1)} />
      </header>

      <nav className="flex gap-1 px-1">
        {(["picks", "board"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setView(tab)}
            className={cn(
              "rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors",
              view === tab ? "bg-raised text-ink" : "text-ink-faint hover:text-ink-muted",
            )}
          >
            {tab === "picks" ? "Matches" : "Leaderboard"}
          </button>
        ))}
      </nav>

      {view === "board" && <Leaderboard />}

      {view === "picks" && (
        <>
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
        <div className="flex items-center justify-between gap-2 rounded-lg border border-loss-muted/40 bg-surface px-3 py-2.5 text-xs text-loss">
          <span>Couldn't load matches. Check your connection.</span>
          <button
            onClick={() => fixtures.refetch()}
            className="shrink-0 rounded border border-loss-muted/50 px-2 py-0.5 font-semibold uppercase tracking-widest"
          >
            Retry
          </button>
        </div>
      )}
      {lock.isError && (
        <p className="rounded-lg border border-loss-muted/40 bg-surface px-3 py-2.5 text-xs text-loss">
          {friendlyError((lock.error as Error).message)}
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
        </>
      )}
    </div>
  );
}
