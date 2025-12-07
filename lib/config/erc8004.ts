/**
 * ERC-8004 Configuration
 *
 * Reads configuration from config/erc8004.json with .env overrides for secrets.
 *
 * Config priority:
 * 1. Environment variables (highest - for secrets/overrides)
 * 2. config/erc8004.json (committed defaults)
 *
 * @see https://eips.ethereum.org/EIPS/eip-8004
 * @see https://sdk.ag0.xyz
 */

import type { Address } from "viem";
import configJson from "@/config/erc8004.json";

// ============================================================================
// Types
// ============================================================================

export type ERC8004Network = "anvil" | "base-sepolia" | "base";

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  isTestnet: boolean;
  contracts: {
    identity: string | null;
    reputation: string | null;
    validation: string | null;
  };
  agentId: number | null;
  subgraphUrl: string | null;
}

interface EndpointConfig {
  path: string;
  version?: string;
  capabilities?: Record<string, boolean>;
}

interface ERC8004Config {
  service: {
    name: string;
    description: string;
    image: string;
    version: string;
    category: string;
    protocols: string[];
    supportedTrust: Array<"reputation" | "crypto-economic" | "tee-attestation">;
  };
  networks: Record<string, NetworkConfig>;
  endpoints: Record<string, EndpointConfig>;
  defaults: {
    network: string;
    productionNetwork: string;
  };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ============================================================================
// Load Configuration
// ============================================================================

// Type the imported JSON
const config = configJson as ERC8004Config;

/**
 * Get network configuration with .env overrides
 */
function getNetworkConfig(network: ERC8004Network): NetworkConfig {
  const base = config.networks[network];
  if (!base) {
    throw new Error(`Unknown network: ${network}`);
  }

  // Environment variable overrides (for secrets and dynamic values)
  const envPrefix = network === "base-sepolia" ? "SEPOLIA" : network === "base" ? "BASE" : "ANVIL";

  return {
    ...base,
    // Override RPC URL if provided (useful for private RPCs)
    rpcUrl: process.env[`${envPrefix}_RPC_URL`] || process.env.ANVIL_RPC_URL || base.rpcUrl,
    contracts: {
      identity:
        process.env[`ERC8004_IDENTITY_REGISTRY_${envPrefix}`] ||
        base.contracts.identity,
      reputation:
        process.env[`ERC8004_REPUTATION_REGISTRY_${envPrefix}`] ||
        base.contracts.reputation,
      validation:
        process.env[`ERC8004_VALIDATION_REGISTRY_${envPrefix}`] ||
        base.contracts.validation,
    },
    // Override agent ID if provided
    agentId:
      process.env[`ELIZA_CLOUD_AGENT_ID_${envPrefix}`] !== undefined
        ? parseInt(process.env[`ELIZA_CLOUD_AGENT_ID_${envPrefix}`]!, 10)
        : base.agentId,
  };
}

// ============================================================================
// Exported Constants (for backwards compatibility)
// ============================================================================

export const CHAIN_IDS: Record<ERC8004Network, number> = {
  anvil: config.networks.anvil.chainId,
  "base-sepolia": config.networks["base-sepolia"].chainId,
  base: config.networks.base.chainId,
};

export const RPC_URLS: Record<ERC8004Network, string> = {
  anvil: getNetworkConfig("anvil").rpcUrl,
  "base-sepolia": getNetworkConfig("base-sepolia").rpcUrl,
  base: getNetworkConfig("base").rpcUrl,
};

export const BLOCK_EXPLORERS: Record<ERC8004Network, string> = {
  anvil: config.networks.anvil.blockExplorer,
  "base-sepolia": config.networks["base-sepolia"].blockExplorer,
  base: config.networks.base.blockExplorer,
};

// Contract addresses (with .env overrides)
export const IDENTITY_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  anvil: (getNetworkConfig("anvil").contracts.identity || ZERO_ADDRESS) as Address,
  "base-sepolia": (getNetworkConfig("base-sepolia").contracts.identity || ZERO_ADDRESS) as Address,
  base: (getNetworkConfig("base").contracts.identity || ZERO_ADDRESS) as Address,
};

export const REPUTATION_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  anvil: (getNetworkConfig("anvil").contracts.reputation || ZERO_ADDRESS) as Address,
  "base-sepolia": (getNetworkConfig("base-sepolia").contracts.reputation || ZERO_ADDRESS) as Address,
  base: (getNetworkConfig("base").contracts.reputation || ZERO_ADDRESS) as Address,
};

export const VALIDATION_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  anvil: (getNetworkConfig("anvil").contracts.validation || ZERO_ADDRESS) as Address,
  "base-sepolia": (getNetworkConfig("base-sepolia").contracts.validation || ZERO_ADDRESS) as Address,
  base: (getNetworkConfig("base").contracts.validation || ZERO_ADDRESS) as Address,
};

export const SUBGRAPH_URLS: Record<ERC8004Network, string | null> = {
  anvil: config.networks.anvil.subgraphUrl,
  "base-sepolia": config.networks["base-sepolia"].subgraphUrl,
  base: config.networks.base.subgraphUrl,
};

// Service wallet (from .env - it's a secret)
export const SERVICE_WALLET_ADDRESS: Address = (
  process.env.X402_RECIPIENT_ADDRESS || ZERO_ADDRESS
) as Address;

// Agent IDs (from JSON config, overridable via .env)
export const ELIZA_CLOUD_AGENT_ID: Record<ERC8004Network, number | null> = {
  anvil: getNetworkConfig("anvil").agentId,
  "base-sepolia": getNetworkConfig("base-sepolia").agentId,
  base: getNetworkConfig("base").agentId,
};

// ============================================================================
// Service Info
// ============================================================================

export const SERVICE_INFO = {
  name: config.service.name,
  description: config.service.description,
  image: config.service.image,
  version: config.service.version,
  category: config.service.category,
  protocols: config.service.protocols,
  supportedTrust: config.service.supportedTrust,
};

export const ENDPOINTS = config.endpoints;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get default network based on environment
 */
export function getDefaultNetwork(): ERC8004Network {
  const envNetwork = process.env.ERC8004_NETWORK as ERC8004Network | undefined;
  if (envNetwork && CHAIN_IDS[envNetwork]) return envNetwork;
  if (process.env.USE_ANVIL === "true") return "anvil";
  if (process.env.NODE_ENV === "production") return config.defaults.productionNetwork as ERC8004Network;
  return config.defaults.network as ERC8004Network;
}

/**
 * Check if ERC-8004 is properly configured for a network
 */
export function isERC8004Configured(network?: ERC8004Network): boolean {
  const net = network || getDefaultNetwork();
  return IDENTITY_REGISTRY_ADDRESSES[net] !== ZERO_ADDRESS;
}

/**
 * Check if Eliza Cloud is registered as an agent on the network
 */
export function isAgentRegistered(network?: ERC8004Network): boolean {
  const net = network || getDefaultNetwork();
  return ELIZA_CLOUD_AGENT_ID[net] !== null;
}

/**
 * Get all contract addresses for a network
 */
export function getContractAddresses(network?: ERC8004Network) {
  const net = network || getDefaultNetwork();
  return {
    identity: IDENTITY_REGISTRY_ADDRESSES[net],
    reputation: REPUTATION_REGISTRY_ADDRESSES[net],
    validation: VALIDATION_REGISTRY_ADDRESSES[net],
    chainId: CHAIN_IDS[net],
    rpcUrl: RPC_URLS[net],
    subgraphUrl: SUBGRAPH_URLS[net],
  };
}

/**
 * Get full network configuration
 */
export function getFullNetworkConfig(network?: ERC8004Network): NetworkConfig {
  const net = network || getDefaultNetwork();
  return getNetworkConfig(net);
}

// ============================================================================
// ERC-8004 Registration File Schema
// ============================================================================

export interface ERC8004RegistrationFile {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";
  name: string;
  description: string;
  image: string;
  endpoints: Array<{
    name: string;
    endpoint: string;
    version?: string;
    capabilities?: Record<string, boolean>;
  }>;
  registrations: Array<{
    agentId: number | null;
    network: string;
  }>;
  supportedTrust: Array<"reputation" | "crypto-economic" | "tee-attestation">;
}

/**
 * Generate the ERC-8004 registration file
 */
export function generateRegistrationFile(baseUrl: string): ERC8004RegistrationFile {
  const network = getDefaultNetwork();

  return {
    type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
    name: SERVICE_INFO.name,
    description: SERVICE_INFO.description,
    image: `${baseUrl}${SERVICE_INFO.image}`,
    endpoints: [
      {
        name: "A2A",
        endpoint: `${baseUrl}${ENDPOINTS.a2a.path}`,
        version: ENDPOINTS.a2a.version,
      },
      {
        name: "MCP",
        endpoint: `${baseUrl}${ENDPOINTS.mcp.path}`,
        version: ENDPOINTS.mcp.version,
        capabilities: ENDPOINTS.mcp.capabilities,
      },
      {
        name: "OpenAPI",
        endpoint: `${baseUrl}${ENDPOINTS.openapi.path}`,
        version: ENDPOINTS.openapi.version,
      },
      {
        name: "agentWallet",
        endpoint: `eip155:${CHAIN_IDS[network]}:${SERVICE_WALLET_ADDRESS}`,
      },
    ],
    registrations: [
      { agentId: ELIZA_CLOUD_AGENT_ID["anvil"], network: "eip155:31337" },
      { agentId: ELIZA_CLOUD_AGENT_ID["base-sepolia"], network: "eip155:84532" },
      { agentId: ELIZA_CLOUD_AGENT_ID["base"], network: "eip155:8453" },
    ].filter((r) => r.agentId !== null),
    supportedTrust: SERVICE_INFO.supportedTrust,
  };
}

// ============================================================================
// Agent0 SDK Integration Types
// ============================================================================

export interface Agent0RegistrationParams {
  name: string;
  description: string;
  image?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  walletAddress?: Address;
  active?: boolean;
}

export interface Agent0RegistrationResult {
  agentId: string; // Format: "chainId:tokenId"
  agentURI: string; // IPFS or HTTP URI
  txHash: string;
}
