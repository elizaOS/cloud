/**
 * ERC-8004 Discovery Types
 *
 * Types for the unified discovery API that combines local marketplace
 * services with ERC-8004 registered external services.
 */

import type { ERC8004Network } from "@/lib/config/erc8004";

// ============================================================================
// Service Types
// ============================================================================

/**
 * Type of service in the discovery results
 */
export type ServiceType = "agent" | "mcp" | "a2a" | "app";

/**
 * Source of the discovered service
 */
export type ServiceSource = "local" | "erc8004";

/**
 * Pricing model for the service
 */
export interface ServicePricing {
  type: "free" | "credits" | "x402" | "subscription";
  amount?: number;
  currency?: string;
  description?: string;
}

/**
 * Unified representation of a discovered service
 *
 * This normalizes services from both local (Eliza Cloud) and
 * external (ERC-8004 registry) sources into a consistent format.
 */
export interface DiscoveredService {
  /** Unique identifier (format varies by source) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Service description */
  description: string;

  /** Type of service */
  type: ServiceType;

  /** Where the service was discovered */
  source: ServiceSource;

  /** Image/avatar URL */
  image?: string;

  /** Service category */
  category?: string;

  /** Tags for filtering */
  tags: string[];

  /** Whether the service is active */
  active: boolean;

  /** Pricing information */
  pricing?: ServicePricing;

  // =========================================================================
  // Endpoints
  // =========================================================================

  /** A2A endpoint URL */
  a2aEndpoint?: string;

  /** MCP endpoint URL */
  mcpEndpoint?: string;

  // =========================================================================
  // Capabilities
  // =========================================================================

  /** MCP tools/capabilities offered */
  mcpTools?: string[];

  /** A2A skills offered */
  a2aSkills?: string[];

  /** Whether x402 payment is supported */
  x402Support: boolean;

  // =========================================================================
  // ERC-8004 Specific
  // =========================================================================

  /** Network where registered (ERC-8004 services only) */
  network?: ERC8004Network;

  /** Chain ID (ERC-8004 services only) */
  chainId?: number;

  /** Token ID on the Identity Registry (ERC-8004 services only) */
  tokenId?: number;

  /** Wallet address (ERC-8004 services only) */
  walletAddress?: string;

  /** Agent ID in format "chainId:tokenId" (ERC-8004 services only) */
  agentId?: string;

  // =========================================================================
  // Local Service Specific
  // =========================================================================

  /** Organization ID (local services only) */
  organizationId?: string;

  /** Creator/user ID (local services only) */
  creatorId?: string;

  /** Whether the creator is verified (local services only) */
  verified?: boolean;

  /** Slug for URL (local services only) */
  slug?: string;
}

// ============================================================================
// Search/Filter Types
// ============================================================================

/**
 * Filters for discovering services
 */
export interface DiscoveryFilters {
  /** Search query (matches name, description) */
  query?: string;

  /** Filter by service type */
  types?: ServiceType[];

  /** Filter by source */
  sources?: ServiceSource[];

  /** Filter by category */
  categories?: string[];

  /** Filter by tags */
  tags?: string[];

  /** Filter by MCP tools */
  mcpTools?: string[];

  /** Filter by A2A skills */
  a2aSkills?: string[];

  /** Only return services with x402 support */
  x402Only?: boolean;

  /** Only return active services */
  activeOnly?: boolean;

  /** Only return verified creators (local only) */
  verifiedOnly?: boolean;

  /** Network to search (ERC-8004 only, defaults to current network) */
  network?: ERC8004Network;
}

/**
 * Pagination options
 */
export interface DiscoveryPagination {
  limit?: number;
  offset?: number;
}

/**
 * Sort options
 */
export interface DiscoverySort {
  field: "name" | "created" | "popularity";
  direction: "asc" | "desc";
}

/**
 * Discovery request parameters
 */
export interface DiscoveryRequest {
  filters?: DiscoveryFilters;
  pagination?: DiscoveryPagination;
  sort?: DiscoverySort;
}

/**
 * Discovery response
 */
export interface DiscoveryResponse {
  services: DiscoveredService[];
  total: number;
  hasMore: boolean;
  pagination: {
    limit: number;
    offset: number;
  };
  /** Cache status for debugging */
  cached?: boolean;
}

// ============================================================================
// Conversion Utilities
// ============================================================================

/**
 * Convert an Agent0 agent to a DiscoveredService
 */
export function agent0ToDiscoveredService(
  agent: {
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
  },
  network: ERC8004Network,
  chainId: number
): DiscoveredService {
  // Parse agentId to get tokenId
  const [, tokenIdStr] = agent.agentId.split(":");
  const tokenId = parseInt(tokenIdStr, 10);

  // Determine service type based on endpoints
  let type: ServiceType = "agent";
  if (agent.mcpEndpoint && !agent.a2aEndpoint) {
    type = "mcp";
  } else if (agent.a2aEndpoint && !agent.mcpEndpoint) {
    type = "a2a";
  }

  return {
    id: agent.agentId,
    name: agent.name,
    description: agent.description ?? "",
    type,
    source: "erc8004",
    image: agent.image,
    tags: [],
    active: agent.active,
    a2aEndpoint: agent.a2aEndpoint,
    mcpEndpoint: agent.mcpEndpoint,
    mcpTools: agent.mcpTools,
    a2aSkills: agent.a2aSkills,
    x402Support: agent.x402Support,
    network,
    chainId,
    tokenId: isNaN(tokenId) ? undefined : tokenId,
    walletAddress: agent.walletAddress,
    agentId: agent.agentId,
    pricing: agent.x402Support
      ? { type: "x402", description: "Pay-per-request via x402" }
      : { type: "free", description: "Free to use" },
  };
}


