import { NextRequest } from "next/server";
import { organizationsService } from "@/lib/services";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { logger } from "@/lib/utils/logger";
import { roomsRepository } from "@/db/repositories";
import { userContextService } from "@/lib/eliza/user-context";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import type { AgentModeConfig } from "@/lib/eliza/agent-mode-types";
import { AgentMode, isValidAgentModeConfig } from "@/lib/eliza/agent-mode-types";

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
    // Step 1: Parse and validate request
    const { roomId } = await ctx.params;
    const body = await request.json();
    const { text, model, agentMode } = body;

    if (!roomId || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate agentMode if provided, default to CHAT
    let agentModeConfig: AgentModeConfig | undefined;
    if (agentMode) {
      if (!isValidAgentModeConfig(agentMode)) {
        return new Response(
          JSON.stringify({ error: "Invalid agent mode configuration" }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      agentModeConfig = agentMode;
      logger.info(`[Stream] Using agent mode: ${agentModeConfig.mode}`);
    } else {
      // Default to CHAT mode
      agentModeConfig = { mode: AgentMode.CHAT };
      logger.info(`[Stream] No agent mode specified, defaulting to CHAT`);
    }

    if (model) {
      logger.debug("[Stream] User selected model:", model);
    }

    // Step 2: Authentication & Context Building (single step, clean!)
    const userContext = await authenticateAndBuildContext(request, agentModeConfig.mode);

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

    // Step 4: Get character assignment for room from metadata
    const room = await roomsRepository.findById(roomId);
    let characterId = (room?.metadata?.characterId as string) || undefined;
    
    // For BUILD mode, use the targetCharacterId from agent mode metadata
    // This ensures we're editing the correct character, not the default
    if (agentModeConfig.mode === AgentMode.BUILD && agentModeConfig.metadata?.targetCharacterId) {
      characterId = agentModeConfig.metadata.targetCharacterId as string;
      logger.info(
        `[Stream] BUILD mode - Using character from metadata: ${characterId}`
      );
      
      // Store character ID in room metadata for build mode
      if (characterId) {
        try {
          await roomsRepository.setCharacterId(roomId, characterId);
          logger.info(
            `[Stream] BUILD mode - Stored character in room metadata: room ${roomId} → character ${characterId}`
          );
        } catch (error) {
          logger.error(
            `[Stream] BUILD mode - Failed to store character in room metadata:`,
            error
          );
        }
      }
    }
    
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
      logger.info(`[Stream] User selected model: ${model}`);
    } else if (userContext.modelPreferences) {
      logger.info(
        `[Stream] Using stored model preferences: ${userContext.modelPreferences.smallModel} / ${userContext.modelPreferences.largeModel}`,
      );
    } else {
      logger.info(`[Stream] No model preference set, using defaults`);
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
            entityId: userContext.userId,
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

          // Process message and get response (using user's actual ID)
          logger.info("[Stream Messages] Processing message...");
          const result = await messageHandler.process({
            roomId,
            text,
            model,
            agentModeConfig,
          });

          // Extract content - the full Content object is now stored in memory
          const messageContent = result.message.content;
          const responseText =
            typeof messageContent === "string"
              ? messageContent
              : messageContent?.text || "";

          // Build response content, preserving all Content fields
          const responseContentPayload: Record<string, unknown> = {
            text: responseText,
            source: messageContent?.source || "agent",
          };

          // Include attachments if present
          if (typeof messageContent === "object" && messageContent?.attachments) {
            responseContentPayload.attachments = messageContent.attachments;
          }

          // Include actions if present (needed for frontend to detect APPLY_CHARACTER_CHANGES)
          if (typeof messageContent === "object" && messageContent?.actions) {
            responseContentPayload.actions = messageContent.actions;
          }

          // Include thought if present
          if (typeof messageContent === "object" && messageContent?.thought) {
            responseContentPayload.thought = messageContent.thought;
          }

          // Include metadata if present (for PROPOSE_CHARACTER_CHANGES with updatedCharacter)
          if (typeof messageContent === "object" && messageContent?.metadata) {
            responseContentPayload.metadata = messageContent.metadata;
          }

          // Send agent response
          sendEvent("message", {
            id: result.message.id,
            entityId: result.message.entityId,
            agentId: result.message.agentId,
            content: responseContentPayload,
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
async function authenticateAndBuildContext(request: NextRequest, agentMode: AgentMode) {
  try {
    // Try authenticated user first
    const authResult = await requireAuthOrApiKey(request);
    return await userContextService.buildContext({
      ...authResult,
      isAnonymous: false,
      agentMode,
    });
  } catch (error) {
    // Fall back to anonymous user
    const anonData = await getAnonymousUser();
    if (!anonData) {
      throw new Error("Authentication required");
    }

    return await userContextService.buildContext({
      user: anonData.user,
      anonymousSession: anonData.session,
      isAnonymous: true,
      agentMode,
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
