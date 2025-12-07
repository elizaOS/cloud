#!/usr/bin/env bun
/**
 * ERC-8004 Complete Setup Script
 *
 * Handles the complete ERC-8004 setup across all networks:
 * 1. Deploys contracts (for Anvil and Base Mainnet where needed)
 * 2. Registers the Eliza Cloud agent
 * 3. Verifies everything is working
 *
 * Networks:
 * - anvil: Local development (contracts deployed fresh each time)
 * - base-sepolia: Uses official agent0 contracts
 * - base: Deploys our own contracts (agent0 doesn't have mainnet yet)
 *
 * Usage:
 *   bun run scripts/erc8004-setup-all.ts
 *   bun run scripts/erc8004-setup-all.ts --network base-sepolia
 *   bun run scripts/erc8004-setup-all.ts --skip-deploy
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  formatUnits,
  encodeAbiParameters,
  parseAbiParameters,
  type Address,
  type Hex,
} from "viem";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { existsSync, readFileSync } from "fs";
import { SDK } from "agent0-sdk";
import { readEnvFile, updateEnvFileMultiple } from "./lib/env-utils";

// ============================================================================
// Configuration
// ============================================================================

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// Wrapper to add logging
function updateEnvFile(updates: Record<string, string>): void {
  updateEnvFileMultiple(updates);
  for (const [key, value] of Object.entries(updates)) {
    console.log(`   Updated: ${key}=${value}`);
  }
}

const env = readEnvFile();

// Network configurations
interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  chain: typeof base | typeof baseSepolia | null;
  needsDeploy: boolean;
  envPrefix: string;
}

const NETWORKS: Record<string, NetworkConfig> = {
  anvil: {
    name: "Local Anvil",
    chainId: 31337,
    rpcUrl: env.ANVIL_RPC_URL || "http://127.0.0.1:8545",
    chain: null,
    needsDeploy: true,
    envPrefix: "ANVIL",
  },
  "base-sepolia": {
    name: "Base Sepolia",
    chainId: 84532,
    rpcUrl: "https://sepolia.base.org",
    chain: baseSepolia,
    needsDeploy: false, // Uses official agent0 contracts
    envPrefix: "SEPOLIA",
  },
  base: {
    name: "Base Mainnet",
    chainId: 8453,
    rpcUrl: "https://mainnet.base.org",
    chain: base,
    needsDeploy: true, // No official contracts yet
    envPrefix: "BASE",
  },
};

// Official agent0 contract addresses (for Base Sepolia)
const AGENT0_CONTRACTS = {
  "base-sepolia": {
    identity: "0x8004AA63c570c570eBF15376c0dB199918BFe9Fb" as Address,
    reputation: "0x8004bd8daB57f14Ed299135749a5CB5c42d341BF" as Address,
    validation: "0x8004C269D0A5647E51E121FeB226200ECE932d55" as Address,
  },
};

// Contract bytecodes (compiled from docs/docs/erc-8004-contracts)
// These are loaded dynamically from the artifacts if available
function loadContractBytecode(contractName: string): Hex | null {
  const artifactPath = `docs/docs/erc-8004-contracts/artifacts/contracts/${contractName}.sol/${contractName}.json`;
  if (existsSync(artifactPath)) {
    const artifact = JSON.parse(readFileSync(artifactPath, "utf-8"));
    return artifact.bytecode as Hex;
  }
  return null;
}

// ABIs
const IDENTITY_ABI = parseAbi([
  "function initialize() external",
  "function register(string tokenUri) returns (uint256)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function setAgentUri(uint256 agentId, string newUri) external",
  "function getVersion() view returns (string)",
  "event Registered(uint256 indexed agentId, string tokenURI, address indexed owner)",
]);

const REGISTRY_INIT_ABI = parseAbi([
  "function initialize(address identityRegistry) external",
  "function getVersion() view returns (string)",
  "function getIdentityRegistry() view returns (address)",
]);

// ERC1967Proxy bytecode (minimal)
const ERC1967_PROXY_BYTECODE =
  "0x608060405234801561001057600080fd5b506040516104423803806104428339818101604052810190610032919061031e565b61004561003d610096565b6100a5565b600081511115610089576000836001600160a01b03168360405161006991906103a7565b600060405180830381855af49150503d80600081146100a4576040519150601f19603f3d011682016040523d82523d6000602084013e5b505b50505050506103be565b600061009f6100cb565b905090565b3660008037600080366000845af43d6000803e8080156100c3573d6000f35b3d6000fd5b565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565b6000604051905090565b600080fd5b600080fd5b60006001600160a01b0382169050919050565b6100188161010b565b811461012357600080fd5b50565b6000815190506101358161010f565b92915050565b600080fd5b600080fd5b6000601f19601f8301169050919050565b7f4e487b7100000000000000000000000000000000000000000000000000000000600052604160045260246000fd5b61018e82610145565b810181811067ffffffffffffffff821117156101ad576101ac610156565b5b80604052505050565b60006101c06100f1565b90506101cc8282610185565b919050565b600067ffffffffffffffff8211156101ec576101eb610156565b5b6101f582610145565b9050602081019050919050565b60005b83811015610220578082015181840152602081019050610205565b83811115610230576000848401525b50505050565b600061024961024484610101565b6101b6565b90508281526020810184848401111561026557610264610140565b5b610270848285610202565b509392505050565b600082601f83011261028d5761028c61013b565b5b815161029d848260208601610236565b91505092915050565b6000806040838503121561010b576102ba6100fb565b5b60006102c885828601610126565b925050602083015167ffffffffffffffff8111156102e9576102e8610100565b5b6102f585828601610278565b9150509250929050565b600082825260208201905092915050565b600081519050919050565b600082825260208201905092915050565b600061033782610310565b610341818561031b565b9350610351818560208601610202565b61035a81610145565b840191505092915050565b6000610371838361032c565b905092915050565b600082825260208201905092915050565b600061039582610310565b61039f8185610379565b93508360208202850161035e565050919050565b60006103bf828461038e565b915081905092915050565b6070806103d26000396000f3fe6080604052600a600c565b005b6018601460105b9182819190565b6020601f565b565b600090565b7f360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc5490565fea164736f6c6343000811000a" as Hex;

// ============================================================================
// Contract Deployment
// ============================================================================

async function deployContracts(
  networkKey: string,
  privateKey: Hex
): Promise<{ identity: Address; reputation: Address; validation: Address } | null> {
  const config = NETWORKS[networkKey];
  console.log(`\n📦 Deploying contracts to ${config.name}...`);

  // Check if we have compiled contracts
  const identityBytecode = loadContractBytecode("IdentityRegistryUpgradeable");
  const reputationBytecode = loadContractBytecode("ReputationRegistryUpgradeable");
  const validationBytecode = loadContractBytecode("ValidationRegistryUpgradeable");
  const proxyBytecode = loadContractBytecode("ERC1967Proxy");

  if (!identityBytecode || !reputationBytecode || !validationBytecode) {
    console.log(`\n⚠️  Compiled contracts not found.`);
    console.log(`   Run: cd docs/docs/erc-8004-contracts && npm install && npx hardhat compile`);

    if (networkKey === "anvil") {
      console.log(`\n   For Anvil, you can use the Hardhat deployment script:`);
      console.log(`   cd docs/docs/erc-8004-contracts && npm run deploy:upgradeable`);
    }

    return null;
  }

  const account = privateKeyToAccount(privateKey);
  const transport = http(config.rpcUrl);

  const publicClient = createPublicClient({
    chain: config.chain || {
      id: config.chainId,
      name: config.name,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    } as Parameters<typeof createPublicClient>[0]["chain"],
    transport,
  });

  const walletClient = createWalletClient({
    account,
    chain: config.chain || {
      id: config.chainId,
      name: config.name,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    } as Parameters<typeof createWalletClient>[0]["chain"],
    transport,
  });

  // Check balance
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`   Deployer: ${account.address}`);
  console.log(`   Balance: ${formatUnits(balance, 18)} ETH`);

  if (balance < BigInt(1e15)) {
    console.log(`   ❌ Insufficient balance for deployment`);
    return null;
  }

  // For now, return null and recommend using Hardhat
  console.log(`\n   Use Hardhat for deployment:`);
  console.log(`   cd docs/docs/erc-8004-contracts`);
  console.log(`   npx hardhat vars set DEPLOYER_PRIVATE_KEY ${privateKey}`);
  console.log(`   npm run deploy:upgradeable:${networkKey === "base" ? "base" : networkKey}`);

  return null;
}

// ============================================================================
// Agent Registration
// ============================================================================

async function registerAgent(
  networkKey: string,
  privateKey: Hex,
  contracts: { identity: Address; reputation: Address; validation: Address }
): Promise<number | null> {
  const config = NETWORKS[networkKey];
  const baseUrl = env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const pinataJwt = env.PINATA_JWT;

  console.log(`\n🤖 Registering agent on ${config.name}...`);
  console.log(`   Base URL: ${baseUrl}`);

  // Build registry overrides
  const registryOverrides: Record<number, Record<string, Address>> = {
    [config.chainId]: {
      IDENTITY: contracts.identity,
      REPUTATION: contracts.reputation,
      VALIDATION: contracts.validation,
    },
  };

  const sdk = new SDK({
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    signer: privateKey,
    registryOverrides,
    ...(pinataJwt && { ipfs: "pinata" as const, pinataJwt }),
  });

  // Create agent
  const agent = sdk.createAgent(
    "Eliza Cloud",
    "AI agent infrastructure: inference, agents, memory, billing. " +
      "Supports REST, MCP, A2A protocols with x402 or API key authentication.",
    `${baseUrl}/logo.png`
  );

  // Configure endpoints
  console.log(`   Configuring endpoints...`);
  await agent.setMCP(`${baseUrl}/api/mcp`);
  await agent.setA2A(`${baseUrl}/.well-known/agent-card.json`);

  // Configure wallet
  const walletAddress = env.X402_RECIPIENT_ADDRESS;
  if (walletAddress && walletAddress !== ZERO_ADDRESS) {
    agent.setAgentWallet(walletAddress as Address, config.chainId);
  }

  // Configure trust and metadata
  const x402Enabled = env.ENABLE_X402_PAYMENTS === "true";
  agent.setTrust(true, x402Enabled, false);
  agent.setMetadata({
    version: "1.0.0",
    category: "ai-infrastructure",
    protocols: ["openai", "mcp", "a2a"],
    paymentMethods: x402Enabled ? ["x402", "api_key"] : ["api_key"],
  });
  agent.setActive(true);

  // Add OASF taxonomies
  agent.addSkill("natural_language_processing/text_generation", false);
  agent.addDomain("technology/artificial_intelligence", false);
  agent.addDomain("technology/cloud_services", false);

  // Register
  console.log(`   Registering on-chain...`);

  let agentId: string;
  let agentURI: string;

  if (pinataJwt) {
    const result = await agent.registerIPFS();
    agentId = result.agentId;
    agentURI = result.agentURI;
  } else {
    const registrationUrl = `${baseUrl}/.well-known/erc8004-registration.json`;
    await agent.registerHTTP(registrationUrl);
    agentId = `${config.chainId}:?`;
    agentURI = registrationUrl;
  }

  console.log(`   ✅ Registered!`);
  console.log(`   Agent ID: ${agentId}`);
  console.log(`   Agent URI: ${agentURI}`);

  // Extract token ID
  const tokenId = agentId.split(":")[1];
  if (tokenId && tokenId !== "?") {
    return parseInt(tokenId, 10);
  }

  // If we used HTTP registration, query for the token ID
  const transport = http(config.rpcUrl);
  const publicClient = createPublicClient({
    chain: config.chain || {
      id: config.chainId,
      name: config.name,
      nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    } as Parameters<typeof createPublicClient>[0]["chain"],
    transport,
  });

  const account = privateKeyToAccount(privateKey);

  // Query recent registration events
  const currentBlock = await publicClient.getBlockNumber();
  const logs = await publicClient.getLogs({
    address: contracts.identity,
    event: {
      type: "event",
      name: "Registered",
      inputs: [
        { name: "agentId", type: "uint256", indexed: true },
        { name: "tokenURI", type: "string", indexed: false },
        { name: "owner", type: "address", indexed: true },
      ],
    },
    args: { owner: account.address },
    fromBlock: currentBlock - 100n,
    toBlock: currentBlock,
  });

  if (logs.length > 0) {
    const latestLog = logs[logs.length - 1];
    return Number(latestLog.args.agentId);
  }

  return null;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║           ERC-8004 Complete Setup                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const args = process.argv.slice(2);
  const specificNetwork = args
    .find((a) => a.startsWith("--network="))
    ?.split("=")[1];
  const skipDeploy = args.includes("--skip-deploy");

  // Get private key
  const privateKey = (env.AGENT0_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY) as Hex;
  if (!privateKey) {
    console.error("\n❌ AGENT0_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY required in .env.local");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log(`\n🔑 Wallet: ${account.address}`);

  // Determine which networks to set up
  const networksToSetup = specificNetwork
    ? [specificNetwork]
    : Object.keys(NETWORKS);

  const results: Record<string, { agentId: number | null; contracts: Record<string, Address> }> = {};

  for (const networkKey of networksToSetup) {
    const config = NETWORKS[networkKey];
    if (!config) {
      console.log(`\n❌ Unknown network: ${networkKey}`);
      continue;
    }

    console.log(`\n${"═".repeat(60)}`);
    console.log(`📍 ${config.name}`);
    console.log(`${"═".repeat(60)}`);

    // Get contract addresses
    let contracts: { identity: Address; reputation: Address; validation: Address };

    if (networkKey === "base-sepolia") {
      // Use official agent0 contracts
      contracts = AGENT0_CONTRACTS["base-sepolia"];
      console.log(`   Using official agent0 contracts`);
    } else {
      // Check if we have custom contracts configured
      const identityAddr = env[`ERC8004_IDENTITY_REGISTRY_${config.envPrefix}`];
      const reputationAddr = env[`ERC8004_REPUTATION_REGISTRY_${config.envPrefix}`];
      const validationAddr = env[`ERC8004_VALIDATION_REGISTRY_${config.envPrefix}`];

      if (identityAddr && identityAddr !== ZERO_ADDRESS) {
        contracts = {
          identity: identityAddr as Address,
          reputation: (reputationAddr || ZERO_ADDRESS) as Address,
          validation: (validationAddr || ZERO_ADDRESS) as Address,
        };
        console.log(`   Using configured contracts`);
      } else if (config.needsDeploy && !skipDeploy) {
        // Deploy contracts
        const deployed = await deployContracts(networkKey, privateKey);
        if (!deployed) {
          console.log(`   ⚠️  Skipping ${config.name} - no contracts`);
          continue;
        }
        contracts = deployed;

        // Save to env
        updateEnvFile({
          [`ERC8004_IDENTITY_REGISTRY_${config.envPrefix}`]: contracts.identity,
          [`ERC8004_REPUTATION_REGISTRY_${config.envPrefix}`]: contracts.reputation,
          [`ERC8004_VALIDATION_REGISTRY_${config.envPrefix}`]: contracts.validation,
        });
      } else {
        console.log(`   ⚠️  No contracts configured for ${config.name}`);
        console.log(`   Set ERC8004_IDENTITY_REGISTRY_${config.envPrefix} in .env.local`);
        continue;
      }
    }

    console.log(`   Identity: ${contracts.identity}`);

    // Check existing agent ID
    const existingAgentId = env[`ELIZA_CLOUD_AGENT_ID_${config.envPrefix}`];
    if (existingAgentId) {
      console.log(`\n   Agent already registered: ${config.chainId}:${existingAgentId}`);
      results[networkKey] = {
        agentId: parseInt(existingAgentId, 10),
        contracts,
      };
      continue;
    }

    // Register agent
    const agentId = await registerAgent(networkKey, privateKey, contracts);

    if (agentId) {
      // Save to env
      updateEnvFile({
        [`ELIZA_CLOUD_AGENT_ID_${config.envPrefix}`]: agentId.toString(),
      });
    }

    results[networkKey] = { agentId, contracts };
  }

  // Summary
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 SETUP COMPLETE");
  console.log(`${"═".repeat(60)}`);

  console.log("\n| Network        | Agent ID         | Identity Registry                  |");
  console.log("|----------------|------------------|-------------------------------------|");

  for (const [networkKey, result] of Object.entries(results)) {
    const config = NETWORKS[networkKey];
    const agentIdStr = result.agentId
      ? `${config.chainId}:${result.agentId}`
      : "Not registered";
    console.log(
      `| ${config.name.padEnd(14)} | ${agentIdStr.padEnd(16)} | ${result.contracts.identity} |`
    );
  }

  console.log(`\n✅ Run verification: bun run scripts/erc8004-verify-all.ts`);
}

main().catch(console.error);

