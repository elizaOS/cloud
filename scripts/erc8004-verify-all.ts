#!/usr/bin/env bun
/**
 * ERC-8004 Comprehensive Verification Script
 *
 * Verifies the complete ERC-8004 setup across all networks:
 * - Local Anvil (development)
 * - Base Sepolia (testnet)
 * - Base Mainnet (production)
 *
 * Reads configuration from config/erc8004.json
 *
 * Usage:
 *   bun run scripts/erc8004-verify-all.ts
 *   bun run scripts/erc8004-verify-all.ts --network=base-sepolia
 */

import {
  createPublicClient,
  http,
  parseAbi,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import {
  CHAIN_IDS,
  RPC_URLS,
  BLOCK_EXPLORERS,
  IDENTITY_REGISTRY_ADDRESSES,
  REPUTATION_REGISTRY_ADDRESSES,
  VALIDATION_REGISTRY_ADDRESSES,
  ELIZA_CLOUD_AGENT_ID,
  SERVICE_INFO,
  ENDPOINTS,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import configJson from "@/config/erc8004.json";

// ============================================================================
// Types
// ============================================================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  chain: typeof base | typeof baseSepolia | null;
  contracts: {
    identity: Address;
    reputation: Address;
    validation: Address;
  };
  agentId: number | null;
  isLocal: boolean;
}

function getNetworkConfigs(): Record<string, NetworkConfig> {
  return {
    anvil: {
      name: configJson.networks.anvil.name,
      chainId: CHAIN_IDS.anvil,
      rpcUrl: RPC_URLS.anvil,
      blockExplorer: BLOCK_EXPLORERS.anvil,
      chain: null,
      contracts: {
        identity: IDENTITY_REGISTRY_ADDRESSES.anvil,
        reputation: REPUTATION_REGISTRY_ADDRESSES.anvil,
        validation: VALIDATION_REGISTRY_ADDRESSES.anvil,
      },
      agentId: ELIZA_CLOUD_AGENT_ID.anvil,
      isLocal: true,
    },
    "base-sepolia": {
      name: configJson.networks["base-sepolia"].name,
      chainId: CHAIN_IDS["base-sepolia"],
      rpcUrl: RPC_URLS["base-sepolia"],
      blockExplorer: BLOCK_EXPLORERS["base-sepolia"],
      chain: baseSepolia,
      contracts: {
        identity: IDENTITY_REGISTRY_ADDRESSES["base-sepolia"],
        reputation: REPUTATION_REGISTRY_ADDRESSES["base-sepolia"],
        validation: VALIDATION_REGISTRY_ADDRESSES["base-sepolia"],
      },
      agentId: ELIZA_CLOUD_AGENT_ID["base-sepolia"],
      isLocal: false,
    },
    base: {
      name: configJson.networks.base.name,
      chainId: CHAIN_IDS.base,
      rpcUrl: RPC_URLS.base,
      blockExplorer: BLOCK_EXPLORERS.base,
      chain: base,
      contracts: {
        identity: IDENTITY_REGISTRY_ADDRESSES.base,
        reputation: REPUTATION_REGISTRY_ADDRESSES.base,
        validation: VALIDATION_REGISTRY_ADDRESSES.base,
      },
      agentId: ELIZA_CLOUD_AGENT_ID.base,
      isLocal: false,
    },
  };
}

// ABIs
const IDENTITY_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function register(string tokenUri) returns (uint256)",
  "function setAgentUri(uint256 agentId, string newUri) external",
  "event Registered(uint256 indexed agentId, string tokenURI, address indexed owner)",
]);

const VERSION_ABI = parseAbi([
  "function getVersion() view returns (string)",
  "function getIdentityRegistry() view returns (address)",
]);

// ============================================================================
// Verification Functions
// ============================================================================

interface VerificationResult {
  network: string;
  contractsDeployed: boolean;
  contractVersions: Record<string, string>;
  walletBalance: string;
  agentRegistered: boolean;
  agentId: number | null;
  tokenURI: string | null;
  endpointsAccessible: Record<string, boolean>;
  issues: string[];
  recommendations: string[];
}

async function verifyNetwork(
  networkKey: string,
  config: NetworkConfig,
  walletAddress: Address
): Promise<VerificationResult> {
  const result: VerificationResult = {
    network: config.name,
    contractsDeployed: false,
    contractVersions: {},
    walletBalance: "0",
    agentRegistered: false,
    agentId: null,
    tokenURI: null,
    endpointsAccessible: {},
    issues: [],
    recommendations: [],
  };

  console.log(`\n${"═".repeat(60)}`);
  console.log(`📍 ${config.name} (Chain ID: ${config.chainId})`);
  console.log(`${"═".repeat(60)}`);

  // Create client
  const transport = http(config.rpcUrl);
  let client;

  try {
    if (config.chain) {
      client = createPublicClient({ chain: config.chain, transport });
    } else {
      client = createPublicClient({
        transport,
        chain: {
          id: config.chainId,
          name: config.name,
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [config.rpcUrl] } },
        } as Parameters<typeof createPublicClient>[0]["chain"],
      });
    }
  } catch {
    result.issues.push(`Cannot connect to ${config.rpcUrl}`);
    console.log(`❌ Cannot connect to RPC`);
    return result;
  }

  // Check if RPC is reachable
  try {
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ RPC connected (block: ${blockNumber})`);
  } catch {
    result.issues.push(`RPC unreachable: ${config.rpcUrl}`);
    console.log(`❌ RPC unreachable`);
    if (config.isLocal) {
      result.recommendations.push("Start Anvil: bun run anvil:start");
    }
    return result;
  }

  // Check wallet balance
  try {
    const balance = await client.getBalance({ address: walletAddress });
    result.walletBalance = formatUnits(balance, 18);
    console.log(`💰 Wallet: ${walletAddress}`);
    console.log(`   Balance: ${result.walletBalance} ETH`);

    if (balance < BigInt(1e15)) {
      result.issues.push("Low ETH balance for gas");
      if (config.isLocal) {
        result.recommendations.push("Anvil provides 10000 ETH to test accounts");
      } else if (networkKey === "base-sepolia") {
        result.recommendations.push(
          "Get testnet ETH: https://www.coinbase.com/faucets/base-ethereum-goerli-faucet"
        );
      } else {
        result.recommendations.push("Fund wallet with ETH on Base mainnet");
      }
    }
  } catch {
    console.log(`❌ Cannot check balance`);
  }

  // Check contract deployment
  console.log(`\n📋 Contracts:`);

  const contractEntries: [string, Address][] = [
    ["identity", config.contracts.identity],
    ["reputation", config.contracts.reputation],
    ["validation", config.contracts.validation],
  ];

  for (const [name, address] of contractEntries) {
    if (address === ZERO_ADDRESS) {
      console.log(`   ${name}: ❌ Not configured`);
      result.issues.push(`${name} registry not configured`);
      continue;
    }

    try {
      const code = await client.getCode({ address });
      const deployed = code && code !== "0x";

      if (deployed) {
        console.log(`   ${name}: ✅ ${address}`);
        result.contractsDeployed = true;

        // Try to get version
        try {
          const version = await client.readContract({
            address,
            abi: VERSION_ABI,
            functionName: "getVersion",
          });
          result.contractVersions[name] = version as string;
          console.log(`      Version: ${version}`);
        } catch {
          // Version function may not exist
        }
      } else {
        console.log(`   ${name}: ❌ Not deployed at ${address}`);
        result.issues.push(`${name} not deployed at ${address}`);
      }
    } catch {
      console.log(`   ${name}: ⚠️ Check failed`);
    }
  }

  // Check agent registration
  console.log(`\n🤖 Agent Registration:`);

  if (config.contracts.identity !== ZERO_ADDRESS) {
    // Check if we have an agent ID configured (note: 0 is a valid agent ID)
    if (config.agentId !== null) {
      result.agentId = config.agentId;

      // Verify it exists on-chain
      try {
        const owner = await client.readContract({
          address: config.contracts.identity,
          abi: IDENTITY_ABI,
          functionName: "ownerOf",
          args: [BigInt(config.agentId)],
        });

        if (owner) {
          result.agentRegistered = true;
          console.log(`   Agent ID: ${config.chainId}:${config.agentId} ✅`);
          console.log(`   Owner: ${owner}`);

          // Get token URI
          try {
            const uri = await client.readContract({
              address: config.contracts.identity,
              abi: IDENTITY_ABI,
              functionName: "tokenURI",
              args: [BigInt(config.agentId)],
            });
            result.tokenURI = uri as string;
            console.log(`   Token URI: ${uri}`);
          } catch {
            console.log(`   Token URI: ❌ Not set`);
            result.issues.push("Token URI not set");
          }
        }
      } catch {
        console.log(`   Agent ID: ${config.agentId} ❌ Not found on-chain`);
        result.issues.push(`Agent ID ${config.agentId} not found on-chain`);
      }
    } else {
      console.log(`   Agent ID: Not configured`);
      result.recommendations.push(
        `Register agent: bun run erc8004:register --network ${networkKey}`
      );
    }
  } else {
    console.log(`   ⚠️ No Identity Registry configured`);
    if (networkKey === "base") {
      result.recommendations.push(
        "Deploy contracts: cd docs/docs/erc-8004-contracts && npm run deploy:upgradeable:base"
      );
    }
  }

  return result;
}

async function verifyEndpoints(baseUrl: string): Promise<Record<string, boolean>> {
  console.log(`\n🌐 Endpoint Verification:`);
  console.log(`   Base URL: ${baseUrl}`);

  const endpoints: Record<string, string> = {
    "erc8004-registration": `${baseUrl}/.well-known/erc8004-registration.json`,
    "agent-card": `${baseUrl}${ENDPOINTS.a2a.path}`,
    mcp: `${baseUrl}${ENDPOINTS.mcp.path}`,
    a2a: `${baseUrl}/api/a2a`,
    health: `${baseUrl}/api/health`,
  };

  const results: Record<string, boolean> = {};

  for (const [name, url] of Object.entries(endpoints)) {
    try {
      const response = await fetch(url, {
        method: name === "mcp" || name === "a2a" ? "OPTIONS" : "GET",
        signal: AbortSignal.timeout(5000),
      });

      const accessible =
        response.ok || response.status === 401 || response.status === 402;
      results[name] = accessible;
      console.log(`   ${name}: ${accessible ? "✅" : "❌"} (${response.status})`);
    } catch (error) {
      results[name] = false;
      const message = error instanceof Error ? error.message : "Unknown error";
      console.log(`   ${name}: ❌ ${message}`);
    }
  }

  return results;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║       ERC-8004 Comprehensive Verification Report         ║");
  console.log(`║       Service: ${SERVICE_INFO.name.padEnd(40)}║`);
  console.log("╚══════════════════════════════════════════════════════════╝");

  const args = process.argv.slice(2);
  const specificNetwork = args
    .find((a) => a.startsWith("--network="))
    ?.split("=")[1];

  // Get wallet address
  const privateKey = process.env.AGENT0_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  let walletAddress: Address;

  if (privateKey) {
    const account = privateKeyToAccount(privateKey as Hex);
    walletAddress = account.address;
    console.log(`\n🔑 Wallet: ${walletAddress}`);
  } else {
    walletAddress = "0x5dB1268e424da5C26451e4a8B9C221e6DE3C3064" as Address;
    console.log(`\n⚠️  No private key configured, using default address`);
    console.log(`   ${walletAddress}`);
  }

  // Get network configs
  const NETWORKS = getNetworkConfigs();

  // Determine which networks to verify
  const networksToVerify = specificNetwork
    ? [specificNetwork]
    : Object.keys(NETWORKS);

  const results: VerificationResult[] = [];

  for (const networkKey of networksToVerify) {
    const config = NETWORKS[networkKey];
    if (!config) {
      console.log(`\n❌ Unknown network: ${networkKey}`);
      continue;
    }

    const result = await verifyNetwork(networkKey, config, walletAddress);
    results.push(result);
  }

  // Verify endpoints
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const endpointResults = await verifyEndpoints(baseUrl);

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 SUMMARY");
  console.log(`${"═".repeat(60)}`);

  console.log("\n| Network        | Contracts | Agent | Balance    |");
  console.log("|----------------|-----------|-------|------------|");

  for (const result of results) {
    const contracts = result.contractsDeployed ? "✅ Yes" : "❌ No";
    const agent = result.agentRegistered
      ? `✅ ${result.agentId}`
      : "❌ No";
    const balance = `${parseFloat(result.walletBalance).toFixed(4)} ETH`;
    console.log(
      `| ${result.network.padEnd(14)} | ${contracts.padEnd(9)} | ${agent.padEnd(5)} | ${balance.padEnd(10)} |`
    );
  }

  // Issues
  const allIssues = results.flatMap((r) =>
    r.issues.map((i) => `[${r.network}] ${i}`)
  );
  if (allIssues.length > 0) {
    console.log("\n⚠️  Issues Found:");
    for (const issue of allIssues) {
      console.log(`   - ${issue}`);
    }
  }

  // Recommendations
  const allRecs = results.flatMap((r) =>
    r.recommendations.map((rec) => `[${r.network}] ${rec}`)
  );
  if (allRecs.length > 0) {
    console.log("\n💡 Recommendations:");
    for (const rec of allRecs) {
      console.log(`   - ${rec}`);
    }
  }

  // Endpoint summary
  console.log("\n🌐 Endpoints:");
  for (const [name, accessible] of Object.entries(endpointResults)) {
    console.log(`   ${name}: ${accessible ? "✅" : "❌"}`);
  }

  // Config location
  console.log(`\n📁 Configuration:`);
  console.log(`   Config file: config/erc8004.json`);
  console.log(`   Secrets: .env.local (AGENT0_PRIVATE_KEY, X402_RECIPIENT_ADDRESS)`);

  // Overall status
  const allContractsDeployed = results.every(
    (r) => r.contractsDeployed || r.network === "Local Anvil"
  );
  const allAgentsRegistered = results.every(
    (r) => r.agentRegistered || r.network === "Local Anvil" || r.network === "Base Mainnet"
  );

  console.log(`\n${"═".repeat(60)}`);
  if (allContractsDeployed && allAgentsRegistered && allIssues.length === 0) {
    console.log("✅ All checks passed!");
  } else {
    console.log("⚠️  Some checks need attention. See recommendations above.");
  }
  console.log(`${"═".repeat(60)}\n`);

  return { results, endpointResults };
}

main().catch(console.error);
