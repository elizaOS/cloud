import { NextResponse } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import type { UUID } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import {
  creditsService,
  usageService,
  generationsService,
  organizationsService,
  discordService,
  anonymousSessionsService,
} from "@/lib/services";
import {
  calculateCost,
  getProviderFromModel,
  estimateTokens,
} from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import { roomsRepository } from "@/db/repositories";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";

export const maxDuration = 60;

// POST /api/eliza/rooms/[roomId]/messages - Send a message
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  try {
    // Support both authenticated and anonymous users
    let user: any;
    let apiKey: any = undefined;
    let isAnonymous = false;
    let anonymousSession: any = null;

    try {
      const authResult = await requireAuthOrApiKey(request);
      user = authResult.user;
      apiKey = authResult.apiKey;
    } catch (error) {
      // Fallback to anonymous user
      logger.info("[Messages API] Privy auth failed, trying anonymous...");

      let anonData = await getAnonymousUser();

      if (!anonData) {
        // Create new anonymous session if none exists
        logger.info(
          "[Messages API] No session cookie - creating new anonymous session",
        );
        const { getOrCreateAnonymousUser } =
          await import("@/lib/auth-anonymous");
        const newAnonData = await getOrCreateAnonymousUser();
        anonData = {
          user: newAnonData.user,
          session: newAnonData.session,
        };
        logger.info("[Messages API] Created anonymous user:", anonData.user.id);
      }

      user = anonData.user;
      anonymousSession = anonData.session;
      isAnonymous = true;

      logger.info("[Messages API] Anonymous user authenticated:", {
        userId: user.id,
        sessionId: anonymousSession?.id,
        messageCount: anonymousSession?.message_count,
      });
    }

    const { roomId } = await ctx.params;
    const body = await request.json();
    const { text, attachments } = body;

    // IMPORTANT: Use authenticated user's ID as entityId (not from request body)
    const entityId = user.id;

    if (!roomId) {
      logger.error("[Eliza Messages API] Missing roomId");
      return NextResponse.json(
        { error: "roomId is required" },
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

    // Handle anonymous user rate limiting
    if (isAnonymous && anonymousSession) {
      const limitCheck = await checkAnonymousLimit(
        anonymousSession.session_token,
      );

      if (!limitCheck.allowed) {
        const errorMessage =
          limitCheck.reason === "message_limit"
            ? `You've reached your free message limit (${limitCheck.limit} messages). Sign up to continue chatting!`
            : `You've reached the hourly rate limit. Please wait an hour or sign up for unlimited access.`;

        logger.warn("eliza-messages-api", "Anonymous user limit reached", {
          userId: user.id,
          sessionId: anonymousSession.id,
          reason: limitCheck.reason,
          limit: limitCheck.limit,
        });

        return NextResponse.json(
          {
            error: errorMessage,
            requiresSignup: true,
            reason: limitCheck.reason,
            limit: limitCheck.limit,
            remaining: limitCheck.remaining,
          },
          { status: 429 },
        );
      }

      logger.info("eliza-messages-api", "Anonymous user message allowed", {
        userId: user.id,
        remaining: limitCheck.remaining,
        limit: limitCheck.limit,
      });
    }

    // For authenticated users: Check credit balance BEFORE processing
    if (!isAnonymous) {
      const estimatedInputTokens = estimateTokens(text);
      const estimatedOutputTokens = 100;
      const model = "gpt-4o";
      const provider = getProviderFromModel(model);

      const { totalCost: estimatedCost } = await calculateCost(
        model,
        provider,
        estimatedInputTokens,
        estimatedOutputTokens,
      );

      if (!user.organization_id) {
        return NextResponse.json(
          { error: "Organization required for authenticated users" },
          { status: 500 },
        );
      }

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
    }

    // Look up character for this room from agentId (single source of truth)
    let characterId: string | undefined;
    let characterName: string | undefined;
    try {
      const room = await roomsRepository.findById(roomId);
      if (room) {
        characterId = room.agentId || undefined;
        if (characterId) {
          logger.info(
            "[Eliza Messages API] ✓ Using custom character:",
            characterId,
            "for room:",
            roomId,
          );

          // Get character name
          const runtime =
            await agentRuntime.getRuntimeForCharacter(characterId);
          characterName = runtime.character.name || "Agent";
        } else {
          logger.info(
            "[Eliza Messages API] ⓘ No character mapping found for room:",
            roomId,
            "- using default character",
          );
          // Get default character name
          const runtime = await agentRuntime.getRuntime();
          characterName = runtime.character.name || "Agent";
        }
      }
    } catch (lookupError) {
      logger.error(
        "[Eliza Messages API] ✗ Failed to lookup character mapping:",
        lookupError,
      );
      // Continue with default character
      characterName = "Agent";
    }

    // Handle the message and get usage information
    const result = await agentRuntime.handleMessage(
      roomId,
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

    // Send messages to Discord thread (fire-and-forget)
    (async () => {
      try {
        // Get Discord thread ID from room metadata
        const roomData = await db.execute<{ metadata: any }>(
          sql`SELECT metadata FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
        );

        const threadId = roomData.rows[0]?.metadata?.discordThreadId;

        if (threadId) {
          // Send user message
          await discordService.sendToThread(
            threadId,
            `**${user.name || user.email || entityId}:** ${text}`,
          );

          // Send agent response
          const responseText =
            typeof message.content === "string"
              ? message.content
              : message.content?.text || JSON.stringify(message.content);

          await discordService.sendToThread(
            threadId,
            `**🤖 ${characterName}:** ${responseText}`,
          );

          logger.info(
            `[Eliza Messages API] Sent messages to Discord thread ${threadId}`,
          );
        }
      } catch (err) {
        logger.error(
          "[Eliza Messages API] Failed to send to Discord thread:",
          err,
        );
      }
    })();

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
        organizationId: user.organization_id!,
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
            organizationId: user.organization_id!,
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
        organization_id: user.organization_id!!,
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
          organization_id: user.organization_id!!,
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
          organization_id: user.organization_id!!,
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

    // Increment message count AFTER successful message creation (for anonymous users)
    if (isAnonymous && anonymousSession) {
      await anonymousSessionsService.incrementMessageCount(anonymousSession.id);

      logger.info(
        "eliza-messages-api",
        "Incremented anonymous message count after success",
        {
          sessionId: anonymousSession.id,
          newCount: anonymousSession.message_count + 1,
        },
      );
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
