#!/usr/bin/env bun
/**
 * Eliza Cloud Agent Registration Script
 *
 * Manually registers or updates Eliza Cloud on the ERC-8004 Identity Registry.
 * Use this for explicit control over registration, or to update an existing agent.
 *
 * For automatic registration, use: bun run dev:erc8004 or bun run dev:x402
 *
 * Usage:
 *   bun run erc8004:register                           # Register on base-sepolia
 *   bun run erc8004:register --network base            # Register on mainnet
 *   bun run erc8004:register --update                  # Update existing registration
 *
 * Prerequisites:
 *   - AGENT0_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY in .env.local
 *   - ETH on the target network for gas
 */

import { SDK } from "agent0-sdk";
import {
  CHAIN_IDS,
  RPC_URLS,
  ELIZA_CLOUD_AGENT_ID,
  SERVICE_WALLET_ADDRESS,
  IDENTITY_REGISTRY_ADDRESSES,
  REPUTATION_REGISTRY_ADDRESSES,
  VALIDATION_REGISTRY_ADDRESSES,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { X402_ENABLED } from "@/lib/config/x402";
import {
  readEnvFile,
  updateEnvFile as updateEnvFileBase,
} from "./lib/env-utils";

// Wrapper to add logging
function updateEnvFile(key: string, value: string): void {
  updateEnvFileBase(key, value);
  console.log(`   Updated .env.local: ${key}=${value}`);
}

function parseArgs(): { network: ERC8004Network; update: boolean } {
  const args = process.argv.slice(2);
  const networkArg =
    args.find((a) => a.startsWith("--network="))?.split("=")[1] ||
    args[args.indexOf("--network") + 1] ||
    "base-sepolia";

  if (!["base-sepolia", "base"].includes(networkArg)) {
    throw new Error(`Unknown network: ${networkArg}. Use base-sepolia or base`);
  }

  return {
    network: networkArg as ERC8004Network,
    update: args.includes("--update"),
  };
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const { network, update } = parseArgs();
  const env = readEnvFile();

  console.log("\n🚀 Eliza Cloud Agent Registration");
  console.log("==================================");
  console.log(`   Network: ${network}`);
  console.log(`   Mode: ${update ? "Update" : "New"}`);

  // Get private key
  const privateKey = (env.AGENT0_PRIVATE_KEY ||
    env.DEPLOYER_PRIVATE_KEY) as `0x${string}`;
  if (!privateKey) {
    throw new Error(
      "AGENT0_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY required in .env.local",
    );
  }

  // Check existing registration
  const envKey =
    network === "base-sepolia"
      ? "ELIZA_CLOUD_AGENT_ID_SEPOLIA"
      : "ELIZA_CLOUD_AGENT_ID_MAINNET";
  const existingId = env[envKey] || ELIZA_CLOUD_AGENT_ID[network];

  if (existingId && !update) {
    console.log(
      `\n   ℹ️  Already registered: ${CHAIN_IDS[network]}:${existingId}`,
    );
    console.log(`   Use --update to modify the registration`);
    return;
  }

  // Initialize SDK
  const baseUrl = env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const pinataJwt = env.PINATA_JWT;

  console.log(`   Base URL: ${baseUrl}`);
  console.log(`   IPFS: ${pinataJwt ? "Pinata" : "HTTP"}`);

  // Get registry addresses (use custom overrides for networks where we deploy our own contracts)
  const chainId = CHAIN_IDS[network];
  const identityAddress = IDENTITY_REGISTRY_ADDRESSES[network];
  const reputationAddress = REPUTATION_REGISTRY_ADDRESSES[network];
  const validationAddress = VALIDATION_REGISTRY_ADDRESSES[network];

  // Check if we have valid registry addresses (not zero address)
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  if (identityAddress === ZERO_ADDRESS) {
    throw new Error(
      `No Identity Registry deployed on ${network}. ` +
        `Deploy contracts first: cd docs/docs/erc-8004-contracts && npm run deploy:upgradeable:${network}`,
    );
  }

  console.log(`   Identity Registry: ${identityAddress}`);

  // Build registry overrides for custom deployments
  const registryOverrides: Record<number, Record<string, string>> = {
    [chainId]: {
      IDENTITY: identityAddress,
      REPUTATION: reputationAddress,
      VALIDATION: validationAddress,
    },
  };

  const sdk = new SDK({
    chainId,
    rpcUrl: RPC_URLS[network],
    signer: privateKey,
    registryOverrides,
    ...(pinataJwt && { ipfs: "pinata" as const, pinataJwt }),
  });

  let agent;

  if (update && existingId) {
    // Load existing agent
    console.log(`\n📝 Loading agent ${CHAIN_IDS[network]}:${existingId}...`);
    agent = await sdk.loadAgent(`${CHAIN_IDS[network]}:${existingId}`);
  } else {
    // Create new agent
    console.log("\n📝 Creating new agent...");
    agent = sdk.createAgent(
      "Eliza Cloud",
      "AI agent infrastructure: inference, agents, memory, billing. " +
        "Supports REST, MCP, A2A protocols with x402 or API key authentication.",
      `${baseUrl}/logo.png`,
    );
  }

  // Configure endpoints
  console.log("   Configuring endpoints...");
  await agent.setMCP(`${baseUrl}/api/mcp`);
  await agent.setA2A(`${baseUrl}/.well-known/agent-card.json`);

  // Configure wallet
  const walletAddress = env.X402_RECIPIENT_ADDRESS || SERVICE_WALLET_ADDRESS;
  if (
    walletAddress &&
    walletAddress !== "0x0000000000000000000000000000000000000000"
  ) {
    agent.setAgentWallet(walletAddress as `0x${string}`, CHAIN_IDS[network]);
  }

  // Configure trust and metadata
  agent.setTrust(true, X402_ENABLED, false);
  agent.setMetadata({
    version: "1.0.0",
    category: "ai-infrastructure",
    protocols: ["openai", "mcp", "a2a"],
    paymentMethods: X402_ENABLED ? ["x402", "api_key"] : ["api_key"],
  });
  agent.setActive(true);

  // Add OASF taxonomies
  agent.addSkill("natural_language_processing/text_generation", false);
  agent.addDomain("technology/artificial_intelligence", false);
  agent.addDomain("technology/cloud_services", false);

  // Register
  console.log("\n📤 Registering on-chain...");

  let agentId: string;
  let agentURI: string;

  if (pinataJwt) {
    const result = await agent.registerIPFS();
    agentId = result.agentId;
    agentURI = result.agentURI;
  } else {
    const registrationUrl = `${baseUrl}/.well-known/erc8004-registration.json`;
    await agent.registerHTTP(registrationUrl);
    agentId =
      update && existingId
        ? `${CHAIN_IDS[network]}:${existingId}`
        : `${CHAIN_IDS[network]}:?`;
    agentURI = registrationUrl;
  }

  // Update env
  const tokenId = agentId.split(":")[1];
  if (tokenId && tokenId !== "?") {
    updateEnvFile(envKey, tokenId);
  }

  console.log(`\n✅ ${update ? "Updated" : "Registered"}!`);
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   Agent URI: ${agentURI}`);
  console.log("\n📋 Verification:");
  console.log(`   Block Explorer: https://sepolia.basescan.org/`);
  console.log(`   Agent Discovery: https://sdk.ag0.xyz/demo`);
}

main().catch((error) => {
  console.error(`\n❌ Error: ${error.message}`);
  process.exit(1);
});
