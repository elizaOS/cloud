/**
 * Agent0 Service
 *
 * Provides integration with Agent0's ERC-8004 on-chain registry for agent
 * discovery, search, and (future) reputation/feedback.
 *
 * Features:
 * - Cached searches via Redis (stale-while-revalidate)
 * - Individual agent lookup with caching
 * - Filter by MCP tools, A2A skills, x402 support
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
  type ERC8004Network,
} from "@/lib/config/erc8004";
import { logger } from "@/lib/utils/logger";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL, CacheStaleTTL } from "@/lib/cache/keys";
import { createHash } from "crypto";

// Lazy import agent0-sdk to avoid JSON import issues during initial load
let SDK: typeof import("agent0-sdk").SDK | null = null;

async function getSDKModule() {
  if (!SDK) {
    const sdkModule = await import("agent0-sdk");
    SDK = sdkModule.SDK;
  }
  return SDK;
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
  active: boolean;
  x402Support: boolean;
}

// ============================================================================
// Agent0 Service
// ============================================================================

// SDK instance type - use InstanceType for proper typing
type SDKInstance = InstanceType<Awaited<ReturnType<typeof getSDKModule>>>;

class Agent0Service {
  private sdk: SDKInstance | null = null;
  private initPromise: Promise<void> | null = null;
  private network: ERC8004Network;

  constructor() {
    this.network = getDefaultNetwork();
  }

  /**
   * Initialize SDK lazily
   */
  private async ensureSDK(): Promise<SDKInstance> {
    if (this.sdk) return this.sdk;

    if (this.initPromise) {
      await this.initPromise;
      return this.sdk!;
    }

    this.initPromise = (async () => {
      const privateKey = process.env.AGENT0_PRIVATE_KEY as
        | `0x${string}`
        | undefined;

      const SDKClass = await getSDKModule();
      this.sdk = new SDKClass({
        chainId: CHAIN_IDS[this.network],
        rpcUrl: RPC_URLS[this.network],
        signer: privateKey,
        subgraphUrl: SUBGRAPH_URLS[this.network] || undefined,
      });

      logger.info("[Agent0] SDK initialized", {
        network: this.network,
        chainId: CHAIN_IDS[this.network],
        readOnly: !privateKey,
      });
    })();

    await this.initPromise;
    return this.sdk!;
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
   * Search for agents on the network
   */
  async searchAgents(
    filters: Agent0SearchFilters = {},
  ): Promise<Agent0Agent[]> {
    const sdk = await this.ensureSDK();

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
    }));
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

  /**
   * Invalidate all ERC-8004 cache entries
   * Call this when we register a new agent or MCP
   */
  async invalidateCache(): Promise<void> {
    await cache.delPattern(CacheKeys.erc8004.pattern());
    logger.info("[Agent0] ERC-8004 cache invalidated");
  }

  /**
   * Get the current network
   */
  getNetwork(): ERC8004Network {
    return this.network;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const agent0Service = new Agent0Service();
