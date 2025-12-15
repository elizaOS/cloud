#!/usr/bin/env bun
/**
 * ERC-8004 Development Setup Script
 *
 * Comprehensive setup for ERC-8004 and agent0 development.
 * Automatically handles configuration, registration on ALL available networks,
 * and starts dev server.
 *
 * Usage:
 *   bun run dev:erc8004
 *
 * This script will:
 * 1. Check and set default environment configuration
 * 2. Validate network connectivity for testnet AND mainnet
 * 3. Auto-register Eliza Cloud on all networks with deployed contracts
 * 4. Start the Next.js dev server
 */

import { SDK } from "agent0-sdk";
import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { spawn } from "child_process";
import {
  CHAIN_IDS,
  RPC_URLS,
  IDENTITY_REGISTRY_ADDRESSES,
  ELIZA_CLOUD_AGENT_ID,
  SERVICE_WALLET_ADDRESS,
  REPUTATION_REGISTRY_ADDRESSES,
  VALIDATION_REGISTRY_ADDRESSES,
  getDefaultNetwork,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { X402_ENABLED, USDC_ADDRESSES } from "@/lib/config/x402";
import { readEnvFile, updateEnvFile } from "./lib/env-utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Networks to check for registration (in priority order)
const NETWORKS_TO_CHECK: ERC8004Network[] = ["base-sepolia", "base"];

// ============================================================================
// Configuration Check
// ============================================================================

async function ensureConfiguration(): Promise<{
  env: Record<string, string>;
  primaryNetwork: ERC8004Network;
}> {
  console.log("\n📋 Configuration");
  console.log("================");

  const env = readEnvFile();
  let updated = false;

  // Set defaults
  const defaults: Record<string, string> = {
    ERC8004_NETWORK: "base-sepolia",
    ENABLE_X402_PAYMENTS: "true",
    X402_NETWORK: "base-sepolia",
  };

  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (!env[key]) {
      env[key] = defaultValue;
      updateEnvFile(key, defaultValue);
      updated = true;
      console.log(`   Set ${key}=${defaultValue}`);
    }
  }

  const primaryNetwork = (env.ERC8004_NETWORK ||
    "base-sepolia") as ERC8004Network;

  console.log(`   Primary Network: ${primaryNetwork}`);
  console.log(`   x402 Enabled: ${env.ENABLE_X402_PAYMENTS || "false"}`);

  // Check wallet
  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  if (privateKey) {
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    console.log(
      `   Wallet: ${account.address.slice(0, 10)}...${account.address.slice(-8)}`,
    );
  } else {
    console.log(`   Wallet: Not configured`);
  }

  if (updated) {
    console.log(`\n   ✅ Updated .env.local`);
  }

  return { env, primaryNetwork };
}

// ============================================================================
// Network Check
// ============================================================================

interface NetworkStatus {
  network: ERC8004Network;
  connected: boolean;
  contractsDeployed: boolean;
  registered: boolean;
  agentId: number | null;
  walletBalance: bigint;
}

async function checkNetwork(
  network: ERC8004Network,
  env: Record<string, string>,
): Promise<NetworkStatus> {
  const status: NetworkStatus = {
    network,
    connected: false,
    contractsDeployed: false,
    registered: false,
    agentId: null,
    walletBalance: 0n,
  };

  const chain = network === "base-sepolia" ? baseSepolia : base;
  const rpcUrl = RPC_URLS[network];

  try {
    const publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    await publicClient.getBlockNumber();
    status.connected = true;

    // Check Identity Registry
    const identityAddress = IDENTITY_REGISTRY_ADDRESSES[network];
    if (identityAddress && identityAddress !== ZERO_ADDRESS) {
      const code = await publicClient.getCode({ address: identityAddress });
      status.contractsDeployed = !!(code && code !== "0x");
    }

    // Check wallet balance
    const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
    if (privateKey) {
      const account = privateKeyToAccount(privateKey as `0x${string}`);
      status.walletBalance = await publicClient.getBalance({
        address: account.address,
      });
    }

    // Check if already registered
    const envKey = getEnvKeyForNetwork(network);
    const existingId = env[envKey] || ELIZA_CLOUD_AGENT_ID[network];
    if (existingId !== null && existingId !== undefined) {
      status.registered = true;
      status.agentId =
        typeof existingId === "string" ? parseInt(existingId, 10) : existingId;
    }
  } catch {
    // Network not reachable
  }

  return status;
}

function getEnvKeyForNetwork(network: ERC8004Network): string {
  switch (network) {
    case "base-sepolia":
      return "ELIZA_CLOUD_AGENT_ID_SEPOLIA";
    case "base":
      return "ELIZA_CLOUD_AGENT_ID_MAINNET";
    case "anvil":
      return "ELIZA_CLOUD_AGENT_ID_ANVIL";
    default:
      return `ELIZA_CLOUD_AGENT_ID_${network.toUpperCase().replace("-", "_")}`;
  }
}

async function checkAllNetworks(
  env: Record<string, string>,
): Promise<Record<ERC8004Network, NetworkStatus>> {
  console.log("\n🌐 Network Status");
  console.log("=================");

  const results: Record<string, NetworkStatus> = {};

  for (const network of NETWORKS_TO_CHECK) {
    const status = await checkNetwork(network, env);
    results[network] = status;

    const icon =
      status.connected && status.contractsDeployed
        ? "✅"
        : status.connected
          ? "⚠️"
          : "❌";
    const regIcon = status.registered ? "✅" : "❌";

    console.log(`   ${network}:`);
    console.log(
      `      ${icon} Network: ${status.connected ? "Connected" : "Unreachable"}`,
    );
    console.log(
      `      ${status.contractsDeployed ? "✅" : "⚠️"} Contracts: ${status.contractsDeployed ? "Deployed" : "Not deployed"}`,
    );
    console.log(
      `      ${regIcon} Agent: ${status.registered ? `ID ${status.agentId}` : "Not registered"}`,
    );
    if (status.walletBalance > 0n) {
      console.log(
        `      💰 Balance: ${formatUnits(status.walletBalance, 18)} ETH`,
      );
    }
  }

  return results as Record<ERC8004Network, NetworkStatus>;
}

// ============================================================================
// Wallet Check
// ============================================================================

function getWalletAddress(env: Record<string, string>): string | null {
  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) return null;
  const account = privateKeyToAccount(privateKey as `0x${string}`);
  return account.address;
}

// ============================================================================
// Auto Registration
// ============================================================================

async function registerOnNetwork(
  network: ERC8004Network,
  env: Record<string, string>,
): Promise<{ success: boolean; agentId?: number }> {
  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    return { success: false };
  }

  const baseUrl = env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const pinataJwt = env.PINATA_JWT;

  // Get registry addresses for overrides (supports custom deployments)
  const chainId = CHAIN_IDS[network];
  const identityAddress = IDENTITY_REGISTRY_ADDRESSES[network];
  const reputationAddress = REPUTATION_REGISTRY_ADDRESSES[network];
  const validationAddress = VALIDATION_REGISTRY_ADDRESSES[network];

  // Build registry overrides
  const registryOverrides: Record<number, Record<string, string>> = {};
  if (identityAddress !== ZERO_ADDRESS) {
    registryOverrides[chainId] = {
      IDENTITY: identityAddress,
      REPUTATION: reputationAddress,
      VALIDATION: validationAddress,
    };
  }

  // Initialize SDK
  const sdk = new SDK({
    chainId,
    rpcUrl: RPC_URLS[network],
    signer: privateKey,
    registryOverrides:
      Object.keys(registryOverrides).length > 0 ? registryOverrides : undefined,
    ...(pinataJwt && {
      ipfs: "pinata" as const,
      pinataJwt,
    }),
  });

  // Create agent
  const agent = sdk.createAgent(
    "Eliza Cloud",
    "AI agent infrastructure: inference, agents, memory, billing. " +
      "Supports REST, MCP, A2A protocols with x402 or API key authentication.",
    `${baseUrl}/logo.png`,
  );

  // Configure endpoints
  await agent.setMCP(`${baseUrl}/api/mcp`);
  await agent.setA2A(`${baseUrl}/.well-known/agent-card.json`);

  // Configure wallet
  const walletAddress = env.X402_RECIPIENT_ADDRESS || SERVICE_WALLET_ADDRESS;
  if (walletAddress && walletAddress !== ZERO_ADDRESS) {
    agent.setAgentWallet(walletAddress as `0x${string}`, chainId);
  }

  // Configure trust
  agent.setTrust(true, X402_ENABLED, false);

  // Add metadata
  agent.setMetadata({
    version: "1.0.0",
    category: "ai-infrastructure",
    protocols: ["openai", "mcp", "a2a"],
  });

  agent.setActive(true);

  // Add OASF taxonomies
  agent.addSkill("natural_language_processing/text_generation", false);
  agent.addDomain("technology/artificial_intelligence", false);
  agent.addDomain("technology/cloud_services", false);

  // Register
  let agentId: string;

  if (pinataJwt) {
    const result = await agent.registerIPFS();
    agentId = result.agentId;
  } else {
    const registrationUrl = `${baseUrl}/.well-known/erc8004-registration.json`;
    await agent.registerHTTP(registrationUrl);
    agentId = `${chainId}:new`;
  }

  // Update env file
  const tokenId = agentId.split(":")[1];
  const envKey = getEnvKeyForNetwork(network);

  if (tokenId && tokenId !== "new") {
    updateEnvFile(envKey, tokenId);
    return { success: true, agentId: parseInt(tokenId, 10) };
  }

  return { success: true };
}

async function ensureAllRegistered(
  networkStatuses: Record<ERC8004Network, NetworkStatus>,
  env: Record<string, string>,
): Promise<void> {
  console.log("\n🤖 Auto-Registration Check");
  console.log("==========================");

  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    console.log("   ⚠️  No wallet configured - skipping auto-registration");
    console.log("   Set AGENT0_PRIVATE_KEY in .env.local to enable");
    return;
  }

  for (const network of NETWORKS_TO_CHECK) {
    const status = networkStatuses[network];

    if (!status.connected) {
      console.log(`   ${network}: ⏭️  Network not reachable - skipping`);
      continue;
    }

    if (!status.contractsDeployed) {
      console.log(`   ${network}: ⏭️  Contracts not deployed - skipping`);
      continue;
    }

    if (status.registered) {
      console.log(
        `   ${network}: ✅ Already registered (Agent ID: ${status.agentId})`,
      );
      continue;
    }

    // Need to register
    const minBalance = network === "base" ? BigInt(1e15) : BigInt(1e14); // 0.001 ETH mainnet, 0.0001 testnet
    if (status.walletBalance < minBalance) {
      console.log(`   ${network}: ⚠️  Insufficient ETH for registration`);
      if (network === "base-sepolia") {
        console.log(
          `      Get test ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet`,
        );
      }
      continue;
    }

    console.log(`   ${network}: 📝 Registering...`);

    try {
      const result = await registerOnNetwork(network, env);
      if (result.success) {
        console.log(
          `   ${network}: ✅ Registration submitted${result.agentId ? ` (Agent ID: ${result.agentId})` : ""}`,
        );
      } else {
        console.log(`   ${network}: ❌ Registration failed`);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(`   ${network}: ❌ Error: ${msg}`);
    }
  }
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("\n🚀 ERC-8004 Development Setup");
  console.log("==============================");

  // 1. Ensure configuration
  const { env, primaryNetwork } = await ensureConfiguration();

  // 2. Check all networks
  const networkStatuses = await checkAllNetworks(env);

  // 3. Auto-register on all available networks
  await ensureAllRegistered(networkStatuses, env);

  // Summary
  console.log("\n📊 Summary");
  console.log("==========");

  const walletAddress = getWalletAddress(env);
  console.log(
    `   Wallet: ${walletAddress ? `${walletAddress.slice(0, 10)}...${walletAddress.slice(-8)}` : "Not configured"}`,
  );
  console.log(`   Primary Network: ${primaryNetwork}`);

  let hasRegistration = false;
  for (const network of NETWORKS_TO_CHECK) {
    const status = networkStatuses[network];
    if (status.registered) {
      console.log(`   ${network}: ✅ Agent ID ${status.agentId}`);
      hasRegistration = true;
    } else if (status.contractsDeployed) {
      console.log(`   ${network}: ⚠️  Not registered`);
    } else {
      console.log(`   ${network}: ⏭️  Contracts not deployed`);
    }
  }

  if (!hasRegistration && walletAddress) {
    console.log("\n💡 To register on testnet:");
    console.log(
      "   1. Get test ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet",
    );
    console.log("   2. Run: bun run dev:erc8004");
  } else if (!walletAddress) {
    console.log("\n💡 To enable auto-registration:");
    console.log("   Add AGENT0_PRIVATE_KEY to .env.local");
  }

  // Start dev server
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
