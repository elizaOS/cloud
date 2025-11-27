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
    // Step 1: Authentication & Context Building (single step, clean!)
    const userContext = await authenticateAndBuildContext(request);

    // Step 2: Parse and validate request
    const { roomId } = await ctx.params;
    const body = await request.json();
    const { entityId, text, model } = body;

    if (!roomId || !entityId || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

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
async function authenticateAndBuildContext(request: NextRequest) {
  try {
    // Try authenticated user first
    const authResult = await requireAuthOrApiKey(request);
    return await userContextService.buildContext({
      ...authResult,
      isAnonymous: false,
    });
  } catch (error) {
    // Fall back to anonymous user
    logger.info("[Stream] Privy auth failed, trying anonymous user...");
    
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
      logger.info("[Stream] Created anonymous user:", anonData.user.id);
    } else {
      logger.info("[Stream] Anonymous user found:", anonData.user.id);
    }

    return await userContextService.buildContext({
      user: anonData.user,
      anonymousSession: anonData.session,
      isAnonymous: true,
    });
  }
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
