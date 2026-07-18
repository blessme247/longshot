import { issueNonce, linkGuest, verifySignIn } from "./auth";
import { buildProofResponse, commitmentKey, runCommitments } from "./commit";
import { getRegistry } from "./registry";
import { leaderboard, runSettlements } from "./settle";
import type { Env } from "./env";
import { getFixtureById, listFixtures } from "./fixtures";
import { isGuestIdentity } from "./identity";
import { listPicks, upsertPick } from "./picks";
import { rateLimited } from "./ratelimit";
import { linkBodySchema, pickBodySchema, proofQuerySchema, verifyBodySchema } from "./schemas";
import { sessionFromRequest } from "./session";
import { withTxLine } from "./txline";

function corsHeaders(env: Env, request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = env.ALLOWED_ORIGINS.split(",");
  return {
    "Access-Control-Allow-Origin": origin && allowed.includes(origin) ? origin : allowed[0]!,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const cors = corsHeaders(env, request);

    const json = (body: unknown, status = 200): Response =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...cors },
      });

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    try {
      if (request.method === "GET" && pathname === "/api/health") {
        return json({ status: "ok" });
      }

      if (request.method === "GET" && pathname === "/api/fixtures") {
        const fixtures = await withTxLine(env, (config) => listFixtures(config));
        return json(fixtures);
      }

      if (request.method === "GET" && pathname === "/api/auth/nonce") {
        if (rateLimited(request)) return json({ error: "rate limited" }, 429);
        return json(await issueNonce(env));
      }

      if (request.method === "POST" && pathname === "/api/auth/verify") {
        if (rateLimited(request)) return json({ error: "rate limited" }, 429);
        const parsed = verifyBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid body" }, 400);
        const result = await verifySignIn(env, parsed.data);
        if ("error" in result) return json({ error: result.error }, result.status);
        return json(result);
      }

      if (request.method === "POST" && pathname === "/api/auth/link") {
        const pubkey = await sessionFromRequest(env, request);
        if (!pubkey) return json({ error: "sign in required" }, 401);
        const parsed = linkBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid body" }, 400);
        const result = await linkGuest(env, pubkey, parsed.data.guestId);
        if ("error" in result) return json({ error: result.error }, result.status);
        return json(result);
      }

      if (request.method === "POST" && pathname === "/api/picks") {
        if (rateLimited(request)) return json({ error: "rate limited" }, 429);
        const parsed = pickBodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ error: "invalid body" }, 400);

        // Authenticated identity always wins; guests must supply a UUID.
        const pubkey = await sessionFromRequest(env, request);
        const identity = pubkey ?? parsed.data.userId;
        if (!identity || (!pubkey && !isGuestIdentity(identity))) {
          return json({ error: "sign in or supply a guest UUID userId" }, 400);
        }

        const result = await withTxLine(env, (config) =>
          upsertPick(env, config, identity, parsed.data),
        );
        if ("error" in result) return json({ error: result.error }, result.status);
        return json(result.pick, 201);
      }

      if (request.method === "GET" && pathname === "/api/picks") {
        const pubkey = await sessionFromRequest(env, request);
        const userId = url.searchParams.get("userId");
        const identity = pubkey ?? userId;
        if (!identity || (!pubkey && !isGuestIdentity(identity))) {
          return json({ error: "sign in or supply a guest UUID userId" }, 400);
        }
        const picks = await withTxLine(env, (config) =>
          listPicks(env, config, identity, pubkey !== null),
        );
        return json(picks);
      }

      if (request.method === "GET" && pathname === "/api/leaderboard") {
        return json(await leaderboard(env));
      }

      if (request.method === "GET" && pathname.startsWith("/api/commitments/")) {
        const fixtureId = Number(pathname.split("/").pop());
        if (!Number.isInteger(fixtureId)) return json({ error: "invalid fixture id" }, 400);
        const record = await env.PICKS.get(commitmentKey(fixtureId));
        if (!record) return json({ error: "not committed" }, 404);
        return json(JSON.parse(record));
      }

      if (request.method === "GET" && pathname === "/api/proof") {
        const parsed = proofQuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) return json({ error: "fixtureId and identity required" }, 400);
        const fixture = await withTxLine(env, (config) =>
          getFixtureById(config, parsed.data.fixtureId),
        );
        if (!fixture) return json({ error: "unknown fixture" }, 404);
        const result = await buildProofResponse(env, fixture, parsed.data.identity);
        if ("error" in result) return json({ error: result.error }, result.status);
        return json(result);
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "internal error" }, 500);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // One registry GET per tick; outside action windows nothing else runs.
    // Independent failure domains: settlement runs even if commitments fail
    // and vice versa. Each catches its own per-fixture errors internally.
    ctx.waitUntil(
      (async () => {
        const entries = await getRegistry(env);
        if (entries.length === 0) return;
        await Promise.allSettled([
          runCommitments(env, entries),
          entries.some((e) => !e.settled)
            ? withTxLine(env, (config) => runSettlements(env, config, entries))
            : Promise.resolve(),
        ]);
      })(),
    );
  },
};
