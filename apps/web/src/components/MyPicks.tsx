import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";

import { CountUp } from "@/components/CountUp";
import { VerifyPanel } from "@/components/VerifyPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ApiPick } from "@/lib/api";
import { flag } from "@/lib/flags";
import { cn } from "@/lib/utils";

const OUTCOME_LABEL = (pick: ApiPick): string =>
  pick.outcome === "home" ? pick.home : pick.outcome === "away" ? pick.away : "Draw";

function statusStyle(pick: ApiPick): string {
  switch (pick.status) {
    case "won":
      return "bg-win/15 text-win";
    case "lost":
      return "bg-loss/15 text-loss";
    case "hitting":
      return "bg-win-muted/20 text-win-muted";
    case "busted":
      return "bg-loss-muted/20 text-loss-muted";
    default:
      return "bg-raised text-ink-muted";
  }
}

function StatusChip({ pick }: { pick: ApiPick }) {
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={pick.status}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest",
          statusStyle(pick),
        )}
      >
        {pick.status}
      </motion.span>
    </AnimatePresence>
  );
}

function Points({ pick }: { pick: ApiPick }) {
  // The settlement money moment: credited points count up in gold.
  if (pick.status === "won" && pick.creditedPoints !== null) {
    return (
      <span className="font-condensed text-base font-bold tabular-nums text-gold">
        <CountUp to={pick.creditedPoints} /> pts won
      </span>
    );
  }
  if (pick.demo) {
    return (
      <span className="text-xs tabular-nums text-ink-muted">
        {pick.potentialPoints} practice pts
      </span>
    );
  }
  return (
    <span
      className={cn(
        "text-xs tabular-nums",
        pick.status === "lost" || pick.status === "busted"
          ? "text-ink-faint line-through"
          : "text-ink-muted",
      )}
    >
      {pick.potentialPoints} pts
    </span>
  );
}

function PickRow({ pick }: { pick: ApiPick }) {
  const [showVerify, setShowVerify] = useState(false);
  const verifiable = !pick.demo && pick.kickoffAt <= Date.now();

  return (
    <motion.div layout className="flex flex-col gap-2 rounded-lg border border-line bg-raised px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-baseline gap-2 text-sm">
            <span className="truncate font-medium">
              {flag(pick.home)} {pick.home}
              <span className="mx-1 text-ink-faint">v</span>
              {flag(pick.away)} {pick.away}
            </span>
            {pick.homeGoals !== null && (
              <span className="shrink-0 font-condensed text-lg font-bold tabular-nums">
                {pick.homeGoals}–{pick.awayGoals}
              </span>
            )}
          </p>
          <p className="truncate text-xs text-ink-muted">
            {OUTCOME_LABEL(pick)} @{" "}
            <span className="font-condensed font-semibold tabular-nums">
              {pick.multiplier.toFixed(2)}x
            </span>{" "}
            · <Points pick={pick} />
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {verifiable && (
            <button
              onClick={() => setShowVerify((v) => !v)}
              className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-ink-muted hover:border-line-bright"
            >
              Verify
            </button>
          )}
          <StatusChip pick={pick} />
        </div>
      </div>
      {showVerify && <VerifyPanel pick={pick} identity={pick.userId} />}
    </motion.div>
  );
}

export function MyPicks({ picks }: { picks: ApiPick[] }) {
  if (picks.length === 0) return null;

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
          My picks
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {picks.map((pick) => (
          <PickRow key={`${pick.userId}:${pick.fixtureId}`} pick={pick} />
        ))}
      </CardContent>
    </Card>
  );
}
