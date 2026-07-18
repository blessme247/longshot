import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import type { Env } from "./env";
import { isWalletIdentity } from "./identity";
import { issueSession } from "./session";

const NONCE_TTL_SECONDS = 300;
const SIGN_IN_DOMAIN = "underdog-web.kamigo.workers.dev";

// Fixed template — the server reconstructs this exact message for
// verification, so a captured signature is only ever valid for one nonce.
export function signInMessage(nonce: string): string {
  return `${SIGN_IN_DOMAIN} wants you to sign in with your Solana account.\n\nThis signature proves you own this wallet. It is free and sends no transaction.\n\nNonce: ${nonce}`;
}

export async function issueNonce(env: Env): Promise<{ nonce: string; message: string }> {
  const nonce = crypto.randomUUID();
  await env.PICKS.put(`nonce:${nonce}`, "1", { expirationTtl: NONCE_TTL_SECONDS });
  return { nonce, message: signInMessage(nonce) };
}

export async function verifySignIn(
  env: Env,
  body: { pubkey: string; signature: string; nonce: string },
): Promise<{ token: string; pubkey: string } | { error: string; status: number }> {
  const nonceKey = `nonce:${body.nonce}`;
  const nonceExists = await env.PICKS.get(nonceKey);
  if (!nonceExists) {
    return { error: "nonce expired or already used", status: 401 };
  }
  await env.PICKS.delete(nonceKey);

  if (!isWalletIdentity(body.pubkey)) {
    return { error: "invalid pubkey", status: 400 };
  }

  let signature: Uint8Array;
  try {
    signature = Uint8Array.from(atob(body.signature), (c) => c.charCodeAt(0));
  } catch {
    return { error: "signature must be base64", status: 400 };
  }

  const message = new TextEncoder().encode(signInMessage(body.nonce));
  const pubkeyBytes = new PublicKey(body.pubkey).toBytes();

  if (!nacl.sign.detached.verify(message, signature, pubkeyBytes)) {
    return { error: "signature verification failed", status: 401 };
  }

  const token = await issueSession(env, body.pubkey);
  return { token, pubkey: body.pubkey };
}

// Display-only linking: pick records are never rewritten (committed leaf
// hashes embed the original identity permanently). Reads resolve through
// these mappings instead.
export async function linkGuest(
  env: Env,
  pubkey: string,
  guestId: string,
): Promise<{ linked: true } | { error: string; status: number }> {
  const existing = await env.PICKS.get(`link:${guestId}`);
  if (existing && existing !== pubkey) {
    return { error: "guest identity already linked to a different wallet", status: 409 };
  }
  if (existing === pubkey) {
    return { linked: true };
  }

  await env.PICKS.put(`link:${guestId}`, pubkey);

  const reverseRaw = await env.PICKS.get(`linkw:${pubkey}`);
  const guestIds: string[] = reverseRaw ? JSON.parse(reverseRaw) : [];
  if (!guestIds.includes(guestId)) {
    guestIds.push(guestId);
    await env.PICKS.put(`linkw:${pubkey}`, JSON.stringify(guestIds));
  }

  return { linked: true };
}

export async function linkedGuestIds(env: Env, pubkey: string): Promise<string[]> {
  const raw = await env.PICKS.get(`linkw:${pubkey}`);
  return raw ? JSON.parse(raw) : [];
}
