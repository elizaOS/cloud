import { NextRequest } from "next/server";
import { stringToUuid, type UUID } from "@elizaos/core";
import { organizationsService } from "@/lib/services";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import { logger } from "@/lib/utils/logger";
import { elizaRoomCharactersRepository } from "@/db/repositories";
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
 *
 * Single-endpoint streaming architecture:
 * - Receives message via POST
 * - Streams back thinking indicator and agent response via SSE
 * - Uses core ElizaOS.sendMessage() for iso behavior (server/serverless)
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
    const { entityId, text, model, agentMode } = body;

    if (!roomId || !entityId || !text?.trim()) {
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

    // Step 2: Authentication & Context Building
    const userContext = await authenticateAndBuildContext(
      request,
      agentModeConfig.mode,
    );

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
    let characterId = roomCharacter?.character_id || undefined;

    // For BUILD mode, use the targetCharacterId from agent mode metadata
    if (
      agentModeConfig.mode === AgentMode.BUILD &&
      agentModeConfig.metadata?.targetCharacterId
    ) {
      characterId = agentModeConfig.metadata.targetCharacterId as string;
      logger.info(
        `[Stream] BUILD mode - Using character from metadata: ${characterId}`,
      );

      // Ensure room-character association exists for build mode
      if (!roomCharacter && characterId) {
        try {
          await elizaRoomCharactersRepository.create({
            room_id: roomId,
            character_id: characterId,
            user_id: userContext.userId,
          });
          logger.info(
            `[Stream] BUILD mode - Created room-character association: room ${roomId} → character ${characterId}`,
          );
        } catch (error) {
          logger.error(
            `[Stream] BUILD mode - Failed to create room-character association:`,
            error,
          );
        }
      } else if (roomCharacter && roomCharacter.character_id !== characterId) {
        try {
          await elizaRoomCharactersRepository.update(roomId, characterId);
          logger.info(
            `[Stream] BUILD mode - Updated room-character association: room ${roomId} → character ${characterId}`,
          );
        } catch (error) {
          logger.error(
            `[Stream] BUILD mode - Failed to update room-character association:`,
            error,
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

          // Process message using core ElizaOS.sendMessage() with side effects
          logger.info("[Stream] Processing message via sendMessageWithSideEffects...");
          const result = await sendMessageWithSideEffects(
            elizaOS,
            agentRuntime,
            roomId as UUID,
            stringToUuid(entityId) as UUID,
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
  } catch (error) {
    logger.error("[Stream] Request error:", error);
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
 */
async function authenticateAndBuildContext(
  request: NextRequest,
  agentMode: AgentMode,
) {
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
