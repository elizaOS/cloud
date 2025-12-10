/**
 * Discovery Stats API
 *
 * Returns aggregate statistics about the marketplace.
 *
 * @route GET /api/v1/discovery/stats
 */

import { NextRequest, NextResponse } from "next/server";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";
import { getDefaultNetwork, CHAIN_IDS, isMultiRegistryEnabled, getSearchNetworks } from "@/lib/config/erc8004";

// ============================================================================
// Types
// ============================================================================

interface MarketplaceStats {
  // Aggregate counts
  totalServices: number;
  totalAgents: number;
  totalMCPs: number;
  totalApps: number;

  // By source
  localServices: number;
  onChainServices: number;

  // Features
  x402Enabled: number;
  verified: number;

  // Categories breakdown (top 10)
  topCategories: Array<{
    category: string;
    count: number;
  }>;

  // Tags breakdown (top 20)
  topTags: Array<{
    tag: string;
    count: number;
  }>;

  // Network info
  networks: Array<{
    network: string;
    chainId: number;
    agentCount: number;
    isActive: boolean;
  }>;

  // Multi-registry status
  multiRegistry: {
    enabled: boolean;
    searchNetworks: string[];
  };

  meta: {
    cached: boolean;
    lastUpdated: string;
  };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(_request: NextRequest) {
  try {
    const cacheKey = "discovery:stats";

    // Check cache (10 minutes TTL)
    const cached = await cache.get<MarketplaceStats>(cacheKey);
    if (cached) {
      return NextResponse.json({ ...cached, meta: { ...cached.meta, cached: true } });
    }

    // Fetch data with graceful fallbacks
    let characters: { category?: string; tags?: string[] }[] = [];
    let mcps: { status: string; category?: string; tags?: string[]; x402_enabled: boolean; is_verified: boolean }[] = [];
    
    // Try to fetch local data
    try {
      const result = await characterMarketplaceService.searchCharactersPublic({
        filters: {},
        sortOptions: { field: "popularity_score", direction: "desc" },
        pagination: { limit: 1000, page: 1 },
        includeStats: false,
      });
      characters = result.characters;
      mcps = await userMcpsService.listPublic({ limit: 1000 });
    } catch {
      // Database unavailable - continue with ERC-8004 only
    }
    
    // Always fetch ERC-8004 agents
    const agents = await agent0Service.searchAgentsCached({ active: true });

  // Count by type
  const localAgents = characters.length;
  const localMCPs = mcps.filter(m => m.status === "live").length;
  let onChainAgents = 0;
  let onChainMCPs = 0;
  let onChainApps = 0;

  for (const agent of agents) {
    if (agent.mcpEndpoint && !agent.a2aEndpoint) {
      onChainMCPs++;
    } else if (!agent.mcpEndpoint && !agent.a2aEndpoint) {
      onChainApps++;
    } else {
      onChainAgents++;
    }
  }

  // Count x402 and verified
  const x402Local = mcps.filter(m => m.x402_enabled).length;
  const x402OnChain = agents.filter(a => a.x402Support).length;
  const verifiedLocal = mcps.filter(m => m.is_verified).length;

  // Categories
  const categoryCounts = new Map<string, number>();
  for (const char of characters) {
    if (char.category) {
      categoryCounts.set(char.category, (categoryCounts.get(char.category) ?? 0) + 1);
    }
  }
  for (const mcp of mcps) {
    if (mcp.category) {
      categoryCounts.set(mcp.category, (categoryCounts.get(mcp.category) ?? 0) + 1);
    }
  }

  // Tags
  const tagCounts = new Map<string, number>();
  for (const char of characters) {
    for (const tag of char.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const mcp of mcps) {
    for (const tag of mcp.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  for (const agent of agents) {
    for (const tool of agent.mcpTools ?? []) {
      tagCounts.set(tool, (tagCounts.get(tool) ?? 0) + 1);
    }
    for (const skill of agent.a2aSkills ?? []) {
      tagCounts.set(skill, (tagCounts.get(skill) ?? 0) + 1);
    }
  }

  // Build network info
  const network = getDefaultNetwork();
  const searchNetworks = getSearchNetworks();
  const networks = searchNetworks.map(net => ({
    network: net,
    chainId: CHAIN_IDS[net],
    agentCount: net === network ? agents.length : 0,
    isActive: net === network,
  }));

  const response: MarketplaceStats = {
    totalServices: localAgents + localMCPs + agents.length,
    totalAgents: localAgents + onChainAgents,
    totalMCPs: localMCPs + onChainMCPs,
    totalApps: onChainApps,
    localServices: localAgents + localMCPs,
    onChainServices: agents.length,
    x402Enabled: x402Local + x402OnChain,
    verified: verifiedLocal,

    topCategories: Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([category, count]) => ({ category, count })),

    topTags: Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([tag, count]) => ({ tag, count })),

    networks,

    multiRegistry: {
      enabled: isMultiRegistryEnabled(),
      searchNetworks,
    },

    meta: {
      cached: false,
      lastUpdated: new Date().toISOString(),
    },
  };

  // Cache for 10 minutes
  await cache.set(cacheKey, response, CacheTTL.erc8004.discovery);

  return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

