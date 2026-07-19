// Subscribes the ops wallet to the TxLINE free World Cup tier and activates
// the API token. Mirrors tx-on-chain/examples/devnet/common/users.ts.
//
// NETWORK=devnet (default)  -> service level 1, devnet program/mint
// NETWORK=mainnet           -> service level 12 (real-time), mainnet program/mint
//
// Env:
//   KEYPAIR_PATH - ops keypair path (default ./ops-keypair.json)
//   IDL_PATH     - Anchor IDL JSON (default ./txoracle.json, vendored)
//   RPC_URL      - override the default public RPC for the network
//
// Run: npm run activate            (dry run: pre-flight checks only)
//      npm run activate -- --yes   (send the subscribe tx and activate)
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";
import nacl from "tweetnacl";
import fs from "node:fs";

const NETWORKS = {
  devnet: {
    programId: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    txlTokenMint: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
    rpcUrl: "https://api.devnet.solana.com",
    host: "https://txline-dev.txodds.com",
    serviceLevelId: 1,
  },
  mainnet: {
    programId: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    txlTokenMint: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
    rpcUrl: "https://api.mainnet-beta.solana.com",
    host: "https://txline.txodds.com",
    serviceLevelId: 12, // real-time World Cup & Int'l Friendlies, free
  },
};

const network = process.env.NETWORK ?? "devnet";
const net = NETWORKS[network];
if (!net) {
  console.error(`NETWORK must be devnet or mainnet, got: ${network}`);
  process.exit(1);
}

const DURATION_WEEKS = 4; // must be a multiple of 4
const SELECTED_LEAGUES = []; // standard free bundle

const KEYPAIR_PATH = process.env.KEYPAIR_PATH ?? "./ops-keypair.json";
const IDL_PATH = process.env.IDL_PATH ?? "./txoracle.json";
const RPC_URL = process.env.RPC_URL ?? net.rpcUrl;
const DRY_RUN = !process.argv.includes("--yes");

if (!fs.existsSync(KEYPAIR_PATH)) {
  console.error(`No keypair at ${KEYPAIR_PATH}. Run generate-keypair.mjs first.`);
  process.exit(1);
}
if (!fs.existsSync(IDL_PATH)) {
  console.error(`No IDL at ${IDL_PATH}.`);
  process.exit(1);
}

const opsKeypair = Keypair.fromSecretKey(
  Uint8Array.from(JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"))),
);
const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8"));

// The vendored IDL embeds the devnet address; patch it for the selected
// network and fail loudly on any mismatch.
idl.address = net.programId;
const programId = new PublicKey(net.programId);
const txlTokenMint = new PublicKey(net.txlTokenMint);

const connection = new Connection(RPC_URL, "confirmed");
const provider = new AnchorProvider(connection, new Wallet(opsKeypair), {
  commitment: "confirmed",
});
const program = new Program(idl, provider);

if (!program.programId.equals(programId)) {
  console.error(
    `Program ID mismatch: IDL resolved to ${program.programId.toBase58()}, expected ${programId.toBase58()}`,
  );
  process.exit(1);
}

const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("pricing_matrix")],
  programId,
);
const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("token_treasury_v2")],
  programId,
);
const tokenTreasuryVault = getAssociatedTokenAddressSync(
  txlTokenMint,
  tokenTreasuryPda,
  true,
  TOKEN_2022_PROGRAM_ID,
);
const userTokenAccount = getAssociatedTokenAddressSync(
  txlTokenMint,
  opsKeypair.publicKey,
  false,
  TOKEN_2022_PROGRAM_ID,
);

console.log(`Network: ${network}`);
console.log("Ops wallet:", opsKeypair.publicKey.toBase58());
const balanceLamports = await connection.getBalance(opsKeypair.publicKey);
console.log("SOL balance:", balanceLamports / 1e9);
console.log("Program:", programId.toBase58());
console.log("Service level:", net.serviceLevelId, "weeks:", DURATION_WEEKS);

// Pre-flight: confirm the requested service level exists in the on-chain
// pricing matrix before spending anything.
const matrix = await program.account.pricingMatrix.fetch(pricingMatrixPda);
console.log("\nPricing matrix (rowId, tokens/week, sampling sec):");
for (const row of matrix.rows) {
  console.log(`  ${row.rowId}  ${row.pricePerWeekToken}  ${row.samplingIntervalSec}`);
}
const levelRow = matrix.rows.find((row) => Number(row.rowId) === net.serviceLevelId);
if (!levelRow) {
  console.error(`Service level ${net.serviceLevelId} not found in the on-chain pricing matrix.`);
  process.exit(1);
}
if (Number(levelRow.pricePerWeekToken) !== 0) {
  console.error(
    `Service level ${net.serviceLevelId} is not free (price/week: ${levelRow.pricePerWeekToken}). Aborting.`,
  );
  process.exit(1);
}
console.log(`\nService level ${net.serviceLevelId} confirmed free on-chain.`);

if (DRY_RUN) {
  console.log("\nDry run only — no transaction sent. Re-run with --yes to subscribe.");
  process.exit(0);
}

if (balanceLamports === 0) {
  console.error("Ops wallet has 0 SOL — fund it first.");
  process.exit(1);
}

// The subscribe instruction requires the user's Token-2022 ATA for the TxL
// mint to exist, even on free tiers.
const ataInfo = await connection.getAccountInfo(userTokenAccount);
if (!ataInfo) {
  console.log("Creating user Token-2022 account for the TxL mint...");
  const tx = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      opsKeypair.publicKey,
      userTokenAccount,
      opsKeypair.publicKey,
      txlTokenMint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  );
  await sendAndConfirmTransaction(connection, tx, [opsKeypair], { commitment: "confirmed" });
  console.log("Token account created.");
}

console.log("Subscribing on-chain...");
const txSig = await program.methods
  .subscribe(net.serviceLevelId, DURATION_WEEKS)
  .accounts({
    user: opsKeypair.publicKey,
    pricingMatrix: pricingMatrixPda,
    tokenMint: txlTokenMint,
    userTokenAccount,
    tokenTreasuryVault,
    tokenTreasuryPda,
    tokenProgram: TOKEN_2022_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .rpc();
console.log("Subscribe tx confirmed:", txSig);

const authRes = await fetch(`${net.host}/auth/guest/start`, { method: "POST" });
if (!authRes.ok) throw new Error(`guest/start failed: ${authRes.status}`);
const { token: jwt } = await authRes.json();

const message = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
const walletSignature = Buffer.from(
  nacl.sign.detached(new TextEncoder().encode(message), opsKeypair.secretKey),
).toString("base64");

const activateRes = await fetch(`${net.host}/api/token/activate`, {
  method: "POST",
  headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
  body: JSON.stringify({ txSig, walletSignature, leagues: SELECTED_LEAGUES }),
});
if (!activateRes.ok) {
  throw new Error(`token/activate failed: ${activateRes.status} ${await activateRes.text()}`);
}

// The activation endpoint may return JSON ({ token }) or a plain string.
const rawActivationBody = await activateRes.text();
let apiToken;
try {
  const parsed = JSON.parse(rawActivationBody);
  apiToken = typeof parsed === "string" ? parsed : parsed?.token;
} catch {
  apiToken = rawActivationBody.trim();
}
if (!apiToken) {
  throw new Error(`Unexpected activation response: ${rawActivationBody}`);
}

console.log("\nActivated. Verifying with a fixtures pull...");
const verifyRes = await fetch(`${net.host}/api/fixtures/snapshot`, {
  headers: { Authorization: `Bearer ${jwt}`, "X-Api-Token": apiToken },
});
console.log("Fixtures snapshot status:", verifyRes.status);

// console.log("\nSet these in your worker/app env:");
// console.log(`***REMOVED***`);
// console.log(`***REMOVED***`);
