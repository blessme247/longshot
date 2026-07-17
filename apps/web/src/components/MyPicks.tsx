import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiPick } from "@/lib/api";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<ApiPick["status"], string> = {
  pending: "bg-neutral-100 text-neutral-600",
  hitting: "bg-emerald-100 text-emerald-700",
  busted: "bg-red-100 text-red-600",
};

const OUTCOME_LABEL = (pick: ApiPick): string =>
  pick.outcome === "home" ? pick.home : pick.outcome === "away" ? pick.away : "Draw";

export function MyPicks({ picks }: { picks: ApiPick[] }) {
  if (picks.length === 0) return null;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">My picks</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {picks.map((pick) => (
          <div
            key={pick.fixtureId}
            className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">
                {pick.home} v {pick.away}
                {pick.homeGoals !== null && (
                  <span className="ml-1.5 text-neutral-500 tabular-nums">
                    {pick.homeGoals}-{pick.awayGoals}
                  </span>
                )}
              </p>
              <p className="truncate text-xs text-neutral-500">
                {OUTCOME_LABEL(pick)} @ {pick.multiplier.toFixed(2)}x ·{" "}
                {pick.potentialPoints} pts
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                STATUS_STYLES[pick.status],
              )}
            >
              {pick.status}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
