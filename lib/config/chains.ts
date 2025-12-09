/**
 * Jeju Chain Definitions for viem
 *
 * Custom chain configurations for Jeju localnet, testnet, and mainnet.
 * Compatible with viem/wagmi for use in wallet connections and contract interactions.
 *
 * @see https://viem.sh/docs/chains/introduction.html
 */

import { defineChain, type Chain } from "viem";

// ============================================================================
// Jeju Chain Definitions
// ============================================================================

/**
 * Jeju Localnet - Local development environment
 * L2 on local Anvil L1
 */
export const jejuLocalnet = defineChain({
  id: 1337,
  name: "Jeju Localnet",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["http://127.0.0.1:9545"],
      webSocket: ["ws://127.0.0.1:9546"],
    },
  },
  blockExplorers: {
    default: {
      name: "Local Explorer",
      url: "http://127.0.0.1:4000",
    },
  },
  contracts: {
    // OP-Stack predeploys
    l2CrossDomainMessenger: {
      address: "0x4200000000000000000000000000000000000007",
    },
    l2StandardBridge: {
      address: "0x4200000000000000000000000000000000000010",
    },
    l2ToL1MessagePasser: {
      address: "0x4200000000000000000000000000000000000016",
    },
    gasPriceOracle: {
      address: "0x420000000000000000000000000000000000000F",
    },
  },
  testnet: true,
});

/**
 * Jeju Testnet - Public testnet on Sepolia L1
 */
export const jejuTestnet = defineChain({
  id: 420690,
  name: "Jeju Testnet",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnet-rpc.jeju.network"],
      webSocket: ["wss://testnet-ws.jeju.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Jeju Testnet Explorer",
      url: "https://testnet-explorer.jeju.network",
    },
  },
  contracts: {
    // OP-Stack predeploys
    l2CrossDomainMessenger: {
      address: "0x4200000000000000000000000000000000000007",
    },
    l2StandardBridge: {
      address: "0x4200000000000000000000000000000000000010",
    },
    l2ToL1MessagePasser: {
      address: "0x4200000000000000000000000000000000000016",
    },
    gasPriceOracle: {
      address: "0x420000000000000000000000000000000000000F",
    },
  },
  testnet: true,
  sourceId: 11155111, // Sepolia L1
});

/**
 * Jeju Mainnet - Production network on Ethereum L1
 */
export const jeju = defineChain({
  id: 420691,
  name: "Jeju",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.jeju.network"],
      webSocket: ["wss://ws.jeju.network"],
    },
  },
  blockExplorers: {
    default: {
      name: "Jeju Explorer",
      url: "https://explorer.jeju.network",
    },
  },
  contracts: {
    // OP-Stack predeploys
    l2CrossDomainMessenger: {
      address: "0x4200000000000000000000000000000000000007",
    },
    l2StandardBridge: {
      address: "0x4200000000000000000000000000000000000010",
    },
    l2ToL1MessagePasser: {
      address: "0x4200000000000000000000000000000000000016",
    },
    gasPriceOracle: {
      address: "0x420000000000000000000000000000000000000F",
    },
  },
  testnet: false,
  sourceId: 1, // Ethereum L1
});

// ============================================================================
// Chain Lookups
// ============================================================================

/** All Jeju chains */
export const JEJU_CHAINS = {
  localnet: jejuLocalnet,
  testnet: jejuTestnet,
  mainnet: jeju,
} as const;

/** Chain ID to Chain mapping */
export const CHAIN_BY_ID: Record<number, Chain> = {
  [jejuLocalnet.id]: jejuLocalnet,
  [jejuTestnet.id]: jejuTestnet,
  [jeju.id]: jeju,
};

/**
 * Get Jeju chain by environment
 */
export function getJejuChain(): Chain {
  const network = process.env.JEJU_NETWORK || "testnet";
  
  if (network === "localnet") return jejuLocalnet;
  if (network === "mainnet" || process.env.NODE_ENV === "production") return jeju;
  return jejuTestnet;
}

/**
 * Get chain by chain ID (includes Jeju chains)
 */
export function getChainById(chainId: number): Chain | undefined {
  return CHAIN_BY_ID[chainId];
}

/**
 * Check if a chain ID is a Jeju chain
 */
export function isJejuChain(chainId: number): boolean {
  return chainId === jejuLocalnet.id || 
         chainId === jejuTestnet.id || 
         chainId === jeju.id;
}

// ============================================================================
// L1 Chain References
// ============================================================================

/** L1 chain IDs for each Jeju network */
export const JEJU_L1_CHAIN_IDS = {
  [jejuLocalnet.id]: 1337, // Local Anvil
  [jejuTestnet.id]: 11155111, // Sepolia
  [jeju.id]: 1, // Ethereum
} as const;

/**
 * Get L1 chain ID for a Jeju chain
 */
export function getL1ChainId(jejuChainId: number): number | undefined {
  return JEJU_L1_CHAIN_IDS[jejuChainId as keyof typeof JEJU_L1_CHAIN_IDS];
}

