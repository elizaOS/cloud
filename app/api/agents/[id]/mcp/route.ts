/**
 * Individual Agent MCP Endpoint
 *
 * Provides MCP (Model Context Protocol) access to individual agents.
 * Each public agent gets its own MCP endpoint with tools for interaction.
 *
 * GET /api/agents/{id}/mcp - Returns MCP server metadata
 * POST /api/agents/{id}/mcp - MCP protocol handler
 *
 * Supports:
 * - API key authentication (uses org credits)
 * - x402 payment (permissionless, pay-per-request)
 *
 * When monetization is enabled, the agent creator earns their markup percentage.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { creditsService } from "@/lib/services/credits";
import { charactersService } from "@/lib/services/characters/characters";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import {
  calculateCost,
  getProviderFromModel,
  estimateRequestCost,
} from "@/lib/pricing";
import { X402_ENABLED, isX402Configured } from "@/lib/config/x402";
import { agentMonetizationService } from "@/lib/services/agent-monetization";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

const MCPRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/agents/{id}/mcp
 * Returns MCP server metadata
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const character = await charactersService.getById(id);
  if (!character) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (!character.is_public || !character.mcp_enabled) {
    return NextResponse.json(
      { error: "MCP not accessible for this agent" },
      { status: 403 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const bioText = Array.isArray(character.bio)
    ? character.bio.join("\n")
    : character.bio;

  const markupPct = Number(character.inference_markup_percentage || 0);

  // Return MCP-compatible metadata
  return NextResponse.json({
    name: character.name,
    description: bioText,
    version: "1.0.0",
    protocol: "2024-11-05",
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
    pricing: character.monetization_enabled
      ? {
          type: "credits",
          markupPercentage: markupPct,
          description: `Base inference cost + ${markupPct}% creator markup`,
        }
      : {
          type: "credits",
          description: "Standard inference costs",
        },
    endpoints: {
      mcp: `${baseUrl}/api/agents/${id}/mcp`,
      a2a: `${baseUrl}/api/agents/${id}/a2a`,
    },
    tools: [
      {
        name: "chat",
        description: `Send a message to ${character.name} and get a response`,
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The message to send",
            },
            model: {
              type: "string",
              description: "Model to use (default: gpt-4o-mini)",
              enum: [
                "gpt-4o-mini",
                "gpt-4o",
                "gpt-4-turbo",
                "claude-sonnet-4",
                "claude-haiku-4",
                "gemini-2.0-flash",
                "gemini-1.5-flash",
              ],
            },
          },
          required: ["message"],
        },
      },
      {
        name: "get_info",
        description: `Get information about ${character.name}`,
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  });
}

/**
 * POST /api/agents/{id}/mcp
 * MCP protocol handler
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  const character = await charactersService.getById(id);
  if (!character) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "Agent not found" },
        id: null,
      },
      { status: 404 },
    );
  }

  if (!character.is_public || !character.mcp_enabled) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32001, message: "MCP not accessible" },
        id: null,
      },
      { status: 403 },
    );
  }

  const body = await request.json();
  const validation = MCPRequestSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      },
      { status: 400 },
    );
  }

  const { method, params, id: rpcId } = validation.data;

  // Authenticate with API key or session
  // NOTE: This endpoint uses credit-based auth. For x402 payments, clients should:
  // 1. Top up credits via /api/v1/credits/topup (x402 enabled)
  // 2. Then use their API key or session here
  const authResult = await requireAuthOrApiKeyWithOrg(request).catch(
    () => null,
  );

  if (!authResult) {
    // Return 402 with x402 topup info if enabled
    if (X402_ENABLED && isX402Configured()) {
      const {
        getDefaultNetwork,
        X402_RECIPIENT_ADDRESS,
        USDC_ADDRESSES,
        TOPUP_PRICE,
        CREDITS_PER_DOLLAR,
      } = await import("@/lib/config/x402");
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32002,
            message:
              "Authentication required. Top up credits via x402 at /api/v1/credits/topup",
            data: {
              x402: {
                topupEndpoint: "/api/v1/credits/topup",
                network: getDefaultNetwork(),
                asset: USDC_ADDRESSES[getDefaultNetwork()],
                payTo: X402_RECIPIENT_ADDRESS,
                minimumTopup: TOPUP_PRICE,
                creditsPerDollar: CREDITS_PER_DOLLAR,
              },
            },
          },
          id: rpcId,
        },
        { status: 402 },
      );
    }
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32002, message: "Authentication required" },
        id: rpcId,
      },
      { status: 401 },
    );
  }

  const paymentMethod = "credits" as const;

  // Handle MCP methods
  switch (method) {
    case "initialize":
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {
          protocolVersion: "2024-11-05",
          serverInfo: {
            name: character.name,
            version: "1.0.0",
          },
          capabilities: {
            tools: {},
          },
        },
        id: rpcId,
      });

    case "tools/list":
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {
          tools: [
            {
              name: "chat",
              description: `Send a message to ${character.name}`,
              inputSchema: {
                type: "object",
                properties: {
                  message: { type: "string" },
                  model: { type: "string" },
                },
                required: ["message"],
              },
            },
            {
              name: "get_info",
              description: `Get information about ${character.name}`,
              inputSchema: {
                type: "object",
                properties: {},
              },
            },
          ],
        },
        id: rpcId,
      });

    case "tools/call":
      return handleToolCall(
        character,
        params ?? {},
        rpcId,
        authResult,
        paymentMethod,
      );

    case "ping":
      return NextResponse.json({
        jsonrpc: "2.0",
        result: {},
        id: rpcId,
      });

    default:
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: { code: -32601, message: "Method not found" },
          id: rpcId,
        },
        { status: 400 },
      );
  }
}

/**
 * Handle MCP tool calls
 */
async function handleToolCall(
  character: {
    id: string;
    name: string;
    user_id: string; // Owner of the agent
    organization_id: string;
    monetization_enabled: boolean;
    inference_markup_percentage: string | null;
    system: string | null;
    bio: string | string[];
  },
  params: Record<string, unknown>,
  rpcId: string | number,
  authResult: { user: { id: string; organization_id: string } } | null,
  paymentMethod: "credits" | "x402",
) {
  const { name, arguments: args } = params as {
    name: string;
    arguments: Record<string, unknown>;
  };

  if (name === "get_info") {
    const bioText = Array.isArray(character.bio)
      ? character.bio.join("\n")
      : character.bio;

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              name: character.name,
              bio: bioText,
              monetization: character.monetization_enabled,
              markup: character.inference_markup_percentage,
            }),
          },
        ],
      },
      id: rpcId,
    });
  }

  if (name === "chat") {
    const { message, model = "gpt-4o-mini" } = args as {
      message: string;
      model?: string;
    };

    if (!message) {
      return NextResponse.json({
        jsonrpc: "2.0",
        error: { code: -32602, message: "message required" },
        id: rpcId,
      });
    }

    // Build system prompt
    const bioText = Array.isArray(character.bio)
      ? character.bio.join("\n")
      : character.bio;
    const systemPrompt =
      character.system || `You are ${character.name}. ${bioText}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: message },
    ];

    // Calculate costs
    const provider = getProviderFromModel(model);
    const baseCost = await estimateRequestCost(model, messages);
    const markupPct = Number(character.inference_markup_percentage || 0);
    const creatorMarkup = character.monetization_enabled
      ? baseCost * (markupPct / 100)
      : 0;
    const totalCost = baseCost + creatorMarkup;

    // Deduct credits
    if (paymentMethod === "credits" && authResult) {
      const deductResult = await creditsService.deductCredits({
        organizationId: authResult.user.organization_id,
        amount: totalCost,
        description: `Agent MCP: ${character.name}`,
        metadata: {
          agent_id: character.id,
          tool: "chat",
          base_cost: baseCost,
          creator_markup: creatorMarkup,
        },
      });

      if (!deductResult.success) {
        return NextResponse.json({
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message: `Insufficient credits. Required: $${totalCost.toFixed(4)}`,
          },
          id: rpcId,
        });
      }
    }

    // Generate response
    const result = await streamText({
      model: gateway.languageModel(model),
      messages,
    });

    let fullText = "";
    for await (const delta of result.textStream) {
      fullText += delta;
    }

    const usage = await result.usage;

    // Calculate actual costs
    const { totalCost: actualBaseCost } = await calculateCost(
      model,
      provider,
      usage?.inputTokens || 0,
      usage?.outputTokens || 0,
    );
    const actualCreatorMarkup = character.monetization_enabled
      ? actualBaseCost * (markupPct / 100)
      : 0;

    // Credit the creator
    // IMPORTANT: This goes to REDEEMABLE EARNINGS (for elizaOS token redemption)
    if (character.monetization_enabled && actualCreatorMarkup > 0) {
      await agentMonetizationService.recordCreatorEarnings({
        agentId: character.id,
        agentName: character.name,
        ownerId: character.user_id,
        ownerOrgId: character.organization_id,
        earnings: actualCreatorMarkup,
        consumerOrgId: authResult?.user.organization_id,
        model,
        tokens: (usage?.inputTokens || 0) + (usage?.outputTokens || 0),
        protocol: "mcp",
      });

      logger.info(
        "[Agent MCP] Creator earnings credited to redeemable balance",
        {
          agentId: character.id,
          ownerId: character.user_id,
          earnings: actualCreatorMarkup,
        },
      );
    }

    // Handle cost difference (refund or charge extra)
    const actualTotal = actualBaseCost + actualCreatorMarkup;
    if (paymentMethod === "credits" && authResult) {
      const diff = actualTotal - totalCost;
      if (diff < 0) {
        await creditsService.refundCredits({
          organizationId: authResult.user.organization_id,
          amount: -diff,
          description: `Agent MCP refund: ${character.name}`,
        });
      } else if (diff > 0) {
        await creditsService.deductCredits({
          organizationId: authResult.user.organization_id,
          amount: diff,
          description: `Agent MCP additional: ${character.name}`,
        });
      }
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        content: [
          {
            type: "text",
            text: fullText,
          },
        ],
        _meta: {
          cost: {
            base: actualBaseCost,
            markup: actualCreatorMarkup,
            total: actualBaseCost + actualCreatorMarkup,
          },
          usage: {
            inputTokens: usage?.inputTokens || 0,
            outputTokens: usage?.outputTokens || 0,
          },
        },
      },
      id: rpcId,
    });
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    error: { code: -32601, message: `Unknown tool: ${name}` },
    id: rpcId,
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type, Authorization, X-API-Key, X-PAYMENT",
    },
  });
}
