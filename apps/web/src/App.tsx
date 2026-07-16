import { toMultipliers } from "@underdog/txline";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const sampleMultipliers = toMultipliers([
  { fixtureId: "demo", market: "90min_result", outcome: "home", decimalOdds: 1.3, observedAt: new Date().toISOString() },
  { fixtureId: "demo", market: "90min_result", outcome: "draw", decimalOdds: 4.5, observedAt: new Date().toISOString() },
  { fixtureId: "demo", market: "90min_result", outcome: "away", decimalOdds: 6.2, observedAt: new Date().toISOString() },
]);

export function App() {
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Underdog — scaffold check</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {sampleMultipliers.map((m) => (
            <div key={m.outcome} className="flex justify-between text-sm">
              <span className="capitalize">{m.outcome}</span>
              <span>{m.multiplier.toFixed(2)}x</span>
            </div>
          ))}
        </CardContent>
      </Card>
      <Button>Pick</Button>
    </div>
  );
}
