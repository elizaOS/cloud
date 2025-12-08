/**
 * User MCPs Service
 *
 * Manages user-created MCP servers with monetization support.
 * Handles CRUD, revenue distribution, discovery, and ERC-8004 registration.
 */

import {
  userMcpsRepository,
  mcpUsageRepository,
  type UserMcp,
  type NewUserMcp,
  type McpUsage,
} from "@/db/repositories";
import { creditsService } from "./credits";
import { containersService } from "./containers";
import { redeemableEarningsService } from "./redeemable-earnings";
import { agentRegistryService } from "./agent-registry";
import { agent0Service } from "./agent0";
import { logger } from "@/lib/utils/logger";
import { getDefaultNetwork, type ERC8004Network } from "@/lib/config/erc8004";

// ============================================================================
// Types
// ============================================================================

export interface CreateMcpParams {
  name: string;
  slug: string;
  description: string;
  organizationId: string;
  userId: string;
  category?: string;
  endpointType?: "container" | "external";
  containerId?: string;
  externalEndpoint?: string;
  endpointPath?: string;
  transportType?: "http" | "sse" | "streamable-http";
  tools?: Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    cost?: string;
  }>;
  pricingType?: "free" | "credits" | "x402";
  creditsPerRequest?: number;
  x402PriceUsd?: number;
  x402Enabled?: boolean;
  creatorSharePercentage?: number;
  documentationUrl?: string;
  sourceCodeUrl?: string;
  supportEmail?: string;
  tags?: string[];
  icon?: string;
  color?: string;
}

export interface UpdateMcpParams {
  name?: string;
  description?: string;
  version?: string;
  category?: string;
  endpointPath?: string;
  transportType?: "http" | "sse" | "streamable-http";
  tools?: Array<{
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
    cost?: string;
  }>;
  pricingType?: "free" | "credits" | "x402";
  creditsPerRequest?: number;
  x402PriceUsd?: number;
  x402Enabled?: boolean;
  creatorSharePercentage?: number;
  documentationUrl?: string;
  sourceCodeUrl?: string;
  supportEmail?: string;
  tags?: string[];
  icon?: string;
  color?: string;
  isPublic?: boolean;
}

export interface UseMcpParams {
  mcpId: string;
  organizationId: string;
  userId?: string;
  toolName: string;
  paymentType: "credits" | "x402";
  metadata?: Record<string, unknown>;
}

export interface UseMcpResult {
  success: boolean;
  creditsCharged: number;
  x402AmountUsd: number;
  creatorEarnings: number;
  platformEarnings: number;
  usageId: string;
}

// ============================================================================
// Service
// ============================================================================

class UserMcpsService {
  /**
   * Create a new user MCP
   */
  async create(params: CreateMcpParams): Promise<UserMcp> {
    // Validate container exists if using container endpoint
    if (params.endpointType === "container" && params.containerId) {
      const container = await containersService.getById(params.containerId);
      if (!container) {
        throw new Error("Container not found");
      }
      if (container.organization_id !== params.organizationId) {
        throw new Error("Container does not belong to this organization");
      }
    }

    // Check slug uniqueness
    const existing = await userMcpsRepository.getBySlug(
      params.slug,
      params.organizationId
    );
    if (existing) {
      throw new Error(`MCP with slug "${params.slug}" already exists`);
    }

    const mcp = await userMcpsRepository.create({
      name: params.name,
      slug: params.slug,
      description: params.description,
      organization_id: params.organizationId,
      created_by_user_id: params.userId,
      category: params.category ?? "utilities",
      endpoint_type: params.endpointType ?? "container",
      container_id: params.containerId,
      external_endpoint: params.externalEndpoint,
      endpoint_path: params.endpointPath ?? "/mcp",
      transport_type: params.transportType ?? "streamable-http",
      tools: params.tools ?? [],
      pricing_type: params.pricingType ?? "credits",
      credits_per_request: params.creditsPerRequest?.toString() ?? "1.0000",
      x402_price_usd: params.x402PriceUsd?.toString() ?? "0.000100",
      x402_enabled: params.x402Enabled ?? false,
      creator_share_percentage:
        params.creatorSharePercentage?.toString() ?? "80.00",
      platform_share_percentage: (
        100 - (params.creatorSharePercentage ?? 80)
      ).toString(),
      documentation_url: params.documentationUrl,
      source_code_url: params.sourceCodeUrl,
      support_email: params.supportEmail,
      tags: params.tags ?? [],
      icon: params.icon ?? "puzzle",
      color: params.color ?? "#6366F1",
      status: "draft",
      is_public: true,
    });

    logger.info("[UserMcps] Created MCP", {
      id: mcp.id,
      name: mcp.name,
      slug: mcp.slug,
    });

    return mcp;
  }

  /**
   * Get MCP by ID
   */
  async getById(id: string): Promise<UserMcp | null> {
    return userMcpsRepository.getById(id);
  }

  /**
   * Get MCP by slug and organization
   */
  async getBySlug(
    slug: string,
    organizationId: string
  ): Promise<UserMcp | null> {
    return userMcpsRepository.getBySlug(slug, organizationId);
  }

  /**
   * List MCPs by organization
   */
  async listByOrganization(
    organizationId: string,
    options?: {
      status?: UserMcp["status"];
      limit?: number;
      offset?: number;
    }
  ): Promise<UserMcp[]> {
    return userMcpsRepository.listByOrganization(organizationId, options);
  }

  /**
   * List public MCPs (for registry)
   */
  async listPublic(options?: {
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<UserMcp[]> {
    return userMcpsRepository.listPublic({ ...options, status: "live" });
  }

  /**
   * Update an MCP
   */
  async update(
    id: string,
    organizationId: string,
    params: UpdateMcpParams
  ): Promise<UserMcp> {
    const mcp = await userMcpsRepository.getById(id);
    if (!mcp) {
      throw new Error("MCP not found");
    }
    if (mcp.organization_id !== organizationId) {
      throw new Error("Unauthorized");
    }

    const updateData: Partial<UserMcp> = {};

    if (params.name !== undefined) updateData.name = params.name;
    if (params.description !== undefined)
      updateData.description = params.description;
    if (params.version !== undefined) updateData.version = params.version;
    if (params.category !== undefined) updateData.category = params.category;
    if (params.endpointPath !== undefined)
      updateData.endpoint_path = params.endpointPath;
    if (params.transportType !== undefined)
      updateData.transport_type = params.transportType;
    if (params.tools !== undefined) updateData.tools = params.tools;
    if (params.pricingType !== undefined)
      updateData.pricing_type = params.pricingType;
    if (params.creditsPerRequest !== undefined)
      updateData.credits_per_request = params.creditsPerRequest.toString();
    if (params.x402PriceUsd !== undefined)
      updateData.x402_price_usd = params.x402PriceUsd.toString();
    if (params.x402Enabled !== undefined)
      updateData.x402_enabled = params.x402Enabled;
    if (params.creatorSharePercentage !== undefined) {
      updateData.creator_share_percentage =
        params.creatorSharePercentage.toString();
      updateData.platform_share_percentage = (
        100 - params.creatorSharePercentage
      ).toString();
    }
    if (params.documentationUrl !== undefined)
      updateData.documentation_url = params.documentationUrl;
    if (params.sourceCodeUrl !== undefined)
      updateData.source_code_url = params.sourceCodeUrl;
    if (params.supportEmail !== undefined)
      updateData.support_email = params.supportEmail;
    if (params.tags !== undefined) updateData.tags = params.tags;
    if (params.icon !== undefined) updateData.icon = params.icon;
    if (params.color !== undefined) updateData.color = params.color;
    if (params.isPublic !== undefined) updateData.is_public = params.isPublic;

    const updated = await userMcpsRepository.update(id, updateData);
    if (!updated) {
      throw new Error("Failed to update MCP");
    }

    logger.info("[UserMcps] Updated MCP", { id, updates: Object.keys(params) });

    return updated;
  }

  /**
   * Publish an MCP (make it live)
   *
   * If registerOnChain is true, the MCP will also be registered on
   * the ERC-8004 Identity Registry, making it discoverable by other
   * AI agents across the ecosystem.
   */
  async publish(
    id: string,
    organizationId: string,
    options?: {
      registerOnChain?: boolean;
      network?: ERC8004Network;
    }
  ): Promise<UserMcp> {
    const mcp = await userMcpsRepository.getById(id);
    if (!mcp) {
      throw new Error("MCP not found");
    }
    if (mcp.organization_id !== organizationId) {
      throw new Error("Unauthorized");
    }

    // Validate MCP is ready to publish
    if (!mcp.name || !mcp.description) {
      throw new Error("MCP must have a name and description");
    }
    if (mcp.tools.length === 0) {
      throw new Error("MCP must have at least one tool defined");
    }
    if (
      mcp.endpoint_type === "container" &&
      !mcp.container_id
    ) {
      throw new Error("Container MCP must have a container assigned");
    }
    if (
      mcp.endpoint_type === "external" &&
      !mcp.external_endpoint
    ) {
      throw new Error("External MCP must have an endpoint URL");
    }

    let updated = await userMcpsRepository.updateStatus(id, "live");
    if (!updated) {
      throw new Error("Failed to publish MCP");
    }

    // Register on ERC-8004 if requested and not already registered
    const shouldRegister = options?.registerOnChain ?? false;
    if (shouldRegister && !mcp.erc8004_registered) {
      const network = options?.network ?? getDefaultNetwork();

      logger.info("[UserMcps] Registering MCP on ERC-8004", {
        id,
        name: mcp.name,
        network,
      });

      const registrationResult = await agentRegistryService.registerMCP({
        mcp: updated,
        network,
      });

      if (registrationResult.success) {
        // Parse the token ID from agentId (format: "chainId:tokenId")
        const tokenId = parseInt(registrationResult.agentId.split(":")[1], 10);

        // Update MCP with ERC-8004 registration data
        updated = await userMcpsRepository.update(id, {
          erc8004_registered: true,
          erc8004_network: network,
          erc8004_agent_id: isNaN(tokenId) ? null : tokenId,
          erc8004_agent_uri: registrationResult.agentUri,
          erc8004_registered_at: new Date(),
        });

        // Invalidate ERC-8004 cache since we added a new entry
        await agent0Service.invalidateCache();

        logger.info("[UserMcps] MCP registered on ERC-8004", {
          id,
          agentId: registrationResult.agentId,
          agentUri: registrationResult.agentUri,
        });
      } else {
        logger.warn("[UserMcps] ERC-8004 registration failed, MCP still published", {
          id,
          name: mcp.name,
        });
      }
    }

    logger.info("[UserMcps] Published MCP", {
      id,
      name: mcp.name,
      erc8004Registered: updated?.erc8004_registered ?? false,
    });

    return updated!;
  }

  /**
   * Unpublish an MCP
   */
  async unpublish(id: string, organizationId: string): Promise<UserMcp> {
    const mcp = await userMcpsRepository.getById(id);
    if (!mcp) {
      throw new Error("MCP not found");
    }
    if (mcp.organization_id !== organizationId) {
      throw new Error("Unauthorized");
    }

    const updated = await userMcpsRepository.updateStatus(id, "draft");
    if (!updated) {
      throw new Error("Failed to unpublish MCP");
    }

    logger.info("[UserMcps] Unpublished MCP", { id });

    return updated;
  }

  /**
   * Delete an MCP
   */
  async delete(id: string, organizationId: string): Promise<void> {
    const mcp = await userMcpsRepository.getById(id);
    if (!mcp) {
      throw new Error("MCP not found");
    }
    if (mcp.organization_id !== organizationId) {
      throw new Error("Unauthorized");
    }

    await userMcpsRepository.delete(id);

    logger.info("[UserMcps] Deleted MCP", { id });
  }

  /**
   * Record MCP usage and distribute revenue
   */
  async recordUsage(params: UseMcpParams): Promise<UseMcpResult> {
    const mcp = await userMcpsRepository.getById(params.mcpId);
    if (!mcp) {
      throw new Error("MCP not found");
    }

    // Calculate charges and revenue split
    let creditsCharged = 0;
    let x402AmountUsd = 0;

    if (params.paymentType === "credits") {
      creditsCharged = Number(mcp.credits_per_request);
    } else {
      x402AmountUsd = Number(mcp.x402_price_usd);
      // Convert x402 USD to credits (assuming 100 credits = $1)
      creditsCharged = x402AmountUsd * 100;
    }

    const creatorSharePct = Number(mcp.creator_share_percentage) / 100;
    const platformSharePct = Number(mcp.platform_share_percentage) / 100;

    const creatorEarnings = creditsCharged * creatorSharePct;
    const platformEarnings = creditsCharged * platformSharePct;

    // Charge the consumer
    if (params.paymentType === "credits" && creditsCharged > 0) {
      const deductResult = await creditsService.deductCredits({
        organizationId: params.organizationId,
        amount: creditsCharged,
        description: `MCP: ${mcp.name} - ${params.toolName}`,
        metadata: {
          mcp_id: mcp.id,
          mcp_name: mcp.name,
          tool_name: params.toolName,
          creator_org_id: mcp.organization_id,
        },
      });

      if (!deductResult.success) {
        throw new Error("Insufficient credits");
      }
    }

    // Credit the creator's organization credits (for platform operations)
    if (creatorEarnings > 0) {
      await creditsService.addCredits({
        organizationId: mcp.organization_id,
        amount: creatorEarnings,
        description: `MCP Revenue: ${mcp.name} - ${params.toolName}`,
        metadata: {
          mcp_id: mcp.id,
          consumer_org_id: params.organizationId,
          tool_name: params.toolName,
          payment_type: params.paymentType,
        },
      });

      // CRITICAL: Also credit the creator's redeemable_earnings for token redemption
      if (mcp.created_by_user_id) {
        const result = await redeemableEarningsService.addEarnings({
          userId: mcp.created_by_user_id,
          amount: creatorEarnings / 100, // Convert credits to dollars (100 credits = $1)
          source: "mcp",
          sourceId: mcp.id,
          description: `MCP earnings: ${mcp.name} - ${params.toolName}`,
          metadata: {
            mcpId: mcp.id,
            mcpName: mcp.name,
            toolName: params.toolName,
            consumerOrgId: params.organizationId,
            paymentType: params.paymentType,
            creditsEarned: creatorEarnings,
          },
        });

        if (!result.success) {
          logger.error("[UserMcps] Failed to credit redeemable earnings", {
            mcpId: mcp.id,
            creatorId: mcp.created_by_user_id,
            error: result.error,
          });
        }
      }
    }

    // Record usage
    const usage = await mcpUsageRepository.create({
      mcp_id: params.mcpId,
      organization_id: params.organizationId,
      user_id: params.userId,
      tool_name: params.toolName,
      request_count: 1,
      credits_charged: creditsCharged.toString(),
      x402_amount_usd: x402AmountUsd.toString(),
      payment_type: params.paymentType,
      creator_earnings: creatorEarnings.toString(),
      platform_earnings: platformEarnings.toString(),
      metadata: params.metadata ?? {},
    });

    // Update MCP stats
    await userMcpsRepository.incrementUsage(
      params.mcpId,
      creatorEarnings,
      x402AmountUsd
    );

    logger.info("[UserMcps] Recorded usage", {
      mcpId: params.mcpId,
      toolName: params.toolName,
      creditsCharged,
      creatorEarnings,
    });

    return {
      success: true,
      creditsCharged,
      x402AmountUsd,
      creatorEarnings,
      platformEarnings,
      usageId: usage.id,
    };
  }

  /**
   * Get usage stats for an MCP
   */
  async getStats(
    mcpId: string,
    organizationId: string
  ): Promise<{
    totalRequests: number;
    totalCreditsEarned: number;
    totalX402EarnedUsd: number;
    uniqueUsers: number;
  }> {
    const mcp = await userMcpsRepository.getById(mcpId);
    if (!mcp) {
      throw new Error("MCP not found");
    }
    if (mcp.organization_id !== organizationId) {
      throw new Error("Unauthorized");
    }

    return mcpUsageRepository.getStats(mcpId);
  }

  /**
   * Get the full endpoint URL for an MCP
   */
  getEndpointUrl(mcp: UserMcp, baseUrl: string): string {
    if (mcp.endpoint_type === "external" && mcp.external_endpoint) {
      return mcp.external_endpoint;
    }

    // Container endpoint - would need to look up container URL
    if (mcp.endpoint_type === "container" && mcp.container_id) {
      // Container URL would be constructed from container's load_balancer_url
      return `${baseUrl}/api/mcp/proxy/${mcp.id}${mcp.endpoint_path ?? "/mcp"}`;
    }

    return `${baseUrl}/api/mcp/user/${mcp.slug}`;
  }

  /**
   * Convert UserMcp to registry format
   */
  toRegistryFormat(
    mcp: UserMcp,
    baseUrl: string
  ): {
    id: string;
    name: string;
    description: string;
    category: string;
    endpoint: string;
    type: "http" | "sse" | "streamable-http";
    version: string;
    status: "live" | "coming_soon" | "maintenance";
    icon: string;
    color: string;
    toolCount: number;
    features: string[];
    pricing: {
      type: "free" | "credits" | "x402";
      description: string;
      pricePerRequest?: string;
    };
    x402Enabled: boolean;
    documentation?: string;
    creator: {
      organizationId: string;
      verified: boolean;
    };
    configTemplate: {
      servers: Record<
        string,
        {
          type: "http" | "sse" | "streamable-http";
          url: string;
        }
      >;
    };
  } {
    const endpoint = this.getEndpointUrl(mcp, baseUrl);

    let pricingDescription = "Free to use";
    if (mcp.pricing_type === "credits") {
      pricingDescription = `${mcp.credits_per_request} credits per request`;
    } else if (mcp.pricing_type === "x402") {
      pricingDescription = `$${mcp.x402_price_usd} per request`;
    }

    return {
      id: `user-${mcp.id}`,
      name: mcp.name,
      description: mcp.description,
      category: mcp.category,
      endpoint,
      type: mcp.transport_type as "http" | "sse" | "streamable-http",
      version: mcp.version,
      status: mcp.status === "live" ? "live" : "coming_soon",
      icon: mcp.icon ?? "puzzle",
      color: mcp.color ?? "#6366F1",
      toolCount: mcp.tools.length,
      features: mcp.tools.map((t) => t.name),
      pricing: {
        type: mcp.pricing_type ?? "free",
        description: pricingDescription,
        pricePerRequest:
          mcp.pricing_type === "credits"
            ? mcp.credits_per_request?.toString()
            : mcp.pricing_type === "x402"
              ? mcp.x402_price_usd?.toString()
              : undefined,
      },
      x402Enabled: mcp.x402_enabled,
      documentation: mcp.documentation_url ?? undefined,
      creator: {
        organizationId: mcp.organization_id,
        verified: mcp.is_verified,
      },
      configTemplate: {
        servers: {
          [mcp.slug]: {
            type: mcp.transport_type as "http" | "sse" | "streamable-http",
            url: endpoint,
          },
        },
      },
    };
  }
}

export const userMcpsService = new UserMcpsService();

