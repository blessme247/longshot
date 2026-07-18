import type { Env } from "./env";

const LIMIT_PER_MINUTE = 30;

// Soft limit: KV counters are eventually consistent, so bursts can exceed the
// cap slightly. Good enough to stop unbounded KV writes from anonymous input.
export async function rateLimited(env: Env, request: Request): Promise<boolean> {
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const bucket = Math.floor(Date.now() / 60_000);
  const key = `rl:${ip}:${bucket}`;

  const current = Number((await env.PICKS.get(key)) ?? "0");
  if (current >= LIMIT_PER_MINUTE) return true;

  await env.PICKS.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}
