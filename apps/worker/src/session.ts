import type { Env } from "./env";

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;

interface SessionPayload {
  pubkey: string;
  exp: number;
}

function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const padded = s.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function hmacKey(env: Env): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(env.SESSION_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function issueSession(env: Env, pubkey: string): Promise<string> {
  const payload: SessionPayload = { pubkey, exp: Date.now() + SESSION_TTL_MS };
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env), body as BufferSource);
  return `${b64url(body)}.${b64url(new Uint8Array(sig))}`;
}

export async function verifySession(env: Env, token: string): Promise<string | null> {
  const [bodyPart, sigPart] = token.split(".");
  if (!bodyPart || !sigPart) return null;

  try {
    const body = fromB64url(bodyPart);
    const sig = fromB64url(sigPart);
    const valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(env),
      sig as BufferSource,
      body as BufferSource,
    );
    if (!valid) return null;

    const payload: SessionPayload = JSON.parse(new TextDecoder().decode(body));
    if (typeof payload.pubkey !== "string" || payload.exp < Date.now()) return null;
    return payload.pubkey;
  } catch {
    return null;
  }
}

export async function sessionFromRequest(env: Env, request: Request): Promise<string | null> {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return verifySession(env, header.slice("Bearer ".length));
}
