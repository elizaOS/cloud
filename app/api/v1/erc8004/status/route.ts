/**
 * ERC-8004 Registration Status Endpoint
 *
 * Provides status information about ERC-8004 registration for
 * agents and MCPs, as well as overall configuration status.
 * Supports multi-registry (Jeju + Base) configuration.
 *
 * GET /api/v1/erc8004/status - Get overall ERC-8004 status
 * GET /api/v1/erc8004/status?agentId=xxx - Get specific agent status
 * GET /api/v1/erc8004/status?mcpId=xxx - Get specific MCP status
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters/characters";
import { userMcpsService } from "@/lib/services/user-mcps";
import { agent0Service } from "@/lib/services/agent0";
import {
  getDefaultNetwork,
  getFallbackNetwork,
  getNetworkEcosystem,
  isERC8004Configured,
  isAgentRegistered,
  isMultiRegistryEnabled,
  isBatchRegistrationAvailable,
  isGasSponsored,
  getContractAddresses,
  getSearchNetworks,
  ELIZA_CLOUD_AGENT_ID,
  SERVICE_INFO,
  BLOCK_EXPLORERS,
  JEJU_NETWORKS,
  BASE_NETWORKS,
  SUPPORTED_NETWORKS,
} from "@/lib/config/erc8004";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const agentId = url.searchParams.get("agentId");
  const mcpId = url.searchParams.get("mcpId");

  const network = getDefaultNetwork();
  const contracts = getContractAddresses(network);
  const blockExplorer = BLOCK_EXPLORERS[network];

  // If checking specific agent status
  if (agentId) {
    const authResult = await requireAuthOrApiKeyWithOrg(request);

    const character = await charactersService.getById(agentId);
    if (!character) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Verify ownership
    if (character.user_id !== authResult.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const onChainAgent = character.erc8004_agent_id
      ? await agent0Service.getAgentCached(
          `${contracts.chainId}:${character.erc8004_agent_id}`,
        )
      : null;

    return NextResponse.json({
      type: "agent",
      id: agentId,
      name: character.name,
      isPublic: character.is_public,
      erc8004: {
        registered: character.erc8004_registered,
        network: character.erc8004_network,
        agentId: character.erc8004_agent_id
          ? `${contracts.chainId}:${character.erc8004_agent_id}`
          : null,
        agentUri: character.erc8004_agent_uri,
        registeredAt: character.erc8004_registered_at,
        blockExplorerUrl: character.erc8004_agent_id
          ? `${blockExplorer}/token/${contracts.identity}?a=${character.erc8004_agent_id}`
          : null,
        onChainStatus: onChainAgent
          ? {
              active: onChainAgent.active,
              name: onChainAgent.name,
              a2aEndpoint: onChainAgent.a2aEndpoint,
              mcpEndpoint: onChainAgent.mcpEndpoint,
            }
          : null,
      },
      protocols: {
        a2aEnabled: character.a2a_enabled,
        mcpEnabled: character.mcp_enabled,
      },
      monetization: {
        enabled: character.monetization_enabled,
        markupPercentage: character.inference_markup_percentage,
      },
    });
  }

  // If checking specific MCP status
  if (mcpId) {
    const authResult = await requireAuthOrApiKeyWithOrg(request);

    const mcp = await userMcpsService.getById(mcpId);
    if (!mcp) {
      return NextResponse.json({ error: "MCP not found" }, { status: 404 });
    }

    // Verify ownership
    if (mcp.organization_id !== authResult.user.organization_id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const onChainAgent = mcp.erc8004_agent_id
      ? await agent0Service.getAgentCached(
          `${contracts.chainId}:${mcp.erc8004_agent_id}`,
        )
      : null;

    return NextResponse.json({
      type: "mcp",
      id: mcpId,
      name: mcp.name,
      status: mcp.status,
      erc8004: {
        registered: mcp.erc8004_registered,
        network: mcp.erc8004_network,
        agentId: mcp.erc8004_agent_id
          ? `${contracts.chainId}:${mcp.erc8004_agent_id}`
          : null,
        agentUri: mcp.erc8004_agent_uri,
        registeredAt: mcp.erc8004_registered_at,
        blockExplorerUrl: mcp.erc8004_agent_id
          ? `${blockExplorer}/token/${contracts.identity}?a=${mcp.erc8004_agent_id}`
          : null,
        onChainStatus: onChainAgent
          ? {
              active: onChainAgent.active,
              name: onChainAgent.name,
              mcpEndpoint: onChainAgent.mcpEndpoint,
              tools: onChainAgent.mcpTools,
            }
          : null,
      },
      pricing: {
        type: mcp.pricing_type,
        creditsPerRequest: mcp.credits_per_request,
        x402Enabled: mcp.x402_enabled,
      },
    });
  }

  // Overall ERC-8004 status
  const elizaCloudAgentId = ELIZA_CLOUD_AGENT_ID[network];
  const selfAgent = elizaCloudAgentId
    ? await agent0Service.getAgentCached(
        `${contracts.chainId}:${elizaCloudAgentId}`,
      )
    : null;

  // Get status for all networks
  const networkStatuses = SUPPORTED_NETWORKS.map((net) => {
    const netContracts = getContractAddresses(net);
    const agentId = ELIZA_CLOUD_AGENT_ID[net];
    return {
      network: net,
      ecosystem: getNetworkEcosystem(net),
      chainId: netContracts.chainId,
      configured: isERC8004Configured(net),
      registered: isAgentRegistered(net),
      agentId: agentId ? `${netContracts.chainId}:${agentId}` : null,
    };
  });

  return NextResponse.json({
    service: SERVICE_INFO.name,
    version: SERVICE_INFO.version,

    // Current network
    network: {
      current: network,
      fallback: getFallbackNetwork(),
      ecosystem: getNetworkEcosystem(network),
    },

    configured: isERC8004Configured(network),
    elizaCloudRegistered: isAgentRegistered(network),

    // Multi-registry support
    multiRegistry: {
      enabled: isMultiRegistryEnabled(),
      batchRegistration: isBatchRegistrationAvailable(),
      gasSponsored: isGasSponsored(),
      searchNetworks: getSearchNetworks(),
      ecosystems: {
        jeju: {
          networks: JEJU_NETWORKS,
          configured: JEJU_NETWORKS.some((n) => isERC8004Configured(n)),
          registered: JEJU_NETWORKS.some((n) => isAgentRegistered(n)),
        },
        base: {
          networks: BASE_NETWORKS,
          configured: BASE_NETWORKS.some((n) => isERC8004Configured(n)),
          registered: BASE_NETWORKS.some((n) => isAgentRegistered(n)),
        },
      },
      networkStatuses,
    },

    contracts: {
      chainId: contracts.chainId,
      identity: contracts.identity,
      reputation: contracts.reputation,
      validation: contracts.validation,
      subgraphUrl: contracts.subgraphUrl,
      blockExplorer,
    },

    elizaCloud: {
      agentId: elizaCloudAgentId
        ? `${contracts.chainId}:${elizaCloudAgentId}`
        : null,
      onChainStatus: selfAgent
        ? {
            active: selfAgent.active,
            name: selfAgent.name,
            a2aEndpoint: selfAgent.a2aEndpoint,
            mcpEndpoint: selfAgent.mcpEndpoint,
            x402Support: selfAgent.x402Support,
          }
        : null,
    },

    capabilities: {
      agentRegistration: isERC8004Configured(network),
      mcpRegistration: isERC8004Configured(network),
      multiChainRegistration: isMultiRegistryEnabled(),
      discovery: true,
      multiRegistrySearch: agent0Service.isMultiRegistryEnabled(),
      subgraphAvailable: !!contracts.subgraphUrl,
    },

    endpoints: {
      discovery: "/api/v1/discovery",
      proxy: "/api/v1/discovery/proxy",
      agentPublish: "/api/v1/agents/{agentId}/publish",
      mcpPublish: "/api/v1/mcps/{mcpId}/publish",
    },

    documentation: "https://eips.ethereum.org/EIPS/eip-8004",
  });
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}
