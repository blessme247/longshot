// Generates a dedicated ops keypair for the TxLINE mainnet subscription flow.
// Run: npm install && npm run generate-keypair
// Output path is gitignored — never commit ops-keypair.json.
import { Keypair } from "@solana/web3.js";
import fs from "node:fs";

const OUT_PATH = process.env.KEYPAIR_PATH ?? "./ops-keypair.json";

if (fs.existsSync(OUT_PATH)) {
  console.error(`${OUT_PATH} already exists — refusing to overwrite. Delete it first if you want a new one.`);
  process.exit(1);
}

const keypair = Keypair.generate();
fs.writeFileSync(OUT_PATH, JSON.stringify(Array.from(keypair.secretKey)));

// Public key is safe to print (it is not a credential) and is needed to fund
// the wallet. The secret key is only ever written to the gitignored file.
console.log("Ops keypair generated.");
console.log("Public key (fund this address):", keypair.publicKey.toBase58());
