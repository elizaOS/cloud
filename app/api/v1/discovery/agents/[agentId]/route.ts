/**
 * Agent Detail API
 *
 * Returns detailed information about a specific ERC-8004 registered agent.
 *
 * @route GET /api/v1/discovery/agents/:agentId
 */

import { NextRequest, NextResponse } from "next/server";
import { agent0Service } from "@/lib/services/agent0";
import { cache } from "@/lib/cache/client";
import { CacheTTL } from "@/lib/cache/keys";
import { logger } from "@/lib/utils/logger";
import { getDefaultNetwork, CHAIN_IDS, BLOCK_EXPLORERS, getContractAddresses, type ERC8004Network } from "@/lib/config/erc8004";
import { isValidAgentId, parseAgentId } from "@/lib/types/erc8004";

// ============================================================================
// Types
// ============================================================================

interface AgentDetailResponse {
  /** Agent ID in format chainId:tokenId */
  agentId: string;
  /** Parsed token ID */
  tokenId: number;
  /** Chain ID where registered */
  chainId: number;
  /** Network name */
  network: string;
  /** Human-readable name */
  name: string;
  /** Description */
  description?: string;
  /** Image/avatar URL */
  image?: string;
  /** Service type */
  type: "agent" | "mcp" | "app";
  /** Category */
  category?: string;
  /** Tags for filtering */
  tags: string[];
  /** Whether service is active */
  active: boolean;

  // Endpoints
  endpoints: {
    a2a?: string;
    mcp?: string;
    registration?: string;
  };

  // Capabilities
  capabilities: {
    mcpTools: string[];
    a2aSkills: string[];
    supportsStreaming?: boolean;
    supportsWebhooks?: boolean;
  };

  // Payment
  payment: {
    x402Support: boolean;
    walletAddress?: string;
    acceptedTokens?: string[];
  };

  // Trust & Reputation
  trust: {
    stakeTier?: "none" | "small" | "medium" | "high";
    stakeAmount?: string;
    verified?: boolean;
    teeAttested?: boolean;
  };

  // Metadata
  metadata: {
    registeredAt?: string;
    lastActivityAt?: string;
    version?: string;
  };

  // Links
  links: {
    blockExplorer: string;
    tokenURI?: string;
  };
}

// ============================================================================
// Route Handler
// ============================================================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { agentId } = await params;

  // Validate agentId format
  if (!agentId || !isValidAgentId(agentId)) {
    return NextResponse.json(
      { error: "Invalid agent ID format. Expected: chainId:tokenId (e.g., 8453:123)" },
      { status: 400 }
    );
  }

  const cacheKey = `discovery:agent:${agentId}`;

  // Check cache (1 hour TTL for individual agent details)
  const cached = await cache.get<AgentDetailResponse>(cacheKey);
  if (cached) {
    return NextResponse.json({ ...cached, cached: true });
  }

  logger.debug("[Discovery/Agent] Fetching agent details", { agentId });

  // Fetch from agent0 service
  const agent = await agent0Service.getAgentCached(agentId);

  if (!agent) {
    return NextResponse.json(
      { error: "Agent not found", agentId },
      { status: 404 }
    );
  }

  const parsed = parseAgentId(agentId);
  const network = getDefaultNetwork();
  const chainId = parsed?.chainId ?? CHAIN_IDS[network];
  const blockExplorerBase = BLOCK_EXPLORERS[network] ?? "";

  // Determine service type
  let type: "agent" | "mcp" | "app" = "agent";
  if (agent.mcpEndpoint && !agent.a2aEndpoint) {
    type = "mcp";
  } else if (!agent.mcpEndpoint && !agent.a2aEndpoint) {
    type = "app";
  }

  const response: AgentDetailResponse = {
    agentId: agent.agentId,
    tokenId: parsed?.tokenId ?? 0,
    chainId,
    network,
    name: agent.name,
    description: agent.description,
    image: agent.image,
    type,
    category: inferCategory(agent),
    tags: [...(agent.mcpTools ?? []), ...(agent.a2aSkills ?? [])],
    active: agent.active,

    endpoints: {
      a2a: agent.a2aEndpoint,
      mcp: agent.mcpEndpoint,
    },

    capabilities: {
      mcpTools: agent.mcpTools ?? [],
      a2aSkills: agent.a2aSkills ?? [],
    },

    payment: {
      x402Support: agent.x402Support,
      walletAddress: agent.walletAddress,
    },

    trust: {
      // These would come from on-chain data if available
      verified: false,
    },

    metadata: {},

    links: {
      blockExplorer: `${blockExplorerBase}/token/${getRegistryAddress(network)}?a=${parsed?.tokenId ?? 0}`,
    },
  };

  // Cache for 1 hour
  await cache.set(cacheKey, response, CacheTTL.erc8004.agent);

  return NextResponse.json(response);
}

// ============================================================================
// Helpers
// ============================================================================

function inferCategory(agent: {
  mcpTools?: string[];
  a2aSkills?: string[];
  name: string;
  description?: string;
}): string {
  const allTerms = [
    ...(agent.mcpTools ?? []),
    ...(agent.a2aSkills ?? []),
    agent.name.toLowerCase(),
    (agent.description ?? "").toLowerCase(),
  ].join(" ").toLowerCase();

  if (allTerms.includes("chat") || allTerms.includes("llm") || allTerms.includes("inference")) {
    return "ai";
  }
  if (allTerms.includes("swap") || allTerms.includes("trade") || allTerms.includes("defi")) {
    return "defi";
  }
  if (allTerms.includes("game") || allTerms.includes("npc")) {
    return "gaming";
  }
  if (allTerms.includes("storage") || allTerms.includes("ipfs")) {
    return "storage";
  }

  return "utilities";
}

function getRegistryAddress(network: string): string {
  const contracts = getContractAddresses(network as ERC8004Network);
  return contracts.identity;
}

