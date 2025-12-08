/**
 * Individual Agent A2A Endpoint
 *
 * Provides A2A (Agent-to-Agent) protocol access to individual agents.
 * Each public agent gets its own A2A endpoint for discovery and interaction.
 *
 * GET /api/agents/{id}/a2a - Returns the Agent Card
 * POST /api/agents/{id}/a2a - JSON-RPC for agent interaction
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
import { agentRegistryService } from "@/lib/services/agent-registry";
import { streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { calculateCost, getProviderFromModel, estimateRequestCost } from "@/lib/pricing";
import { X402_ENABLED, isX402Configured } from "@/lib/config/x402";
import { agentMonetizationService } from "@/lib/services/agent-monetization";
import { logger } from "@/lib/utils/logger";

export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

const JsonRpcRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  id: z.union([z.string(), z.number()]),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/agents/{id}/a2a
 * Returns the A2A Agent Card for this agent
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const character = await charactersService.getById(id);
  if (!character) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Only public agents have A2A endpoints
  if (!character.is_public) {
    return NextResponse.json(
      { error: "Agent is not public" },
      { status: 403 }
    );
  }

  // Check if A2A is enabled for this agent
  if (!character.a2a_enabled) {
    return NextResponse.json(
      { error: "A2A not enabled for this agent" },
      { status: 403 }
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://elizacloud.ai";
  const agentCard = agentRegistryService.generateAgentCard(character, baseUrl);

  return NextResponse.json(agentCard, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

/**
 * POST /api/agents/{id}/a2a
 * JSON-RPC endpoint for agent interaction
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // Get the character
  const character = await charactersService.getById(id);
  if (!character) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Agent not found" }, id: null },
      { status: 404 }
    );
  }

  if (!character.is_public || !character.a2a_enabled) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32001, message: "Agent not accessible" }, id: null },
      { status: 403 }
    );
  }

  // Parse JSON-RPC request
  const body = await request.json();
  const validation = JsonRpcRequestSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      },
      { status: 400 }
    );
  }

  const { method, params, id: rpcId } = validation.data;

  // Authenticate with API key or session
  // NOTE: This endpoint uses credit-based auth. For x402 payments, clients should:
  // 1. Top up credits via /api/v1/credits/topup (x402 enabled)
  // 2. Then use their API key or session here
  const authResult = await requireAuthOrApiKeyWithOrg(request).catch(() => null);
  
  if (!authResult) {
    // Return 402 with x402 topup info if enabled
    if (X402_ENABLED && isX402Configured()) {
      const { getDefaultNetwork, X402_RECIPIENT_ADDRESS, USDC_ADDRESSES, TOPUP_PRICE, CREDITS_PER_DOLLAR } = await import("@/lib/config/x402");
      return NextResponse.json(
        {
          jsonrpc: "2.0",
          error: {
            code: -32002,
            message: "Authentication required. Top up credits via x402 at /api/v1/credits/topup",
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
        { status: 402 }
      );
    }
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32002, message: "Authentication required" },
        id: rpcId,
      },
      { status: 401 }
    );
  }
  
  const paymentMethod = "credits" as const;

  // Handle method
  if (method === "chat") {
    return handleChat(request, character, params ?? {}, rpcId, authResult, paymentMethod);
  }

  if (method === "getAgentInfo") {
    return NextResponse.json({
      jsonrpc: "2.0",
      result: {
        name: character.name,
        bio: character.bio,
        category: character.category,
        tags: character.tags,
        monetizationEnabled: character.monetization_enabled,
        markupPercentage: character.inference_markup_percentage,
      },
      id: rpcId,
    });
  }

  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: { code: -32601, message: "Method not found" },
      id: rpcId,
    },
    { status: 400 }
  );
}

/**
 * Handle chat method with monetization
 */
async function handleChat(
  request: NextRequest,
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
  paymentMethod: "credits" | "x402"
) {
  const { model = "gpt-4o-mini", messages } = params as {
    model?: string;
    messages: Array<{ role: string; content: string }>;
  };

  if (!messages?.length) {
    return NextResponse.json({
      jsonrpc: "2.0",
      error: { code: -32602, message: "messages required" },
      id: rpcId,
    });
  }

  // Build system prompt from character
  const bioText = Array.isArray(character.bio)
    ? character.bio.join("\n")
    : character.bio;
  const systemPrompt =
    character.system ||
    `You are ${character.name}. ${bioText}`;

  const fullMessages = [
    { role: "system" as const, content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  // Calculate costs
  const provider = getProviderFromModel(model);
  const baseCost = await estimateRequestCost(model, fullMessages);

  // Apply markup if monetization is enabled
  const markupPct = Number(character.inference_markup_percentage || 0);
  const creatorMarkup = character.monetization_enabled
    ? baseCost * (markupPct / 100)
    : 0;
  const totalCost = baseCost + creatorMarkup;

  // Deduct credits if using credit payment
  if (paymentMethod === "credits" && authResult) {
    const deductResult = await creditsService.deductCredits({
      organizationId: authResult.user.organization_id,
      amount: totalCost,
      description: `Agent: ${character.name} (${model})`,
      metadata: {
        agent_id: character.id,
        agent_name: character.name,
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
    messages: fullMessages,
  });

  let fullText = "";
  for await (const delta of result.textStream) {
    fullText += delta;
  }

  const usage = await result.usage;

  // Calculate actual cost and handle difference
  const { totalCost: actualBaseCost } = await calculateCost(
    model,
    provider,
    usage?.inputTokens || 0,
    usage?.outputTokens || 0
  );
  const actualCreatorMarkup = character.monetization_enabled
    ? actualBaseCost * (markupPct / 100)
    : 0;
  const actualTotal = actualBaseCost + actualCreatorMarkup;

  // Credit the creator their markup if monetization is enabled
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
      tokens: usage?.totalTokens,
      protocol: "a2a",
    });

    logger.info("[Agent A2A] Creator earnings credited to redeemable balance", {
      agentId: character.id,
      ownerId: character.user_id,
      earnings: actualCreatorMarkup,
    });
  }

  // Handle cost difference (refund or charge extra)
  if (paymentMethod === "credits" && authResult) {
    const diff = actualTotal - totalCost;
    if (diff < 0) {
      await creditsService.refundCredits({
        organizationId: authResult.user.organization_id,
        amount: -diff,
        description: `Agent refund: ${character.name}`,
      });
    } else if (diff > 0) {
      await creditsService.deductCredits({
        organizationId: authResult.user.organization_id,
        amount: diff,
        description: `Agent additional: ${character.name}`,
      });
    }
  }

  return NextResponse.json({
    jsonrpc: "2.0",
    result: {
      content: fullText,
      model,
      usage: {
        prompt_tokens: usage?.inputTokens || 0,
        completion_tokens: usage?.outputTokens || 0,
        total_tokens: usage?.totalTokens || 0,
      },
      cost: {
        base: actualBaseCost,
        markup: actualCreatorMarkup,
        total: actualTotal,
      },
    },
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-PAYMENT",
    },
  });
}

