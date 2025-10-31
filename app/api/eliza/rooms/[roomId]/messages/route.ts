import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  creditsService,
  usageService,
  generationsService,
  organizationsService,
} from "@/lib/services";
import {
  calculateCost,
  getProviderFromModel,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import { elizaRoomCharactersRepository } from "@/db/repositories";

export const maxDuration = 60;

// POST /api/eliza/rooms/[roomId]/messages - Send a message
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    // Authenticate user or validate API key
    const { user, apiKey } = await requireAuthOrApiKey(request);

    const { roomId } = await ctx.params;
    const body = await request.json();
    const { entityId, text, attachments } = body;

    if (!roomId) {
      logger.error("[Eliza Messages API] Missing roomId");
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    if (!entityId) {
      logger.error("[Eliza Messages API] Missing entityId");
      return NextResponse.json(
        { error: "entityId is required" },
        { status: 400 },
      );
    }

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      logger.error("[Eliza Messages API] Invalid or missing text", { text });
      return NextResponse.json(
        { error: "text is required and must be a non-empty string" },
        { status: 400 },
      );
    }

    // CRITICAL FIX: Check credit balance BEFORE processing to prevent free service
    // Estimate cost based on input text
    const estimatedInputTokens = estimateTokens(text);
    const estimatedOutputTokens = 100; // Conservative estimate for response
    const model = "gpt-4o";
    const provider = getProviderFromModel(model);

    const { totalCost: estimatedCost } = await calculateCost(
      model,
      provider,
      estimatedInputTokens,
      estimatedOutputTokens,
    );

    // Check organization balance
    const org = await organizationsService.getById(user.organization_id);
    if (!org) {
      logger.error("[Eliza Messages API] Organization not found", {
        organizationId: user.organization_id,
      });
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 },
      );
    }

    if (Number(org.credit_balance) < estimatedCost) {
      logger.warn("[Eliza Messages API] Insufficient credits", {
        organizationId: user.organization_id,
        required: estimatedCost,
        balance: org.credit_balance,
      });
      return NextResponse.json(
        {
          error: "Insufficient balance",
          details: `Required: ${estimatedCost}, Available: ${org.credit_balance}`,
        },
        { status: 402 },
      );
    }

    // Look up character for this room
    let characterId: string | undefined;
    try {
      const roomCharacter =
        await elizaRoomCharactersRepository.findByRoomId(roomId);
      if (roomCharacter) {
        characterId = roomCharacter.character_id;
        logger.info(
          "[Eliza Messages API] ✓ Using custom character:",
          characterId,
          "for room:",
          roomId,
        );
      } else {
        logger.info(
          "[Eliza Messages API] ⓘ No character mapping found for room:",
          roomId,
          "- using default character",
        );
      }
    } catch (lookupError) {
      logger.error(
        "[Eliza Messages API] ✗ Failed to lookup character mapping:",
        lookupError,
      );
      // Continue with default character
    }

    // Handle the message and get usage information
    const result = await agentRuntime.handleMessage(
      roomId,
      entityId,
      {
        text,
        attachments: attachments || [],
      },
      characterId,
    );

    const { message, usage } = result;

    logger.debug(`[Eliza Messages API] Message sent`, {
      roomId,
      entityId,
      messageId: message.id,
      usage,
    });

    // Always deduct credits for Eliza messages
    // If we don't have usage data, estimate based on text length
    const effectiveUsage = usage || {
      inputTokens: Math.ceil(text.length / 4),
      outputTokens: 100, // Rough estimate for response
      model: "gpt-4o",
    };

    logger.debug(
      `[Eliza Messages API] Effective usage for billing:`,
      effectiveUsage,
    );

    try {
      const model = effectiveUsage.model || "gpt-4o";
      const provider = getProviderFromModel(model);

      // Calculate costs
      const { inputCost, outputCost, totalCost } = await calculateCost(
        model,
        provider,
        effectiveUsage.inputTokens || 0,
        effectiveUsage.outputTokens || 0,
      );

      // Deduct credits
      const deductionResult = await creditsService.deductCredits({
        organizationId: user.organization_id,
        amount: totalCost,
        description: `Eliza chat completion: ${model}`,
        metadata: { user_id: user.id },
      });

      if (!deductionResult.success) {
        // CRITICAL: This should rarely happen since we checked credits before processing
        // But it can happen if credits were spent elsewhere between check and now
        logger.error(
          "[Eliza Messages API] CRITICAL: Failed to deduct credits after message processing - race condition detected",
          {
            organizationId: user.organization_id,
            cost: String(totalCost),
            balance: deductionResult.newBalance,
            messageId: message.id,
          },
        );
        // Message has already been processed, so we return it but flag the billing issue
        // This should trigger an alert for manual review
      }

      // Create usage record
      const usageRecord = await usageService.create({
        organization_id: user.organization_id,
        user_id: user.id,
        api_key_id: apiKey?.id || null,
        type: "eliza",
        model,
        provider,
        input_tokens: effectiveUsage.inputTokens || 0,
        output_tokens: effectiveUsage.outputTokens || 0,
        input_cost: String(inputCost),
        output_cost: String(outputCost),
        is_successful: true,
      });

      // Create generation record if using API key
      if (apiKey) {
        await generationsService.create({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey.id,
          type: "eliza",
          model,
          provider,
          prompt: text,
          status: "completed",
          tokens:
            (effectiveUsage.inputTokens || 0) +
            (effectiveUsage.outputTokens || 0),
          cost: String(totalCost),
          credits: String(totalCost),
          usage_record_id: usageRecord.id,
          completed_at: new Date(),
        });
      }

      logger.debug(
        `[Eliza Messages API] Cost charged: $${totalCost.toFixed(4)} (Input: $${inputCost.toFixed(4)}, Output: $${outputCost.toFixed(4)}), New balance: $${deductionResult.newBalance.toFixed(2)}`,
      );
    } catch (error) {
      logger.error(
        "[Eliza Messages API] Error deducting credits or tracking usage:",
        error,
      );

      // Still create an unsuccessful usage record for tracking
      try {
        await usageService.create({
          organization_id: user.organization_id,
          user_id: user.id,
          api_key_id: apiKey?.id || null,
          type: "eliza",
          model: effectiveUsage.model || "gpt-4o",
          provider: getProviderFromModel(effectiveUsage.model || "gpt-4o"),
          input_tokens: effectiveUsage.inputTokens || 0,
          output_tokens: effectiveUsage.outputTokens || 0,
          input_cost: String(0),
          output_cost: String(0),
          is_successful: false,
          error_message:
            error instanceof Error ? error.message : "Unknown error",
        });
      } catch (usageError) {
        logger.error(
          "[Eliza Messages API] Error creating usage record:",
          usageError,
        );
      }
    }

    // Return the created message
    return NextResponse.json({
      success: true,
      message: {
        id: message.id,
        entityId: message.entityId || "",
        agentId: message.agentId,
        content: message.content,
        createdAt: message.createdAt,
        roomId,
      },
      // Include polling hint for the client
      pollForResponse: true,
      pollDuration: 30000, // 30 seconds
      pollInterval: 1000, // 1 second
    });
  } catch (error) {
    logger.error("[Eliza Messages API] Error sending message:", error);

    // Provide more specific error messages based on the error type
    if (error instanceof TypeError) {
      return NextResponse.json(
        {
          error: "Invalid request format",
          details: error.message,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to send message",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// GET /api/eliza/rooms/[roomId]/messages - Get messages (for polling)
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    // Authenticate user or validate API key
    await requireAuthOrApiKey(request);

    const { roomId } = await ctx.params;
    const { searchParams } = new URL(request.url);
    const limit = searchParams.get("limit");
    const afterTimestamp = searchParams.get("afterTimestamp");

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    const runtime = await agentRuntime.getRuntime();
    const messages = await runtime.getMemories({
      tableName: "messages",
      roomId: roomId as UUID,
      count: limit ? parseInt(limit) : 100, // Higher count for polling to catch all new messages
      unique: false,
    });

    // Filter messages by timestamp if provided (for polling)
    const parsed = afterTimestamp ? Number(afterTimestamp) : 0;
    const afterTimestampNum =
      Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
    const isValidAfter = afterTimestampNum > 0;
    const filteredMessages = isValidAfter
      ? messages.filter((msg) => {
          const msgTime = (msg as { createdAt: number }).createdAt;
          return msgTime > afterTimestampNum;
        })
      : messages;

    const simple = filteredMessages
      .map((msg) => {
        let parsedContent: unknown = msg.content;
        try {
          if (typeof msg.content === "string")
            parsedContent = JSON.parse(msg.content);
        } catch {
          parsedContent = msg.content;
        }
        return {
          id: msg.id,
          entityId: msg.entityId,
          agentId: msg.agentId,
          content: parsedContent,
          createdAt: (msg as { createdAt: number }).createdAt,
          isAgent: msg.entityId === msg.agentId,
        };
      })
      .sort((a, b) => a.createdAt - b.createdAt);

    return NextResponse.json(
      {
        success: true,
        messages: simple,
        hasMore: false,
        lastTimestamp:
          simple.length > 0 ? simple[simple.length - 1].createdAt : Date.now(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("[Eliza Messages API] Error getting messages:", error);
    return NextResponse.json(
      {
        error: "Failed to get messages",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
