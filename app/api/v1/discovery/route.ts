/**
 * Unified Discovery API
 *
 * Provides a single endpoint to discover services from both:
 * - Local Eliza Cloud marketplace (agents, MCPs, apps)
 * - External ERC-8004 registry (decentralized agents, MCPs)
 *
 * This enables agents to find and interact with services across
 * the entire ecosystem, not just those hosted on Eliza Cloud.
 *
 * @route GET /api/v1/discovery
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { cache } from "@/lib/cache/client";
import { CacheKeys, CacheTTL, CacheStaleTTL } from "@/lib/cache/keys";
import { createHash } from "crypto";
import { logger } from "@/lib/utils/logger";
import { getDefaultNetwork, CHAIN_IDS } from "@/lib/config/erc8004";
import {
  type DiscoveredService,
  type DiscoveryResponse,
  type ServiceType,
  type ServiceSource,
  agent0ToDiscoveredService,
} from "@/lib/types/erc8004";

// ============================================================================
// Request Validation
// ============================================================================

const querySchema = z.object({
  query: z.string().optional(),
  types: z
    .string()
    .transform((s) => s.split(",") as ServiceType[])
    .optional(),
  sources: z
    .string()
    .transform((s) => s.split(",") as ServiceSource[])
    .optional(),
  categories: z
    .string()
    .transform((s) => s.split(","))
    .optional(),
  tags: z
    .string()
    .transform((s) => s.split(","))
    .optional(),
  mcpTools: z
    .string()
    .transform((s) => s.split(","))
    .optional(),
  a2aSkills: z
    .string()
    .transform((s) => s.split(","))
    .optional(),
  x402Only: z
    .string()
    .transform((s) => s === "true")
    .optional(),
  activeOnly: z
    .string()
    .transform((s) => s === "true")
    .optional()
    .default("true"),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams);

  // Validate query parameters
  const parseResult = querySchema.safeParse(rawParams);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const params = parseResult.data;

  // Generate cache key from params
  const paramHash = createHash("md5")
    .update(JSON.stringify(params))
    .digest("hex")
    .substring(0, 12);
  const cacheKey = CacheKeys.erc8004.discovery(paramHash);

  // Use SWR caching for discovery results
  const result = await cache.getWithSWR<DiscoveryResponse>(
    cacheKey,
    CacheStaleTTL.erc8004.discovery,
    async () => {
      logger.debug("[Discovery] Cache miss, fetching fresh data", { params });

      const services: DiscoveredService[] = [];
      const sources = params.sources ?? ["local", "erc8004"];

      // ========================================================================
      // Fetch from local sources
      // ========================================================================
      if (sources.includes("local")) {
        const types = params.types ?? ["agent", "mcp", "app"];

        // Fetch local agents
        if (types.includes("agent")) {
          const localAgents = await fetchLocalAgents(params);
          services.push(...localAgents);
        }

        // Fetch local MCPs
        if (types.includes("mcp")) {
          const localMcps = await fetchLocalMcps(params);
          services.push(...localMcps);
        }
      }

      // ========================================================================
      // Fetch from ERC-8004 registry
      // ========================================================================
      if (sources.includes("erc8004")) {
        const externalServices = await fetchERC8004Services(params);
        services.push(...externalServices);
      }

      // ========================================================================
      // Deduplicate services (prefer local over ERC-8004 for same service)
      // ========================================================================
      
      const deduped = deduplicateServices(services);

      // ========================================================================
      // Apply filtering and pagination
      // ========================================================================

      let filtered = deduped;

      // Text search
      if (params.query) {
        const query = params.query.toLowerCase();
        filtered = filtered.filter(
          (s) =>
            s.name.toLowerCase().includes(query) ||
            s.description.toLowerCase().includes(query)
        );
      }

      // Filter by x402 support
      if (params.x402Only) {
        filtered = filtered.filter((s) => s.x402Support);
      }

      // Filter by active status
      if (params.activeOnly) {
        filtered = filtered.filter((s) => s.active);
      }

      // Filter by categories
      if (params.categories?.length) {
        filtered = filtered.filter(
          (s) => s.category && params.categories!.includes(s.category)
        );
      }

      // Filter by tags
      if (params.tags?.length) {
        filtered = filtered.filter((s) =>
          s.tags.some((tag) => params.tags!.includes(tag))
        );
      }

      // Sort by name (could add more sort options)
      filtered.sort((a, b) => a.name.localeCompare(b.name));

      // Pagination
      const total = filtered.length;
      const paginated = filtered.slice(
        params.offset,
        params.offset + params.limit
      );

      return {
        services: paginated,
        total,
        hasMore: params.offset + paginated.length < total,
        pagination: {
          limit: params.limit,
          offset: params.offset,
        },
      };
    }
  );

  if (!result) {
    return NextResponse.json(
      { error: "Failed to fetch discovery results" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ...result,
    cached: true, // Will be true if served from cache
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Fetch local agents from the marketplace
 */
async function fetchLocalAgents(
  params: z.infer<typeof querySchema>
): Promise<DiscoveredService[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  const characters = await characterMarketplaceService.searchPublic({
    search: params.query,
    category: params.categories?.[0],
    limit: params.limit,
    offset: params.offset,
  });

  return characters.map((char): DiscoveredService => {
    const bio = Array.isArray(char.bio) ? char.bio.join(" ") : char.bio;

    return {
      id: char.id,
      name: char.name,
      description: bio,
      type: "agent",
      source: "local",
      image: char.avatar_url ?? undefined,
      category: char.category ?? undefined,
      tags: char.tags ?? [],
      active: true,
      a2aEndpoint: `${baseUrl}/api/agents/${char.id}/a2a`,
      mcpEndpoint: `${baseUrl}/api/agents/${char.id}/mcp`,
      mcpTools: [],
      a2aSkills: [],
      x402Support: false, // Agents use credits, not direct x402. Credits can be topped up via x402.
      organizationId: char.organization_id,
      creatorId: char.user_id,
      verified: false, // TODO: Add verification support
      slug: char.slug ?? undefined,
      pricing: char.monetization_enabled
        ? {
            type: "credits",
            description: `${char.inference_markup_percentage}% markup on inference costs`,
          }
        : { type: "free", description: "Free to use" },
    };
  });
}

/**
 * Fetch local MCPs from the registry
 */
async function fetchLocalMcps(
  params: z.infer<typeof querySchema>
): Promise<DiscoveredService[]> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  const mcps = await userMcpsService.listPublic({
    category: params.categories?.[0],
    search: params.query,
    limit: params.limit,
    offset: params.offset,
  });

  return mcps.map((mcp): DiscoveredService => ({
    id: mcp.id,
    name: mcp.name,
    description: mcp.description,
    type: "mcp",
    source: "local",
    category: mcp.category,
    tags: mcp.tags ?? [],
    active: mcp.status === "live",
    mcpEndpoint: userMcpsService.getEndpointUrl(mcp, baseUrl),
    mcpTools: mcp.tools.map((t) => t.name),
    a2aSkills: [],
    x402Support: mcp.x402_enabled,
    organizationId: mcp.organization_id,
    creatorId: mcp.created_by_user_id,
    verified: mcp.is_verified,
    slug: mcp.slug,
    pricing:
      mcp.pricing_type === "free"
        ? { type: "free", description: "Free to use" }
        : mcp.pricing_type === "credits"
          ? {
              type: "credits",
              amount: Number(mcp.credits_per_request),
              description: `${mcp.credits_per_request} credits per request`,
            }
          : {
              type: "x402",
              amount: Number(mcp.x402_price_usd),
              currency: "USD",
              description: `$${mcp.x402_price_usd} per request`,
            },
  }));
}

/**
 * Fetch services from the ERC-8004 registry
 */
async function fetchERC8004Services(
  params: z.infer<typeof querySchema>
): Promise<DiscoveredService[]> {
  const network = getDefaultNetwork();
  const chainId = CHAIN_IDS[network];

  // Use cached search from agent0Service
  const agents = await agent0Service.searchAgentsCached({
    name: params.query,
    mcpTools: params.mcpTools,
    a2aSkills: params.a2aSkills,
    x402Support: params.x402Only,
    active: params.activeOnly,
  });

  return agents.map((agent) =>
    agent0ToDiscoveredService(agent, network, chainId)
  );
}

/**
 * Deduplicate services by preferring local over ERC-8004
 * 
 * When a service exists in both local marketplace and ERC-8004 registry,
 * we prefer the local version since it has richer metadata.
 * 
 * Deduplication is based on:
 * 1. Same name (case-insensitive)
 * 2. Same endpoints (A2A or MCP)
 */
function deduplicateServices(services: DiscoveredService[]): DiscoveredService[] {
  const seen = new Map<string, DiscoveredService>();
  
  // Process local services first (they have priority)
  const localServices = services.filter((s) => s.source === "local");
  const erc8004Services = services.filter((s) => s.source === "erc8004");
  
  // Add all local services
  for (const service of localServices) {
    const key = getServiceDedupeKey(service);
    seen.set(key, service);
  }
  
  // Add ERC-8004 services only if not already present
  for (const service of erc8004Services) {
    const key = getServiceDedupeKey(service);
    if (!seen.has(key)) {
      seen.set(key, service);
    }
  }
  
  return Array.from(seen.values());
}

/**
 * Generate a deduplication key for a service
 */
function getServiceDedupeKey(service: DiscoveredService): string {
  // Primary key: normalized name + type
  const normalizedName = service.name.toLowerCase().trim();
  
  // Secondary: endpoint matching
  const endpointKey = service.a2aEndpoint || service.mcpEndpoint || "";
  
  // Combine for unique key
  return `${normalizedName}:${service.type}:${normalizeEndpoint(endpointKey)}`;
}

/**
 * Normalize endpoint URL for comparison
 */
function normalizeEndpoint(url: string): string {
  if (!url) return "";
  
  // Remove protocol and trailing slashes for comparison
  return url
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "")
    .toLowerCase();
}


