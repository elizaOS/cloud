import { NextResponse } from "next/server";
import { stringToUuid, type UUID, type Memory } from "@elizaos/core";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { organizationsService } from "@/lib/services";
import { calculateCost, getProviderFromModel, estimateTokens } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import { roomsRepository } from "@/db/repositories";
import type { UserWithOrganization, ApiKey } from "@/lib/types";
import type { AnonymousSession } from "@/db/schemas";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { sendMessageWithSideEffects } from "@/lib/eliza/send-message";

export const maxDuration = 60;

/**
 * POST /api/eliza/rooms/[roomId]/messages
 * Sends a message to a room and processes it through the Eliza agent runtime.
 * Supports both authenticated and anonymous users with rate limiting.
 * 
 * Note: Billing is handled by the gateway (plugin-elizacloud routes through /api/v1/chat/completions)
 *
 * @param request - Request body with text and optional attachments.
 * @param ctx - Route context containing the room ID parameter.
 * @returns Created message and polling hints for response.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  // Support both authenticated and anonymous users
  let user: UserWithOrganization;
  let apiKey: ApiKey | undefined = undefined;
  let isAnonymous = false;
  let anonymousSession: AnonymousSession | null = null;

  try {
    const authResult = await requireAuthOrApiKey(request);
    user = authResult.user;
    apiKey = authResult.apiKey;
  } catch {
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
    } else {
      logger.info(
        "[Eliza Messages API] ⓘ No character mapping found for room:",
        roomId,
        "- using default character",
      );
    }
  }

  // Build user context for runtime creation using centralized service
  const userContext = await userContextService.buildContext({
    user,
    apiKey,
    isAnonymous,
    anonymousSession: anonymousSession ?? undefined,
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

  const responseContent = result.result?.responseContent;

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
}

/**
 * GET /api/eliza/rooms/[roomId]/messages
 * Retrieves messages from a room, optionally filtered by timestamp for polling.
 *
 * @param request - Request with optional limit and afterTimestamp query parameters.
 * @param ctx - Route context containing the room ID parameter.
 * @returns Array of messages with pagination metadata.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
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
    ? messages.filter((msg: Memory) => {
        const msgTime = msg.createdAt ?? 0;
        return msgTime > afterTimestampNum;
      })
    : messages;

  const simple = filteredMessages
    .map((msg: Memory) => {
      return {
        id: msg.id,
        entityId: msg.entityId,
        agentId: msg.agentId,
        content: msg.content,
        createdAt: msg.createdAt ?? Date.now(),
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
}
