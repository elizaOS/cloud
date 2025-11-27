import { NextRequest } from "next/server";
import { organizationsService } from "@/lib/services";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { logger } from "@/lib/utils/logger";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { userContextService } from "@/lib/eliza/user-context";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/eliza/rooms/[roomId]/messages/stream
 *
 * Single-endpoint streaming architecture:
 * - Receives message via POST
 * - Streams back thinking indicator and agent response via SSE
 * - All processing happens in same container (no cross-container issues!)
 * - Simple, fast, and works perfectly on serverless
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const encoder = new TextEncoder();

  try {
    // Step 1: Parse request body FIRST (needed for session token check)
    const { roomId } = await ctx.params;
    const body = await request.json();
    const { entityId, text, model, sessionToken } = body;

    if (!roomId || !entityId || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Step 2: Authentication & Context Building (pass body for session token check)
    logger.info("[Stream] 📊 Session token from body:", sessionToken ? sessionToken.slice(0, 8) + "..." : "N/A");
    const userContext = await authenticateAndBuildContext(request, { sessionToken });
    
    logger.info("[Stream] 📊 UserContext after auth:", {
      isAnonymous: userContext.isAnonymous,
      hasSessionToken: !!userContext.sessionToken,
      sessionTokenPreview: userContext.sessionToken?.slice(0, 8) + "...",
      userId: userContext.userId,
    });

    if (model) {
      logger.debug("[Stream] User selected model:", model);
    }

    // Step 3: Rate limiting for anonymous users
    if (userContext.isAnonymous && userContext.sessionToken) {
      const limitCheck = await checkAnonymousLimit(userContext.sessionToken);

      if (!limitCheck.allowed) {
        const errorMessage =
          limitCheck.reason === "message_limit"
            ? `You've reached your free message limit (${limitCheck.limit} messages). Sign up to continue!`
            : `Hourly rate limit reached. Wait an hour or sign up for unlimited access.`;

        return new Response(
          JSON.stringify({
            error: errorMessage,
            requiresSignup: true,
            reason: limitCheck.reason,
          }),
          { status: 429, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // Step 4: Get character assignment for room
    const roomCharacter =
      await elizaRoomCharactersRepository.findByRoomId(roomId);
    const characterId = roomCharacter?.character_id || undefined;

    logger.info(
      `[Stream] Room ${roomId} - Character lookup:`,
      characterId
        ? `Using character ${characterId}`
        : "Using default character",
    );

    // Step 5: Apply model preferences if provided
    if (model) {
      userContext.modelPreferences = {
        smallModel: model,
        largeModel: model,
      };
    }

    // Apply character if specified
    if (characterId) {
      userContext.characterId = characterId;
      logger.info(`[Stream] Set characterId in userContext: ${characterId}`);
    }

    // Step 6: Create runtime with user context (clean, no key fetching here!)
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

    // Step 7: Create message handler
    const messageHandler = createMessageHandler(runtime, userContext);

    // Step 8: Create streaming response
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
            entityId,
            content: { text },
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

          // Process message and get response (much cleaner!)
          logger.info("[Stream Messages] Processing message...");
          const result = await messageHandler.process({
            roomId,
            entityId,
            text,
            model,
          });

          const responseText =
            typeof result.message.content === "string"
              ? result.message.content
              : result.message.content?.text || "";

          // Extract attachments if present
          const attachments =
            typeof result.message.content === "object" &&
            result.message.content?.attachments
              ? result.message.content.attachments
              : undefined;

          // Send agent response
          sendEvent("message", {
            id: result.message.id,
            entityId: result.message.entityId,
            agentId: result.message.agentId,
            content: {
              text: responseText,
              source: "agent",
              ...(attachments && { attachments }),
            },
            createdAt: result.message.createdAt || Date.now(),
            isAgent: true,
            type: "agent",
          });

          // Credits and side effects are handled by MessageHandler
          // Check if we should send low credit warning
          if (result.usage && !userContext.isAnonymous) {
            // This is just for the warning event, actual credit deduction happened in MessageHandler
            const remainingCredits = await checkUserCredits(
              userContext.organizationId,
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
          logger.error("[Stream Messages] Error:", error);
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
  } catch (error) {
    logger.error("[Stream Messages] Request error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Request failed",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Helper function to authenticate and build user context
 * Centralizes authentication and context creation
 */
async function authenticateAndBuildContext(request: NextRequest, body?: { sessionToken?: string }) {
  logger.info("[Stream Auth] Starting authentication, sessionToken in body:", body?.sessionToken?.slice(0, 8) + "...");
  
  // CRITICAL: Check for anonymous session token FIRST
  // If an anonymous session token is explicitly provided, we should use it
  // This prevents issues where a user might have a stale Privy session
  const headerToken = request.headers.get("X-Anonymous-Session");
  const bodyToken = body?.sessionToken;
  const anonymousSessionToken = headerToken || bodyToken;
  
  if (anonymousSessionToken) {
    logger.info("[Stream Auth] 🔑 Anonymous session token detected, prioritizing anonymous flow:", anonymousSessionToken.slice(0, 8) + "...");
    // Skip Privy auth and go straight to anonymous handling
    // This ensures the message count is tracked for the correct session
  } else {
    // No anonymous token provided, try Privy auth
    try {
      logger.info("[Stream Auth] Attempting Privy/API key authentication...");
      const authResult = await requireAuthOrApiKey(request);
      logger.info("[Stream Auth] ✅ Privy/API auth SUCCEEDED - treating as authenticated user:", {
        userId: authResult.user.id,
        authMethod: authResult.authMethod,
      });
      return await userContextService.buildContext({
        ...authResult,
        isAnonymous: false,
      });
    } catch (error) {
      logger.info("[Stream Auth] ❌ Privy auth failed, error:", error instanceof Error ? error.message : String(error));
    }
  }
  
  // Handle anonymous user
  logger.info("[Stream Auth] Processing as anonymous user...");
    
  // CRITICAL: Check for session token in multiple places to avoid race condition
  // Priority: 1) Header, 2) Body, 3) Cookie
  // IMPORTANT: If a token is explicitly provided, we MUST use it and NOT fall back silently
  // Note: We use anonymousSessionToken which was already extracted above
  const providedToken = anonymousSessionToken;
  
  const { anonymousSessionsService, usersService } = await import("@/lib/services");
  
  if (providedToken) {
    logger.info("[Stream] 🔑 Session token provided in request:", providedToken.slice(0, 8) + "...");
    
    // Look up the session by the provided token
    const session = await anonymousSessionsService.getByToken(providedToken);
    
    logger.info("[Stream] 🔍 Session lookup result:", {
      found: !!session,
      sessionId: session?.id,
      messageCount: session?.message_count,
      tokenUsed: providedToken.slice(0, 8) + "...",
    });
    
    if (session) {
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
          sessionToken: session.session_token.slice(0, 8) + "...",
          messageCount: session.message_count,
        });
        return await userContextService.buildContext({
          user: { ...user, organization: null as never },
          anonymousSession: session,
          isAnonymous: true,
        });
      } else {
        logger.warn("[Stream] ⚠️ User not found or not anonymous for session:", session.id);
      }
    } else {
      logger.warn("[Stream] ⚠️ Session not found for provided token:", providedToken.slice(0, 8) + "...");
      // Session not found - this could mean it expired or was never created properly
      // DO NOT fall back to cookie silently - this would cause message count to be tracked for wrong session
    }
    
    // If we had a provided token but couldn't find a valid session, log a warning
    // but still try cookie as fallback (for backward compatibility)
    logger.warn("[Stream] ⚠️ Provided session token invalid, falling back to cookie - THIS MAY CAUSE MESSAGE COUNT ISSUES");
  }
  
  // Fall back to cookie
  let anonData = await getAnonymousUser();
  
  if (!anonData) {
    // No cookie found - create new anonymous session
    logger.info("[Stream] No session cookie - creating new anonymous session");
    const { getOrCreateAnonymousUser } = await import("@/lib/auth-anonymous");
    const newAnonData = await getOrCreateAnonymousUser();
    anonData = {
      user: newAnonData.user,
      session: newAnonData.session,
    };
    logger.info("[Stream] Created anonymous user:", {
      userId: anonData.user.id,
      sessionToken: anonData.session.session_token.slice(0, 8) + "...",
    });
  } else {
    logger.info("[Stream] Anonymous user found via cookie:", {
      userId: anonData.user.id,
      sessionToken: anonData.session.session_token.slice(0, 8) + "...",
      messageCount: anonData.session.message_count,
    });
  }

  return await userContextService.buildContext({
    user: anonData.user,
    anonymousSession: anonData.session,
    isAnonymous: true,
  });
}

/**
 * Helper function to check user credits
 */
async function checkUserCredits(organizationId: string): Promise<number> {
  try {
    const org = await organizationsService.getById(organizationId);
    if (!org) {
      return 0;
    }
    return Number.parseFloat(String(org.credit_balance));
  } catch (error) {
    logger.error("[Stream] Failed to check credits:", error);
    return 0;
  }
}
