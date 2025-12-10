/**
 * ERC-8004 Marketplace Service
 *
 * Provides discovery and search for ERC-8004 registered agents, MCPs, and apps.
 * Combines local database with on-chain registry for comprehensive discovery.
 *
 * Features:
 * - Search/filter registered agents and MCPs
 * - Tag-based discovery
 * - Online status tracking
 * - Multi-registry support (Jeju + Base)
 */

import { userCharactersRepository } from "@/db/repositories/characters";
import { userMcpsRepository } from "@/db/repositories/user-mcps";
import { agent0Service, type Agent0Agent } from "./agent0";
import { logger } from "@/lib/utils/logger";
import { cache } from "@/lib/cache/client";
import {
  getDefaultNetwork,
  getSearchNetworks,
  isMultiRegistryEnabled,
  CHAIN_IDS,
  type ERC8004Network,
} from "@/lib/config/erc8004";
import type {
  ERC8004DiscoveryFilters,
  ERC8004SortOptions,
  ERC8004PaginationOptions,
  ERC8004MarketplaceItem,
  ERC8004DiscoveryResult,
  ERC8004ServiceType,
  TagGroup,
  CategoryCount,
} from "@/lib/types/erc8004-marketplace";
import { ALL_DISCOVERY_TAGS } from "@/lib/types/erc8004-marketplace";

// ============================================================================
// Cache Keys
// ============================================================================

const CACHE_PREFIX = "erc8004:marketplace";
const CACHE_TTL = 300; // 5 minutes

function cacheKey(suffix: string): string {
  return `${CACHE_PREFIX}:${suffix}`;
}

// ============================================================================
// Service Implementation
// ============================================================================

class ERC8004MarketplaceService {
  /**
   * Search and discover marketplace items
   *
   * Combines local database items with on-chain registry results
   */
  async discover(
    filters: ERC8004DiscoveryFilters = {},
    sort: ERC8004SortOptions = { sortBy: "relevance", order: "desc" },
    pagination: ERC8004PaginationOptions = { page: 1, limit: 20 }
  ): Promise<ERC8004DiscoveryResult> {
    const startTime = Date.now();

    logger.debug("[ERC8004 Marketplace] Discovery request", {
      filters,
      sort,
      pagination,
    });

    // Fetch from both sources in parallel
    const [localItems, registryItems] = await Promise.all([
      this.getLocalItems(filters),
      filters.registeredOnly !== false
        ? this.getRegistryItems(filters)
        : Promise.resolve([]),
    ]);

    // Merge and deduplicate
    const mergedItems = this.mergeItems(localItems, registryItems);

    // Apply filters
    let filteredItems = this.applyFilters(mergedItems, filters);

    // Apply sorting
    filteredItems = this.applySorting(filteredItems, sort);

    // Get total before pagination
    const total = filteredItems.length;

    // Apply pagination
    const offset = (pagination.page - 1) * pagination.limit;
    const paginatedItems = filteredItems.slice(
      offset,
      offset + pagination.limit
    );

    // Get available tags and categories for filtering UI
    const [availableTags, availableCategories] = await Promise.all([
      this.getAvailableTags(filters),
      this.getAvailableCategories(filters),
    ]);

    const duration = Date.now() - startTime;
    logger.debug("[ERC8004 Marketplace] Discovery complete", {
      total,
      returned: paginatedItems.length,
      duration,
    });

    return {
      items: paginatedItems,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: Math.ceil(total / pagination.limit),
        hasMore: offset + paginatedItems.length < total,
      },
      filters: {
        applied: filters,
        availableTags,
        availableCategories,
      },
      source:
        registryItems.length > 0
          ? localItems.length > 0
            ? "hybrid"
            : "registry"
          : "local",
    };
  }

  /**
   * Get local database items (agents and MCPs)
   */
  private async getLocalItems(
    filters: ERC8004DiscoveryFilters
  ): Promise<ERC8004MarketplaceItem[]> {
    const items: ERC8004MarketplaceItem[] = [];
    const types = filters.types || ["agent", "mcp"];

    // Fetch agents
    if (types.includes("agent")) {
      const agents = await userCharactersRepository.findPublicRegistered({
        erc8004Only: filters.registeredOnly,
        category: filters.category,
        limit: 100,
      });

      for (const agent of agents) {
        items.push(this.agentToMarketplaceItem(agent));
      }
    }

    // Fetch MCPs
    if (types.includes("mcp")) {
      const mcps = await userMcpsRepository.findPublicRegistered({
        erc8004Only: filters.registeredOnly,
        category: filters.category,
        limit: 100,
      });

      for (const mcp of mcps) {
        items.push(this.mcpToMarketplaceItem(mcp));
      }
    }

    return items;
  }

  /**
   * Get items from on-chain registry via agent0 SDK
   */
  private async getRegistryItems(
    filters: ERC8004DiscoveryFilters
  ): Promise<ERC8004MarketplaceItem[]> {
    const searchFilters = {
      name: filters.query,
      mcpTools: filters.mcpTools,
      a2aSkills: filters.a2aSkills,
      active: filters.activeOnly,
      x402Support: filters.x402Only,
      ecosystem: filters.ecosystem,
    };

    const agents = isMultiRegistryEnabled()
      ? await agent0Service.searchAgentsMultiRegistryCached(searchFilters)
      : await agent0Service.searchAgentsCached(searchFilters);

    return agents.map((agent) => this.registryAgentToMarketplaceItem(agent));
  }

  /**
   * Merge local and registry items, preferring local data when available
   */
  private mergeItems(
    localItems: ERC8004MarketplaceItem[],
    registryItems: ERC8004MarketplaceItem[]
  ): ERC8004MarketplaceItem[] {
    const merged = new Map<string, ERC8004MarketplaceItem>();

    // Add local items first (they have more complete data)
    for (const item of localItems) {
      const key = item.erc8004.agentId || item.id;
      merged.set(key, item);
    }

    // Add registry items that aren't already present
    for (const item of registryItems) {
      const key = item.erc8004.agentId || item.id;
      if (!merged.has(key)) {
        merged.set(key, item);
      } else {
        // Merge registry data into local item
        const local = merged.get(key)!;
        merged.set(key, {
          ...local,
          status: {
            ...local.status,
            online: item.status.online,
            active: item.status.active,
          },
        });
      }
    }

    return Array.from(merged.values());
  }

  /**
   * Apply filters to items
   */
  private applyFilters(
    items: ERC8004MarketplaceItem[],
    filters: ERC8004DiscoveryFilters
  ): ERC8004MarketplaceItem[] {
    let filtered = items;

    // Text search
    if (filters.query) {
      const query = filters.query.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.name.toLowerCase().includes(query) ||
          item.description.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Type filter
    if (filters.types?.length) {
      filtered = filtered.filter((item) => filters.types!.includes(item.type));
    }

    // Protocol filter
    if (filters.protocols?.length) {
      filtered = filtered.filter((item) =>
        filters.protocols!.some((protocol) => {
          if (protocol === "a2a") return !!item.endpoints.a2a;
          if (protocol === "mcp") return !!item.endpoints.mcp;
          if (protocol === "openapi") return !!item.endpoints.openapi;
          if (protocol === "x402") return item.capabilities.x402;
          return false;
        })
      );
    }

    // Tag filters (AND logic)
    if (filters.tags?.length) {
      filtered = filtered.filter((item) =>
        filters.tags!.every((tag) => item.tags.includes(tag))
      );
    }

    // Any tags (OR logic)
    if (filters.anyTags?.length) {
      filtered = filtered.filter((item) =>
        filters.anyTags!.some((tag) => item.tags.includes(tag))
      );
    }

    // Payment method filter
    if (filters.paymentMethods?.length) {
      filtered = filtered.filter((item) =>
        filters.paymentMethods!.includes(item.pricing.type)
      );
    }

    // x402 only
    if (filters.x402Only) {
      filtered = filtered.filter((item) => item.capabilities.x402);
    }

    // Active only
    if (filters.activeOnly) {
      filtered = filtered.filter((item) => item.status.active);
    }

    // Registered only
    if (filters.registeredOnly) {
      filtered = filtered.filter((item) => item.erc8004.registered);
    }

    // Category filter
    if (filters.category) {
      filtered = filtered.filter((item) => item.category === filters.category);
    }

    return filtered;
  }

  /**
   * Apply sorting to items
   */
  private applySorting(
    items: ERC8004MarketplaceItem[],
    sort: ERC8004SortOptions
  ): ERC8004MarketplaceItem[] {
    const sorted = [...items];
    const multiplier = sort.order === "asc" ? 1 : -1;

    sorted.sort((a, b) => {
      switch (sort.sortBy) {
        case "popularity":
          return (a.stats.popularity - b.stats.popularity) * multiplier;
        case "recent":
          return (
            (new Date(a.createdAt).getTime() -
              new Date(b.createdAt).getTime()) *
            multiplier
          );
        case "name":
          return a.name.localeCompare(b.name) * multiplier;
        case "relevance":
        default:
          // Relevance: registered + active + popularity
          const scoreA =
            (a.erc8004.registered ? 100 : 0) +
            (a.status.active ? 50 : 0) +
            a.stats.popularity;
          const scoreB =
            (b.erc8004.registered ? 100 : 0) +
            (b.status.active ? 50 : 0) +
            b.stats.popularity;
          return (scoreA - scoreB) * multiplier;
      }
    });

    return sorted;
  }

  /**
   * Get available tags with counts
   */
  async getAvailableTags(
    filters?: ERC8004DiscoveryFilters
  ): Promise<TagGroup[]> {
    const cacheResult = await cache.get<TagGroup[]>(cacheKey("tags"));
    if (cacheResult) return cacheResult;

    // Get all items to count tags
    const items = await this.getLocalItems({});

    const tagCounts = new Map<string, number>();
    for (const item of items) {
      for (const tag of item.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    // Group by prefix
    const groups: Record<string, { tag: string; count: number }[]> = {
      skill: [],
      domain: [],
      mcp: [],
      capability: [],
      other: [],
    };

    for (const [tag, count] of tagCounts) {
      const group = tag.startsWith("nlp/") ||
        tag.startsWith("dev/") ||
        tag.startsWith("reasoning/") ||
        tag.startsWith("creative/") ||
        tag.startsWith("data/") ||
        tag.startsWith("research/") ||
        tag.startsWith("comm/") ||
        tag.startsWith("productivity/")
        ? "skill"
        : tag.startsWith("domain/")
          ? "domain"
          : tag.startsWith("mcp/")
            ? "mcp"
            : tag.startsWith("cap/")
              ? "capability"
              : "other";

      groups[group].push({ tag, count });
    }

    const result: TagGroup[] = Object.entries(groups)
      .filter(([_, tags]) => tags.length > 0)
      .map(([group, tags]) => ({
        group,
        tags: tags.sort((a, b) => b.count - a.count),
      }));

    await cache.set(cacheKey("tags"), result, CACHE_TTL);
    return result;
  }

  /**
   * Get available categories with counts
   */
  async getAvailableCategories(
    filters?: ERC8004DiscoveryFilters
  ): Promise<CategoryCount[]> {
    const cacheResult = await cache.get<CategoryCount[]>(
      cacheKey("categories")
    );
    if (cacheResult) return cacheResult;

    const items = await this.getLocalItems({});

    const categoryCounts = new Map<string, number>();
    for (const item of items) {
      if (item.category) {
        categoryCounts.set(
          item.category,
          (categoryCounts.get(item.category) || 0) + 1
        );
      }
    }

    const result: CategoryCount[] = Array.from(categoryCounts.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);

    await cache.set(cacheKey("categories"), result, CACHE_TTL);
    return result;
  }

  /**
   * Get all available discovery tags for search context
   */
  getAllTags(): { tags: string[]; grouped: Record<string, string[]> } {
    const tags = [...ALL_DISCOVERY_TAGS] as string[];

    const grouped: Record<string, string[]> = {
      skills: tags.filter(
        (t) =>
          t.startsWith("nlp/") ||
          t.startsWith("dev/") ||
          t.startsWith("reasoning/") ||
          t.startsWith("creative/") ||
          t.startsWith("data/") ||
          t.startsWith("research/") ||
          t.startsWith("comm/") ||
          t.startsWith("productivity/")
      ),
      domains: tags.filter((t) => t.startsWith("domain/")),
      mcpCategories: tags.filter((t) => t.startsWith("mcp/")),
      capabilities: tags.filter((t) => t.startsWith("cap/")),
    };

    return { tags, grouped };
  }

  /**
   * Get a single marketplace item by ID
   */
  async getItem(
    id: string,
    type?: ERC8004ServiceType
  ): Promise<ERC8004MarketplaceItem | null> {
    // Check if it's an ERC-8004 agent ID (chainId:tokenId format)
    if (id.includes(":")) {
      const agent = await agent0Service.getAgentCached(id);
      if (agent) {
        return this.registryAgentToMarketplaceItem(agent);
      }
    }

    // Try local database
    if (!type || type === "agent") {
      const character = await userCharactersRepository.findById(id);
      if (character && character.is_public) {
        return this.agentToMarketplaceItem(character);
      }
    }

    if (!type || type === "mcp") {
      const mcp = await userMcpsRepository.getById(id);
      if (mcp && mcp.is_public) {
        return this.mcpToMarketplaceItem(mcp);
      }
    }

    return null;
  }

  /**
   * Get items by tags (for agent discovery)
   */
  async getByTags(
    tags: string[],
    options: { limit?: number; activeOnly?: boolean } = {}
  ): Promise<ERC8004MarketplaceItem[]> {
    const result = await this.discover(
      {
        anyTags: tags,
        activeOnly: options.activeOnly,
        registeredOnly: true,
      },
      { sortBy: "relevance", order: "desc" },
      { page: 1, limit: options.limit || 20 }
    );

    return result.items;
  }

  /**
   * Get items with specific MCP tools
   */
  async getByMCPTools(
    tools: string[],
    options: { limit?: number } = {}
  ): Promise<ERC8004MarketplaceItem[]> {
    const result = await this.discover(
      {
        mcpTools: tools,
        types: ["mcp"],
        registeredOnly: true,
      },
      { sortBy: "relevance", order: "desc" },
      { page: 1, limit: options.limit || 20 }
    );

    return result.items;
  }

  /**
   * Get items with specific A2A skills
   */
  async getByA2ASkills(
    skills: string[],
    options: { limit?: number } = {}
  ): Promise<ERC8004MarketplaceItem[]> {
    const result = await this.discover(
      {
        a2aSkills: skills,
        types: ["agent"],
        registeredOnly: true,
      },
      { sortBy: "relevance", order: "desc" },
      { page: 1, limit: options.limit || 20 }
    );

    return result.items;
  }

  /**
   * Get x402-enabled services
   */
  async getPayableServices(
    options: { type?: ERC8004ServiceType; limit?: number } = {}
  ): Promise<ERC8004MarketplaceItem[]> {
    const result = await this.discover(
      {
        x402Only: true,
        types: options.type ? [options.type] : undefined,
        activeOnly: true,
      },
      { sortBy: "popularity", order: "desc" },
      { page: 1, limit: options.limit || 20 }
    );

    return result.items;
  }

  // ============================================================================
  // Conversion Helpers
  // ============================================================================

  private agentToMarketplaceItem(agent: {
    id: string;
    name: string;
    bio: string | string[] | null;
    avatar_url: string | null;
    user_id: string;
    organization_id: string;
    category: string | null;
    tags: string[] | null;
    is_public: boolean;
    featured: boolean;
    view_count: number;
    interaction_count: number;
    popularity_score: number;
    erc8004_registered: boolean;
    erc8004_network: string | null;
    erc8004_agent_id: number | null;
    erc8004_agent_uri: string | null;
    erc8004_registered_at: Date | null;
    monetization_enabled: boolean;
    inference_markup_percentage: string;
    a2a_enabled: boolean;
    mcp_enabled: boolean;
    settings?: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
  }): ERC8004MarketplaceItem {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    const bio = Array.isArray(agent.bio) ? agent.bio.join("\n") : agent.bio || "";
    const network = agent.erc8004_network as ERC8004Network | null;

    return {
      id: agent.id,
      type: "agent",
      name: agent.name,
      description: bio,
      image: agent.avatar_url || undefined,
      creatorId: agent.user_id,
      organizationId: agent.organization_id,
      erc8004: {
        registered: agent.erc8004_registered,
        network: agent.erc8004_network || undefined,
        agentId: agent.erc8004_agent_id && network
          ? `${CHAIN_IDS[network]}:${agent.erc8004_agent_id}`
          : undefined,
        agentUri: agent.erc8004_agent_uri || undefined,
        registeredAt: agent.erc8004_registered_at?.toISOString(),
      },
      endpoints: {
        a2a: agent.a2a_enabled
          ? `${baseUrl}/api/agents/${agent.id}/a2a`
          : undefined,
        mcp: agent.mcp_enabled
          ? `${baseUrl}/api/agents/${agent.id}/mcp`
          : undefined,
      },
      tags: agent.tags || [],
      category: agent.category || undefined,
      capabilities: {
        streaming: true,
        x402: agent.monetization_enabled,
        multimodal: false,
        voice: !!(agent.settings as Record<string, unknown> | undefined)?.voice,
      },
      pricing: {
        type: agent.monetization_enabled ? "x402" : "credits",
        inferenceMarkup: parseFloat(agent.inference_markup_percentage) || 0,
      },
      stats: {
        popularity: agent.popularity_score,
        viewCount: agent.view_count,
        interactionCount: agent.interaction_count,
        totalRequests: agent.interaction_count,
      },
      status: {
        active: agent.is_public,
        online: agent.is_public && agent.erc8004_registered,
        verified: false,
        featured: agent.featured,
      },
      createdAt: agent.created_at.toISOString(),
      updatedAt: agent.updated_at.toISOString(),
    };
  }

  private mcpToMarketplaceItem(mcp: {
    id: string;
    name: string;
    description: string;
    organization_id: string;
    created_by_user_id: string;
    category: string;
    tags: string[];
    is_public: boolean;
    is_featured: boolean;
    is_verified: boolean;
    status: string;
    pricing_type: string;
    credits_per_request: string | null;
    x402_price_usd: string | null;
    x402_enabled: boolean;
    total_requests: number;
    erc8004_registered: boolean;
    erc8004_network: string | null;
    erc8004_agent_id: number | null;
    erc8004_agent_uri: string | null;
    erc8004_registered_at: Date | null;
    endpoint_type: string;
    external_endpoint: string | null;
    slug: string;
    tools?: Array<{ name: string; description: string }>;
    created_at: Date;
    updated_at: Date;
  }): ERC8004MarketplaceItem {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
    const network = mcp.erc8004_network as ERC8004Network | null;

    const mcpEndpoint =
      mcp.endpoint_type === "external" && mcp.external_endpoint
        ? mcp.external_endpoint
        : `${baseUrl}/api/mcp/${mcp.slug}`;

    return {
      id: mcp.id,
      type: "mcp",
      name: mcp.name,
      description: mcp.description,
      image: undefined,
      creatorId: mcp.created_by_user_id,
      organizationId: mcp.organization_id,
      erc8004: {
        registered: mcp.erc8004_registered,
        network: mcp.erc8004_network || undefined,
        agentId: mcp.erc8004_agent_id && network
          ? `${CHAIN_IDS[network]}:${mcp.erc8004_agent_id}`
          : undefined,
        agentUri: mcp.erc8004_agent_uri || undefined,
        registeredAt: mcp.erc8004_registered_at?.toISOString(),
      },
      endpoints: {
        mcp: mcpEndpoint,
      },
      tags: [`mcp/${mcp.category}`, ...mcp.tags],
      category: mcp.category,
      capabilities: {
        streaming: true,
        x402: mcp.x402_enabled,
        multimodal: false,
        voice: false,
      },
      pricing: {
        type: mcp.pricing_type as "free" | "credits" | "x402",
        creditsPerRequest: mcp.credits_per_request
          ? parseFloat(mcp.credits_per_request)
          : undefined,
        x402PriceUsd: mcp.x402_price_usd
          ? parseFloat(mcp.x402_price_usd)
          : undefined,
      },
      stats: {
        popularity: mcp.total_requests,
        viewCount: 0,
        interactionCount: mcp.total_requests,
        totalRequests: mcp.total_requests,
      },
      status: {
        active: mcp.status === "live",
        online: mcp.status === "live" && mcp.is_public,
        verified: mcp.is_verified,
        featured: mcp.is_featured,
      },
      createdAt: mcp.created_at.toISOString(),
      updatedAt: mcp.updated_at.toISOString(),
    };
  }

  private registryAgentToMarketplaceItem(
    agent: Agent0Agent
  ): ERC8004MarketplaceItem {
    return {
      id: agent.agentId,
      type: "agent",
      name: agent.name,
      description: agent.description || "",
      image: agent.image,
      creatorId: agent.walletAddress || "",
      organizationId: "",
      erc8004: {
        registered: true,
        network: agent.network,
        agentId: agent.agentId,
        agentUri: undefined,
      },
      endpoints: {
        a2a: agent.a2aEndpoint,
        mcp: agent.mcpEndpoint,
      },
      tags: [
        ...(agent.mcpTools || []).map((t) => `tool/${t}`),
        ...(agent.a2aSkills || []).map((s) => `skill/${s}`),
      ],
      category: undefined,
      capabilities: {
        streaming: true,
        x402: agent.x402Support,
        multimodal: false,
        voice: false,
      },
      pricing: {
        type: agent.x402Support ? "x402" : "credits",
      },
      stats: {
        popularity: 0,
        viewCount: 0,
        interactionCount: 0,
        totalRequests: 0,
      },
      status: {
        active: agent.active,
        online: agent.active,
        verified: false,
        featured: false,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Invalidate marketplace cache
   */
  async invalidateCache(): Promise<void> {
    await cache.delPattern(`${CACHE_PREFIX}:*`);
    logger.info("[ERC8004 Marketplace] Cache invalidated");
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const erc8004MarketplaceService = new ERC8004MarketplaceService();

