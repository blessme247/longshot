// Retries /api/token/activate for an already-confirmed subscribe tx and
// prints the raw response, tolerating both JSON and plain-string bodies.
// Usage: NETWORK=devnet node reactivate.mjs <txSig>
import { Keypair } from "@solana/web3.js";
import nacl from "tweetnacl";
import fs from "node:fs";

const HOSTS = {
  devnet: "https://txline-dev.txodds.com",
  mainnet: "https://txline.txodds.com",
};

const network = process.env.NETWORK ?? "devnet";
const host = HOSTS[network];
const txSig = process.argv[2];
if (!host || !txSig) {
  console.error("Usage: NETWORK=devnet|mainnet node reactivate.mjs <txSig>");
  process.exit(1);
}

const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? "./ops-keypair.json";
const SELECTED_LEAGUES = [];

const opsKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"))),
);

const authRes = await fetch(`${host}/auth/guest/start`, { method: "POST" });
if (!authRes.ok) throw new Error(`guest/start failed: ${authRes.status}`);
const { token: jwt } = await authRes.json();

const message = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
const walletSignature = Buffer.from(
  nacl.sign.detached(new TextEncoder().encode(message), opsKeypair.secretKey),
).toString("base64");

const res = await fetch(`${host}/api/token/activate`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
});

const rawBody = await res.text();
console.log("Status:", res.status);
console.log("Content-Type:", res.headers.get("content-type"));
console.log(***REMOVED***);

if (!res.ok) process.exit(1);

let apiToken;
try {
  const parsed = JSON.parse(rawBody);
  apiToken = typeof parsed === "string" ? parsed : parsed?.token;
} catch {
  apiToken = rawBody.trim();
}
if (!apiToken) {
  console.error("Could not extract an API token from the response.");
  process.exit(1);
}

console.log("\nVerifying with a fixtures pull...");
const verifyRes = await fetch(`${host}/api/fixtures/snapshot`, {
  headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
});
const verifyBody = await verifyRes.text();
console.log("Fixtures snapshot status:", verifyRes.status);
console.log("Fixtures snapshot body (first 500 chars):", verifyBody.slice(0, 500));

console.log("\nSet these in your worker/app env:");
// console.log(`***REMOVED***`);
// console.log(`***REMOVED***`);
