/**
 * Test Payout System on Base Network
 *
 * This script tests the payout system using the funded wallet.
 *
 * Run: bun run scripts/test-payout-base.ts
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
} from "viem";
import { base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

// elizaOS token on Base
const ELIZA_TOKEN_ADDRESS =
  "0xea17df5cf6d172224892b5477a16acb111182478" as Address;
const ELIZA_DECIMALS = 9;

const ERC20_ABI = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

async function main() {
  console.log("=".repeat(70));
  console.log("PAYOUT SYSTEM TEST - BASE NETWORK");
  console.log("=".repeat(70));
  console.log("");

  // Check environment
  const privateKey =
    process.env.EVM_PRIVATE_KEY || process.env.EVM_PAYOUT_PRIVATE_KEY;
  if (!privateKey) {
    console.error(
      "❌ EVM_PRIVATE_KEY or EVM_PAYOUT_PRIVATE_KEY not set in environment",
    );
    process.exit(1);
  }

  // Format private key
  const formattedKey = privateKey.startsWith("0x")
    ? (privateKey as `0x${string}`)
    : (`0x${privateKey}` as `0x${string}`);

  // Create account from private key
  const account = privateKeyToAccount(formattedKey);
  console.log("📍 Payout Wallet Address:", account.address);
  console.log("");

  // Verify it matches expected address
  const expectedAddress = "0x5dB1268e424da5C26451e4a8B9C221e6DE3C3064";
  if (account.address.toLowerCase() !== expectedAddress.toLowerCase()) {
    console.warn("⚠️  Address mismatch!");
    console.warn("   Expected:", expectedAddress);
    console.warn("   Got:", account.address);
    console.log("");
  } else {
    console.log("✅ Address matches expected payout wallet");
    console.log("");
  }

  // Create clients
  const publicClient = createPublicClient({
    chain: base,
    transport: http(),
  });

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(),
  });

  console.log("=".repeat(70));
  console.log("1. CHECKING TOKEN CONTRACT");
  console.log("=".repeat(70));
  console.log("");

  // Check token contract
  console.log("Token Address:", ELIZA_TOKEN_ADDRESS);

  const [tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
    publicClient.readContract({
      address: ELIZA_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "name",
    }),
    publicClient.readContract({
      address: ELIZA_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: ELIZA_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "decimals",
    }),
  ]);

  console.log("Token Name:", tokenName);
  console.log("Token Symbol:", tokenSymbol);
  console.log("Token Decimals:", tokenDecimals);
  console.log("");

  if (Number(tokenDecimals) !== ELIZA_DECIMALS) {
    console.warn(
      `⚠️  Decimals mismatch! Expected ${ELIZA_DECIMALS}, got ${tokenDecimals}`,
    );
  } else {
    console.log("✅ Token decimals match expected (9)");
  }
  console.log("");

  console.log("=".repeat(70));
  console.log("2. CHECKING WALLET BALANCES");
  console.log("=".repeat(70));
  console.log("");

  // Check ETH balance for gas
  const ethBalance = await publicClient.getBalance({
    address: account.address,
  });
  const ethBalanceFormatted = formatUnits(ethBalance, 18);
  console.log("ETH Balance:", ethBalanceFormatted, "ETH");

  if (parseFloat(ethBalanceFormatted) < 0.001) {
    console.warn("⚠️  Low ETH balance - may not have enough for gas fees");
  } else {
    console.log("✅ Sufficient ETH for gas");
  }
  console.log("");

  // Check elizaOS token balance
  const tokenBalance = await publicClient.readContract({
    address: ELIZA_TOKEN_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });

  const tokenBalanceFormatted = formatUnits(tokenBalance, ELIZA_DECIMALS);
  console.log("elizaOS Balance:", tokenBalanceFormatted, tokenSymbol);

  if (parseFloat(tokenBalanceFormatted) === 0) {
    console.error("❌ No elizaOS tokens in wallet!");
    console.log("");
    console.log(
      "Please fund the wallet with elizaOS tokens to enable payouts.",
    );
    process.exit(1);
  } else if (parseFloat(tokenBalanceFormatted) < 100) {
    console.warn("⚠️  Low elizaOS balance - may want to add more for payouts");
  } else {
    console.log("✅ elizaOS tokens available for payouts");
  }
  console.log("");

  console.log("=".repeat(70));
  console.log("3. SIMULATING A PAYOUT");
  console.log("=".repeat(70));
  console.log("");

  // Simulate a small payout (1 elizaOS token)
  const testAmount = BigInt(1 * Math.pow(10, ELIZA_DECIMALS)); // 1 token
  const testRecipient = account.address; // Send to self for testing

  console.log("Test payout details:");
  console.log(
    "  Amount:",
    formatUnits(testAmount, ELIZA_DECIMALS),
    tokenSymbol,
  );
  console.log("  Recipient:", testRecipient, "(self - for testing)");
  console.log("");

  // Simulate the transaction
  console.log("Simulating transfer...");

  try {
    const { request } = await publicClient.simulateContract({
      account,
      address: ELIZA_TOKEN_ADDRESS,
      abi: ERC20_ABI,
      functionName: "transfer",
      args: [testRecipient, testAmount],
    });

    console.log("✅ Simulation successful - transfer would succeed");
    console.log("");

    // Ask if user wants to execute
    console.log("=".repeat(70));
    console.log("4. EXECUTE REAL TRANSFER?");
    console.log("=".repeat(70));
    console.log("");
    console.log("To execute a real test transfer, run with --execute flag:");
    console.log("  bun run scripts/test-payout-base.ts --execute");
    console.log("");

    if (process.argv.includes("--execute")) {
      console.log("Executing real transfer...");

      const txHash = await walletClient.writeContract(request);
      console.log("Transaction submitted:", txHash);
      console.log("Explorer:", `https://basescan.org/tx/${txHash}`);
      console.log("");

      console.log("Waiting for confirmation...");
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 2,
      });

      if (receipt.status === "success") {
        console.log("✅ Transaction confirmed!");
        console.log("   Block:", receipt.blockNumber);
        console.log("   Gas used:", receipt.gasUsed.toString());
      } else {
        console.error("❌ Transaction reverted!");
      }
    }
  } catch (error) {
    console.error("❌ Simulation failed:", error);
    process.exit(1);
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("5. PAYOUT SYSTEM STATUS");
  console.log("=".repeat(70));
  console.log("");

  const status = {
    network: "base",
    configured: true,
    walletAddress: account.address,
    ethBalance: ethBalanceFormatted,
    tokenBalance: tokenBalanceFormatted,
    canProcessPayouts:
      parseFloat(tokenBalanceFormatted) > 0 &&
      parseFloat(ethBalanceFormatted) > 0.001,
  };

  console.log("Status:", JSON.stringify(status, null, 2));
  console.log("");

  if (status.canProcessPayouts) {
    console.log("✅ PAYOUT SYSTEM READY ON BASE");
    console.log("");
    console.log("The system can process redemptions on Base network.");
    console.log(`Available tokens: ${tokenBalanceFormatted} ${tokenSymbol}`);
  } else {
    console.log("⚠️ PAYOUT SYSTEM NOT READY");
    console.log("");
    if (parseFloat(tokenBalanceFormatted) === 0) {
      console.log("- Need to fund wallet with elizaOS tokens");
    }
    if (parseFloat(ethBalanceFormatted) < 0.001) {
      console.log("- Need to fund wallet with ETH for gas");
    }
  }

  console.log("");
  console.log("=".repeat(70));
  console.log("TEST COMPLETE");
  console.log("=".repeat(70));
}

main().catch(console.error);
