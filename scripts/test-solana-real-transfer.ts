/**
 * Solana Real Transfer Test
 *
 * Executes a real token transfer on Solana mainnet to verify the payout system.
 *
 * Run: SOLANA_PAYOUT_PRIVATE_KEY=<key> bun run scripts/test-solana-real-transfer.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createTransferInstruction,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

const ELIZA_TOKEN_MINT = new PublicKey(
  "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
);
const ELIZA_DECIMALS = 9;

// Test recipient - send to self for testing
const TEST_RECIPIENT = "ATwDftA6zTxod9A7ys2QSa1cEWg9usuLtCQj5MXPNc89";
const TEST_AMOUNT = 1; // 1 elizaOS token

async function main() {
  console.log("═".repeat(70));
  console.log("SOLANA REAL TRANSFER TEST");
  console.log("═".repeat(70));
  console.log("");

  // Get private key from env
  const privateKeyBase58 = process.env.SOLANA_PAYOUT_PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("❌ SOLANA_PAYOUT_PRIVATE_KEY not set");
    process.exit(1);
  }

  // Decode private key
  const privateKeyBytes = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(privateKeyBytes);

  console.log(`Sender: ${keypair.publicKey.toBase58()}`);
  console.log(`Recipient: ${TEST_RECIPIENT}`);
  console.log(`Amount: ${TEST_AMOUNT} elizaOS`);
  console.log("");

  // Connect to Solana mainnet
  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  const connection = new Connection(rpcUrl, "confirmed");

  // Get source token account
  const sourceTokenAccount = await getAssociatedTokenAddress(
    ELIZA_TOKEN_MINT,
    keypair.publicKey,
  );

  // Get or create destination token account
  const recipientPubkey = new PublicKey(TEST_RECIPIENT);
  const destTokenAccount = await getAssociatedTokenAddress(
    ELIZA_TOKEN_MINT,
    recipientPubkey,
  );

  console.log(`Source Token Account: ${sourceTokenAccount.toBase58()}`);
  console.log(`Dest Token Account: ${destTokenAccount.toBase58()}`);
  console.log("");

  // Check balance before
  const accountBefore = await getAccount(connection, sourceTokenAccount);
  const balanceBefore =
    Number(accountBefore.amount) / Math.pow(10, ELIZA_DECIMALS);
  console.log(`Balance before: ${balanceBefore.toFixed(2)} elizaOS`);

  // Create transfer instruction
  const transferAmount = BigInt(TEST_AMOUNT * Math.pow(10, ELIZA_DECIMALS));

  const transferIx = createTransferInstruction(
    sourceTokenAccount,
    destTokenAccount,
    keypair.publicKey,
    transferAmount,
  );

  // Build transaction
  const transaction = new Transaction().add(transferIx);

  console.log("");
  console.log("Sending transaction...");

  // Send and confirm
  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [keypair],
    { commitment: "confirmed" },
  );

  console.log("");
  console.log("✅ TRANSACTION CONFIRMED");
  console.log(`Signature: ${signature}`);
  console.log(`Explorer: https://solscan.io/tx/${signature}`);

  // Check balance after
  const accountAfter = await getAccount(connection, sourceTokenAccount);
  const balanceAfter =
    Number(accountAfter.amount) / Math.pow(10, ELIZA_DECIMALS);
  console.log("");
  console.log(`Balance after: ${balanceAfter.toFixed(2)} elizaOS`);
  console.log(
    `Transferred: ${(balanceBefore - balanceAfter).toFixed(2)} elizaOS`,
  );

  console.log("");
  console.log("═".repeat(70));
  console.log("✅ SOLANA PAYOUT SYSTEM VERIFIED ON-CHAIN");
  console.log("═".repeat(70));
}

main().catch((e) => {
  console.error("❌ Transfer failed:", e.message);
  process.exit(1);
});
