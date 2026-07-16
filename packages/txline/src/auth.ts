// Docs: https://txline-docs.txodds.com/api-reference/authentication/start-a-new-guest-session
// POST {baseUrl}/auth/guest/start -> { token }, valid 30 days, no request body/auth required.
export async function startGuestSession(baseUrl: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/guest/start`, { method: "POST" });

  if (!res.ok) {
    throw new Error(`TxLINE guest session request failed: ${res.status}`);
  }

  const body = (await res.json()) as { token: string };
  return body.token;
}

// TODO: /api/token/activate exchanges a signed on-chain subscription tx for the
// long-lived API token (X-Api-Token). This is a one-time provisioning step done
// via the Solana wallet flow, not a runtime data call — implement once the
// wallet-adapter integration (CLAUDE.md day 2) is in place.
