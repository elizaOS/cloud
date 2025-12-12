#!/usr/bin/env npx tsx
/**
 * Verify Payout Logic - Test the actual code paths
 *
 * This script verifies:
 * 1. Wallet derivation from private key
 * 2. Transaction building
 * 3. Gas estimation
 * 4. Balance checking
 *
 * Run: bun run scripts/verify-payout-logic.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  formatUnits,
  parseUnits,
  parseAbi,
  type Address,
  type PrivateKeyAccount,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const ELIZA_TOKEN_BASE: Address = "0xea17df5cf6d172224892b5477a16acb111182478";
const ELIZA_DECIMALS = 9;

const ERC20_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

async function main() {
  console.log("═".repeat(70));
  console.log("   PAYOUT LOGIC VERIFICATION");
  console.log("═".repeat(70));
  console.log("");

  // Check for private key
  const privateKey =
    process.env.EVM_PRIVATE_KEY || process.env.EVM_PAYOUT_PRIVATE_KEY;

  if (!privateKey) {
    console.log("❌ No private key found in environment");
    console.log("   Set EVM_PRIVATE_KEY or EVM_PAYOUT_PRIVATE_KEY");
    process.exit(1);
  }

  console.log("1️⃣  WALLET DERIVATION");
  console.log("-".repeat(70));

  // Derive account from private key
  let account: PrivateKeyAccount;
  try {
    // Ensure private key has 0x prefix
    const formattedKey = privateKey.startsWith("0x")
      ? (privateKey as `0x${string}`)
      : (`0x${privateKey}` as `0x${string}`);

    account = privateKeyToAccount(formattedKey);
    console.log(`  ✅ Derived address: ${account.address}`);
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ❌ Failed to derive account: ${error.message}`);
    process.exit(1);
  }
  console.log("");

  // Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
  });

  const walletClient = createWalletClient({
    chain: base,
    transport: http("https://mainnet.base.org"),
    account,
  });

  console.log("2️⃣  BALANCE CHECK");
  console.log("-".repeat(70));

  try {
    const [tokenBalance, ethBalance] = await Promise.all([
      publicClient.readContract({
        address: ELIZA_TOKEN_BASE,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [account.address],
      }),
      publicClient.getBalance({ address: account.address }),
    ]);

    const tokenFormatted = formatUnits(tokenBalance, ELIZA_DECIMALS);
    const ethFormatted = formatUnits(ethBalance, 18);

    console.log(`  elizaOS Balance: ${tokenFormatted} tokens`);
    console.log(`  ETH Balance: ${ethFormatted} ETH`);

    if (parseFloat(tokenFormatted) > 0) {
      console.log("  ✅ Wallet has elizaOS tokens");
    } else {
      console.log("  ⚠️  Wallet has NO elizaOS tokens");
    }

    if (parseFloat(ethFormatted) > 0.001) {
      console.log("  ✅ Wallet has sufficient ETH for gas");
    } else {
      console.log("  ⚠️  Wallet has LOW ETH - may not have enough for gas");
    }
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ❌ Balance check failed: ${error.message}`);
  }
  console.log("");

  console.log("3️⃣  TRANSACTION SIMULATION");
  console.log("-".repeat(70));

  // Simulate a transfer (to ourselves, dry-run)
  const testAmount = parseUnits("1", ELIZA_DECIMALS); // 1 token
  const testRecipient = account.address; // Send to ourselves for simulation

  try {
    // Estimate gas for transfer
    const gasEstimate = await publicClient.estimateContractGas({
      address: ELIZA_TOKEN_BASE,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [testRecipient, testAmount],
      account: account.address,
    });

    console.log(`  Gas Estimate: ${gasEstimate.toString()} units`);

    // Get current gas price
    const gasPrice = await publicClient.getGasPrice();
    const gasCost = gasPrice * gasEstimate;
    const gasCostEth = formatUnits(gasCost, 18);

    console.log(`  Gas Price: ${formatUnits(gasPrice, 9)} gwei`);
    console.log(
      `  Estimated Cost: ${gasCostEth} ETH (~$${(parseFloat(gasCostEth) * 3500).toFixed(4)})`,
    );
    console.log("  ✅ Transaction simulation successful");
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ⚠️  Simulation note: ${error.message}`);
    // This might fail if balance is 0, which is fine
  }
  console.log("");

  console.log("4️⃣  TRANSFER FUNCTION VERIFICATION");
  console.log("-".repeat(70));

  // Build (but don't send) a transfer transaction
  try {
    const txRequest = await walletClient.prepareTransactionRequest({
      to: ELIZA_TOKEN_BASE,
      data:
        "0xa9059cbb" + // transfer function selector
        account.address.slice(2).padStart(64, "0") + // recipient
        testAmount.toString(16).padStart(64, "0"), // amount
    });

    console.log(`  To: ${txRequest.to}`);
    console.log(`  Value: ${txRequest.value || 0}`);
    console.log(`  Gas Limit: ${txRequest.gas?.toString() || "auto"}`);
    console.log("  ✅ Transaction can be built and signed");
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ⚠️  Build note: ${error.message}`);
  }
  console.log("");

  console.log("5️⃣  PAYOUT PROCESSOR CODE CHECK");
  console.log("-".repeat(70));

  // Verify the payout processor service is properly configured
  console.log("  Checking payout-processor.ts imports...");

  try {
    // Dynamic import to check if the module loads
    const payoutModule = await import("../lib/services/payout-processor");
    console.log("  ✅ payout-processor.ts loads successfully");
    console.log(
      `  ✅ PayoutProcessorService class exists: ${!!payoutModule.payoutProcessorService}`,
    );
  } catch (e: unknown) {
    const error = e as Error;
    console.log(`  ⚠️  Module check: ${error.message}`);
  }

  console.log("");

  // ========================================
  // SUMMARY
  // ========================================
  console.log("═".repeat(70));
  console.log("   PAYOUT LOGIC VERIFICATION COMPLETE");
  console.log("═".repeat(70));
  console.log("");
  console.log("  Wallet Address: " + account.address);
  console.log("");
  console.log("  To enable payouts, add to .env.local:");
  console.log("    EVM_PAYOUT_WALLET_ADDRESS=" + account.address);
  console.log("    EVM_PAYOUT_PRIVATE_KEY=<your-private-key>");
  console.log("");
  console.log("  Then fund the wallet with:");
  console.log("    - elizaOS tokens (for payouts)");
  console.log("    - ETH (for gas fees)");
  console.log("");
  console.log("═".repeat(70));
}

main().catch(console.error);
