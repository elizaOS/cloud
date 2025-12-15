/**
 * ERC-8004 Configuration
 *
 * Multi-registry support for Jeju AND Base ecosystems.
 * Enables agent registration, discovery, and search across both registries.
 *
 * Features:
 * - Register agents on both Jeju and Base registries with single user action
 * - Aggregate search across all registries
 * - Account abstraction (ERC-4337) for gasless registration
 * - Paymaster-sponsored gas for minimal user friction
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

/** All supported ERC-8004 networks including Jeju and Base */
export type ERC8004Network =
  | "jeju-localnet"
  | "jeju-testnet"
  | "jeju"
  | "anvil"
  | "base-sepolia"
  | "base";

/** Registry ecosystem */
export type ERC8004Ecosystem = "jeju" | "base";

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  isTestnet: boolean;
  isLocalnet?: boolean;
  contracts: {
    identity: string | null;
    reputation: string | null;
    validation: string | null;
  };
  agentId: number | null;
  subgraphUrl: string | null;
  ecosystem: ERC8004Ecosystem;
}

interface EndpointConfig {
  path: string;
  version?: string;
  capabilities?: Record<string, boolean>;
}

interface MultiRegistryConfig {
  enabled: boolean;
  primaryEcosystem: ERC8004Ecosystem;
  secondaryEcosystem: ERC8004Ecosystem;
  syncStrategy: "parallel" | "sequential";
  crossEcosystemSearch: boolean;
  registrationStrategy: {
    batchRegistration: boolean;
    usePaymaster: boolean;
    gasSponsored: boolean;
  };
}

interface AccountAbstractionConfig {
  enabled: boolean;
  entryPoint: string;
  paymasterEnabled: boolean;
  batchOperations: {
    multiChainRegistration: boolean;
    maxBatchSize: number;
  };
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
  multiRegistry: MultiRegistryConfig;
  accountAbstraction: AccountAbstractionConfig;
  endpoints: Record<string, EndpointConfig>;
  indexing: {
    aggregateSearch: boolean;
    deduplication: boolean;
    preferredRegistry: ERC8004Ecosystem;
    fallbackRegistry: ERC8004Ecosystem;
  };
  defaults: {
    network: string;
    productionNetwork: string;
    localnetNetwork: string;
    jejuNetwork: string;
    jejuProductionNetwork: string;
    fallbackNetwork: string;
    fallbackProductionNetwork: string;
  };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ============================================================================
// Load Configuration
// ============================================================================

const config = configJson as ERC8004Config;

/**
 * Get environment prefix for a network
 */
function getEnvPrefix(network: ERC8004Network): string {
  const prefixMap: Record<ERC8004Network, string> = {
    "jeju-localnet": "JEJU_LOCALNET",
    "jeju-testnet": "JEJU_TESTNET",
    jeju: "JEJU",
    anvil: "ANVIL",
    "base-sepolia": "BASE_SEPOLIA",
    base: "BASE",
  };
  return prefixMap[network];
}

/**
 * Get network configuration with .env overrides
 */
function getNetworkConfigInternal(network: ERC8004Network): NetworkConfig {
  const base = config.networks[network];
  if (!base) {
    throw new Error(`Unknown network: ${network}`);
  }

  const envPrefix = getEnvPrefix(network);

  return {
    ...base,
    rpcUrl: process.env[`${envPrefix}_RPC_URL`] || base.rpcUrl,
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
    agentId:
      process.env[`ELIZA_CLOUD_AGENT_ID_${envPrefix}`] !== undefined
        ? parseInt(process.env[`ELIZA_CLOUD_AGENT_ID_${envPrefix}`]!, 10)
        : base.agentId,
  };
}

// ============================================================================
// Network Constants
// ============================================================================

/** All supported networks */
export const SUPPORTED_NETWORKS: ERC8004Network[] = [
  "jeju-localnet",
  "jeju-testnet",
  "jeju",
  "anvil",
  "base-sepolia",
  "base",
];

/** Jeju ecosystem networks */
export const JEJU_NETWORKS: ERC8004Network[] = [
  "jeju-localnet",
  "jeju-testnet",
  "jeju",
];

/** Base ecosystem networks */
export const BASE_NETWORKS: ERC8004Network[] = [
  "anvil",
  "base-sepolia",
  "base",
];

/** Chain IDs for all networks */
export const CHAIN_IDS: Record<ERC8004Network, number> = {
  "jeju-localnet": config.networks["jeju-localnet"].chainId,
  "jeju-testnet": config.networks["jeju-testnet"].chainId,
  jeju: config.networks["jeju"].chainId,
  anvil: config.networks.anvil.chainId,
  "base-sepolia": config.networks["base-sepolia"].chainId,
  base: config.networks.base.chainId,
};

/** RPC URLs for all networks */
export const RPC_URLS: Record<ERC8004Network, string> = {
  "jeju-localnet": getNetworkConfigInternal("jeju-localnet").rpcUrl,
  "jeju-testnet": getNetworkConfigInternal("jeju-testnet").rpcUrl,
  jeju: getNetworkConfigInternal("jeju").rpcUrl,
  anvil: getNetworkConfigInternal("anvil").rpcUrl,
  "base-sepolia": getNetworkConfigInternal("base-sepolia").rpcUrl,
  base: getNetworkConfigInternal("base").rpcUrl,
};

/** Block explorers for all networks */
export const BLOCK_EXPLORERS: Record<ERC8004Network, string> = {
  "jeju-localnet": config.networks["jeju-localnet"].blockExplorer,
  "jeju-testnet": config.networks["jeju-testnet"].blockExplorer,
  jeju: config.networks["jeju"].blockExplorer,
  anvil: config.networks.anvil.blockExplorer,
  "base-sepolia": config.networks["base-sepolia"].blockExplorer,
  base: config.networks.base.blockExplorer,
};

/** Identity registry addresses */
export const IDENTITY_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  "jeju-localnet": (getNetworkConfigInternal("jeju-localnet").contracts
    .identity || ZERO_ADDRESS) as Address,
  "jeju-testnet": (getNetworkConfigInternal("jeju-testnet").contracts
    .identity || ZERO_ADDRESS) as Address,
  jeju: (getNetworkConfigInternal("jeju").contracts.identity ||
    ZERO_ADDRESS) as Address,
  anvil: (getNetworkConfigInternal("anvil").contracts.identity ||
    ZERO_ADDRESS) as Address,
  "base-sepolia": (getNetworkConfigInternal("base-sepolia").contracts
    .identity || ZERO_ADDRESS) as Address,
  base: (getNetworkConfigInternal("base").contracts.identity ||
    ZERO_ADDRESS) as Address,
};

/** Reputation registry addresses */
export const REPUTATION_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  "jeju-localnet": (getNetworkConfigInternal("jeju-localnet").contracts
    .reputation || ZERO_ADDRESS) as Address,
  "jeju-testnet": (getNetworkConfigInternal("jeju-testnet").contracts
    .reputation || ZERO_ADDRESS) as Address,
  jeju: (getNetworkConfigInternal("jeju").contracts.reputation ||
    ZERO_ADDRESS) as Address,
  anvil: (getNetworkConfigInternal("anvil").contracts.reputation ||
    ZERO_ADDRESS) as Address,
  "base-sepolia": (getNetworkConfigInternal("base-sepolia").contracts
    .reputation || ZERO_ADDRESS) as Address,
  base: (getNetworkConfigInternal("base").contracts.reputation ||
    ZERO_ADDRESS) as Address,
};

/** Validation registry addresses */
export const VALIDATION_REGISTRY_ADDRESSES: Record<ERC8004Network, Address> = {
  "jeju-localnet": (getNetworkConfigInternal("jeju-localnet").contracts
    .validation || ZERO_ADDRESS) as Address,
  "jeju-testnet": (getNetworkConfigInternal("jeju-testnet").contracts
    .validation || ZERO_ADDRESS) as Address,
  jeju: (getNetworkConfigInternal("jeju").contracts.validation ||
    ZERO_ADDRESS) as Address,
  anvil: (getNetworkConfigInternal("anvil").contracts.validation ||
    ZERO_ADDRESS) as Address,
  "base-sepolia": (getNetworkConfigInternal("base-sepolia").contracts
    .validation || ZERO_ADDRESS) as Address,
  base: (getNetworkConfigInternal("base").contracts.validation ||
    ZERO_ADDRESS) as Address,
};

/** Subgraph URLs */
export const SUBGRAPH_URLS: Record<ERC8004Network, string | null> = {
  "jeju-localnet": config.networks["jeju-localnet"].subgraphUrl,
  "jeju-testnet": config.networks["jeju-testnet"].subgraphUrl,
  jeju: config.networks["jeju"].subgraphUrl,
  anvil: config.networks.anvil.subgraphUrl,
  "base-sepolia": config.networks["base-sepolia"].subgraphUrl,
  base: config.networks.base.subgraphUrl,
};

/** Service wallet address */
export const SERVICE_WALLET_ADDRESS: Address = (process.env
  .X402_RECIPIENT_ADDRESS || ZERO_ADDRESS) as Address;

/** Agent IDs per network */
export const ELIZA_CLOUD_AGENT_ID: Record<ERC8004Network, number | null> = {
  "jeju-localnet": getNetworkConfigInternal("jeju-localnet").agentId,
  "jeju-testnet": getNetworkConfigInternal("jeju-testnet").agentId,
  jeju: getNetworkConfigInternal("jeju").agentId,
  anvil: getNetworkConfigInternal("anvil").agentId,
  "base-sepolia": getNetworkConfigInternal("base-sepolia").agentId,
  base: getNetworkConfigInternal("base").agentId,
};

// ============================================================================
// Multi-Registry Configuration
// ============================================================================

/** Multi-registry configuration */
export const MULTI_REGISTRY = config.multiRegistry;

/** Account abstraction configuration */
export const ACCOUNT_ABSTRACTION = config.accountAbstraction;

/** Indexing configuration */
export const INDEXING = config.indexing;

/** ERC-4337 EntryPoint address */
export const ENTRYPOINT_ADDRESS = config.accountAbstraction
  .entryPoint as Address;

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
// Network Helper Functions
// ============================================================================

/**
 * Check if Jeju ERC-8004 contracts are deployed
 * Set JEJU_DEPLOYED=true once IdentityRegistry and other contracts are live
 */
export function isJejuDeployed(): boolean {
  return process.env.JEJU_DEPLOYED === "true";
}

/**
 * Get default network based on environment
 *
 * Priority:
 * 1. Explicit ERC8004_NETWORK env var
 * 2. Anvil mode (USE_ANVIL=true)
 * 3. Localnet mode (JEJU_NETWORK=localnet)
 * 4. Jeju networks (if JEJU_DEPLOYED=true)
 * 5. Base networks (fallback until Jeju is deployed)
 */
export function getDefaultNetwork(): ERC8004Network {
  const envNetwork = process.env.ERC8004_NETWORK as ERC8004Network | undefined;
  if (envNetwork && CHAIN_IDS[envNetwork]) return envNetwork;

  if (process.env.USE_ANVIL === "true") return "anvil";

  // Check for localnet mode
  if (process.env.JEJU_NETWORK === "localnet") {
    return config.defaults.localnetNetwork as ERC8004Network;
  }

  // Use Jeju if deployed, otherwise fallback to Base
  const jejuDeployed = isJejuDeployed();

  if (process.env.NODE_ENV === "production") {
    return jejuDeployed
      ? (config.defaults.jejuProductionNetwork as ERC8004Network)
      : (config.defaults.productionNetwork as ERC8004Network);
  }

  return jejuDeployed
    ? (config.defaults.jejuNetwork as ERC8004Network)
    : (config.defaults.network as ERC8004Network);
}

/**
 * Get fallback network (Base) for when primary is unavailable
 */
export function getFallbackNetwork(): ERC8004Network {
  if (process.env.NODE_ENV === "production") {
    return config.defaults.fallbackProductionNetwork as ERC8004Network;
  }
  return config.defaults.fallbackNetwork as ERC8004Network;
}

/**
 * Get ecosystem for a network
 */
export function getNetworkEcosystem(network: ERC8004Network): ERC8004Ecosystem {
  if (JEJU_NETWORKS.includes(network)) return "jeju";
  return "base";
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
  const agentId = ELIZA_CLOUD_AGENT_ID[net];
  return agentId !== null && agentId !== 0;
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
    ecosystem: getNetworkEcosystem(net),
  };
}

/**
 * Get full network configuration
 */
export function getFullNetworkConfig(network?: ERC8004Network): NetworkConfig {
  const net = network || getDefaultNetwork();
  return getNetworkConfigInternal(net);
}

// ============================================================================
// Multi-Registry Helper Functions
// ============================================================================

/**
 * Check if multi-registry is enabled
 */
export function isMultiRegistryEnabled(): boolean {
  return MULTI_REGISTRY.enabled;
}

/**
 * Get networks for an ecosystem
 */
export function getEcosystemNetworks(
  ecosystem: ERC8004Ecosystem,
): ERC8004Network[] {
  if (ecosystem === "jeju") return JEJU_NETWORKS;
  return BASE_NETWORKS;
}

/**
 * Get active network for each ecosystem based on environment
 */
export function getActiveNetworkPerEcosystem(): Record<
  ERC8004Ecosystem,
  ERC8004Network
> {
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalnet = process.env.JEJU_NETWORK === "localnet";

  return {
    jeju: isLocalnet ? "jeju-localnet" : isProduction ? "jeju" : "jeju-testnet",
    base: isProduction ? "base" : "base-sepolia",
  };
}

/**
 * Get all networks to register on (for multi-registry)
 */
export function getRegistrationNetworks(): ERC8004Network[] {
  if (!isMultiRegistryEnabled()) {
    return [getDefaultNetwork()];
  }

  const active = getActiveNetworkPerEcosystem();
  return [active.jeju, active.base];
}

/**
 * Get all networks to search (for aggregate search)
 */
export function getSearchNetworks(): ERC8004Network[] {
  if (!INDEXING.aggregateSearch) {
    return [getDefaultNetwork()];
  }

  const active = getActiveNetworkPerEcosystem();
  return [active.jeju, active.base].filter(
    (net) => IDENTITY_REGISTRY_ADDRESSES[net] !== ZERO_ADDRESS,
  );
}

/**
 * Check if batch registration via account abstraction is available
 */
export function isBatchRegistrationAvailable(): boolean {
  return (
    MULTI_REGISTRY.registrationStrategy.batchRegistration &&
    ACCOUNT_ABSTRACTION.enabled &&
    ACCOUNT_ABSTRACTION.batchOperations.multiChainRegistration
  );
}

/**
 * Check if gas is sponsored for registration
 */
export function isGasSponsored(): boolean {
  return (
    MULTI_REGISTRY.registrationStrategy.gasSponsored &&
    MULTI_REGISTRY.registrationStrategy.usePaymaster &&
    ACCOUNT_ABSTRACTION.paymasterEnabled
  );
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
 * Includes registrations from BOTH Jeju and Base ecosystems
 */
export function generateRegistrationFile(
  baseUrl: string,
): ERC8004RegistrationFile {
  const network = getDefaultNetwork();

  // Build registrations from all networks
  const allRegistrations = [
    // Jeju networks
    {
      agentId: ELIZA_CLOUD_AGENT_ID["jeju-localnet"],
      network: `eip155:${CHAIN_IDS["jeju-localnet"]}`,
    },
    {
      agentId: ELIZA_CLOUD_AGENT_ID["jeju-testnet"],
      network: `eip155:${CHAIN_IDS["jeju-testnet"]}`,
    },
    {
      agentId: ELIZA_CLOUD_AGENT_ID["jeju"],
      network: `eip155:${CHAIN_IDS["jeju"]}`,
    },
    // Base networks
    {
      agentId: ELIZA_CLOUD_AGENT_ID["anvil"],
      network: `eip155:${CHAIN_IDS["anvil"]}`,
    },
    {
      agentId: ELIZA_CLOUD_AGENT_ID["base-sepolia"],
      network: `eip155:${CHAIN_IDS["base-sepolia"]}`,
    },
    {
      agentId: ELIZA_CLOUD_AGENT_ID["base"],
      network: `eip155:${CHAIN_IDS["base"]}`,
    },
  ].filter((r) => r.agentId !== null && r.agentId !== 0);

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
    registrations: allRegistrations,
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

/** Multi-chain registration result */
export interface MultiChainRegistrationResult {
  success: boolean;
  registrations: Array<{
    network: ERC8004Network;
    ecosystem: ERC8004Ecosystem;
    agentId: string;
    agentURI: string;
    txHash?: string;
    error?: string;
  }>;
  batchTxHash?: string;
}

// ============================================================================
// Re-exports from x402.ts for Account Abstraction
// ============================================================================

export { isAccountAbstractionEnabled, isPaymasterEnabled } from "./x402";
