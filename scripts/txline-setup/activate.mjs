// Subscribes the ops wallet to TxLINE service level 12 (mainnet, real-time
// World Cup & Int'l Friendlies, free tier) and activates the API token.
//
// Requires:
//   KEYPAIR_PATH  - path to the ops keypair from generate-keypair.mjs (default ./ops-keypair.json)
//   IDL_PATH      - path to the subscription program's Anchor IDL JSON (no default - required)
//   TXLINE_BASE_URL - default https://txline.txodds.com
//   RPC_URL       - default https://api.mainnet-beta.solana.com
//
// Run: npm install && npm run activate -- --yes
// Without --yes, this only prints the derived accounts and current SOL balance
// (dry run) — it does not build or send the transaction.
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import nacl from "tweetnacl";
import fs from "node:fs";

const PROGRAM_ID = new PublicKey("9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA");
const TXL_TOKEN_MINT = new PublicKey("Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL");

const SERVICE_LEVEL_ID = 12; // real-time World Cup & Int'l Friendlies, mainnet, free
const DURATION_WEEKS = 4; // minimum term
const SELECTED_LEAGUES = []; // standard free bundle

const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? "./ops-keypair.json";
const IDL_PATH = process.env.IDL_PATH;
const TXLINE_BASE_URL = process.env.TXLINE_BASE_URL ?? "https://txline.txodds.com";
const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const DRY_RUN = !process.argv.includes("--yes");

if (!IDL_PATH) {
  console.error("Set IDL_PATH to the subscription program's Anchor IDL JSON file.");
  process.exit(1);
}
if (!fs.existsSync(KEYPAIR_PATH)) {
  console.error(`No keypair at ${KEYPAIR_PATH}. Run generate-keypair.mjs first.`);
  process.exit(1);
}

const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8")));
const opsKeypair = Keypair.fromSecretKey(secretKey);
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));

const connection = new Connection(RPC_URL, "confirmed");
const wallet = new Wallet(opsKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
const program = new Program(idl, PROGRAM_ID, provider);

const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")],
  PROGRAM_ID,
);
const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")],
  PROGRAM_ID,
);
const tokenTreasuryVault = getAssociatedTokenAddressSync(
  TXL_TOKEN_MINT,
  tokenTreasuryPda,
  true,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
);
const userTokenAccount = getAssociatedTokenAddressSync(
  TXL_TOKEN_MINT,
  opsKeypair.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
);

const balanceLamports = await connection.getBalance(opsKeypair.publicKey);

console.log("Ops wallet:", opsKeypair.publicKey.toBase58());
console.log("SOL balance:", balanceLamports / 1e9);
console.log("tokenTreasuryPda:", tokenTreasuryPda.toBase58());
console.log("pricingMatrixPda:", pricingMatrixPda.toBase58());
console.log("tokenTreasuryVault:", tokenTreasuryVault.toBase58());
console.log("userTokenAccount:", userTokenAccount.toBase58());
console.log("Service level:", SERVICE_LEVEL_ID, "Duration weeks:", DURATION_WEEKS);

if (DRY_RUN) {
  console.log("\nDry run only — no transaction sent. Re-run with --yes to subscribe for real.");
  process.exit(0);
}

if (balanceLamports === 0) {
  console.error("Ops wallet has 0 SOL — fund it before subscribing.");
  process.exit(1);
}

const txSig = await program.methods
  .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
  .accounts({
    user: opsKeypair.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: TXL_TOKEN_MINT,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();

console.log("Subscribe tx confirmed:", txSig);

const authRes = await fetch(`${TXLINE_BASE_URL}/auth/guest/start`, { method: "POST" });
if (!authRes.ok) throw new Error(`guest/start failed: ${authRes.status}`);
const { token: jwt } = await authRes.json();

const message = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
const signature = nacl.sign.detached(Buffer.from(message), opsKeypair.secretKey);
const walletSignature = Buffer.from(signature).toString("base64");

const activateRes = await fetch(`${TXLINE_BASE_URL}/api/token/activate`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${jwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
});

if (!activateRes.ok) {
  throw new Error(`token/activate failed: ${activateRes.status} ${await activateRes.text()}`);
}

const { apiToken } = await activateRes.json();
console.log("\nActivated. Set this in your worker/app env:");
console.log("***REMOVED***);
