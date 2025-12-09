#!/usr/bin/env bun
/**
 * ERC-8004 Contract Info Script
 *
 * Shows information about ERC-8004 contract deployments.
 * The official agent0 contracts are already deployed - no deployment needed.
 *
 * Usage:
 *   bun run erc8004:deploy
 */

import {
  CHAIN_IDS,
  RPC_URLS,
  IDENTITY_REGISTRY_ADDRESSES,
  REPUTATION_REGISTRY_ADDRESSES,
  VALIDATION_REGISTRY_ADDRESSES,
  SUBGRAPH_URLS,
} from "@/lib/config/erc8004";

console.log("\n📋 ERC-8004 Contract Information");
console.log("=================================");
console.log("\nThe official agent0 contracts are already deployed.\n");

const networks = ["base-sepolia", "base"] as const;

for (const network of networks) {
  console.log(`\n🔗 ${network.toUpperCase()}`);
  console.log("─".repeat(40));
  console.log(`   Chain ID: ${CHAIN_IDS[network]}`);
  console.log(`   RPC: ${RPC_URLS[network]}`);
  console.log(`   Identity Registry: ${IDENTITY_REGISTRY_ADDRESSES[network]}`);
  console.log(`   Reputation Registry: ${REPUTATION_REGISTRY_ADDRESSES[network]}`);
  console.log(`   Validation Registry: ${VALIDATION_REGISTRY_ADDRESSES[network]}`);
  if (SUBGRAPH_URLS[network]) {
    console.log(`   Subgraph: Available`);
  }
}

console.log("\n📝 To register Eliza Cloud as an agent:");
console.log("   1. Start dev server: bun run dev:erc8004");
console.log("      (Auto-registers if AGENT0_PRIVATE_KEY is set)");
console.log("");
console.log("   2. Or manually: bun run erc8004:register --network base-sepolia");
console.log("");

console.log("🔗 Resources:");
console.log("   - Agent0 SDK: https://sdk.ag0.xyz");
console.log("   - ERC-8004 Spec: https://eips.ethereum.org/EIPS/eip-8004");
console.log("   - Get test ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet");
console.log("");

