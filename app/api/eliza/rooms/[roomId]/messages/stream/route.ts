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

    // Get character assignment for room
    const roomCharacter =
      await elizaRoomCharactersRepository.findByRoomId(roomId);
    const characterId = roomCharacter?.character_id || undefined;

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
          logger.info("[Stream Messages] Processing message...");
          const result = await agentRuntime.handleMessage(
            roomId,
            entityId,
            { text },
            characterId,
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

          // Send agent response
          sendEvent("message", {
            id: result.message.id,
            entityId: result.message.entityId,
            agentId: result.message.agentId,
            content: {
              text: responseText,
              source: "agent",
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
                // Get character name from runtime
                let characterName = "Agent";
                try {
                  if (characterId) {
                    const runtime = await agentRuntime.getRuntimeForCharacter(characterId);
                    characterName = runtime.character.name || "Agent";
                  } else {
                    const runtime = await agentRuntime.getRuntime();
                    characterName = runtime.character.name || "Agent";
                  }
                } catch (err) {
                  logger.error("[Stream Messages] Failed to fetch character name from runtime:", err);
                }

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
