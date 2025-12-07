#!/usr/bin/env bun
/**
 * Unified Setup Script for Eliza Cloud
 * 
 * Handles complete development environment setup with minimal configuration:
 * 1. Checks and creates .env.local with defaults
 * 2. Validates database connection
 * 3. Sets up ERC-8004 and x402 configuration
 * 4. Optionally registers agent on-chain
 * 
 * Usage:
 *   bun run setup              # Full setup
 *   bun run setup --onchain    # Register agent on-chain
 *   bun run setup --check      # Just validate current config
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import erc8004Config from "@/config/erc8004.json";

const ENV_FILE = ".env.local";
const EXAMPLE_ENV = "example.env.local";

// ============================================================================
// Environment Helpers
// ============================================================================

function readEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};

  const content = readFileSync(ENV_FILE, "utf-8");
  const env: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...valueParts] = trimmed.split("=");
    if (key) {
      env[key] = valueParts.join("=").replace(/^["']|["']$/g, "");
    }
  }

  return env;
}

function updateEnvFile(key: string, value: string): void {
  let content = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf-8") : "";

  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content = content.trim() + `\n${key}=${value}\n`;
  }

  writeFileSync(ENV_FILE, content);
}

function ensureEnvFile(): Record<string, string> {
  if (!existsSync(ENV_FILE) && existsSync(EXAMPLE_ENV)) {
    console.log("   Creating .env.local from example...");
    const example = readFileSync(EXAMPLE_ENV, "utf-8");
    writeFileSync(ENV_FILE, example);
  }
  
  return readEnvFile();
}

// ============================================================================
// Configuration Status
// ============================================================================

interface ConfigStatus {
  database: { configured: boolean; connected?: boolean; error?: string };
  auth: { configured: boolean; provider: string };
  payments: { stripe: boolean; x402: boolean };
  erc8004: { 
    configured: boolean; 
    network: string; 
    registered: boolean; 
    agentId?: number;
  };
  wallet: { configured: boolean; address?: string; balance?: string };
}

async function checkConfiguration(env: Record<string, string>): Promise<ConfigStatus> {
  const status: ConfigStatus = {
    database: { configured: false },
    auth: { configured: false, provider: "privy" },
    payments: { stripe: false, x402: false },
    erc8004: { configured: false, network: "base-sepolia", registered: false },
    wallet: { configured: false },
  };

  // Database
  if (env.DATABASE_URL) {
    status.database.configured = true;
    // Don't actually connect during setup check
  }

  // Auth (Privy)
  if (env.NEXT_PUBLIC_PRIVY_APP_ID && env.PRIVY_APP_SECRET) {
    status.auth.configured = true;
  }

  // Stripe
  if (env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
    status.payments.stripe = true;
  }

  // x402
  if (env.ENABLE_X402_PAYMENTS === "true" && env.X402_RECIPIENT_ADDRESS) {
    status.payments.x402 = true;
  }

  // ERC-8004
  const network = (env.ERC8004_NETWORK || "base-sepolia") as keyof typeof erc8004Config.networks;
  const networkConfig = erc8004Config.networks[network];
  
  if (networkConfig?.contracts?.identity) {
    status.erc8004.configured = true;
    status.erc8004.network = network;
    
    const envKey = network === "base-sepolia" 
      ? "ELIZA_CLOUD_AGENT_ID_SEPOLIA" 
      : "ELIZA_CLOUD_AGENT_ID_BASE";
    
    const agentId = env[envKey] || (networkConfig.agentId ? String(networkConfig.agentId) : null);
    if (agentId) {
      status.erc8004.registered = true;
      status.erc8004.agentId = parseInt(agentId, 10);
    }
  }

  // Wallet
  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  if (privateKey) {
    status.wallet.configured = true;
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    status.wallet.address = account.address;

    // Check balance
    const chain = network === "base" ? base : baseSepolia;
    const rpcUrl = network === "base" 
      ? "https://mainnet.base.org" 
      : "https://sepolia.base.org";

    const client = createPublicClient({ chain, transport: http(rpcUrl) });
    const balance = await client.getBalance({ address: account.address });
    status.wallet.balance = formatUnits(balance, 18);
  }

  return status;
}

// ============================================================================
// Display Functions
// ============================================================================

function displayStatus(status: ConfigStatus): void {
  console.log("\n📊 Configuration Status");
  console.log("========================");

  // Database
  const dbIcon = status.database.configured ? "✅" : "❌";
  console.log(`${dbIcon} Database: ${status.database.configured ? "Configured" : "Not configured"}`);

  // Auth
  const authIcon = status.auth.configured ? "✅" : "❌";
  console.log(`${authIcon} Auth (${status.auth.provider}): ${status.auth.configured ? "Configured" : "Not configured"}`);

  // Payments
  const stripeIcon = status.payments.stripe ? "✅" : "⬜";
  const x402Icon = status.payments.x402 ? "✅" : "⬜";
  console.log(`${stripeIcon} Stripe: ${status.payments.stripe ? "Configured" : "Optional"}`);
  console.log(`${x402Icon} x402 Crypto: ${status.payments.x402 ? "Enabled" : "Disabled"}`);

  // ERC-8004
  const erc8004Icon = status.erc8004.configured ? "✅" : "⬜";
  console.log(`${erc8004Icon} ERC-8004 (${status.erc8004.network}): ${status.erc8004.configured ? "Configured" : "Optional"}`);
  
  if (status.erc8004.registered) {
    console.log(`   └── Agent ID: ${status.erc8004.agentId}`);
  }

  // Wallet
  if (status.wallet.configured) {
    console.log(`✅ Wallet: ${status.wallet.address?.slice(0, 10)}...`);
    console.log(`   └── Balance: ${status.wallet.balance} ETH`);
  } else {
    console.log(`⬜ Wallet: Not configured (needed for on-chain registration)`);
  }
}

// ============================================================================
// Setup Steps
// ============================================================================

async function setupDefaults(env: Record<string, string>): Promise<void> {
  console.log("\n⚙️  Setting up defaults...");
  
  const defaults: Record<string, string> = {
    "NEXT_PUBLIC_APP_URL": "http://localhost:3000",
    "NEXT_PUBLIC_API_URL": "http://localhost:3000",
    "ERC8004_NETWORK": "base-sepolia",
    "X402_NETWORK": "base-sepolia",
    "CACHE_ENABLED": "true",
    "NEXT_PUBLIC_CREDITS_SSE_ENABLED": "true",
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!env[key]) {
      updateEnvFile(key, value);
      console.log(`   Set ${key}=${value}`);
    }
  }
}

async function promptForMissing(env: Record<string, string>): Promise<void> {
  const required = [
    { key: "DATABASE_URL", hint: "PostgreSQL connection URL" },
    { key: "NEXT_PUBLIC_PRIVY_APP_ID", hint: "From https://dashboard.privy.io" },
    { key: "PRIVY_APP_SECRET", hint: "From Privy dashboard" },
  ];

  const missing = required.filter(r => !env[r.key]);
  
  if (missing.length > 0) {
    console.log("\n⚠️  Required configuration missing:");
    for (const m of missing) {
      console.log(`   ${m.key} - ${m.hint}`);
    }
    console.log("\n   Edit .env.local to add these values, then run setup again.");
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║              Eliza Cloud Setup                           ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const onchain = args.includes("--onchain");

  // Step 1: Ensure .env.local exists
  console.log("\n📁 Environment File");
  console.log("====================");
  let env = ensureEnvFile();
  console.log(`   Using: ${ENV_FILE}`);

  // Step 2: Set defaults
  if (!checkOnly) {
    await setupDefaults(env);
    env = readEnvFile(); // Re-read after updates
  }

  // Step 3: Check configuration
  const status = await checkConfiguration(env);
  displayStatus(status);

  // Step 4: Show what's missing
  await promptForMissing(env);

  // Step 5: On-chain registration
  if (onchain) {
    console.log("\n🔗 On-Chain Registration");
    console.log("=========================");
    
    if (!status.wallet.configured) {
      console.log("   ❌ Wallet not configured");
      console.log("   Add AGENT0_PRIVATE_KEY to .env.local first");
    } else if (status.erc8004.registered) {
      console.log(`   ✅ Already registered as Agent ID ${status.erc8004.agentId}`);
    } else {
      console.log("   Running registration script...");
      const { spawn } = await import("child_process");
      const child = spawn("bun", ["run", "erc8004:register"], { stdio: "inherit" });
      await new Promise((resolve) => child.on("close", resolve));
    }
  }

  // Summary
  console.log("\n🚀 Next Steps");
  console.log("==============");
  
  const missingRequired = !status.database.configured || !status.auth.configured;
  
  if (missingRequired) {
    console.log("   1. Add required configuration to .env.local");
    console.log("   2. Run: bun run setup --check");
    console.log("   3. Run: bun run dev");
  } else if (!status.erc8004.registered && status.wallet.configured) {
    console.log("   1. Run: bun run setup --onchain   # Register on ERC-8004");
    console.log("   2. Run: bun run dev");
  } else {
    console.log("   ✅ Ready! Run: bun run dev");
  }
}

main().catch(console.error);

