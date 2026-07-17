import type { Env } from "./env";
import { listFixtures } from "./fixtures";
import { lockPick, listPicks } from "./picks";
import { withTxLine } from "./txline";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      if (request.method === "GET" && pathname === "/api/health") {
        return json({ status: "ok" });
      }

      if (request.method === "GET" && pathname === "/api/fixtures") {
        const fixtures = await withTxLine(env, (config) => listFixtures(config));
        return json(fixtures);
      }

      if (request.method === "POST" && pathname === "/api/picks") {
        const body = await request.json<{ userId: string; fixtureId: number; outcome: never }>();
        const result = await withTxLine(env, (config) => lockPick(env, config, body));
        if ("error" in result) {
          return json({ error: result.error }, result.status);
        }
        return json(result.pick, 201);
      }

      if (request.method === "GET" && pathname === "/api/picks") {
        const userId = url.searchParams.get("userId");
        if (!userId) return json({ error: "userId required" }, 400);
        const picks = await withTxLine(env, (config) => listPicks(env, config, userId));
        return json(picks);
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "internal error" }, 500);
    }
  },
};
