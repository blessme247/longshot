import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiFixture, Outcome } from "@/lib/api";
import { cn } from "@/lib/utils";

const OUTCOMES: { key: Outcome; label: (f: ApiFixture) => string }[] = [
  { key: "home", label: (f) => f.home },
  { key: "draw", label: () => "Draw" },
  { key: "away", label: (f) => f.away },
];

interface PickCardProps {
  fixture: ApiFixture;
  pickedOutcome: Outcome | null;
  locking: boolean;
  onPick: (outcome: Outcome) => void;
}

export function PickCard({ fixture, pickedOutcome, locking, onPick }: PickCardProps) {
  const { multipliers } = fixture;
  if (!multipliers) return null;

  const best = Math.max(multipliers.home, multipliers.draw, multipliers.away);
  const kickoff = new Date(fixture.kickoffAt);

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-baseline justify-between text-base">
          <span>
            {fixture.home} v {fixture.away}
          </span>
          {fixture.demo && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700">
              replay
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-neutral-500">
          Result after 90 mins ·{" "}
          {kickoff.toLocaleString(undefined, {
            weekday: "short",
            hour: "2-digit",
            minute: "2-digit",
            day: "numeric",
            month: "short",
          })}
        </p>
      </CardHeader>
      <CardContent className="flex gap-2">
        {OUTCOMES.map(({ key, label }) => {
          const multiplier = multipliers[key];
          const picked = pickedOutcome === key;
          const isUnderdog = multiplier === best;
          return (
            <button
              key={key}
              disabled={pickedOutcome !== null || locking}
              onClick={() => onPick(key)}
              className={cn(
                "flex flex-1 flex-col items-center rounded-lg border px-2 py-2.5 text-sm transition-colors",
                picked
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-200 bg-white hover:border-neutral-400",
                pickedOutcome !== null && !picked && "opacity-40",
                "disabled:cursor-not-allowed",
              )}
            >
              <span className="truncate text-xs font-medium">{label(fixture)}</span>
              <span
                className={cn(
                  "mt-1 text-base font-semibold tabular-nums",
                  !picked && isUnderdog && "text-emerald-600",
                )}
              >
                {multiplier.toFixed(2)}x
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}
