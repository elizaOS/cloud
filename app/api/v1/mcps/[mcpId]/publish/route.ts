/**
 * MCP Publish/Unpublish API
 *
 * POST /api/v1/mcps/[mcpId]/publish - Publish MCP (make live)
 * DELETE /api/v1/mcps/[mcpId]/publish - Unpublish MCP (back to draft)
 *
 * The POST endpoint accepts optional body parameters:
 * - registerOnChain: boolean - Register on ERC-8004 Identity Registry
 * - network: string - Network to register on (default: configured network)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { userMcpsService } from "@/lib/services";
import { logger } from "@/lib/utils/logger";
import { getDefaultNetwork, type ERC8004Network } from "@/lib/config/erc8004";

export const dynamic = "force-dynamic";

// Request body schema for publish endpoint
const publishBodySchema = z.object({
  /** Register the MCP on ERC-8004 Identity Registry */
  registerOnChain: z.boolean().optional().default(false),
  /** Network to register on (defaults to configured network) */
  network: z
    .enum(["base-sepolia", "base"])
    .optional()
    .describe("ERC-8004 network to register on"),
});

/**
 * POST /api/v1/mcps/[mcpId]/publish
 * Publish MCP (make it live and discoverable)
 *
 * Optional body:
 * - registerOnChain: boolean - Also register on ERC-8004 (decentralized discovery)
 * - network: "base-sepolia" | "base" - Network for on-chain registration
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId } = await ctx.params;

  // Parse optional body for ERC-8004 options
  let registerOnChain = false;
  let network: ERC8004Network = getDefaultNetwork();

  const contentType = request.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    const body = await request.json();
    const parseResult = publishBodySchema.safeParse(body);
    if (parseResult.success) {
      registerOnChain = parseResult.data.registerOnChain ?? false;
      network = (parseResult.data.network as ERC8004Network) ?? getDefaultNetwork();
    }
  }

  const mcp = await userMcpsService.publish(
    mcpId,
    authResult.user.organization_id,
    {
      registerOnChain,
      network,
    }
  );

  logger.info("[API] Published user MCP", {
    id: mcpId,
    name: mcp.name,
    userId: authResult.user.id,
    erc8004Registered: mcp.erc8004_registered,
    erc8004Network: mcp.erc8004_network,
  });

  return NextResponse.json({
    mcp,
    message: mcp.erc8004_registered
      ? "MCP published and registered on ERC-8004. It is now discoverable on-chain."
      : "MCP published successfully. It is now discoverable in the registry.",
    erc8004: mcp.erc8004_registered
      ? {
          registered: true,
          network: mcp.erc8004_network,
          agentId: mcp.erc8004_agent_id,
          agentUri: mcp.erc8004_agent_uri,
        }
      : { registered: false },
  });
}

/**
 * DELETE /api/v1/mcps/[mcpId]/publish
 * Unpublish MCP (back to draft)
 */
export async function DELETE(
  request: NextRequest,
  ctx: { params: Promise<{ mcpId: string }> }
) {
  const authResult = await requireAuthOrApiKeyWithOrg(request);
  const { mcpId } = await ctx.params;

  const mcp = await userMcpsService.unpublish(
    mcpId,
    authResult.user.organization_id
  );

  logger.info("[API] Unpublished user MCP", {
    id: mcpId,
    userId: authResult.user.id,
  });

  return NextResponse.json({
    mcp,
    message: "MCP unpublished. It is no longer discoverable in the registry.",
  });
}

/**
 * OPTIONS handler for CORS
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    },
  });
}

