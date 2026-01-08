#!/usr/bin/env bun
/**
 * x402 Development Setup Script
 *
 * Sets up environment for x402 payments.
 * Uses Base Sepolia testnet.
 *
 * This script will:
 * 1. Configure x402 payment settings
 * 2. Start the Next.js dev server
 *
 * Requirements:
 * 1. X402_RECIPIENT_ADDRESS - your wallet address to receive payments
 *
 * Get test USDC: https://faucet.circle.com/ (Base Sepolia)
 *
 * Usage:
 *   bun run dev:x402
 */

import { spawn } from "child_process";
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
  if (
    !recipient ||
    recipient === "0x0000000000000000000000000000000000000000"
  ) {
    console.log("\n   ⚠️  X402_RECIPIENT_ADDRESS not set!");
    console.log("   Set this to your wallet address to receive payments.");
    console.log("\n   Add to .env.local:");
    console.log("   X402_RECIPIENT_ADDRESS=0xYourWalletAddress\n");
    process.exit(1);
  }

  console.log(
    `   Recipient: ${recipient.slice(0, 10)}...${recipient.slice(-8)}`,
  );

  return env;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("\n🚀 x402 Development Setup");
  console.log("==========================");

  // 1. Configure x402
  await ensureConfiguration();

  // 2. Show helpful info
  console.log("\n💡 Testing x402 Payments");
  console.log("========================");
  console.log("   1. Get test USDC: https://faucet.circle.com/ (Base Sepolia)");
  console.log("   2. Use /api/v1/credits/topup with X-PAYMENT header");
  console.log("   3. Or use the @coinbase/x402 client library");

  // 3. Start server
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
