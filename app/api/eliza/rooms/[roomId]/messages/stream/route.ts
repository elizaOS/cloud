import { NextRequest } from "next/server";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { requireAuthOrApiKey } from "@/lib/auth";
import { getAnonymousUser, checkAnonymousLimit } from "@/lib/auth-anonymous";
import {
  creditsService,
  usageService,
  generationsService,
  anonymousSessionsService,
} from "@/lib/services";
import { calculateCost, getProviderFromModel } from "@/lib/pricing";
import { logger } from "@/lib/utils/logger";
import { elizaRoomCharactersRepository } from "@/db/repositories";
import { getUserElizaCloudApiKey } from "@/lib/eliza/user-api-key";
import { discordService } from "@/lib/services/discord";
import { db } from "@/db/client";
import { sql } from "drizzle-orm";
import { generateRoomTitle } from "@/lib/ai/generate-room-title";

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
    // Authentication
    let user: any;
    let apiKey: any = undefined;
    let isAnonymous = false;
    let anonymousSession: any = null;

    try {
      const authResult = await requireAuthOrApiKey(request);
      user = authResult.user;
      apiKey = authResult.apiKey;
    } catch (error) {
      const anonData = await getAnonymousUser();
      if (!anonData) {
        throw new Error("Authentication required");
      }

      user = anonData.user;
      anonymousSession = anonData.session;
      isAnonymous = true;
    }

    const { roomId } = await ctx.params;
    const body = await request.json();
    const { entityId, text, model } = body;

    // Validation
    if (!roomId || !entityId || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Log model selection if provided
    if (model) {
      logger.debug("[Stream] User selected model:", model);
    }

    // Anonymous rate limiting
    if (isAnonymous && anonymousSession) {
      const limitCheck = await checkAnonymousLimit(
        anonymousSession.session_token,
      );

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

    // ==================== BULLETPROOF CHARACTER LOADING ====================
    logger.info(
      `[Stream Messages] ========== CHARACTER LOADING START ==========`,
    );
    logger.info(`[Stream Messages] roomId: ${roomId}`);

    let characterId: string | undefined = undefined;
    let characterName = "Eliza"; // Default fallback

    try {
      // Step 1: Fetch character mapping from database
      const roomCharacter =
        await elizaRoomCharactersRepository.findByRoomId(roomId);

      if (!roomCharacter) {
        logger.warn(
          `[Stream Messages] ⚠ No character mapping found for room ${roomId}`,
        );
        logger.warn(`[Stream Messages] ⚠ Using default character (Eliza)`);
      } else {
        logger.info(`[Stream Messages] ✓ Character mapping found`);
        logger.info(`[Stream Messages]   room_id: ${roomCharacter.room_id}`);
        logger.info(
          `[Stream Messages]   character_id: ${roomCharacter.character_id}`,
        );
        logger.info(`[Stream Messages]   user_id: ${roomCharacter.user_id}`);

        // Step 2: Validate characterId format
        const mappedCharacterId = roomCharacter.character_id;

        if (mappedCharacterId.startsWith("template-")) {
          // CRITICAL ERROR: Template ID should never be in mapping
          logger.error(
            `[Stream Messages] ✗✗✗ CRITICAL: Template ID in mapping! ✗✗✗`,
          );
          logger.error(
            `[Stream Messages] This indicates room creation failed to convert template to UUID`,
          );
          logger.error(`[Stream Messages] templateId: ${mappedCharacterId}`);
          logger.warn(`[Stream Messages] Falling back to default character`);
        } else {
          // Step 3: Verify character exists in database
          try {
            const runtime =
              await agentRuntime.getRuntimeForCharacter(mappedCharacterId);
            characterId = mappedCharacterId;
            characterName = runtime.character.name || "Eliza";
            logger.info(
              `[Stream Messages] ✓ Character verified: ${characterName}`,
            );
            logger.info(`[Stream Messages] ✓ Character ID: ${characterId}`);
          } catch (charError) {
            logger.error(
              `[Stream Messages] ✗ Failed to load character ${mappedCharacterId}`,
            );
            logger.error(`[Stream Messages] Error:`, charError);
            logger.warn(`[Stream Messages] Falling back to default character`);
          }
        }
      }
    } catch (error) {
      logger.error(
        `[Stream Messages] ✗ Error loading character mapping:`,
        error,
      );
      logger.warn(`[Stream Messages] Falling back to default character`);
    }

    logger.info(
      `[Stream Messages] Final character: ${characterName} (${characterId || "default"})`,
    );
    logger.info(
      `[Stream Messages] ========== CHARACTER LOADING END ==========`,
    );

    // Get user's API key for ElizaCloud plugin authentication
    let userApiKey: string | null = null;
    if (!isAnonymous && user.id && user.organization_id) {
      try {
        userApiKey = await getUserElizaCloudApiKey(
          user.id,
          user.organization_id,
        );
        if (userApiKey) {
          logger.info(
            `[Stream Messages] Retrieved API key for user ${user.id}: ${userApiKey.substring(0, 12)}...`,
          );
        } else {
          // VALIDATION: Reject request if user has no API key
          logger.error(
            `[Stream Messages] No API key found for user ${user.id}`,
          );
          return new Response(
            JSON.stringify({
              error:
                "No API key found for your account. Please contact support or try logging out and back in.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      } catch (error) {
        logger.error(
          "[Stream Messages] Failed to retrieve user API key:",
          error,
        );
        return new Response(
          JSON.stringify({
            error: "Failed to authenticate agent. Please try again.",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    } else if (isAnonymous) {
      logger.info("[Stream Messages] Anonymous user - using shared runtime");
    }

    // Create streaming response
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

          // Process message and get response
          logger.info(
            `[Stream Messages] Processing message with character: ${characterName}`,
          );
          logger.info(
            `[Stream Messages] characterId: ${characterId || "default"}`,
          );

          const result = await agentRuntime.handleMessage(
            roomId,
            entityId,
            { text },
            characterId, // Will be undefined if no mapping/character found → uses default
            userApiKey
              ? {
                  userId: user.id,
                  apiKey: userApiKey,
                  modelPreferences: model
                    ? {
                        smallModel: model,
                        largeModel: model,
                      }
                    : undefined,
                }
              : undefined,
          );

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

          // Handle credits (if authenticated user with usage data)
          if (!isAnonymous && result.usage && user.organization_id) {
            try {
              const model = result.usage.model || "gpt-4o";
              const provider = getProviderFromModel(model);
              const costResult = await calculateCost(
                model,
                provider,
                result.usage.inputTokens,
                result.usage.outputTokens,
              );

              const deductResult = await creditsService.deductCredits({
                organizationId: user.organization_id,
                amount: costResult.totalCost,
                description: "Eliza chat message",
                metadata: {
                  model,
                  provider,
                  inputTokens: result.usage.inputTokens,
                  outputTokens: result.usage.outputTokens,
                },
              });

              await usageService.trackUsage({
                organization_id: user.organization_id,
                type: "llm",
                provider,
                model,
              });

              await generationsService.create({
                organization_id: user.organization_id,
                type: "chat",
                model,
                provider,
                prompt: text,
              });

              // Check remaining balance
              if (deductResult.newBalance < 1.0) {
                sendEvent("warning", {
                  message: "Low credits - please top up to continue",
                });
              }
            } catch (creditError) {
              logger.error(
                "[Stream Messages] Credit handling error:",
                creditError,
              );
            }
          }

          // Increment anonymous message count
          if (isAnonymous && anonymousSession) {
            await anonymousSessionsService.incrementMessageCount(
              anonymousSession.id,
            );
          }

          // Send messages to Discord thread (fire-and-forget)
          (async () => {
            try {
              // Get Discord thread ID from room metadata
              const roomData = await db.execute<{ metadata: any }>(
                sql`SELECT metadata FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
              );

              const threadId = roomData.rows[0]?.metadata?.discordThreadId;

              if (threadId) {
                // Use character name already loaded at the start of the request
                // (no need to fetch runtime again - more efficient and consistent)

                // Send user message
                await discordService.sendToThread(
                  threadId,
                  `**${user.name || user.email || entityId}:** ${text}`,
                );

                // Send agent response
                await discordService.sendToThread(
                  threadId,
                  `**🤖 ${characterName}:** ${responseText}`,
                );

                logger.info(
                  `[Stream Messages] Sent messages to Discord thread ${threadId} for character: ${characterName}`,
                );
              }
            } catch (err) {
              logger.error(
                "[Stream Messages] Failed to send to Discord thread:",
                err,
              );
            }
          })();

          // Generate room title if this is the first user message
          (async () => {
            try {
              // Check if room already has a title
              const roomCheck = await db.execute<{ name: string | null }>(
                sql`SELECT name FROM rooms WHERE id = ${roomId}::uuid LIMIT 1`,
              );

              const currentRoomName = roomCheck.rows[0]?.name;

              // Only generate title if room doesn't have one yet
              if (!currentRoomName) {
                logger.debug(
                  "[Room Title] Room has no title, generating from first message...",
                );

                // Generate title from the user's message
                const title = await generateRoomTitle(text);

                // Update room with the generated title
                await db.execute(
                  sql`UPDATE rooms SET name = ${title} WHERE id = ${roomId}::uuid`,
                );

                logger.info("[Room Title] Generated and saved title:", {
                  roomId,
                  title,
                });
              }
            } catch (err) {
              logger.error(
                "[Room Title] Failed to generate/save room title:",
                err,
              );
              // Non-critical error, don't interrupt the message flow
            }
          })();

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
