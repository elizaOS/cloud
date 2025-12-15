/**
 * Agent0 Service
 *
 * Provides integration with Agent0's ERC-8004 on-chain registry for agent
 * discovery, search, and (future) reputation/feedback.
 *
 * Features:
 * - Multi-registry search across Jeju AND Base ecosystems
 * - Cached searches via Redis (stale-while-revalidate)
 * - Individual agent lookup with caching
 * - Filter by MCP tools, A2A skills, x402 support
 * - Deduplication across registries
 *
 * @see https://sdk.ag0.xyz
 * @see https://eips.ethereum.org/EIPS/eip-8004
 */

import {
  CHAIN_IDS,
  RPC_URLS,
  ELIZA_CLOUD_AGENT_ID,
  SUBGRAPH_URLS,
  getDefaultNetwork,
  getSearchNetworks,
  isMultiRegistryEnabled,
  getNetworkEcosystem,
  INDEXING,
  type ERC8004Network,
  type ERC8004Ecosystem,
} from "@/lib/config/erc8004";
import { logger } from "@/lib/utils/logger";
import { extractErrorMessage } from "@/lib/utils/error-handling";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL, CacheStaleTTL } from "@/lib/cache/keys";
import { createHash } from "crypto";

// Lazy import agent0-sdk to avoid JSON import issues during initial load
let SDK: typeof import("agent0-sdk").SDK | null = null;
let sdkLoadFailed = false;

async function getSDKModule() {
  if (sdkLoadFailed) {
    return null;
  }
  if (!SDK) {
    try {
      const sdkModule = await import("agent0-sdk");
      SDK = sdkModule.SDK;
    } catch (error) {
      logger.warn(
        "[Agent0] Failed to load agent0-sdk, falling back to indexer",
        {
          error: extractErrorMessage(error),
        },
      );
      sdkLoadFailed = true;
      return null;
    }
  }
  return SDK;
}

// Indexer fallback - queries the local indexer directly
const INDEXER_URL = process.env.INDEXER_URL || "http://localhost:4000/graphql";

async function fetchFromIndexer(
  filters: Agent0SearchFilters,
): Promise<Agent0Agent[]> {
  const whereConditions: string[] = [];
  if (filters.active !== false) whereConditions.push(`active_eq: true`);
  if (filters.x402Support) whereConditions.push(`x402Support_eq: true`);
  if (filters.name)
    whereConditions.push(`name_containsInsensitive: "${filters.name}"`);

  const whereClause =
    whereConditions.length > 0
      ? `where: { ${whereConditions.join(", ")} }`
      : "";

  const query = `
    query {
      registeredAgents(limit: ${filters.limit || 50}, orderBy: agentId_DESC${whereClause ? ", " + whereClause : ""}) {
        agentId
        name
        description
        a2aEndpoint
        mcpEndpoint
        serviceType
        category
        x402Support
        mcpTools
        a2aSkills
        image
        tags
        active
      }
    }
  `;

  const response = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });

  const result = await response.json();

  if (result.errors) {
    logger.warn("[Agent0/Indexer] GraphQL errors", { errors: result.errors });
    return [];
  }

  return (result.data?.registeredAgents || []).map(
    (agent: {
      agentId: string;
      name: string;
      description?: string;
      a2aEndpoint?: string;
      mcpEndpoint?: string;
      serviceType?: string;
      category?: string;
      x402Support?: boolean;
      mcpTools?: string[];
      a2aSkills?: string[];
      image?: string;
      tags?: string[];
      active?: boolean;
    }): Agent0Agent => ({
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
      image: agent.image,
      mcpEndpoint: agent.mcpEndpoint,
      a2aEndpoint: agent.a2aEndpoint,
      mcpTools: agent.mcpTools || [],
      a2aSkills: agent.a2aSkills || [],
      tags: agent.tags || [],
      active: agent.active ?? true,
      x402Support: agent.x402Support ?? false,
      network: getDefaultNetwork(),
      ecosystem: getNetworkEcosystem(getDefaultNetwork()),
    }),
  );
}

// Type imports from agent0-sdk
type AgentSummary = import("agent0-sdk").AgentSummary;
type SearchParams = import("agent0-sdk").SearchParams;

// ============================================================================
// Types
// ============================================================================

export interface Agent0SearchFilters {
  name?: string;
  mcpTools?: string[];
  a2aSkills?: string[];
  active?: boolean;
  x402Support?: boolean;
  limit?: number;
  /** Optional: limit search to specific ecosystem */
  ecosystem?: ERC8004Ecosystem;
}

export interface Agent0Agent {
  agentId: string;
  name: string;
  description?: string;
  image?: string;
  walletAddress?: string;
  mcpEndpoint?: string;
  a2aEndpoint?: string;
  mcpTools?: string[];
  a2aSkills?: string[];
  tags?: string[];
  active: boolean;
  x402Support: boolean;
  /** Source registry ecosystem */
  ecosystem?: ERC8004Ecosystem;
  /** Source network */
  network?: ERC8004Network;
}

// ============================================================================
// Agent0 Service
// ============================================================================

// SDK instance type - use InstanceType for proper typing
type SDKInstance = InstanceType<Awaited<ReturnType<typeof getSDKModule>>>;

class Agent0Service {
  private sdkCache: Map<ERC8004Network, SDKInstance> = new Map();
  private initPromises: Map<ERC8004Network, Promise<void>> = new Map();
  private defaultNetwork: ERC8004Network;

  constructor() {
    this.defaultNetwork = getDefaultNetwork();
  }

  /**
   * Initialize SDK lazily for a specific network
   */
  private async ensureSDK(network?: ERC8004Network): Promise<SDKInstance> {
    const targetNetwork = network || this.defaultNetwork;

    const cached = this.sdkCache.get(targetNetwork);
    if (cached) return cached;

    const existingPromise = this.initPromises.get(targetNetwork);
    if (existingPromise) {
      await existingPromise;
      return this.sdkCache.get(targetNetwork)!;
    }

    const initPromise = (async () => {
      const privateKey = process.env.AGENT0_PRIVATE_KEY as
        | `0x${string}`
        | undefined;

      const SDKClass = await getSDKModule();
      const sdk = new SDKClass({
        chainId: CHAIN_IDS[targetNetwork],
        rpcUrl: RPC_URLS[targetNetwork],
        signer: privateKey,
        subgraphUrl: SUBGRAPH_URLS[targetNetwork] || undefined,
      });

      this.sdkCache.set(targetNetwork, sdk);

      logger.info("[Agent0] SDK initialized", {
        network: targetNetwork,
        chainId: CHAIN_IDS[targetNetwork],
        readOnly: !privateKey,
      });
    })();

    this.initPromises.set(targetNetwork, initPromise);
    await initPromise;
    return this.sdkCache.get(targetNetwork)!;
  }

  // Legacy property for backwards compatibility
  private get network(): ERC8004Network {
    return this.defaultNetwork;
  }

  // Legacy property for backwards compatibility
  private get sdk(): SDKInstance | null {
    return this.sdkCache.get(this.defaultNetwork) || null;
  }

  /**
   * Get our registered agent ID
   */
  getAgentId(): string | null {
    const tokenId = ELIZA_CLOUD_AGENT_ID[this.network];
    if (!tokenId) return null;
    return `${CHAIN_IDS[this.network]}:${tokenId}`;
  }

  /**
   * Check if we're registered on the current network
   */
  isRegistered(): boolean {
    return ELIZA_CLOUD_AGENT_ID[this.network] !== null;
  }

  /**
   * Search for agents on a single network
   * Falls back to indexer if SDK is unavailable
   */
  async searchAgents(
    filters: Agent0SearchFilters = {},
    network?: ERC8004Network,
  ): Promise<Agent0Agent[]> {
    const targetNetwork = network || this.defaultNetwork;

    // Try indexer fallback first if SDK failed to load
    if (sdkLoadFailed) {
      logger.debug("[Agent0] Using indexer fallback for search");
      return fetchFromIndexer(filters);
    }

    try {
      const sdk = await this.ensureSDK(targetNetwork);

      const searchParams: SearchParams = {
        name: filters.name,
        mcpTools: filters.mcpTools,
        a2aSkills: filters.a2aSkills,
        active: filters.active,
        x402support: filters.x402Support,
      };

      const { items } = await sdk.searchAgents(searchParams);

      return items.map((agent: AgentSummary) => ({
        agentId: agent.agentId,
        name: agent.name,
        description: agent.description,
        image: agent.image,
        walletAddress: agent.walletAddress,
        mcpEndpoint: agent.mcpEndpoint,
        a2aEndpoint: agent.a2aEndpoint,
        mcpTools: agent.mcpTools,
        a2aSkills: agent.a2aSkills,
        active: agent.active ?? false,
        x402Support: agent.x402support ?? false,
        ecosystem: getNetworkEcosystem(targetNetwork),
        network: targetNetwork,
      }));
    } catch (error) {
      logger.warn("[Agent0] SDK search failed, falling back to indexer", {
        error: extractErrorMessage(error),
      });
      return fetchFromIndexer(filters);
    }
  }

  /**
   * Search for agents across MULTIPLE registries (Jeju and Base)
   *
   * This aggregates results from all configured registries and deduplicates
   * based on agent name and wallet address.
   */
  async searchAgentsMultiRegistry(
    filters: Agent0SearchFilters = {},
  ): Promise<Agent0Agent[]> {
    if (!isMultiRegistryEnabled() || !INDEXING.aggregateSearch) {
      // Fall back to single network search
      return this.searchAgents(filters);
    }

    // If ecosystem filter is set, only search that ecosystem
    if (filters.ecosystem) {
      const networks = getSearchNetworks().filter(
        (n) => getNetworkEcosystem(n) === filters.ecosystem,
      );
      if (networks.length === 0) {
        return [];
      }
      return this.searchAgents(filters, networks[0]);
    }

    const networks = getSearchNetworks();
    logger.debug("[Agent0] Multi-registry search", { networks, filters });

    // Search all networks in parallel
    const searchPromises = networks.map(async (network) => {
      try {
        return await this.searchAgents(filters, network);
      } catch (error) {
        logger.warn("[Agent0] Search failed on network", {
          network,
          error: extractErrorMessage(error),
        });
        return [];
      }
    });

    const results = await Promise.all(searchPromises);
    const allAgents = results.flat();

    // Deduplicate if enabled
    if (INDEXING.deduplication) {
      return this.deduplicateAgents(allAgents);
    }

    return allAgents;
  }

  /**
   * Deduplicate agents based on wallet address or name
   * Prefers agents from the preferred registry
   */
  private deduplicateAgents(agents: Agent0Agent[]): Agent0Agent[] {
    const seen = new Map<string, Agent0Agent>();
    const preferredEcosystem = INDEXING.preferredRegistry;

    for (const agent of agents) {
      // Use wallet address as primary key, fall back to name
      const key =
        agent.walletAddress?.toLowerCase() || agent.name.toLowerCase();

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, agent);
        continue;
      }

      // Replace if new agent is from preferred ecosystem
      if (
        agent.ecosystem === preferredEcosystem &&
        existing.ecosystem !== preferredEcosystem
      ) {
        seen.set(key, agent);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Get a specific agent by ID
   */
  async getAgent(agentId: string): Promise<Agent0Agent | null> {
    const sdk = await this.ensureSDK();

    const agent = await sdk.getAgent(agentId);
    if (!agent) return null;

    return {
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
      image: agent.image,
      walletAddress: agent.walletAddress,
      mcpEndpoint: agent.mcpEndpoint,
      a2aEndpoint: agent.a2aEndpoint,
      mcpTools: agent.mcpTools,
      a2aSkills: agent.a2aSkills,
      active: agent.active ?? false,
      x402Support: agent.x402support ?? false,
    };
  }

  /**
   * Get our own agent profile
   */
  async getSelf(): Promise<Agent0Agent | null> {
    const agentId = this.getAgentId();
    if (!agentId) return null;
    return this.getAgent(agentId);
  }

  /**
   * Search for agents with specific MCP tools
   */
  async findAgentsWithTools(tools: string[]): Promise<Agent0Agent[]> {
    return this.searchAgents({ mcpTools: tools, active: true });
  }

  /**
   * Search for agents with specific A2A skills
   */
  async findAgentsWithSkills(skills: string[]): Promise<Agent0Agent[]> {
    return this.searchAgents({ a2aSkills: skills, active: true });
  }

  /**
   * Search for agents that support x402 payments
   */
  async findPayableAgents(): Promise<Agent0Agent[]> {
    return this.searchAgents({ x402Support: true, active: true });
  }

  // ==========================================================================
  // Cached Methods (SWR pattern for better performance)
  // ==========================================================================

  /**
   * Hash filter parameters for cache key generation
   */
  private hashFilters(filters: Agent0SearchFilters): string {
    const sortedFilters = JSON.stringify(filters, Object.keys(filters).sort());
    return createHash("md5")
      .update(sortedFilters)
      .digest("hex")
      .substring(0, 12);
  }

  /**
   * Search for agents with caching (stale-while-revalidate)
   *
   * Returns cached results immediately if available, refreshes in background if stale.
   * Falls back to direct search if cache is unavailable.
   */
  async searchAgentsCached(
    filters: Agent0SearchFilters = {},
  ): Promise<Agent0Agent[]> {
    const filterHash = this.hashFilters(filters);
    const cacheKey = CacheKeys.erc8004.search(this.network, filterHash);

    const result = await cache.getWithSWR<Agent0Agent[]>(
      cacheKey,
      CacheStaleTTL.erc8004.search,
      async () => {
        logger.debug("[Agent0] Cache miss/stale, fetching from registry", {
          network: this.network,
          filters,
        });
        return this.searchAgents(filters);
      },
    );

    return result ?? [];
  }

  /**
   * Get a specific agent by ID with caching
   *
   * Caches individual agent details for longer (1 hour) since they rarely change.
   */
  async getAgentCached(agentId: string): Promise<Agent0Agent | null> {
    const cacheKey = CacheKeys.erc8004.agent(agentId);

    // Use regular cache get + set pattern for agent details
    const cached = await cache.get<Agent0Agent>(cacheKey);
    if (cached) {
      logger.debug("[Agent0] Cache hit for agent", { agentId });
      return cached;
    }

    logger.debug("[Agent0] Cache miss for agent, fetching", { agentId });
    const agent = await this.getAgent(agentId);

    if (agent) {
      await cache.set(cacheKey, agent, CacheTTL.erc8004.agent);
    }

    return agent;
  }

  /**
   * Search for agents with specific MCP tools (cached)
   */
  async findAgentsWithToolsCached(tools: string[]): Promise<Agent0Agent[]> {
    return this.searchAgentsCached({ mcpTools: tools, active: true });
  }

  /**
   * Search for agents with specific A2A skills (cached)
   */
  async findAgentsWithSkillsCached(skills: string[]): Promise<Agent0Agent[]> {
    return this.searchAgentsCached({ a2aSkills: skills, active: true });
  }

  /**
   * Search for agents that support x402 payments (cached)
   */
  async findPayableAgentsCached(): Promise<Agent0Agent[]> {
    return this.searchAgentsCached({ x402Support: true, active: true });
  }

  // ==========================================================================
  // Multi-Registry Cached Methods
  // ==========================================================================

  /**
   * Search agents across all registries with caching
   */
  async searchAgentsMultiRegistryCached(
    filters: Agent0SearchFilters = {},
  ): Promise<Agent0Agent[]> {
    const filterHash = this.hashFilters({ ...filters, multiRegistry: true });
    const cacheKey = CacheKeys.erc8004.search("multi", filterHash);

    const result = await cache.getWithSWR<Agent0Agent[]>(
      cacheKey,
      CacheStaleTTL.erc8004.search,
      async () => {
        logger.debug("[Agent0] Multi-registry cache miss, fetching", {
          filters,
        });
        return this.searchAgentsMultiRegistry(filters);
      },
    );

    return result ?? [];
  }

  /**
   * Find agents with tools across all registries (cached)
   */
  async findAgentsWithToolsMultiRegistryCached(
    tools: string[],
  ): Promise<Agent0Agent[]> {
    return this.searchAgentsMultiRegistryCached({
      mcpTools: tools,
      active: true,
    });
  }

  /**
   * Find agents with skills across all registries (cached)
   */
  async findAgentsWithSkillsMultiRegistryCached(
    skills: string[],
  ): Promise<Agent0Agent[]> {
    return this.searchAgentsMultiRegistryCached({
      a2aSkills: skills,
      active: true,
    });
  }

  /**
   * Find payable agents across all registries (cached)
   */
  async findPayableAgentsMultiRegistryCached(): Promise<Agent0Agent[]> {
    return this.searchAgentsMultiRegistryCached({
      x402Support: true,
      active: true,
    });
  }

  /**
   * Invalidate all ERC-8004 cache entries
   * Call this when we register a new agent or MCP
   */
  async invalidateCache(): Promise<void> {
    await cache.delPattern(CacheKeys.erc8004.pattern());
    logger.info("[Agent0] ERC-8004 cache invalidated");
  }

  /**
   * Get the current default network
   */
  getNetwork(): ERC8004Network {
    return this.defaultNetwork;
  }

  /**
   * Get all networks being searched
   */
  getSearchNetworks(): ERC8004Network[] {
    return getSearchNetworks();
  }

  /**
   * Check if multi-registry search is enabled
   */
  isMultiRegistryEnabled(): boolean {
    return isMultiRegistryEnabled() && INDEXING.aggregateSearch;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const agent0Service = new Agent0Service();
