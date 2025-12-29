/**
 * JNS (Jeju Name Service) Integration for Cloud
 *
 * Provides:
 * - Name resolution for cloud services
 * - Agent-to-name mapping
 * - App endpoint discovery via JNS
 */

import { createPublicClient, http, type Address, namehash } from "viem";
import { base, baseSepolia } from "viem/chains";
import { getContract, getRpcUrl, getCurrentNetwork } from "@jejunetwork/config";

// ============ Types ============

export interface JNSConfig {
  registry: Address;
  resolver: Address;
  registrar: Address;
  reverseRegistrar: Address;
  chainId: number;
}

export interface JNSResolvedApp {
  name: string;
  address: Address | null;
  endpoint: string | null;
  a2aEndpoint: string | null;
  mcpEndpoint: string | null;
  agentId: bigint;
  contenthash: string | null;
}

// ============ Constants ============

function getJNSConfig(chainId: number): JNSConfig {
  // Get contract addresses from centralized config (public, on-chain addresses)
  const registry = (getContract("jns", "registry") || "0x0000000000000000000000000000000000000000") as Address;
  const resolver = (getContract("jns", "resolver") || "0x0000000000000000000000000000000000000000") as Address;
  const registrar = (getContract("jns", "registrar") || "0x0000000000000000000000000000000000000000") as Address;
  const reverseRegistrar = (getContract("jns", "reverseRegistrar") || "0x0000000000000000000000000000000000000000") as Address;

  return {
    registry,
    resolver,
    registrar,
    reverseRegistrar,
    chainId,
  };
}

// Canonical Jeju app names
export const JEJU_APPS = {
  gateway: "gateway.jeju",
  bazaar: "bazaar.jeju",
  compute: "compute.jeju",
  storage: "storage.jeju",
  indexer: "indexer.jeju",
  cloud: "cloud.jeju",
  intents: "intents.jeju",
  docs: "docs.jeju",
  monitoring: "monitoring.jeju",
} as const;

export type JejuAppName = keyof typeof JEJU_APPS;

// ============ ABIs ============

const RESOLVER_ABI = [
  {
    name: "addr",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
  },
  {
    name: "text",
    type: "function",
    inputs: [
      { name: "node", type: "bytes32" },
      { name: "key", type: "string" },
    ],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
  {
    name: "contenthash",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [{ name: "", type: "bytes" }],
    stateMutability: "view",
  },
  {
    name: "getAppInfo",
    type: "function",
    inputs: [{ name: "node", type: "bytes32" }],
    outputs: [
      { name: "appContract", type: "address" },
      { name: "appId", type: "bytes32" },
      { name: "agentId", type: "uint256" },
      { name: "endpoint", type: "string" },
      { name: "a2aEndpoint", type: "string" },
      { name: "contenthash_", type: "bytes" },
    ],
    stateMutability: "view",
  },
] as const;

const REVERSE_REGISTRAR_ABI = [
  {
    name: "nameOf",
    type: "function",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
  },
] as const;

// ============ Client ============

export class JNSCloudClient {
  private chainId: number;
  private config: JNSConfig;
  private publicClient: ReturnType<typeof createPublicClient>;

  constructor(chainId: number = 1337, rpcUrl?: string) {
    this.chainId = chainId;
    this.config = getJNSConfig(chainId);

    // Use centralized RPC URL from config
    const effectiveRpcUrl = rpcUrl || getRpcUrl();

    const chain =
      chainId === 8453
        ? base
        : chainId === 84532
          ? baseSepolia
          : {
              id: 1337,
              name: "Jeju L2",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: {
                default: { http: [effectiveRpcUrl] },
              },
            };

    this.publicClient = createPublicClient({
      chain,
      transport: http(effectiveRpcUrl),
    });
  }

  /**
   * Resolve a JNS name to its app info
   */
  async resolveApp(name: string): Promise<JNSResolvedApp | null> {
    const fullName = name.endsWith(".jeju") ? name : `${name}.jeju`;
    const node = namehash(fullName) as `0x${string}`;

    if (this.config.resolver === "0x0000000000000000000000000000000000000000") {
      return null;
    }

    const [appInfo, contenthash, mcpEndpoint] = await Promise.all([
      this.publicClient
        .readContract({
          address: this.config.resolver,
          abi: RESOLVER_ABI,
          functionName: "getAppInfo",
          args: [node],
        })
        .catch(() => null),
      this.publicClient
        .readContract({
          address: this.config.resolver,
          abi: RESOLVER_ABI,
          functionName: "contenthash",
          args: [node],
        })
        .catch(() => null),
      this.publicClient
        .readContract({
          address: this.config.resolver,
          abi: RESOLVER_ABI,
          functionName: "text",
          args: [node, "app.mcp"],
        })
        .catch(() => ""),
    ]);

    if (!appInfo) return null;

    return {
      name: fullName,
      address:
        appInfo[0] !== "0x0000000000000000000000000000000000000000"
          ? appInfo[0]
          : null,
      endpoint: appInfo[3] || null,
      a2aEndpoint: appInfo[4] || null,
      mcpEndpoint: mcpEndpoint || null,
      agentId: appInfo[2],
      contenthash: contenthash ? (contenthash as string) : null,
    };
  }

  /**
   * Reverse lookup: address → name
   */
  async reverseLookup(address: Address): Promise<string | null> {
    if (
      this.config.reverseRegistrar ===
      "0x0000000000000000000000000000000000000000"
    ) {
      return null;
    }

    const name = await this.publicClient
      .readContract({
        address: this.config.reverseRegistrar,
        abi: REVERSE_REGISTRAR_ABI,
        functionName: "nameOf",
        args: [address],
      })
      .catch(() => "");

    return name || null;
  }

  /**
   * Get the A2A endpoint for a Jeju app
   */
  async getAppA2AEndpoint(app: JejuAppName): Promise<string | null> {
    const name = JEJU_APPS[app];
    const appInfo = await this.resolveApp(name);
    return appInfo?.a2aEndpoint || null;
  }

  /**
   * Get the MCP endpoint for a Jeju app
   */
  async getAppMCPEndpoint(app: JejuAppName): Promise<string | null> {
    const name = JEJU_APPS[app];
    const appInfo = await this.resolveApp(name);
    return appInfo?.mcpEndpoint || null;
  }

  /**
   * Resolve an agent ID to its JNS name (if linked)
   */
  async getAgentName(agentId: bigint): Promise<string | null> {
    // This would require querying the indexer or events
    // For now, return null - implement with indexer integration
    return null;
  }
}

// ============ Singleton Instance ============

let jnsClient: JNSCloudClient | null = null;

/**
 * Get the JNS client instance
 */
export function getJNSClient(
  chainId?: number,
  rpcUrl?: string,
): JNSCloudClient {
  const effectiveChainId = chainId || 1337; // Jeju L2 chain ID
  
  if (!jnsClient || jnsClient["chainId"] !== effectiveChainId) {
    jnsClient = new JNSCloudClient(
      effectiveChainId,
      rpcUrl || getRpcUrl(),
    );
  }
  return jnsClient;
}

/**
 * Check if JNS is properly configured
 */
export function isJNSConfigured(): boolean {
  const config = getJNSConfig(1337);
  return (
    config.registry !== "0x0000000000000000000000000000000000000000" &&
    config.resolver !== "0x0000000000000000000000000000000000000000"
  );
}

/**
 * Get current JNS configuration for debugging
 */
export function getJNSDebugInfo(): {
  chainId: number;
  network: string;
  registry: string;
  resolver: string;
  registrar: string;
  reverseRegistrar: string;
  rpcUrl: string;
  configured: boolean;
} {
  const network = getCurrentNetwork();
  const config = getJNSConfig(1337); // Chain ID doesn't matter, we use network from config
  return {
    chainId: 1337, // Jeju L2 chain ID
    network,
    registry: config.registry,
    resolver: config.resolver,
    registrar: config.registrar,
    reverseRegistrar: config.reverseRegistrar,
    rpcUrl: getRpcUrl(),
    configured: isJNSConfigured(),
  };
}

// ============ Utility Functions ============

/**
 * Format a display name from a JNS name or address
 */
export async function formatDisplayName(
  addressOrName: string,
  options?: { chainId?: number; rpcUrl?: string },
): Promise<string> {
  const client = getJNSClient(options?.chainId, options?.rpcUrl);

  // If it's already a JNS name, return it
  if (addressOrName.endsWith(".jeju")) {
    return addressOrName;
  }

  // Try reverse lookup
  if (addressOrName.startsWith("0x") && addressOrName.length === 42) {
    const name = await client.reverseLookup(addressOrName as Address);
    if (name) return name;

    // Fallback to shortened address
    return `${addressOrName.slice(0, 6)}...${addressOrName.slice(-4)}`;
  }

  return addressOrName;
}

/**
 * Check if a name is a canonical Jeju app
 */
export function isJejuApp(name: string): boolean {
  return Object.values(JEJU_APPS).includes(
    name as (typeof JEJU_APPS)[JejuAppName],
  );
}

/**
 * Get the app key from a JNS name
 */
export function getAppKeyFromName(name: string): JejuAppName | null {
  const entries = Object.entries(JEJU_APPS);
  for (const [key, value] of entries) {
    if (value === name) {
      return key as JejuAppName;
    }
  }
  return null;
}




