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
 *
 * When monetization is enabled, the agent creator earns their markup percentage.
 *
 * **Anthropic extended thinking:** The `chat` tool merges `providerOptions` using
 * `user_characters.settings.anthropicThinkingBudgetTokens` (see `parseThinkingBudgetFromCharacterSettings`).
 * **Why:** Thinking budget is owner-defined on the character, not passed by MCP clients (untrusted).
 */

import { gateway } from "@ai-sdk/gateway";
import { streamText } from "ai";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthOrApiKeyWithOrg } from "@/lib/auth";
import { calculateCost, estimateTokens, getProviderFromModel } from "@/lib/pricing";
import {
  mergeAnthropicCotProviderOptions,
  parseThinkingBudgetFromCharacterSettings,
  resolveAnthropicThinkingBudgetTokens,
} from "@/lib/providers/anthropic-thinking";
import { agentMonetizationService } from "@/lib/services/agent-monetization";
import { charactersService } from "@/lib/services/characters";
import type { CreditReservation } from "@/lib/services/credits";
import { creditsService, InsufficientCreditsError } from "@/lib/services/credits";
import { logger } from "@/lib/utils/logger";

/**
 * Default minimum output tokens to allow for actual response generation.
 * Consistent with A2A endpoint for credit estimation.
 */
export const DEFAULT_MIN_OUTPUT_TOKENS = 4096;

export const maxDuration = 60;

// ============================================================================
// Schemas
// ============================================================================

const MCPRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  id: z.union([z.string(), z.number()]),
});

// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/agents/{id}/mcp
 * Returns MCP server metadata
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const character = await charactersService.getById(id);
  if (!character) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  if (!character.is_public || !character.mcp_enabled) {
    return NextResponse.json({ error: "MCP not accessible for this agent" }, { status: 403 });
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elizacloud.ai";
  const bioText = Array.isArray(character.bio) ? character.bio.join("\n") : character.bio;

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
              enum: ["gpt-4o-mini", "gpt-4o", "claude-3-5-sonnet-latest"],
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
export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
  const authResult = await requireAuthOrApiKeyWithOrg(request).catch(() => null);

  if (!authResult) {
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        error: { code: -32002, message: "Authentication required" },
        id: rpcId,
      },
      { status: 401 },
    );
  }

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
      return handleToolCall(character, params ?? {}, rpcId, authResult);

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
    settings: Record<string, unknown>;
  },
  params: Record<string, unknown>,
  rpcId: string | number,
  authResult: { user: { id: string; organization_id: string } },
) {
  const { name, arguments: args } = params as {
    name: string;
    arguments: Record<string, unknown>;
  };

  if (name === "get_info") {
    const bioText = Array.isArray(character.bio) ? character.bio.join("\n") : character.bio;

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

    const bioText = Array.isArray(character.bio) ? character.bio.join("\n") : character.bio;
    const systemPrompt = character.system || `You are ${character.name}. ${bioText}`;

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: message },
    ];

    const provider = getProviderFromModel(model);
    const markupPct = Number(character.inference_markup_percentage || 0);

    // Resolve effective thinking budget before reservation (applies ANTHROPIC_COT_BUDGET_MAX cap)
    const agentThinkingBudget = parseThinkingBudgetFromCharacterSettings(character.settings);
    const effectiveThinkingBudget = 
      resolveAnthropicThinkingBudgetTokens(model, process.env, agentThinkingBudget);
    // Include thinking budget in output token estimate when budget is non-null
    // (resolveAnthropicThinkingBudgetTokens already checks model support internally)
    // Note: Use higher base to allow for actual response generation, not just thinking budget
    const baseOutputTokens = DEFAULT_MIN_OUTPUT_TOKENS;
    const estimatedOutputTokens = effectiveThinkingBudget != null
      ? baseOutputTokens + effectiveThinkingBudget
      : baseOutputTokens;

    // Reserve credits BEFORE LLM call to prevent TOCTOU race condition
    let reservation: CreditReservation;
    try {
      reservation = await creditsService.reserve({
        organizationId: authResult.user.organization_id,
        model,
        provider,
        estimatedInputTokens: estimateTokens(systemPrompt + message),
        estimatedOutputTokens,
        userId: authResult.user.id,
        description: `Agent MCP: ${character.name}`,
      });
    } catch (error) {
      if (error instanceof InsufficientCreditsError) {
        return NextResponse.json({
          jsonrpc: "2.0",
          error: {
            code: -32003,
            message: `Insufficient credits. Required: $${error.required.toFixed(4)}`,
          },
          id: rpcId,
        });
      }
      throw error;
    }

    // Anthropic API requires maxOutputTokens >= budgetTokens when thinking is enabled
    // Also need to reserve capacity for actual response generation beyond thinking
    const maxOutputTokens = effectiveThinkingBudget
      ? Math.max(DEFAULT_MIN_OUTPUT_TOKENS, effectiveThinkingBudget) + DEFAULT_MIN_OUTPUT_TOKENS
      : undefined;

    try {
      const result = await streamText({
        model: gateway.languageModel(model),
        messages,
        ...(maxOutputTokens && { maxOutputTokens }),
        ...mergeAnthropicCotProviderOptions(
          model,
          process.env,
          agentThinkingBudget,
        ),
      });

      let fullText = "";
      for await (const delta of result.textStream) {
        fullText += delta;
      }

      const usage = await result.usage;

      const { totalCost: actualBaseCost } = await calculateCost(
        model,
        provider,
        usage?.inputTokens || 0,
        usage?.outputTokens || 0,
      );
      const actualCreatorMarkup = character.monetization_enabled
        ? actualBaseCost * (markupPct / 100)
        : 0;
      const actualTotal = actualBaseCost + actualCreatorMarkup;

      if (character.monetization_enabled && actualCreatorMarkup > 0) {
        await agentMonetizationService.recordCreatorEarnings({
          agentId: character.id,
          agentName: character.name,
          ownerId: character.user_id,
          earnings: actualCreatorMarkup,
          consumerOrgId: authResult.user.organization_id,
          model,
          tokens: (usage?.inputTokens || 0) + (usage?.outputTokens || 0),
          protocol: "mcp",
        });

        logger.info("[Agent MCP] Creator earnings credited to redeemable balance", {
          agentId: character.id,
          ownerId: character.user_id,
          earnings: actualCreatorMarkup,
        });
      }

      // Reconcile with actual cost (handles refund or overage)
      await reservation.reconcile(actualTotal);

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
              total: actualTotal,
            },
            usage: {
              inputTokens: usage?.inputTokens || 0,
              outputTokens: usage?.outputTokens || 0,
            },
          },
        },
        id: rpcId,
      });
    } catch (error) {
      // Refund reserved credits on failure
      await reservation.reconcile(0);
      logger.error("[Agent MCP] Error generating response", {
        error: error instanceof Error ? error.message : "Unknown error",
        agentId: character.id,
      });
      return NextResponse.json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Internal error",
        },
        id: rpcId,
      });
    }
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key, X-App-Id, X-PAYMENT",
    },
  });
}
