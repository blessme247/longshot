export interface TxLineConfig {
  baseUrl: string;
  apiKey: string;
}

// TODO: confirm base URL and auth scheme against https://txline-docs.txodds.com/documentation/quickstart
export function loadTxLineConfig(env: Record<string, string | undefined>): TxLineConfig {
  const baseUrl = env.TXLINE_BASE_URL;
  const apiKey = env.TXLINE_API_KEY;

  if (!baseUrl || !apiKey) {
    throw new Error("TXLINE_BASE_URL and TXLINE_API_KEY must be set");
  }

  return { baseUrl, apiKey };
}
