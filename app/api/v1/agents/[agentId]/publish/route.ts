/**
 * Agent Publish API
 *
 * Publishes an agent to the marketplace and registers it on ERC-8004.
 * Eliza Cloud pays the gas fees for registration.
 *
 * POST /api/v1/agents/[agentId]/publish - Publish agent (make public + ERC-8004)
 * DELETE /api/v1/agents/[agentId]/publish - Unpublish agent (make private)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db/client";
import { userCharacters } from "@/db/schemas/user-characters";
import { eq } from "drizzle-orm";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { charactersService } from "@/lib/services/characters/characters";
import { agentRegistryService } from "@/lib/services/agent-registry";
import { getDefaultNetwork, type ERC8004Network } from "@/lib/config/erc8004";
import { logger } from "@/lib/utils/logger";

const PublishSchema = z.object({
  // Optional: enable monetization when publishing
  enableMonetization: z.boolean().optional().default(false),
  // Optional: set markup percentage (default 0%)
  markupPercentage: z.number().min(0).max(1000).optional().default(0),
  // Optional: payout wallet address
  payoutWalletAddress: z.string().optional(),
  // Optional: specify network (default: base-sepolia for testnet, base for production)
  network: z.enum(["base-sepolia", "base"]).optional(),
  // Optional: enable A2A protocol (default true)
  a2aEnabled: z.boolean().optional().default(true),
  // Optional: enable MCP protocol (default true)
  mcpEnabled: z.boolean().optional().default(true),
});

/**
 * POST /api/v1/agents/[agentId]/publish
 * Publishes an agent to the marketplace.
 *
 * This will:
 * 1. Make the agent public (is_public = true)
 * 2. Register the agent on ERC-8004 (Eliza Cloud pays gas)
 * 3. Optionally enable monetization with specified markup
 * 4. Enable A2A and MCP protocols
 *
 * The agent will be discoverable by other agents via:
 * - A2A: /api/agents/{id}/a2a
 * - MCP: /api/agents/{id}/mcp
 * - ERC-8004 registry
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  // Get agent
  const agent = await charactersService.getById(agentId);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    );
  }

  // Check ownership
  if (agent.user_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "Not authorized to publish this agent" },
      { status: 403 }
    );
  }

  // Parse request body
  let body: z.infer<typeof PublishSchema> = {
    enableMonetization: false,
    markupPercentage: 0,
    a2aEnabled: true,
    mcpEnabled: true,
  };
  
  try {
    const rawBody = await request.json();
    const validation = PublishSchema.safeParse(rawBody);
    if (validation.success) {
      body = validation.data;
    }
  } catch {
    // Empty body is fine, use defaults
  }

  const network = (body.network || getDefaultNetwork()) as ERC8004Network;

  logger.info("[Agent Publish API] Publishing agent", {
    agentId,
    userId: user.id,
    network,
    enableMonetization: body.enableMonetization,
    markupPercentage: body.markupPercentage,
  });

  // Check if already published
  if (agent.is_public && agent.erc8004_registered) {
    return NextResponse.json({
      success: true,
      message: "Agent is already published",
      agent: {
        id: agent.id,
        name: agent.name,
        isPublic: agent.is_public,
        erc8004Registered: agent.erc8004_registered,
        erc8004Network: agent.erc8004_network,
        erc8004AgentId: agent.erc8004_agent_id,
        a2aEndpoint: `${process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai"}/api/agents/${agent.id}/a2a`,
        mcpEndpoint: `${process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai"}/api/agents/${agent.id}/mcp`,
      },
    });
  }

  // Step 1: Update agent to public with settings
  await db
    .update(userCharacters)
    .set({
      is_public: true,
      a2a_enabled: body.a2aEnabled,
      mcp_enabled: body.mcpEnabled,
      monetization_enabled: body.enableMonetization,
      inference_markup_percentage: String(body.markupPercentage),
      ...(body.payoutWalletAddress && {
        payout_wallet_address: body.payoutWalletAddress,
      }),
      updated_at: new Date(),
    })
    .where(eq(userCharacters.id, agentId));

  // Step 2: Register on ERC-8004 (Eliza Cloud pays gas)
  let erc8004Result: {
    success: boolean;
    agentId: string;
    agentUri: string;
    network: ERC8004Network;
    a2aEndpoint: string;
    mcpEndpoint: string;
  } | null = null;

  try {
    // Refresh agent data
    const updatedAgent = await charactersService.getById(agentId);
    if (!updatedAgent) {
      throw new Error("Agent not found after update");
    }

    erc8004Result = await agentRegistryService.registerAgent({
      character: updatedAgent,
      network,
      enableMonetization: body.enableMonetization,
      inferenceMarkupPercentage: body.markupPercentage,
      payoutWalletAddress: body.payoutWalletAddress,
    });

    // Parse token ID from agentId (format: "chainId:tokenId")
    const tokenId = erc8004Result.agentId.split(":")[1];
    const tokenIdNum = tokenId !== "?" ? parseInt(tokenId, 10) : null;

    // Update agent with ERC-8004 registration info
    await db
      .update(userCharacters)
      .set({
        erc8004_registered: true,
        erc8004_network: network,
        erc8004_agent_id: tokenIdNum,
        erc8004_agent_uri: erc8004Result.agentUri,
        erc8004_registered_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(userCharacters.id, agentId));

    logger.info("[Agent Publish API] Agent registered on ERC-8004", {
      agentId,
      erc8004AgentId: erc8004Result.agentId,
      network,
    });
  } catch (error) {
    // ERC-8004 registration failed, but agent is still public
    logger.error("[Agent Publish API] ERC-8004 registration failed", {
      agentId,
      error: error instanceof Error ? error.message : String(error),
    });

    // Agent is public but not registered on-chain
    // This is still a valid state - users can chat with the agent via API
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";

  return NextResponse.json({
    success: true,
    message: erc8004Result
      ? "Agent published and registered on ERC-8004"
      : "Agent published (ERC-8004 registration pending)",
    agent: {
      id: agentId,
      name: agent.name,
      isPublic: true,
      monetizationEnabled: body.enableMonetization,
      markupPercentage: body.markupPercentage,
      a2aEnabled: body.a2aEnabled,
      mcpEnabled: body.mcpEnabled,
      erc8004Registered: !!erc8004Result,
      erc8004Network: erc8004Result?.network,
      erc8004AgentId: erc8004Result?.agentId,
      erc8004AgentUri: erc8004Result?.agentUri,
      a2aEndpoint: `${baseUrl}/api/agents/${agentId}/a2a`,
      mcpEndpoint: `${baseUrl}/api/agents/${agentId}/mcp`,
    },
  });
}

/**
 * DELETE /api/v1/agents/[agentId]/publish
 * Unpublishes an agent (makes it private).
 *
 * Note: This does NOT remove the agent from ERC-8004.
 * The NFT remains on-chain but the agent will no longer
 * be accessible via A2A/MCP protocols.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  const { user } = await requireAuthOrApiKeyWithOrg(request);
  const { agentId } = await params;

  const agent = await charactersService.getById(agentId);
  if (!agent) {
    return NextResponse.json(
      { success: false, error: "Agent not found" },
      { status: 404 }
    );
  }

  if (agent.user_id !== user.id) {
    return NextResponse.json(
      { success: false, error: "Not authorized" },
      { status: 403 }
    );
  }

  // Make agent private
  await db
    .update(userCharacters)
    .set({
      is_public: false,
      monetization_enabled: false,
      updated_at: new Date(),
    })
    .where(eq(userCharacters.id, agentId));

  logger.info("[Agent Publish API] Agent unpublished", {
    agentId,
    userId: user.id,
  });

  return NextResponse.json({
    success: true,
    message: "Agent unpublished",
    agent: {
      id: agentId,
      name: agent.name,
      isPublic: false,
      // Note: ERC-8004 registration remains but agent is no longer accessible
      erc8004Registered: agent.erc8004_registered,
      erc8004Note: agent.erc8004_registered
        ? "ERC-8004 NFT still exists on-chain but agent is no longer accessible"
        : undefined,
    },
  });
}

