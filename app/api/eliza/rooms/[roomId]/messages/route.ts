import { NextResponse } from "next/server";
import { stringToUuid, type UUID } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { organizationsService } from "@/lib/services";
import { calculateCost, getProviderFromModel, estimateTokens } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { sendMessageWithSideEffects } from "@/lib/eliza/send-message";

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
      const anonData = await getAnonymousUser();
      if (!anonData) {
        throw new Error("Authentication required");
      }

      user = anonData.user;
      anonymousSession = anonData.session;
      isAnonymous = true;

      logger.info("eliza-messages-api", "Anonymous user request", {
        userId: user.id,
        sessionId: anonymousSession?.id,
        messageCount: anonymousSession?.message_count,
      });
    }

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

    // Build user context for runtime creation using centralized service
    const userContext = await userContextService.buildContext({
      user,
      apiKey,
      isAnonymous,
      anonymousSession,
      agentMode: AgentMode.CHAT,
    });
    // Add character override if found
    if (characterId) {
      userContext.characterId = characterId;
    }

    // Create runtime and send message using unified API
    // Note: Billing is handled by the gateway (plugin-elizacloud routes through /api/v1/chat/completions)
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);
    const elizaOS = runtimeFactory.getElizaOS();

    const result = await sendMessageWithSideEffects(
      elizaOS,
      runtime,
      roomId as UUID,
      stringToUuid(entityId) as UUID,
      {
        text,
        attachments: attachments || [],
        source: "api",
      },
      userContext,
      characterId,
    );

    // Note: Using 'result' until core is updated with 'processing' rename
    const responseContent = (result as any).processing?.responseContent || (result as any).result?.responseContent;

    logger.debug(`[Eliza Messages API] Message sent`, {
      roomId,
      entityId,
      messageId: result.messageId,
      hasResponse: !!responseContent,
    });

    // Return the created message
    return NextResponse.json({
      success: true,
      message: {
        id: result.messageId,
        entityId: result.userMessage.entityId || "",
        agentId: runtime.agentId,
        content: responseContent || { text: "", source: "agent" },
        createdAt: result.userMessage.createdAt,
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

    const runtime = await runtimeFactory.getSystemRuntime();

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
