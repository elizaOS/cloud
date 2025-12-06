import type { NextRequest } from "next/server";
import { stringToUuid, type UUID } from "@elizaos/core";
import { organizationsService, charactersService, appCreditsService } from "@/lib/services";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { logger } from "@/lib/utils/logger";
import { roomsRepository } from "@/db/repositories";
import { userContextService } from "@/lib/eliza/user-context";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { sendMessageWithSideEffects } from "@/lib/eliza/send-message";
import type { AgentModeConfig } from "@/lib/eliza/agent-mode-types";
import {
  AgentMode,
  isValidAgentModeConfig,
} from "@/lib/eliza/agent-mode-types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/eliza/rooms/[roomId]/messages/stream
 * Single-endpoint streaming architecture for Eliza agent messages.
 * Receives message via POST and streams back thinking indicator and agent response via SSE.
 *
 * Single-endpoint streaming architecture:
 * - Receives message via POST
 * - Streams back thinking indicator and agent response via SSE
 * - Uses core ElizaOS.sendMessage() for iso behavior (server/serverless)
 *
 * @param request - Request body with text, optional model, agentMode, sessionToken, attachments, and appId.
 * @param ctx - Route context containing the room ID parameter.
 * @returns SSE stream with thinking indicators and agent response.
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
) {
  const encoder = new TextEncoder();

  // Step 1: Parse request body FIRST (needed for session token check and agent mode)
  const { roomId } = await ctx.params;
  const body = await request.json();
  const { text, model, agentMode, sessionToken, attachments, appId: bodyAppId } = body;
  
  // App ID can come from body OR X-App-Id header (miniapp proxy uses header)
  const appId = bodyAppId || request.headers.get("X-App-Id");

  if (!roomId || !text?.trim()) {
    return new Response(
      JSON.stringify({ error: "Missing required fields" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Validate agentMode if provided, default to CHAT
  let agentModeConfig: AgentModeConfig;
  if (agentMode) {
    if (!isValidAgentModeConfig(agentMode)) {
      return new Response(
        JSON.stringify({ error: "Invalid agent mode configuration" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
    agentModeConfig = agentMode;
    logger.info(`[Stream] Using agent mode: ${agentModeConfig.mode}`);
  } else {
    // Default to CHAT mode
    agentModeConfig = { mode: AgentMode.CHAT };
    logger.info("[Stream] No agent mode specified, defaulting to CHAT");
  }

  if (model) {
    logger.debug("[Stream] User selected model:", model);
  }

  // Step 2: Authentication & Context Building
  logger.info(
    `[Stream] 📊 Session token from body: ${sessionToken ? `${sessionToken.slice(0, 8)}...` : "N/A"}`
  );
  const userContext = await authenticateAndBuildContext(
    request,
    agentModeConfig.mode,
    { sessionToken, appId }
  );

  logger.info("[Stream] 📊 UserContext after auth:", {
    isAnonymous: userContext.isAnonymous,
    hasSessionToken: !!userContext.sessionToken,
    sessionTokenPreview: `${userContext.sessionToken?.slice(0, 8)}...`,
    userId: userContext.userId,
  });

  // Step 3: Rate limiting for anonymous users
  if (userContext.isAnonymous && userContext.sessionToken) {
    const limitCheck = await checkAnonymousLimit(userContext.sessionToken);

    if (!limitCheck.allowed) {
      const errorMessage =
        limitCheck.reason === "message_limit"
          ? `You've reached your free message limit (${limitCheck.limit} messages). Sign up to continue!`
          : "Hourly rate limit reached. Wait an hour or sign up for unlimited access.";

      return new Response(
        JSON.stringify({
          error: errorMessage,
          requiresSignup: true,
          reason: limitCheck.reason,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // Step 3.5: App credit balance check (miniapp billing)
  // Only check if app has monetization enabled - otherwise user uses org credits
  if (userContext.appId) {
    const monetizationSettings = await appCreditsService.getMonetizationSettings(userContext.appId);
    
    // Only enforce app-specific credit check if monetization is enabled
    if (monetizationSettings?.monetizationEnabled) {
      // Estimate minimum cost (actual cost calculated after processing)
      const MINIMUM_MESSAGE_COST = 0.001; // $0.001 minimum to ensure some balance exists
      
      const balanceCheck = await appCreditsService.checkBalance(
        userContext.appId,
        userContext.userId,
        MINIMUM_MESSAGE_COST
      );

      if (!balanceCheck.sufficient) {
        logger.warn("[Stream] Insufficient app credits", {
          appId: userContext.appId,
          userId: userContext.userId,
          balance: balanceCheck.balance,
          required: MINIMUM_MESSAGE_COST,
        });

        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            details: `Your balance ($${balanceCheck.balance.toFixed(2)}) is too low. Please purchase more credits to continue.`,
            requiresPurchase: true,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } }
        );
      }
    }
  }

  // Step 4: Get character assignment for room from agentId (single source of truth)
  const room = await roomsRepository.findById(roomId);
  let characterId: string | undefined = room?.agentId || undefined;

  // Step 4.5: Check if this is an affiliate character and switch to ASSISTANT mode
  // Affiliate characters need ASSISTANT mode for image generation capability
  // The image generation action's validate function ensures images are only generated
  // when explicitly requested (e.g., "send me a pic", "generate an image")
  if (characterId && agentModeConfig.mode === AgentMode.CHAT) {
    const character = await charactersService.getById(characterId);
    if (character) {
      const characterData = character.character_data as
        | Record<string, unknown>
        | undefined;
      const affiliateData = characterData?.affiliate as
        | Record<string, unknown>
        | undefined;

      if (affiliateData && Object.keys(affiliateData).length > 0) {
        logger.info(
          `[Stream] 🎭 Detected affiliate character - switching to ASSISTANT mode for image generation`
        );
        agentModeConfig = { mode: AgentMode.ASSISTANT };
        // CRITICAL: Also update userContext so runtime loads correct plugins
        userContext.agentMode = AgentMode.ASSISTANT;
      }
    }
  }

  // For BUILD mode, use the targetCharacterId from agent mode metadata
  if (
    agentModeConfig.mode === AgentMode.BUILD &&
    agentModeConfig.metadata?.targetCharacterId
  ) {
    characterId = String(agentModeConfig.metadata.targetCharacterId);
    logger.info(
      `[Stream] BUILD mode - Using character from metadata: ${characterId}`
    );

    // Update room agentId for build mode (proper column, not metadata)
    if (characterId && room && room.agentId !== characterId) {
      await roomsRepository.update(roomId, { agentId: characterId });
      logger.info(
        `[Stream] BUILD mode - Updated room agentId: room ${roomId} → agent ${characterId}`
      );
    }
  }

  logger.info(
    `[Stream] Room ${roomId} - Character lookup:`,
    characterId ? `Using character ${characterId}` : "Using default character"
  );

  // Step 5: Apply model preferences if provided
  if (model) {
    userContext.modelPreferences = {
      smallModel: model,
      largeModel: model,
    };
    logger.info(`[Stream] User selected model: ${model}`);
  } else if (userContext.modelPreferences) {
    logger.info(
      `[Stream] Using stored model preferences: ${userContext.modelPreferences.smallModel} / ${userContext.modelPreferences.largeModel}`
    );
  } else {
    logger.info("[Stream] No model preference set, using defaults");
  }

  // Apply character if specified
  if (characterId) {
    userContext.characterId = characterId;
    logger.info(`[Stream] Set characterId in userContext: ${characterId}`);
  }

  // Step 6: Create runtime and get ElizaOS instance
  const elizaOS = runtimeFactory.getElizaOS();
  const agentRuntime = await runtimeFactory.createRuntimeForUser(userContext);

  // Step 7: Create streaming response
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: unknown) => {
        const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(message));
      };

      try {
        // Send connection confirmation
        sendEvent("connected", { roomId, timestamp: Date.now() });

        // Send user message event
        sendEvent("message", {
          id: `user-${Date.now()}`,
          entityId: userContext.userId,
          content: { text, attachments: attachments || undefined },
          createdAt: Date.now(),
          isAgent: false,
          type: "user",
        });

        // Send thinking indicator
        sendEvent("message", {
          id: `thinking-${Date.now()}`,
          entityId: "agent",
          content: { text: "" },
          createdAt: Date.now(),
          isAgent: true,
          type: "thinking",
        });

        // Process message using core ElizaOS.sendMessage() with side effects
        logger.info("[Stream] Processing message via sendMessageWithSideEffects...");
        const result = await sendMessageWithSideEffects(
          elizaOS,
          agentRuntime,
          roomId as UUID,
          stringToUuid(userContext.entityId) as UUID,
          { text, source: "cloud" },
          userContext,
          characterId,
        );

        // Extract response from result
        const responseContent = result.processing?.responseContent;
        const responseText = responseContent?.text || "";

        // Build response content payload
        const responseContentPayload: Record<string, unknown> = {
          text: responseText,
          source: responseContent?.source || "agent",
        };

        // Include attachments if present
        if (responseContent?.attachments) {
          responseContentPayload.attachments = responseContent.attachments;
        }

        // Include actions if present
        if (responseContent?.actions) {
          responseContentPayload.actions = responseContent.actions;
        }

        // Include thought if present
        if (responseContent?.thought) {
          responseContentPayload.thought = responseContent.thought;
        }

        // Include metadata if present
        if (responseContent?.metadata) {
          responseContentPayload.metadata = responseContent.metadata;
        }

        // Send agent response
        sendEvent("message", {
          id: result.messageId,
          entityId: agentRuntime.agentId,
          agentId: agentRuntime.agentId,
          content: responseContentPayload,
          createdAt: Date.now(),
          isAgent: true,
          type: "agent",
        });

        // Check low credits warning (billing handled by gateway)
        if (!userContext.isAnonymous) {
          const remainingCredits = await checkUserCredits(
            userContext.organizationId
          );
          if (remainingCredits < 1.0) {
            sendEvent("warning", {
              message: "Low credits - please top up to continue",
            });
          }
        }

        // Send completion event
        sendEvent("done", { timestamp: Date.now() });

        controller.close();
      } catch (error) {
        logger.error("[Stream] Error:", error);
        sendEvent("error", {
          message:
            error instanceof Error ? error.message : "Processing failed",
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Helper function to authenticate and build user context
 * Centralizes authentication and context creation
 *
 * IMPORTANT: Auth priority (ALWAYS try Privy first):
 * 1. Try Privy/API key auth - if succeeds, return authenticated context
 * 2. If Privy fails, try anonymous session from token/cookie
 * 3. If no session, create new anonymous session
 *
 * This ensures authenticated users are NEVER treated as anonymous,
 * even if they have a stale session token in their request.
 */
async function authenticateAndBuildContext(
  request: NextRequest,
  agentMode: AgentMode,
  body?: { sessionToken?: string; appId?: string }
) {
  const headerToken = request.headers.get("X-Anonymous-Session");
  const bodyToken = body?.sessionToken;
  const anonymousSessionToken = headerToken || bodyToken;

  logger.info("[Stream Auth] Starting authentication", {
    hasSessionToken: !!anonymousSessionToken,
    tokenPreview: anonymousSessionToken ? `${anonymousSessionToken.slice(0, 8)}...` : "N/A",
  });

  // CRITICAL: ALWAYS try Privy auth FIRST, regardless of session token
  // This ensures authenticated users are never treated as anonymous
  try {
    logger.info("[Stream Auth] Attempting Privy/API key authentication...");
    const authResult = await requireAuthOrApiKey(request);
    logger.info(
      "[Stream Auth] ✅ Privy/API auth SUCCEEDED - treating as authenticated user:",
      {
        userId: authResult.user.id,
        authMethod: authResult.authMethod,
        isAnonymous: authResult.user.is_anonymous,
      }
    );

    // Double-check the user is not anonymous (migration should have set this to false)
    if (authResult.user.is_anonymous) {
      logger.warn(
        "[Stream Auth] ⚠️ User is authenticated but still marked as anonymous - this may indicate incomplete migration"
      );
    }

    return await userContextService.buildContext({
      ...authResult,
      isAnonymous: false,
      agentMode,
      appId: body?.appId,
    });
  } catch (error) {
    logger.info(
      "[Stream Auth] ❌ Privy auth failed, falling back to anonymous:",
      error instanceof Error ? error.message : String(error)
    );
  }

  // Privy auth failed - handle as anonymous user
  logger.info("[Stream Auth] Processing as anonymous user...");

  // Use provided token for session lookup
  const providedToken = anonymousSessionToken;

  const { anonymousSessionsService, usersService } = await import(
    "@/lib/services"
  );

  // Try provided session token first
  if (providedToken) {
    logger.info(
      `[Stream] 🔑 Session token provided in request: ${providedToken.slice(0, 8)}...`
    );

    const session = await anonymousSessionsService.getByToken(providedToken);

    logger.info("[Stream] 🔍 Session lookup result:", {
      found: !!session,
      sessionId: session?.id,
      messageCount: session?.message_count,
      isActive: session?.is_active,
      convertedAt: session?.converted_at,
      tokenUsed: `${providedToken.slice(0, 8)}...`,
    });

    if (session) {
      // Check if session has been converted (user authenticated after this session was created)
      if (session.converted_at || !session.is_active) {
        logger.info(
          "[Stream] ⚠️ Session has been converted/deactivated - user should be authenticated",
          {
            sessionId: session.id,
            convertedAt: session.converted_at,
            isActive: session.is_active,
          }
        );
        // This session was migrated - the user should authenticate via Privy
        // Don't use this session, fall through to create new anonymous or fail
      } else {
        const user = await usersService.getById(session.user_id);
        logger.info("[Stream] 👤 User lookup result:", {
          found: !!user,
          userId: user?.id,
          isAnonymous: user?.is_anonymous,
        });

        if (user && user.is_anonymous) {
          logger.info("[Stream] ✅ Using session from provided token:", {
            sessionId: session.id,
            userId: user.id,
            sessionToken: `${session.session_token.slice(0, 8)}...`,
            messageCount: session.message_count,
          });
          return await userContextService.buildContext({
            user: { ...user, organization: null as never },
            anonymousSession: session,
            isAnonymous: true,
            agentMode,
            appId: body?.appId,
          });
        } else {
          logger.warn(
            "[Stream] ⚠️ User not found or not anonymous for session:",
            session.id
          );
        }
      }
    } else {
      logger.warn(
        `[Stream] ⚠️ Session not found for provided token: ${providedToken.slice(0, 8)}...`
      );
    }

    logger.warn(
      "[Stream] ⚠️ Provided session token invalid or converted, falling back to cookie"
    );
  }

  // Fall back to cookie
  let anonData = await getAnonymousUser();

  if (!anonData) {
    logger.info("[Stream] No session cookie - creating new anonymous session");
    const { getOrCreateAnonymousUser } = await import("@/lib/auth-anonymous");
    const newAnonData = await getOrCreateAnonymousUser();
    anonData = {
      user: newAnonData.user,
      session: newAnonData.session,
    };
    logger.info("[Stream] Created anonymous user:", {
      userId: anonData.user.id,
      sessionToken: `${anonData.session?.session_token.slice(0, 8)}...`,
    });
  } else {
    logger.info("[Stream] Anonymous user found via cookie:", {
      userId: anonData.user.id,
      sessionToken: `${anonData.session?.session_token.slice(0, 8)}...`,
      messageCount: anonData.session?.message_count,
    });
  }

  return await userContextService.buildContext({
    user: anonData.user,
    anonymousSession: anonData.session!,
    isAnonymous: true,
    agentMode,
    appId: body?.appId,
  });
}

/**
 * Helper function to check user credits
 */
async function checkUserCredits(organizationId: string): Promise<number> {
  const org = await organizationsService.getById(organizationId);
  if (!org) {
    return 0;
  }
  return Number.parseFloat(String(org.credit_balance));
}
