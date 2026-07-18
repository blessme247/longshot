const LIMIT_PER_MINUTE = 30;

// Per-isolate, best-effort: resets when the isolate recycles and is not
// shared across colos. Acceptable for a soft cap — spending KV writes to
// protect KV quota was self-defeating on the free tier.
const counters = new Map<string, { bucket: number; count: number }>();

export function rateLimited(request: Request): boolean {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bucket = Math.floor(Date.now() / 60_000);

  const entry = counters.get(ip);
  if (!entry || entry.bucket !== bucket) {
    counters.set(ip, { bucket, count: 1 });
    if (counters.size > 10_000) counters.clear();
    return false;
  }

  entry.count++;
  return entry.count > LIMIT_PER_MINUTE;
}
