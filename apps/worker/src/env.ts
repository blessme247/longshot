export interface Env {
  TXLINE_BASE_URL: string;
  TXLINE_API_TOKEN: string;
  RPC_URL: string;
  ALLOWED_ORIGINS: string;
  SESSION_SECRET: string;
  OPS_KEYPAIR_JSON: string;
  PICKS: KVNamespace;
}
