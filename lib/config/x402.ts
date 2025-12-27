/**
 * x402 Payment Protocol Configuration
 *
 * Multi-chain x402 payment support for Jeju and Base networks.
 * Uses OIF/EIL for cross-chain payment routing - accept tokens from any supported chain.
 *
 * Supports:
 * - Jeju networks (localnet, testnet, mainnet) with decentralized facilitator
 * - Base networks (Sepolia, mainnet) with Coinbase CDP facilitator
 * - Cross-chain payments via OIF intents
 * - Account abstraction (ERC-4337) for gasless UX
 *
 * Config priority:
 * 1. Environment variables (highest - for secrets)
 * 2. config/x402.json (committed defaults)
 *
 * @see https://x402.org
 */

import type { Address } from "viem";
import configJson from "@/config/x402.json";

// ============================================================================
// Types
// ============================================================================

/** All supported x402 networks including Jeju and Base */
export type X402Network =
  | "jeju-localnet"
  | "jeju-testnet"
  | "jeju"
  | "base-sepolia"
  | "base";

/** Network ecosystem for determining facilitator and routing */
export type X402Ecosystem = "jeju" | "base";

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  isTestnet: boolean;
  isLocalnet?: boolean;
  usdc: string;
  l1ChainId?: number;
  l1RpcUrl?: string;
}

interface FacilitatorConfig {
  name: string;
  type: "cdp" | "decentralized" | "public";
  networks: string[];
  requiresCredentials: boolean;
  contractAddress?: string;
  envKeys?: string[];
  rateLimited?: boolean;
}

interface CrossChainConfig {
  enabled: boolean;
  supportedSourceChains: {
    mainnet: number[];
    testnet: number[];
  };
  oifIntegration: {
    enabled: boolean;
    aggregatorUrl: string;
    aggregatorUrlProduction: string;
  };
  eilIntegration: {
    enabled: boolean;
    crossChainPaymaster: boolean;
    supportedPaymentTokens: string[];
  };
  settlementChains: {
    primary: string;
    fallback: string;
    testnetPrimary: string;
    testnetFallback: string;
  };
}

interface X402Config {
  pricing: {
    creditsPerDollar: number;
    topupPrice: string;
  };
  networks: Record<string, NetworkConfig>;
  facilitators: Record<string, FacilitatorConfig>;
  elizaToken: {
    evm: Record<string, string>;
    solana: string;
  };
  crossChainPayments: CrossChainConfig;
  accountAbstraction: {
    erc4337: {
      enabled: boolean;
      entryPoint: string;
      paymasterEnabled: boolean;
    };
    erc7702: {
      enabled: boolean;
    };
    batchTransactions: {
      enabled: boolean;
      maxBatchSize: number;
    };
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

const config = configJson as X402Config;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ============================================================================
// Network Constants
// ============================================================================

/** All supported x402 networks */
export const SUPPORTED_NETWORKS: X402Network[] = [
  "jeju-localnet",
  "jeju-testnet",
  "jeju",
  "base-sepolia",
  "base",
];

/** Jeju networks */
export const JEJU_NETWORKS: X402Network[] = [
  "jeju-localnet",
  "jeju-testnet",
  "jeju",
];

/** Base/Coinbase networks */
export const BASE_NETWORKS: X402Network[] = ["base-sepolia", "base"];

/** Chain IDs for all networks */
export const CHAIN_IDS: Record<X402Network, number> = {
  "jeju-localnet": config.networks["jeju-localnet"].chainId,
  "jeju-testnet": config.networks["jeju-testnet"].chainId,
  jeju: config.networks["jeju"].chainId,
  "base-sepolia": config.networks["base-sepolia"].chainId,
  base: config.networks["base"].chainId,
};

/** USDC addresses per network */
export const USDC_ADDRESSES: Record<X402Network, Address> = {
  "jeju-localnet": config.networks["jeju-localnet"].usdc as Address,
  "jeju-testnet": config.networks["jeju-testnet"].usdc as Address,
  jeju: config.networks["jeju"].usdc as Address,
  "base-sepolia": config.networks["base-sepolia"].usdc as Address,
  base: config.networks["base"].usdc as Address,
};

// ============================================================================
// Environment Configuration
// ============================================================================

/** x402 enabled by default - disable with ENABLE_X402_PAYMENTS=false */
export const X402_ENABLED = process.env.ENABLE_X402_PAYMENTS !== "false";

/** Recipient address for x402 payments */
export const X402_RECIPIENT_ADDRESS: Address = (process.env
  .X402_RECIPIENT_ADDRESS || ZERO_ADDRESS) as Address;

/** Credit pricing from config */
export const TOPUP_PRICE = config.pricing.topupPrice;
export const CREDITS_PER_DOLLAR = config.pricing.creditsPerDollar;

/** elizaOS token addresses for payouts */
export const ELIZA_TOKEN_ADDRESSES = {
  evm: config.elizaToken.evm,
  solana: config.elizaToken.solana,
};

/** Cross-chain payment configuration */
export const CROSS_CHAIN_PAYMENTS = config.crossChainPayments;

/** Account abstraction configuration */
export const ACCOUNT_ABSTRACTION = config.accountAbstraction;

/** ERC-4337 EntryPoint address */
export const ENTRYPOINT_ADDRESS = config.accountAbstraction.erc4337
  .entryPoint as Address;

// ============================================================================
// Network Helper Functions
// ============================================================================

/**
 * Check if Jeju network contracts are deployed
 * Set JEJU_DEPLOYED=true once USDC and other contracts are live on Jeju
 */
export function isJejuDeployed(): boolean {
  return process.env.JEJU_DEPLOYED === "true";
}

/**
 * Get default network based on environment
 *
 * Priority:
 * 1. Explicit X402_NETWORK env var
 * 2. Localnet mode (JEJU_NETWORK=localnet)
 * 3. Jeju networks (if JEJU_DEPLOYED=true)
 * 4. Base networks (fallback until Jeju is deployed)
 */
export function getDefaultNetwork(): X402Network {
  const envNetwork = process.env.X402_NETWORK as X402Network | undefined;
  if (envNetwork && CHAIN_IDS[envNetwork]) return envNetwork;

  // Check for localnet mode
  if (process.env.JEJU_NETWORK === "localnet") {
    return config.defaults.localnetNetwork as X402Network;
  }

  // Use Jeju if deployed, otherwise fallback to Base
  const jejuDeployed = isJejuDeployed();

  if (process.env.NODE_ENV === "production") {
    return jejuDeployed
      ? (config.defaults.jejuProductionNetwork as X402Network)
      : (config.defaults.productionNetwork as X402Network);
  }

  return jejuDeployed
    ? (config.defaults.jejuNetwork as X402Network)
    : (config.defaults.network as X402Network);
}

/**
 * Get fallback network (Base) for when Jeju is unavailable
 */
export function getFallbackNetwork(): X402Network {
  if (process.env.NODE_ENV === "production") {
    return config.defaults.fallbackProductionNetwork as X402Network;
  }
  return config.defaults.fallbackNetwork as X402Network;
}

export const X402_DEFAULT_NETWORK: X402Network = getDefaultNetwork();

/**
 * Get ecosystem for a network (jeju or base)
 */
export function getNetworkEcosystem(network: X402Network): X402Ecosystem {
  if (JEJU_NETWORKS.includes(network)) return "jeju";
  return "base";
}

/**
 * Check if x402 is properly configured
 */
export function isX402Configured(): boolean {
  return X402_ENABLED && X402_RECIPIENT_ADDRESS !== ZERO_ADDRESS;
}

/**
 * Check if a network has USDC configured
 */
export function isNetworkConfigured(network: X402Network): boolean {
  const usdc = USDC_ADDRESSES[network];
  return usdc !== ZERO_ADDRESS;
}

/**
 * Get network configuration
 */
export function getNetworkConfig(network: X402Network): NetworkConfig {
  return config.networks[network];
}

/**
 * Get full network config including USDC address
 */
export function getX402NetworkConfig(network: X402Network) {
  const netConfig = config.networks[network];
  return {
    chainId: netConfig.chainId,
    usdcAddress: netConfig.usdc as Address,
    rpcUrl: netConfig.rpcUrl,
    blockExplorer: netConfig.blockExplorer,
    isTestnet: netConfig.isTestnet,
    isLocalnet: netConfig.isLocalnet ?? false,
    l1ChainId: netConfig.l1ChainId,
    ecosystem: getNetworkEcosystem(network),
  };
}

// ============================================================================
// Facilitator Functions
// ============================================================================

/**
 * Get facilitator type for a network
 */
export function getFacilitatorType(
  network: X402Network,
): "cdp" | "decentralized" | "public" {
  const ecosystem = getNetworkEcosystem(network);

  if (ecosystem === "jeju") {
    return "decentralized";
  }

  // Base networks - check if CDP credentials are configured
  const hasCdpCredentials = Boolean(
    process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET,
  );

  return hasCdpCredentials ? "cdp" : "public";
}

/**
 * Get facilitator configuration for a network
 */
export function getFacilitatorConfig(network: X402Network): FacilitatorConfig {
  const type = getFacilitatorType(network);

  if (type === "decentralized") {
    return config.facilitators.jeju;
  }
  if (type === "cdp") {
    return config.facilitators.coinbase;
  }
  return config.facilitators.public;
}

// ============================================================================
// Cross-Chain Payment Functions
// ============================================================================

/**
 * Check if cross-chain payments are enabled
 */
export function isCrossChainEnabled(): boolean {
  return (
    CROSS_CHAIN_PAYMENTS.enabled && CROSS_CHAIN_PAYMENTS.oifIntegration.enabled
  );
}

/**
 * Get OIF aggregator URL
 */
export function getOIFAggregatorUrl(): string {
  if (process.env.NODE_ENV === "production") {
    return CROSS_CHAIN_PAYMENTS.oifIntegration.aggregatorUrlProduction;
  }
  return (
    process.env.OIF_AGGREGATOR_URL ||
    CROSS_CHAIN_PAYMENTS.oifIntegration.aggregatorUrl
  );
}

/**
 * Get supported source chains for cross-chain payments
 */
export function getSupportedSourceChains(): number[] {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.JEJU_NETWORK === "mainnet"
  ) {
    return CROSS_CHAIN_PAYMENTS.supportedSourceChains.mainnet;
  }
  return CROSS_CHAIN_PAYMENTS.supportedSourceChains.testnet;
}

/**
 * Get settlement chain for cross-chain payments
 */
export function getSettlementChain(): X402Network {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.JEJU_NETWORK === "mainnet"
  ) {
    return CROSS_CHAIN_PAYMENTS.settlementChains.primary as X402Network;
  }
  return CROSS_CHAIN_PAYMENTS.settlementChains.testnetPrimary as X402Network;
}

/**
 * Get settlement fallback chain (Base)
 */
export function getSettlementFallbackChain(): X402Network {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.JEJU_NETWORK === "mainnet"
  ) {
    return CROSS_CHAIN_PAYMENTS.settlementChains.fallback as X402Network;
  }
  return CROSS_CHAIN_PAYMENTS.settlementChains.testnetFallback as X402Network;
}

/**
 * Check if a chain ID is a supported source for cross-chain payments
 */
export function isSourceChainSupported(chainId: number): boolean {
  return getSupportedSourceChains().includes(chainId);
}

// ============================================================================
// Account Abstraction Functions
// ============================================================================

/**
 * Check if ERC-4337 account abstraction is enabled
 */
export function isAccountAbstractionEnabled(): boolean {
  return ACCOUNT_ABSTRACTION.erc4337.enabled;
}

/**
 * Check if paymaster is enabled for gasless transactions
 */
export function isPaymasterEnabled(): boolean {
  return (
    ACCOUNT_ABSTRACTION.erc4337.enabled &&
    ACCOUNT_ABSTRACTION.erc4337.paymasterEnabled
  );
}

/**
 * Check if batch transactions are enabled
 */
export function isBatchTransactionsEnabled(): boolean {
  return ACCOUNT_ABSTRACTION.batchTransactions.enabled;
}

/**
 * Get max batch size for operations
 */
export function getMaxBatchSize(): number {
  return ACCOUNT_ABSTRACTION.batchTransactions.maxBatchSize;
}
