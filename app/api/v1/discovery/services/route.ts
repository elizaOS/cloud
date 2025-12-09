/**
 * Discovery Services API
 *
 * Returns all ERC-8004 registered and available agents/services
 * in a format optimized for marketplace display and agent discovery.
 *
 * Features:
 * - All active agents from on-chain registry
 * - Filtering by type, tags, capabilities
 * - Availability status (online/offline)
 * - MCP/A2A endpoint exposure
 *
 * @route GET /api/v1/discovery/services
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agent0Service } from "@/lib/services/agent0";
import { userMcpsService } from "@/lib/services/user-mcps";
import { characterMarketplaceService } from "@/lib/services/characters/marketplace";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { getDefaultNetwork, CHAIN_IDS } from "@/lib/config/erc8004";

// ============================================================================
// Types
// ============================================================================

type ServiceType = "agent" | "mcp" | "app" | "solver";

interface MarketplaceService {
  /** Unique identifier (agentId for ERC-8004, uuid for local) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description: string;
  /** Service type */
  type: ServiceType;
  /** Image/avatar URL */
  image?: string;
  /** Category (e.g., "ai", "finance", "gaming") */
  category?: string;
  /** Tags for filtering */
  tags: string[];
  /** Whether service is active and available */
  active: boolean;
  /** Whether service is currently online (endpoint reachable) */
  online?: boolean;

  // Endpoints
  a2aEndpoint?: string;
  mcpEndpoint?: string;
  openApiEndpoint?: string;

  // Capabilities
  mcpTools?: string[];
  a2aSkills?: string[];
  supportedProtocols?: string[];

  // Trust & Payment
  x402Support: boolean;
  stakeTier?: "none" | "small" | "medium" | "high";
  stakeAmount?: string;
  verified?: boolean;

  // ERC-8004 specific
  chainId?: number;
  tokenId?: number;
  agentId?: string;
  walletAddress?: string;
  network?: string;
  registeredAt?: string;

  // Pricing
  pricing?: {
    type: "free" | "credits" | "x402" | "subscription";
    amount?: number;
    currency?: string;
    description?: string;
  };

  // Source
  source: "local" | "erc8004";
}

interface ServicesResponse {
  services: MarketplaceService[];
  total: number;
  hasMore: boolean;
  pagination: {
    limit: number;
    offset: number;
  };
  /** Filter options available for this result set */
  filters: {
    types: Array<{ type: ServiceType; count: number }>;
    categories: Array<{ category: string; count: number }>;
    tags: Array<{ tag: string; count: number }>;
  };
  /** Metadata about the response */
  meta: {
    network: string;
    chainId: number;
    cached: boolean;
    lastUpdated?: string;
  };
}

// ============================================================================
// Query Validation
// ============================================================================

const querySchema = z.object({
  query: z.string().optional(),
  types: z
    .string()
    .transform((s) => s.split(",") as ServiceType[])
    .optional(),
  tags: z
    .string()
    .transform((s) => s.split(","))
    .optional(),
  categories: z
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
  onlineOnly: z
    .string()
    .transform((s) => s === "true")
    .optional(),
  verified: z
    .string()
    .transform((s) => s === "true")
    .optional(),
  stakeTier: z.enum(["none", "small", "medium", "high"]).optional(),
  source: z.enum(["local", "erc8004", "all"]).optional().default("all"),
  sortBy: z.enum(["name", "popularity", "stake", "recent"]).optional().default("name"),
  limit: z.coerce.number().min(1).max(100).optional().default(50),
  offset: z.coerce.number().min(0).optional().default(0),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const rawParams = Object.fromEntries(url.searchParams);

  const parseResult = querySchema.safeParse(rawParams);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: "Invalid parameters", details: parseResult.error.issues },
      { status: 400 }
    );
  }

  const params = parseResult.data;
  const network = getDefaultNetwork();
  const chainId = CHAIN_IDS[network];

  // Generate cache key
  const cacheKey = `discovery:services:${JSON.stringify(params)}`;

  // Check cache (5 minute TTL for services)
  const cached = await cache.get<ServicesResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, meta: { ...cached.meta, cached: true } });
  }

  logger.debug("[Discovery/Services] Fetching services", { params });

  const allServices: MarketplaceService[] = [];

  // ========================================================================
  // Fetch from ERC-8004 Registry
  // ========================================================================
  if (params.source === "all" || params.source === "erc8004") {
    const agents = await agent0Service.searchAgentsCached({
      name: params.query,
      mcpTools: params.mcpTools,
      a2aSkills: params.a2aSkills,
      x402Support: params.x402Only,
      active: params.activeOnly,
    });

    for (const agent of agents) {
      // Determine service type based on endpoints
      let type: ServiceType = "agent";
      if (agent.mcpEndpoint && !agent.a2aEndpoint) {
        type = "mcp";
      } else if (!agent.mcpEndpoint && !agent.a2aEndpoint) {
        type = "app";
      }

      // Parse agentId to get tokenId
      const agentIdParts = agent.agentId.split(":");
      const tokenId = agentIdParts.length > 1 ? parseInt(agentIdParts[1], 10) : undefined;

      allServices.push({
        id: agent.agentId,
        name: agent.name,
        description: agent.description ?? "",
        type,
        image: agent.image,
        tags: [...(agent.mcpTools ?? []), ...(agent.a2aSkills ?? [])],
        active: agent.active,
        a2aEndpoint: agent.a2aEndpoint,
        mcpEndpoint: agent.mcpEndpoint,
        mcpTools: agent.mcpTools,
        a2aSkills: agent.a2aSkills,
        x402Support: agent.x402Support,
        chainId,
        tokenId,
        agentId: agent.agentId,
        walletAddress: agent.walletAddress,
        network,
        source: "erc8004",
        pricing: agent.x402Support
          ? { type: "x402", description: "Pay-per-request via x402" }
          : { type: "free", description: "No payment required" },
      });
    }
  }

  // ========================================================================
  // Fetch from Local Marketplace
  // ========================================================================
  if (params.source === "all" || params.source === "local") {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://elizacloud.ai";

    // Local agents
    if (!params.types || params.types.includes("agent")) {
      const characters = await characterMarketplaceService.searchPublic({
        search: params.query,
        category: params.categories?.[0],
        limit: 100,
      });

      for (const char of characters) {
        const bio = Array.isArray(char.bio) ? char.bio.join(" ") : char.bio;

        allServices.push({
          id: char.id,
          name: char.name,
          description: bio,
          type: "agent",
          image: char.avatar_url ?? undefined,
          category: char.category ?? undefined,
          tags: char.tags ?? [],
          active: true,
          a2aEndpoint: `${baseUrl}/api/agents/${char.id}/a2a`,
          mcpEndpoint: `${baseUrl}/api/agents/${char.id}/mcp`,
          x402Support: false,
          verified: false,
          source: "local",
          pricing: char.monetization_enabled
            ? {
                type: "credits",
                description: `${char.inference_markup_percentage}% markup`,
              }
            : { type: "free", description: "Free to use" },
        });
      }
    }

    // Local MCPs
    if (!params.types || params.types.includes("mcp")) {
      const mcps = await userMcpsService.listPublic({
        category: params.categories?.[0],
        search: params.query,
        limit: 100,
      });

      for (const mcp of mcps) {
        allServices.push({
          id: mcp.id,
          name: mcp.name,
          description: mcp.description,
          type: "mcp",
          category: mcp.category,
          tags: mcp.tags ?? [],
          active: mcp.status === "live",
          mcpEndpoint: userMcpsService.getEndpointUrl(mcp, baseUrl),
          mcpTools: mcp.tools.map((t) => t.name),
          x402Support: mcp.x402_enabled,
          verified: mcp.is_verified,
          source: "local",
          pricing:
            mcp.pricing_type === "free"
              ? { type: "free" }
              : mcp.pricing_type === "credits"
                ? { type: "credits", amount: Number(mcp.credits_per_request) }
                : { type: "x402", amount: Number(mcp.x402_price_usd), currency: "USD" },
        });
      }
    }
  }

  // ========================================================================
  // Apply Filters
  // ========================================================================
  let filtered = allServices;

  // Filter by types
  if (params.types?.length) {
    filtered = filtered.filter((s) => params.types!.includes(s.type));
  }

  // Filter by tags
  if (params.tags?.length) {
    filtered = filtered.filter((s) =>
      s.tags.some((tag) =>
        params.tags!.some((pt) => tag.toLowerCase().includes(pt.toLowerCase()))
      )
    );
  }

  // Filter by categories
  if (params.categories?.length) {
    filtered = filtered.filter(
      (s) => s.category && params.categories!.includes(s.category)
    );
  }

  // Filter by x402
  if (params.x402Only) {
    filtered = filtered.filter((s) => s.x402Support);
  }

  // Filter by active
  if (params.activeOnly) {
    filtered = filtered.filter((s) => s.active);
  }

  // Filter by verified
  if (params.verified) {
    filtered = filtered.filter((s) => s.verified);
  }

  // Text search
  if (params.query) {
    const query = params.query.toLowerCase();
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        s.description.toLowerCase().includes(query) ||
        s.tags.some((t) => t.toLowerCase().includes(query))
    );
  }

  // ========================================================================
  // Deduplicate (prefer local over ERC-8004)
  // ========================================================================
  const seen = new Map<string, MarketplaceService>();
  const local = filtered.filter((s) => s.source === "local");
  const erc8004 = filtered.filter((s) => s.source === "erc8004");

  for (const s of local) {
    seen.set(s.name.toLowerCase(), s);
  }
  for (const s of erc8004) {
    if (!seen.has(s.name.toLowerCase())) {
      seen.set(s.name.toLowerCase(), s);
    }
  }

  filtered = Array.from(seen.values());

  // ========================================================================
  // Sort
  // ========================================================================
  switch (params.sortBy) {
    case "name":
      filtered.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "recent":
      // ERC-8004 agents have registeredAt, others go to end
      filtered.sort((a, b) => {
        if (a.registeredAt && b.registeredAt) {
          return new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime();
        }
        return a.registeredAt ? -1 : 1;
      });
      break;
    case "stake":
      const tierOrder = { high: 3, medium: 2, small: 1, none: 0 };
      filtered.sort((a, b) => {
        const aTier = tierOrder[a.stakeTier ?? "none"];
        const bTier = tierOrder[b.stakeTier ?? "none"];
        return bTier - aTier;
      });
      break;
    default:
      filtered.sort((a, b) => a.name.localeCompare(b.name));
  }

  // ========================================================================
  // Build Filter Options
  // ========================================================================
  const typeCount = new Map<ServiceType, number>();
  const categoryCount = new Map<string, number>();
  const tagCount = new Map<string, number>();

  for (const s of filtered) {
    typeCount.set(s.type, (typeCount.get(s.type) ?? 0) + 1);
    if (s.category) {
      categoryCount.set(s.category, (categoryCount.get(s.category) ?? 0) + 1);
    }
    for (const tag of s.tags) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1);
    }
  }

  // ========================================================================
  // Paginate
  // ========================================================================
  const total = filtered.length;
  const paginated = filtered.slice(params.offset, params.offset + params.limit);

  const response: ServicesResponse = {
    services: paginated,
    total,
    hasMore: params.offset + paginated.length < total,
    pagination: {
      limit: params.limit,
      offset: params.offset,
    },
    filters: {
      types: Array.from(typeCount.entries())
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      categories: Array.from(categoryCount.entries())
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count),
      tags: Array.from(tagCount.entries())
        .map(([tag, count]) => ({ tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50),
    },
    meta: {
      network,
      chainId,
      cached: false,
      lastUpdated: new Date().toISOString(),
    },
  };

  // Cache for 5 minutes
  await cache.set(cacheKey, response, CacheTTL.erc8004.discovery);

  return NextResponse.json(response);
}

