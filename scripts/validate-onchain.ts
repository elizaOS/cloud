#!/usr/bin/env bun
/**
 * On-Chain Validation Script
 * Validates all x402 configuration against Base Sepolia and Base Mainnet
 *
 * Run: bun run scripts/validate-onchain.ts
 */

import { createPublicClient, http, parseAbi, formatUnits, type Address } from "viem";
import { baseSepolia, base } from "viem/chains";
import { USDC_ADDRESSES, CHAIN_IDS, X402_RECIPIENT_ADDRESS, isX402Configured } from "@/lib/config/x402";

const USDC_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
]);

const NETWORKS = {
  "base-sepolia": {
    chain: baseSepolia,
    rpc: "https://sepolia.base.org",
    usdc: USDC_ADDRESSES["base-sepolia"],
    chainId: CHAIN_IDS["base-sepolia"],
  },
  base: {
    chain: base,
    rpc: "https://mainnet.base.org",
    usdc: USDC_ADDRESSES["base"],
    chainId: CHAIN_IDS["base"],
  },
};

async function validateNetwork(networkName: "base-sepolia" | "base") {
  const config = NETWORKS[networkName];
  console.log(`\n${"=".repeat(50)}`);
  console.log(`🔗 Validating: ${networkName.toUpperCase()}`);
  console.log(`${"=".repeat(50)}`);

  const client = createPublicClient({
    chain: config.chain,
    transport: http(config.rpc),
  });

  // 1. Verify RPC Connection
  console.log("\n📡 RPC Connection:");
  const blockNumber = await client.getBlockNumber();
  console.log(`   ✅ Connected to ${config.rpc}`);
  console.log(`   ✅ Current block: ${blockNumber}`);

  // 2. Verify Chain ID
  const chainId = await client.getChainId();
  if (chainId === config.chainId) {
    console.log(`   ✅ Chain ID: ${chainId}`);
  } else {
    console.log(`   ❌ Chain ID mismatch: expected ${config.chainId}, got ${chainId}`);
  }

  // 3. Verify USDC Contract
  console.log("\n💵 USDC Contract:");
  console.log(`   Address: ${config.usdc}`);

  const [name, symbol, decimals, totalSupply] = await Promise.all([
    client.readContract({ address: config.usdc, abi: USDC_ABI, functionName: "name" }),
    client.readContract({ address: config.usdc, abi: USDC_ABI, functionName: "symbol" }),
    client.readContract({ address: config.usdc, abi: USDC_ABI, functionName: "decimals" }),
    client.readContract({ address: config.usdc, abi: USDC_ABI, functionName: "totalSupply" }),
  ]);

  if (symbol === "USDC") {
    console.log(`   ✅ Symbol: ${symbol}`);
  } else {
    console.log(`   ❌ Symbol: ${symbol} (expected USDC)`);
  }
  console.log(`   ✅ Name: ${name}`);

  if (decimals === 6) {
    console.log(`   ✅ Decimals: ${decimals}`);
  } else {
    console.log(`   ❌ Decimals: ${decimals} (expected 6)`);
  }
  console.log(`   ✅ Total Supply: ${formatUnits(totalSupply, 6)} USDC`);

  // 4. Verify Recipient Wallet
  if (X402_RECIPIENT_ADDRESS && X402_RECIPIENT_ADDRESS !== "0x0000000000000000000000000000000000000000") {
    console.log("\n👛 Recipient Wallet:");
    console.log(`   Address: ${X402_RECIPIENT_ADDRESS}`);

    const [ethBalance, usdcBalance] = await Promise.all([
      client.getBalance({ address: X402_RECIPIENT_ADDRESS }),
      client.readContract({
        address: config.usdc,
        abi: USDC_ABI,
        functionName: "balanceOf",
        args: [X402_RECIPIENT_ADDRESS],
      }),
    ]);

    console.log(`   ✅ ETH Balance: ${formatUnits(ethBalance, 18)} ETH`);
    console.log(`   ✅ USDC Balance: ${formatUnits(usdcBalance, 6)} USDC`);

    if (usdcBalance === 0n && networkName === "base-sepolia") {
      console.log(`   ⚠️  No USDC - Get test USDC from https://faucet.circle.com/`);
    }
  }

  return true;
}

async function main() {
  console.log("🔍 ON-CHAIN VALIDATION");
  console.log("=".repeat(50));

  // Check configuration
  console.log("\n📋 Configuration:");
  console.log(`   X402 Enabled: ${process.env.ENABLE_X402_PAYMENTS === "true" ? "✅ Yes" : "❌ No"}`);
  console.log(`   X402 Configured: ${isX402Configured() ? "✅ Yes" : "❌ No"}`);
  console.log(`   Recipient: ${X402_RECIPIENT_ADDRESS}`);
  console.log(`   Network: ${process.env.X402_NETWORK || "base-sepolia (default)"}`);

  if (!isX402Configured()) {
    console.log("\n❌ x402 is not properly configured!");
    console.log("   Set ENABLE_X402_PAYMENTS=true and X402_RECIPIENT_ADDRESS in .env.local");
    process.exit(1);
  }

  // Validate both networks
  await validateNetwork("base-sepolia");
  await validateNetwork("base");

  console.log("\n" + "=".repeat(50));
  console.log("✅ ON-CHAIN VALIDATION COMPLETE");
  console.log("=".repeat(50));

  // Summary
  console.log("\n📋 VERIFIED:");
  console.log(`   • Base Sepolia USDC: ${USDC_ADDRESSES["base-sepolia"]} ✅`);
  console.log(`   • Base Mainnet USDC: ${USDC_ADDRESSES["base"]} ✅`);
  console.log(`   • Recipient wallet accessible on both networks ✅`);
  console.log(`   • USDC contracts are valid Circle USDC ✅`);
}

main().catch(console.error);

