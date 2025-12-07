/**
 * x402 Payment Protocol Configuration
 *
 * Reads configuration from config/x402.json with .env overrides for secrets.
 * Uses official @coinbase/x402 and x402-next packages for HTTP 402 payments.
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

export type X402Network = "base-sepolia" | "base";

interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  blockExplorer: string;
  isTestnet: boolean;
  usdc: string;
}

interface X402Config {
  pricing: {
    creditsPerDollar: number;
    topupPrice: string;
  };
  networks: Record<string, NetworkConfig>;
  elizaToken: {
    evm: Record<string, string>;
    solana: string;
  };
  defaults: {
    network: string;
    productionNetwork: string;
  };
}

const config = configJson as X402Config;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

// ============================================================================
// Exported Constants
// ============================================================================

export const SUPPORTED_NETWORKS: X402Network[] = ["base-sepolia", "base"];

export const CHAIN_IDS: Record<X402Network, number> = {
  "base-sepolia": config.networks["base-sepolia"].chainId,
  base: config.networks.base.chainId,
};

// USDC addresses per network (official Circle USDC)
export const USDC_ADDRESSES: Record<X402Network, Address> = {
  "base-sepolia": config.networks["base-sepolia"].usdc as Address,
  base: config.networks.base.usdc as Address,
};

// Environment configuration
export const X402_ENABLED = process.env.ENABLE_X402_PAYMENTS === "true";
export const X402_RECIPIENT_ADDRESS: Address = (process.env.X402_RECIPIENT_ADDRESS || ZERO_ADDRESS) as Address;

// Credit pricing from config
export const TOPUP_PRICE = config.pricing.topupPrice;
export const CREDITS_PER_DOLLAR = config.pricing.creditsPerDollar;

// elizaOS token addresses
export const ELIZA_TOKEN_ADDRESSES = {
  evm: config.elizaToken.evm,
  solana: config.elizaToken.solana,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get default network based on environment
 */
export function getDefaultNetwork(): X402Network {
  const envNetwork = process.env.X402_NETWORK as X402Network | undefined;
  if (envNetwork && CHAIN_IDS[envNetwork]) return envNetwork;
  if (process.env.NODE_ENV === "production") return config.defaults.productionNetwork as X402Network;
  return config.defaults.network as X402Network;
}

export const X402_DEFAULT_NETWORK: X402Network = getDefaultNetwork();

/**
 * Check if x402 is properly configured
 */
export function isX402Configured(): boolean {
  return X402_ENABLED && X402_RECIPIENT_ADDRESS !== ZERO_ADDRESS;
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
  };
}
