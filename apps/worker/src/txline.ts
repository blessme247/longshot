import { startGuestSession, type TxLineConfig } from "@underdog/txline";

import type { Env } from "./env";

// Guest JWTs live 30 days; cache per-isolate and renew once on 401.
let cachedJwt: string | null = null;

export async function withTxLine<T>(
  env: Env,
  fn: (config: TxLineConfig) => Promise<T>,
): Promise<T> {
  cachedJwt ??= await startGuestSession(env.TXLINE_BASE_URL);

  const config: TxLineConfig = {
    baseUrl: env.TXLINE_BASE_URL,
    jwt: cachedJwt,
    apiToken: env.TXLINE_API_TOKEN,
  };

  try {
    return await fn(config);
  } catch (err) {
    if (err instanceof Error && err.message.includes(": 401")) {
      cachedJwt = await startGuestSession(env.TXLINE_BASE_URL);
      return fn({ ...config, jwt: cachedJwt });
    }
    throw err;
  }
}
