#!/usr/bin/env bun
/**
 * x402 + ERC-8004 Development Setup Script
 *
 * Sets up environment for x402 payments and ERC-8004 agent discovery.
 * Uses Base Sepolia testnet - no local blockchain needed.
 *
 * This script will:
 * 1. Configure x402 payment settings
 * 2. Auto-register Eliza Cloud on ERC-8004 (if private key available)
 * 3. Start the Next.js dev server
 *
 * Requirements:
 * 1. X402_RECIPIENT_ADDRESS - your wallet address to receive payments
 * 2. AGENT0_PRIVATE_KEY - for auto-registration (optional but recommended)
 *
 * Get test USDC: https://faucet.circle.com/ (Base Sepolia)
 * Get test ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
 *
 * Usage:
 *   bun run dev:x402
 */

import { SDK } from "agent0-sdk";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { spawn } from "child_process";
import {
  CHAIN_IDS,
  RPC_URLS,
  ELIZA_CLOUD_AGENT_ID,
  SERVICE_WALLET_ADDRESS,
} from "@/lib/config/erc8004";
import { readEnvFile, updateEnvFile } from "./lib/env-utils";

// ============================================================================
// Configuration
// ============================================================================

async function ensureConfiguration(): Promise<Record<string, string>> {
  console.log("\n📋 x402 Configuration");
  console.log("=====================");

  const env = readEnvFile();

  // Set defaults
  const defaults: Record<string, string> = {
    ENABLE_X402_PAYMENTS: "true",
    X402_NETWORK: "base-sepolia",
    ERC8004_NETWORK: "base-sepolia",
  };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!env[key]) {
      env[key] = defaultValue;
      updateEnvFile(key, defaultValue);
      console.log(`   Set ${key}=${defaultValue}`);
    }
  }

  console.log(`   Network: ${env.X402_NETWORK || "base-sepolia"}`);
  console.log(`   x402 Enabled: ${env.ENABLE_X402_PAYMENTS}`);

  // Check recipient address
  const recipient = env.X402_RECIPIENT_ADDRESS;
  if (!recipient || recipient === "0x0000000000000000000000000000000000000000") {
    console.log("\n   ⚠️  X402_RECIPIENT_ADDRESS not set!");
    console.log("   Set this to your wallet address to receive payments.");
    console.log("\n   Add to .env.local:");
    console.log("   X402_RECIPIENT_ADDRESS=0xYourWalletAddress\n");
    process.exit(1);
  }

  console.log(`   Recipient: ${recipient.slice(0, 10)}...${recipient.slice(-8)}`);

  return env;
}

// ============================================================================
// ERC-8004 Auto-Registration
// ============================================================================

async function ensureERC8004Registered(env: Record<string, string>): Promise<boolean> {
  console.log("\n🤖 ERC-8004 Agent");
  console.log("=================");

  const network = "base-sepolia";
  const envKey = "ELIZA_CLOUD_AGENT_ID_SEPOLIA";

  // Check if already registered
  const existingId = env[envKey] || ELIZA_CLOUD_AGENT_ID[network];
  if (existingId) {
    console.log(`   ✅ Registered - Agent ID: ${CHAIN_IDS[network]}:${existingId}`);
    return true;
  }

  // Check if we can register
  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log("   ⚠️  Not registered (optional for x402)");
    console.log("   Set AGENT0_PRIVATE_KEY to enable agent discovery");
    return false;
  }

  // Check wallet balance
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(RPC_URLS[network]),
  });

  const balance = await publicClient.getBalance({ address: account.address });
  if (balance === 0n) {
    console.log(`   ⚠️  Wallet ${account.address.slice(0, 10)}... has no ETH`);
    console.log("   Get test ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
    return false;
  }

  console.log("   📝 Auto-registering...");

  const baseUrl = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const pinataJwt = env.PINATA_JWT;

  // Initialize SDK
  const sdk = new SDK({
    chainId: CHAIN_IDS[network],
    rpcUrl: RPC_URLS[network],
    signer: privateKey,
    ...(pinataJwt && { ipfs: "pinata" as const, pinataJwt }),
  });

  // Create and configure agent
  const agent = sdk.createAgent(
    "Eliza Cloud",
    "AI agent infrastructure with x402 payments. Supports REST, MCP, A2A protocols.",
    `${baseUrl}/logo.png`
  );

  await agent.setMCP(`${baseUrl}/api/mcp`);
  await agent.setA2A(`${baseUrl}/.well-known/agent-card.json`);

  const walletAddress = env.X402_RECIPIENT_ADDRESS || SERVICE_WALLET_ADDRESS;
  if (walletAddress && walletAddress !== "0x0000000000000000000000000000000000000000") {
    agent.setAgentWallet(walletAddress as `0x${string}`, CHAIN_IDS[network]);
  }

  agent.setTrust(true, true, false); // reputation, crypto-economic (x402), no TEE
  agent.setActive(true);

  // Register
  let agentId: string;
  if (pinataJwt) {
    const result = await agent.registerIPFS();
    agentId = result.agentId;
  } else {
    await agent.registerHTTP(`${baseUrl}/.well-known/erc8004-registration.json`);
    agentId = `${CHAIN_IDS[network]}:1`;
  }

  const tokenId = agentId.split(":")[1];
  updateEnvFile(envKey, tokenId);

  console.log(`   ✅ Registered - Agent ID: ${agentId}`);
  return true;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("\n🚀 x402 + ERC-8004 Development Setup");
  console.log("=====================================");

  // 1. Configure x402
  const env = await ensureConfiguration();

  // 2. Auto-register ERC-8004 if possible
  await ensureERC8004Registered(env);

  // 3. Show helpful info
  console.log("\n💡 Testing x402 Payments");
  console.log("========================");
  console.log("   1. Get test USDC: https://faucet.circle.com/ (Base Sepolia)");
  console.log("   2. Use /api/v1/credits/topup with X-PAYMENT header");
  console.log("   3. Or use the @coinbase/x402 client library");

  // 4. Start server
  console.log("\n🔧 Starting Next.js dev server...\n");

  const nextDev = spawn("bun", ["run", "next", "dev", "--turbopack"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });

  nextDev.on("exit", (code) => {
    process.exit(code || 0);
  });
}

main().catch((error) => {
  console.error("\n❌ Error:", error.message);
  process.exit(1);
});
