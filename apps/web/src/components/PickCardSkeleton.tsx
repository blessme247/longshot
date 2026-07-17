import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PickCardSkeleton() {
  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="mt-1 h-3.5 w-56" />
      </CardHeader>
      <CardContent className="flex gap-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex flex-1 flex-col items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-2.5"
          >
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-5 w-12" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
