#!/usr/bin/env bun
/**
 * Startup Checks Script
 *
 * Quick checks that run before the dev server starts.
 * Verifies ERC-8004 registration status on all networks.
 *
 * This is a non-blocking script - it reports status but doesn't
 * prevent the server from starting.
 *
 * Usage:
 *   bun run scripts/startup-checks.ts
 */

import { createPublicClient, http, formatUnits } from "viem";
import { baseSepolia, base } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN_IDS,
  RPC_URLS,
  IDENTITY_REGISTRY_ADDRESSES,
  ELIZA_CLOUD_AGENT_ID,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { readEnvFile } from "./lib/env-utils";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const NETWORKS: ERC8004Network[] = ["base-sepolia", "base"];

interface NetworkStatus {
  network: ERC8004Network;
  name: string;
  connected: boolean;
  contractsDeployed: boolean;
  registered: boolean;
  agentId: number | null;
}

async function checkNetwork(network: ERC8004Network, env: Record<string, string>): Promise<NetworkStatus> {
  const name = network === "base-sepolia" ? "Base Sepolia" : "Base Mainnet";
  const status: NetworkStatus = {
    network,
    name,
    connected: false,
    contractsDeployed: false,
    registered: false,
    agentId: null,
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

    // Check if already registered
    const envKey = network === "base-sepolia" ? "ELIZA_CLOUD_AGENT_ID_SEPOLIA" : "ELIZA_CLOUD_AGENT_ID_MAINNET";
    const existingId = env[envKey] || ELIZA_CLOUD_AGENT_ID[network];
    if (existingId !== null && existingId !== undefined) {
      status.registered = true;
      status.agentId = typeof existingId === "string" ? parseInt(existingId, 10) : existingId;
    }
  } catch {
    // Network not reachable
  }

  return status;
}

async function main() {
  const env = readEnvFile();
  
  console.log("\n⚡ ERC-8004 Quick Status Check");
  console.log("──────────────────────────────");

  const results: NetworkStatus[] = [];
  
  for (const network of NETWORKS) {
    const status = await checkNetwork(network, env);
    results.push(status);
  }

  // Print compact status
  let hasIssues = false;
  
  for (const status of results) {
    if (!status.contractsDeployed) {
      console.log(`   ${status.name}: ⏭️  No contracts`);
      continue;
    }
    
    if (status.registered) {
      console.log(`   ${status.name}: ✅ Agent #${status.agentId}`);
    } else {
      console.log(`   ${status.name}: ⚠️  Not registered`);
      hasIssues = true;
    }
  }

  // Check wallet
  const privateKey = env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY;
  const walletAddress = privateKey ? privateKeyToAccount(privateKey as `0x${string}`).address : null;

  if (hasIssues && walletAddress) {
    console.log(`\n💡 Run 'bun run dev:erc8004' to auto-register`);
  } else if (hasIssues && !walletAddress) {
    console.log(`\n💡 Set AGENT0_PRIVATE_KEY to enable auto-registration`);
  }

  console.log("");
}

main().catch(() => {
  // Silent fail - don't block dev server startup
});

