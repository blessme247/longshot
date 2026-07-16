export interface TxLineConfig {
  baseUrl: string;
  jwt: string;
  apiToken: string;
}

// Every data request needs both credentials per the quickstart:
// Authorization: Bearer <guest JWT from startGuestSession>, X-Api-Token: <activated API token>.
export function txLineHeaders(config: TxLineConfig): HeadersInit {
  return {
    Authorization: `Bearer ${config.jwt}`,
    "X-Api-Token": config.apiToken,
  };
}

export function loadTxLineEnv(env: Record<string, string | undefined>): { baseUrl: string; apiToken: string } {
  const baseUrl = env.TXLINE_BASE_URL;
  const apiToken = env.TXLINE_API_TOKEN;

  if (!baseUrl || !apiToken) {
    throw new Error("TXLINE_BASE_URL and TXLINE_API_TOKEN must be set");
  }

  return { baseUrl, apiToken };
}
