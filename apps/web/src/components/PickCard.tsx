import { Lock } from "lucide-react";

import { OddsTicker } from "@/components/OddsTicker";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ApiFixture, Outcome } from "@/lib/api";
import { flag } from "@/lib/flags";
import { riskColor } from "@/lib/risk";
import { cn } from "@/lib/utils";

const LIVE_WINDOW_MS = 2.5 * 3600 * 1000;

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

function KickoffLabel({ fixture }: { fixture: ApiFixture }) {
  const now = Date.now();
  const isLive = !fixture.demo && fixture.kickoffAt <= now && now < fixture.kickoffAt + LIVE_WINDOW_MS;

  if (isLive) {
    return (
      <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-live">
        <span className="live-dot h-1.5 w-1.5 rounded-full bg-live" />
        Live
      </span>
    );
  }
  if (fixture.demo) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-widest text-ink-faint">FT</span>
    );
  }
  return (
    <span className="text-[10px] font-medium uppercase tracking-widest text-ink-muted">
      {new Date(fixture.kickoffAt).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      })}
    </span>
  );
}

export function PickCard({ fixture, pickedOutcome, locking, onPick }: PickCardProps) {
  const { multipliers } = fixture;
  const marketOpen = multipliers !== null;

  return (
    <Card className={cn("w-full", !marketOpen && "opacity-60")}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-sm font-semibold">
            <span className="mr-1">{flag(fixture.home)}</span>
            {fixture.home}
            <span className="mx-1.5 text-ink-faint">v</span>
            <span className="mr-1">{flag(fixture.away)}</span>
            {fixture.away}
          </p>
          <KickoffLabel fixture={fixture} />
        </div>
        <p className="text-[10px] uppercase tracking-widest text-ink-faint">
          Result after 90 mins
        </p>
      </CardHeader>
      <CardContent className="pb-4">
        {!marketOpen ? (
          <p className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-ink-muted">
            Market opens closer to kickoff
          </p>
        ) : (
          <div className="flex gap-2">
            {OUTCOMES.map(({ key, label }) => {
              const multiplier = multipliers[key];
              const picked = pickedOutcome === key;
              return (
                <button
                  key={key}
                  disabled={pickedOutcome !== null || locking}
                  onClick={() => onPick(key)}
                  className={cn(
                    "relative flex flex-1 flex-col items-center rounded-lg border px-1 pb-2 pt-1.5 transition-all",
                    picked
                      ? "border-gold bg-gold/10 shadow-gold-glow"
                      : "border-line bg-raised hover:border-line-bright",
                    pickedOutcome !== null && !picked && "opacity-40",
                    "disabled:cursor-not-allowed",
                  )}
                >
                  {picked && <Lock className="absolute right-1.5 top-1.5 h-3 w-3 text-gold" />}
                  <OddsTicker
                    value={multiplier}
                    color={picked ? "var(--gold)" : riskColor(multiplier)}
                    className="text-3xl leading-tight"
                  />
                  <span className="w-full truncate text-center text-[10px] font-medium uppercase tracking-wide text-ink-muted">
                    {label(fixture)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
