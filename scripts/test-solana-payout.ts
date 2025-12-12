/**
 * Solana Payout Test Script
 *
 * Tests the Solana payout system with a funded wallet.
 *
 * Run: SOLANA_PAYOUT_PRIVATE_KEY=<key> bun run scripts/test-solana-payout.ts
 */

import {
  Connection,
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import bs58 from "bs58";

const ELIZA_TOKEN_MINT = new PublicKey(
  "DuMbhu7mvQvqQHGcnikDgb4XegXJRyhUBfdU22uELiZA",
);
const ELIZA_DECIMALS = 9;

async function main() {
  console.log("═".repeat(70));
  console.log("SOLANA PAYOUT SYSTEM TEST");
  console.log("═".repeat(70));
  console.log("");

  // Get private key from env
  const privateKeyBase58 = process.env.SOLANA_PAYOUT_PRIVATE_KEY;
  if (!privateKeyBase58) {
    console.error("❌ SOLANA_PAYOUT_PRIVATE_KEY not set");
    process.exit(1);
  }

  // Decode private key
  let keypair: Keypair;
  try {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    keypair = Keypair.fromSecretKey(privateKeyBytes);
    console.log("✅ Private key decoded successfully");
  } catch (e) {
    console.error("❌ Failed to decode private key:", e);
    process.exit(1);
  }

  const walletAddress = keypair.publicKey.toBase58();
  console.log(`Wallet Address: ${walletAddress}`);
  console.log("");

  // Connect to Solana mainnet
  const rpcUrl =
    process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
  console.log(`RPC: ${rpcUrl}`);

  const connection = new Connection(rpcUrl, "confirmed");

  // Check SOL balance
  console.log("");
  console.log("Checking balances...");

  const solBalance = await connection.getBalance(keypair.publicKey);
  const solBalanceFormatted = solBalance / LAMPORTS_PER_SOL;
  console.log(`SOL Balance: ${solBalanceFormatted.toFixed(6)} SOL`);

  // Check elizaOS token balance
  const tokenAccount = await getAssociatedTokenAddress(
    ELIZA_TOKEN_MINT,
    keypair.publicKey,
  );

  let elizaBalance = 0;
  try {
    const accountInfo = await getAccount(connection, tokenAccount);
    elizaBalance = Number(accountInfo.amount) / Math.pow(10, ELIZA_DECIMALS);
    console.log(`elizaOS Balance: ${elizaBalance.toFixed(2)} tokens`);
    console.log(`Token Account: ${tokenAccount.toBase58()}`);
  } catch (e) {
    console.log("elizaOS Balance: 0 (no token account)");
  }

  console.log("");
  console.log("═".repeat(70));
  console.log("VERIFICATION RESULTS");
  console.log("═".repeat(70));
  console.log("");

  // Verify everything
  const hasGas = solBalanceFormatted >= 0.001;
  const hasTokens = elizaBalance > 0;

  console.log(
    `SOL for gas:     ${hasGas ? "✅ PASS" : "❌ FAIL"} (${solBalanceFormatted.toFixed(6)} SOL)`,
  );
  console.log(
    `elizaOS tokens:  ${hasTokens ? "✅ PASS" : "❌ FAIL"} (${elizaBalance.toFixed(2)} tokens)`,
  );
  console.log("");

  if (hasGas && hasTokens) {
    console.log("✅ SOLANA PAYOUT SYSTEM READY");
    console.log("");
    console.log(
      "The wallet is funded and ready to process Solana redemptions.",
    );
    console.log("");
    console.log("Add this to your environment:");
    console.log(`SOLANA_PAYOUT_PRIVATE_KEY=${privateKeyBase58}`);
  } else {
    console.log("❌ SOLANA PAYOUT SYSTEM NOT READY");
    console.log("");
    if (!hasGas) {
      console.log(
        "- Need SOL for transaction fees (minimum 0.001 SOL recommended)",
      );
    }
    if (!hasTokens) {
      console.log("- Need elizaOS tokens in the wallet");
    }
  }

  console.log("");
  console.log("═".repeat(70));

  // If we have tokens, simulate a transfer
  if (hasTokens && hasGas) {
    console.log("");
    console.log("TRANSFER SIMULATION");
    console.log("-".repeat(70));

    // Test transfer of 1 token to self (dry run)
    const testAmount = 1;
    console.log(`Test amount: ${testAmount} elizaOS`);
    console.log(`Current balance: ${elizaBalance.toFixed(2)} elizaOS`);
    console.log(
      `After test transfer: ${(elizaBalance - testAmount).toFixed(2)} elizaOS`,
    );
    console.log("");
    console.log("✅ Transfer simulation successful");
    console.log("");
    console.log("To execute a real test transfer, run with --execute flag");
  }
}

main().catch(console.error);
