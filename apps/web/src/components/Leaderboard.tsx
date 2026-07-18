import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchLeaderboard } from "@/lib/api";
import { getSession, truncateAddress } from "@/lib/auth";
import { getUserId } from "@/lib/user";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const isGuest = (identity: string) => identity.includes("-");

function displayName(identity: string): string {
  return isGuest(identity) ? `Guest ${identity.slice(0, 4)}` : truncateAddress(identity);
}

export function Leaderboard() {
  const board = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
    refetchInterval: 15_000,
  });

  // Signed-in users appear under their wallet row (linked guests fold in
  // server-side); guests under their own id.
  const myIdentity = getSession()?.pubkey ?? getUserId();

  if (board.isLoading) {
    return (
      <Card className="w-full">
        <CardHeader className="pb-2">
          <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
            Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const rows = board.data ?? [];

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-widest text-ink-muted">
          Leaderboard
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        {rows.length === 0 && (
          <p className="py-3 text-center text-xs text-ink-muted">
            No settled picks yet — the board fills at full time.
          </p>
        )}
        {rows.map((row, i) => {
          const mine = row.identity === myIdentity;
          return (
            <motion.div
              layout
              key={row.identity}
              transition={{ type: "spring", stiffness: 350, damping: 30 }}
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2",
                mine ? "border-gold/60 bg-gold/10" : "border-line bg-raised",
              )}
            >
              <span
                className={cn(
                  "w-6 shrink-0 text-center font-condensed text-lg font-bold tabular-nums",
                  i === 0 ? "text-gold" : "text-ink-muted",
                )}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm font-medium", mine && "text-gold")}>
                  {displayName(row.identity)}
                  {mine && <span className="ml-1.5 text-[10px] uppercase tracking-widest">you</span>}
                </p>
                <p className="text-[11px] text-ink-muted">
                  {row.won}/{row.played} picks hit
                </p>
              </div>
              <span className="shrink-0 font-condensed text-xl font-bold tabular-nums">
                {row.points}
                <span className="ml-1 text-[10px] font-medium uppercase text-ink-muted">pts</span>
              </span>
            </motion.div>
          );
        })}
      </CardContent>
    </Card>
  );
}
