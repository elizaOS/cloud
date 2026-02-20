import { roomsRepository } from "@/db/repositories";
import { requireAuthOrApiKey } from "@/lib/auth";
import {
  checkAnonymousLimit,
  getAnonymousUser,
  getOrCreateAnonymousUser,
} from "@/lib/auth-anonymous";
import { anonymousSessionsService } from "@/lib/services/anonymous-sessions";
import { usersService } from "@/lib/services/users";
import type { AgentModeConfig } from "@/lib/eliza/agent-mode-types";
import {
  AgentMode,
  isValidAgentModeConfig,
} from "@/lib/eliza/agent-mode-types";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { runtimeFactory, DEFAULT_AGENT_ID_STRING } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { appCreditsService } from "@/lib/services/app-credits";
import { charactersService } from "@/lib/services/characters/characters";
import { contentModerationService } from "@/lib/services/content-moderation";
import { organizationsService } from "@/lib/services/organizations";
import { entitySettingsService } from "@/lib/services/entity-settings";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import {
  validateAppId,
  validateAppPromptConfig,
  clientCharacterStateSchema,
} from "@/lib/eliza/stream-validation";
import { trackServerEvent } from "@/lib/analytics/posthog-server";
import {
  runWithRequestContext,
  type RequestContext,
  type UUID,
} from "@elizaos/core";
import { createPerfTrace } from "@/lib/utils/perf-trace";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 180; // 3 minutes for image generation support

/**
 * POST /api/eliza/rooms/[roomId]/messages/stream
 *
 * Single-endpoint streaming architecture:
 * - Receives message via POST
 * - Streams back thinking indicator and agent response via SSE
 * - All processing happens in same container (no cross-container issues!)
 * - Simple, fast, and works perfectly on serverless
 *
 * Security: entityId is derived from authenticated user, not client-supplied
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> },
) {
  const encoder = new TextEncoder();

  try {
    // PERF: Granular timing for the entire request pipeline
    const perfTrace = createPerfTrace("stream-route");
    perfTrace.mark("parse-request");

    // Step 1: Parse request body FIRST (needed for session token check and agent mode)
    const { roomId } = await ctx.params;
    const body = await request.json();
    const {
      text,
      model,
      agentMode,
      sessionToken,
      attachments,
      appId: bodyAppId,
      appPromptConfig,
      webSearchEnabled,
      createImageEnabled,
      imageModel,
    } = body;

    // App ID can come from body OR X-App-Id header (miniapp proxy uses header)
    const rawAppId = bodyAppId || request.headers.get("X-App-Id");

    // Validate appId format if provided (must be UUID)
    const appIdResult = validateAppId(rawAppId);
    if (!appIdResult.valid) {
      return new Response(JSON.stringify({ error: appIdResult.error }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const appId = appIdResult.appId;

    if (!roomId || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Validate appPromptConfig if provided
    const promptConfigResult = validateAppPromptConfig(appPromptConfig);
    if (!promptConfigResult.valid) {
      return new Response(
        JSON.stringify({
          error: promptConfigResult.error,
          details: promptConfigResult.details,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Web search is enabled by default unless explicitly set to false
    // When web search is enabled, we need ASSISTANT mode for the web-search plugin
    const effectiveWebSearchEnabled = webSearchEnabled !== false;

    // Determine agent mode based on explicit request, then web search toggle
    // Priority: explicit mode (any) > web search toggle > default
    let agentModeConfig: AgentModeConfig;

    // Validate explicit agentMode if provided
    if (agentMode && !isValidAgentModeConfig(agentMode)) {
      return new Response(
        JSON.stringify({ error: "Invalid agent mode configuration" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Determine agent mode: explicit > features toggle > default
    // Use ASSISTANT mode when web search OR image generation is enabled
    // Only use CHAT mode when both are disabled
    if (agentMode) {
      agentModeConfig = agentMode;
    } else if (effectiveWebSearchEnabled || createImageEnabled) {
      agentModeConfig = { mode: AgentMode.ASSISTANT };
    } else {
      agentModeConfig = { mode: AgentMode.CHAT };
    }

    // Step 2: Authentication & Context Building
    perfTrace.mark("auth");
    const userContext = await authenticateAndBuildContext(
      request,
      agentModeConfig.mode,
      { sessionToken, appId, appPromptConfig, webSearchEnabled },
    );

    // Set webSearchEnabled on context (defaults to true)
    userContext.webSearchEnabled = effectiveWebSearchEnabled;

    perfTrace.mark("parallel-checks");
    // PERF: Run independent checks in parallel after auth.
    // shouldBlockUser, room lookup, anonymous limit check, and app credits check
    // are all independent reads that were previously sequential (~500-800ms savings).
    const moderationCheck = contentModerationService.startModerationCheck(
      text,
      userContext.userId,
      roomId,
    );

    // Background moderation tracking (non-blocking)
    if (moderationCheck.moderationPromise) {
      moderationCheck.moderationPromise
        .then((result) => {
          if (result.flagged && result.action) {
            logger.warn("[Stream] Async moderation detected violation", {
              userId: userContext.userId,
              roomId,
              categories: result.flaggedCategories,
              scores: result.scores,
              action: result.action,
            });
          }
        })
        .catch((error) => {
          logger.error("[Stream] Background moderation failed", {
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }

    // Run all independent checks in parallel
    const [
      isBlocked,
      room,
      anonymousLimitResult,
      monetizationSettingsResult,
    ] = await Promise.all([
      // Check if user is blocked due to moderation violations
      contentModerationService.shouldBlockUser(userContext.userId),
      // Get room data (needed for character assignment)
      roomsRepository.findById(roomId),
      // Check anonymous rate limit (conditional but safe to always check)
      (userContext.isAnonymous && userContext.sessionToken)
        ? checkAnonymousLimit(userContext.sessionToken)
        : Promise.resolve(null),
      // Check app monetization settings (conditional but safe to always check)
      userContext.appId
        ? appCreditsService.getMonetizationSettings(userContext.appId)
        : Promise.resolve(null),
    ]);

    // Process parallel results: user block check
    if (isBlocked) {
      logger.warn("[Stream] User blocked due to moderation violations", {
        userId: userContext.userId,
      });
      perfTrace.end();
      return new Response(
        JSON.stringify({
          error:
            "Your account has been suspended due to policy violations. Please contact support.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Process parallel results: anonymous rate limit
    if (anonymousLimitResult && !anonymousLimitResult.allowed) {
      const errorMessage =
        anonymousLimitResult.reason === "message_limit"
          ? `You've reached your free message limit (${anonymousLimitResult.limit} messages). Sign up to continue!`
          : "Hourly rate limit reached. Wait an hour or sign up for unlimited access.";

      perfTrace.end();
      return new Response(
        JSON.stringify({
          error: errorMessage,
          requiresSignup: true,
          reason: anonymousLimitResult.reason,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } },
      );
    }

    // Process parallel results: app credit balance check
    if (monetizationSettingsResult?.monetizationEnabled && userContext.appId) {
      const MINIMUM_MESSAGE_COST = 0.001;
      const balanceCheck = await appCreditsService.checkBalance(
        userContext.appId,
        userContext.userId,
        MINIMUM_MESSAGE_COST,
      );

      if (!balanceCheck.sufficient) {
        logger.warn("[Stream] Insufficient app credits", {
          appId: userContext.appId,
          userId: userContext.userId,
          balance: balanceCheck.balance,
          required: MINIMUM_MESSAGE_COST,
        });

        perfTrace.end();
        return new Response(
          JSON.stringify({
            error: "Insufficient credits",
            details: `Your balance ($${balanceCheck.balance.toFixed(2)}) is too low. Please purchase more credits to continue.`,
            requiresPurchase: true,
          }),
          { status: 402, headers: { "Content-Type": "application/json" } },
        );
      }
    }
    perfTrace.mark("character-check");
    let characterId: string | undefined = room?.agentId || undefined;

    // Step 4.1: Check if room is locked (character was created/saved)
    // Locked rooms should not accept new messages
    const roomMetadata = room?.metadata as { locked?: boolean } | undefined;
    if (roomMetadata?.locked) {
      logger.info("[Stream] Room is locked - rejecting message", { roomId });
      return new Response(
        JSON.stringify({
          error: "This conversation has ended. Please start a new chat.",
          roomLocked: true,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // Step 4.5: Check character access and affiliate status
    // Access control: Characters are accessible if public, owned by user, or claimable affiliate
    // Affiliate characters use plugin-affiliate (no web search) with ASSISTANT mode
    if (characterId) {
      try {
        const character = await charactersService.getById(characterId);
        if (character) {
          // ACCESS CONTROL: Verify user can chat with this character
          // This is important even for existing rooms - if character becomes private,
          // users should no longer be able to send messages
          const isOwner = character.user_id === userContext.userId;
          const isPublic = character.is_public === true;
          const claimCheck =
            await charactersService.isClaimableAffiliateCharacter(characterId);
          const isClaimableAffiliate = claimCheck.claimable;

          if (!isPublic && !isOwner && !isClaimableAffiliate) {
            logger.warn("[Stream] Access denied to private character:", {
              characterId,
              userId: userContext.userId,
              characterOwnerId: character.user_id,
              isPublic: character.is_public,
            });
            return new Response(
              JSON.stringify({
                error:
                  "This agent is private. Only the owner can chat with it.",
                accessDenied: true,
              }),
              { status: 403, headers: { "Content-Type": "application/json" } },
            );
          }

          // Check legacy location: character_data.affiliate
          const characterData = character.character_data as
            | Record<string, unknown>
            | undefined;
          const legacyAffiliateData = characterData?.affiliate as
            | Record<string, unknown>
            | undefined;

          // Check new location: settings.affiliateData (used by miniapp)
          const settings = character.settings as
            | Record<string, unknown>
            | undefined;
          const settingsAffiliateData = settings?.affiliateData as
            | Record<string, unknown>
            | undefined;

          // Use whichever has data
          const affiliateData = settingsAffiliateData || legacyAffiliateData;

          if (affiliateData && Object.keys(affiliateData).length > 0) {
            logger.info(
              "[Stream] 🎭 Detected affiliate character - using affiliate plugin only (no web search)",
              {
                hasAutoImage: affiliateData.autoImage,
                hasImageUrls: !!(affiliateData.imageUrls as unknown[])?.length,
              },
            );
            agentModeConfig = { mode: AgentMode.ASSISTANT };
            userContext.agentMode = AgentMode.ASSISTANT;
            // Affiliate uses its own plugin - disable web search
            userContext.webSearchEnabled = false;
          }
        }
      } catch (error) {
        logger.error(
          "[Stream] Failed to check character access/affiliate status:",
          error,
        );
      }
    }

    // For BUILD mode, use the targetCharacterId from agent mode metadata
    // This ensures we're editing the correct character, not the default
    if (
      agentModeConfig.mode === AgentMode.BUILD &&
      agentModeConfig.metadata?.targetCharacterId
    ) {
      characterId = String(agentModeConfig.metadata.targetCharacterId);
      logger.info(
        `[Stream] BUILD mode - Using character from metadata: ${characterId}`,
      );

      // Update room agentId for build mode (proper column, not metadata)
      if (characterId && room && room.agentId !== characterId) {
        try {
          await roomsRepository.update(roomId, { agentId: characterId });
          logger.info(
            `[Stream] BUILD mode - Updated room agentId: room ${roomId} → agent ${characterId}`,
          );
        } catch (error) {
          logger.error(
            "[Stream] BUILD mode - Failed to update room agentId:",
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
      logger.info("[Stream] No model preference set, using defaults");
    }

    // Log image generation settings and store model in context for runtime
    if (createImageEnabled) {
      userContext.imageModel = imageModel;
      logger.info(
        `[Stream] Image generation enabled - model: ${imageModel || "default"}, mode: ${agentModeConfig.mode}`,
      );
    }

    // Apply character if specified
    if (characterId) {
      userContext.characterId = characterId;
      logger.info(`[Stream] Set characterId in userContext: ${characterId}`);
    }

    perfTrace.mark("entity-settings+create-runtime");
    // PERF: Steps 5.5 + 6 parallelized — entity-settings prefetch and runtime
    // creation run concurrently. Entity settings are only read during message
    // processing (via getSetting()), not during runtime construction, so it's
    // safe to populate the shared Map after runtime creation completes.
    //
    // Previously sequential: entity-settings (665ms) → create-runtime (485ms) = ~1,150ms
    // Now parallel: max(entity-settings, create-runtime) ≈ ~665ms → saves ~485ms
    //
    // INVARIANT: createRuntimeForUser must NOT call getSetting() or read from
    // entitySettingsMap during construction. Known-safe paths:
    //   - runtimeFactory.createRuntimeForUser → builds AgentRuntime, registers
    //     plugins, sets up providers/actions. None read entity-level settings.
    //   - Plugin init() hooks run during message processing (after settings are
    //     populated), not during runtime construction here.
    // If a plugin or runtime change adds getSetting() during construction,
    // this parallelization must be reverted to sequential.
    // INVARIANT: createRuntimeForUser must NOT call getSetting() or read from
    // entitySettingsMap during construction. Known-safe paths:
    //   - runtimeFactory.createRuntimeForUser builds AgentRuntime, registers
    //     plugins, sets up providers/actions. None read entity-level settings.
    //   - Plugin init() hooks run during message processing (after settings are
    //     populated), not during runtime construction here.
    // If a plugin or runtime change adds getSetting() during construction,
    // this parallelization must be reverted to sequential.
    const agentIdForSettings = characterId || DEFAULT_AGENT_ID_STRING;

    // Create request context with a mutable entitySettings Map.
    // It starts empty and gets populated once the prefetch completes.
    // Type matches RequestContext.entitySettings: Map<string, EntitySettingValue>
    const entitySettingsMap: RequestContext["entitySettings"] = new Map();
    const requestContext: RequestContext = {
      entityId: userContext.userId as UUID,
      agentId: agentIdForSettings as UUID,
      entitySettings: entitySettingsMap,
      requestStartTime: Date.now(),
      traceId: request.headers.get("x-trace-id") || undefined,
      organizationId: userContext.organizationId,
    };

    // Run entity settings prefetch and runtime creation in parallel
    const [entitySettingsResult, runtimeResult] = await Promise.all([
      entitySettingsService.prefetch(
        userContext.userId,
        agentIdForSettings,
        userContext.organizationId
      ),
      runWithRequestContext(requestContext, () =>
        runtimeFactory.createRuntimeForUser(userContext)
      ),
    ]);

    // Inject prefetched entity settings into the shared Map
    // (used by getSetting() during message processing)
    for (const [key, value] of entitySettingsResult.settings) {
      entitySettingsMap.set(key, value);
    }

    const entitySettingsSources = entitySettingsResult.sources;
    const runtime = runtimeResult;

    logger.info(
      {
        userId: userContext.userId,
        agentId: agentIdForSettings,
        settingsCount: entitySettingsResult.settings.size,
        sources: Object.entries(entitySettingsSources).reduce(
          (acc, [_, source]) => {
            acc[source] = (acc[source] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
      },
      `[Stream] Prefetched ${entitySettingsResult.settings.size} entity settings (parallel with runtime)`
    );

    // Step 6.5: For BUILD mode, store client character state in runtime settings
    // This allows the provider to use what the user currently sees on the frontend
    if (
      agentModeConfig.mode === AgentMode.BUILD &&
      agentModeConfig.metadata?.clientCharacterState
    ) {
      const validatedState = clientCharacterStateSchema.safeParse(
        agentModeConfig.metadata.clientCharacterState,
      );

      if (!validatedState.success) {
        logger.warn("[Stream] BUILD mode - Invalid clientCharacterState", {
          issues: validatedState.error.issues,
        });
        return new Response(
          JSON.stringify({
            error: "Invalid character state provided",
            details: validatedState.error.issues,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }

      runtime.character.settings = {
        ...runtime.character.settings,
        clientCharacterState: validatedState.data,
        isClientStateUnsaved:
          typeof agentModeConfig.metadata.isUnsaved === "boolean"
            ? agentModeConfig.metadata.isUnsaved
            : true,
      };
      logger.info(
        "[Stream] BUILD mode - Stored validated client character state in runtime settings",
      );
    }

    perfTrace.mark("message-handler");
    // Step 7: Create message handler
    const messageHandler = createMessageHandler(runtime, userContext);

    // Step 7.5: Check if moderation has flagged before we start streaming
    // If moderation completed with a violation, block the response
    try {
      await moderationCheck.checkBeforeStream();
    } catch (error) {
      if (error instanceof Error && error.name === "ModerationBlockedError") {
        logger.warn("[Stream] Moderation blocked before stream", {
          userId: userContext.userId,
          error: error.message,
        });
        return new Response(
          JSON.stringify({
            error: "Your message was blocked due to content policy violations.",
            details: error.message,
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
      throw error;
    }

    // Step 8: Create streaming response with TransformStream for better flush control
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

    // Pre-compute static SSE prefixes to reduce allocations
    const eventPrefixes = {
      chunk: encoder.encode("event: chunk\ndata: "),
      reasoning: encoder.encode("event: reasoning\ndata: "),
    };
    const sseEnd = encoder.encode("\n\n");

    // Helper to write SSE events - writes immediately and doesn't buffer
    const sendEvent = async (event: string, data: unknown) => {
      const jsonData = JSON.stringify(data);
      // Use pre-computed prefixes for high-frequency events
      const prefix = eventPrefixes[event as keyof typeof eventPrefixes];
      if (prefix) {
        await writer.write(prefix);
        await writer.write(encoder.encode(jsonData));
        await writer.write(sseEnd);
      } else {
        const message = `event: ${event}\ndata: ${jsonData}\n\n`;
        await writer.write(encoder.encode(message));
      }
    };

    // Start processing in background - this allows the response to be returned immediately
    // while chunks are streamed as they're generated
    // IMPORTANT: Wrap in runWithRequestContext so getSetting() has access to entity settings
    runWithRequestContext(requestContext, async () => {
      try {
        // Send connection confirmation
        await sendEvent("connected", { roomId, timestamp: Date.now() });

        // Send user message event
        await sendEvent("message", {
          id: `user-${Date.now()}`,
          entityId: userContext.userId,
          content: { text, attachments: attachments || undefined },
          createdAt: Date.now(),
          isAgent: false,
          type: "user",
        });

        const responseMessageId = `agent-${crypto.randomUUID()}`;

        // Send thinking indicator
        await sendEvent("message", {
          id: `thinking-${Date.now()}`,
          entityId: "agent",
          content: { text: "" },
          createdAt: Date.now(),
          isAgent: true,
          type: "thinking",
        });

        // Create streaming callback to send chunks via SSE in real-time
        // Each chunk is written immediately - no buffering
        const onStreamChunk = async (chunk: string) => {
          await sendEvent("chunk", {
            messageId: responseMessageId,
            chunk,
            timestamp: Date.now(),
          });
        };

        // Create reasoning callback to stream chain-of-thought
        // Shows users the LLM's planning process in real-time
        const onReasoningChunk = async (chunk: string, phase: string) => {
          await sendEvent("reasoning", {
            messageId: responseMessageId,
            chunk,
            phase,
            timestamp: Date.now(),
          });
        };

        // Process message and get response (using user's actual ID)
        perfTrace.mark("message-processing");
        logger.info("[Stream Messages] Processing message with streaming...");
        const result = await messageHandler.process({
          roomId,
          text,
          model,
          agentModeConfig,
          attachments,
          onStreamChunk,
          onReasoningChunk,
        });

        // Track chat message in PostHog (non-blocking)
        // Use internal UUID for consistent tracking
        if (!userContext.isAnonymous && userContext.userId) {
          trackServerEvent(userContext.userId, "agent_chat_message_sent", {
            agent_id: characterId || "default",
            room_id: roomId,
            agent_mode: agentModeConfig.mode,
            has_attachments: !!(attachments && attachments.length > 0),
            message_length: text.length,
          } as const);
        }

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

        await sendEvent("message", {
          id: responseMessageId,
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
            await sendEvent("warning", {
              message: "Low credits - please top up to continue",
            });
          }
        }

        // PERF: End trace and log all phase timings
        perfTrace.mark("send-response");
        const traceResult = perfTrace.end();

        // WARNING: When ENABLE_PERF_TRACE is on, phase names (e.g. "auth",
        // "parallel-checks") are sent to the client, revealing infrastructure
        // topology. ENABLE_PERF_TRACE is for dev/staging only — never enable
        // in production. If production tracing is needed, emit to server logs only.
        const donePayload: Record<string, unknown> = { timestamp: Date.now() };
        if (traceResult.traceId) {
          donePayload.perfTrace = {
            totalMs: traceResult.totalMs,
            phases: traceResult.phases.map((p) => ({
              name: p.name,
              durationMs: p.durationMs,
            })),
          };
        }
        await sendEvent("done", donePayload);
      } catch (error) {
        logger.error("[Stream Messages] Error:", error);
        perfTrace.end(); // Ensure trace is logged even on error
        await sendEvent("error", {
          message: error instanceof Error ? error.message : "Processing failed",
        });
      } finally {
        // Close the writer to signal stream completion
        await writer.close();
      }
    });

    // Return the response immediately - chunks will stream as they're written
    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        // Prevent any compression that could buffer the stream
        "Content-Encoding": "none",
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
 * Auth priority: Privy/API key > anonymous session token > cookie > new anonymous
 */
async function authenticateAndBuildContext(
  request: NextRequest,
  agentMode: AgentMode,
  body?: {
    sessionToken?: string;
    appId?: string;
    appPromptConfig?: Record<string, unknown>;
    webSearchEnabled?: boolean;
  },
) {
  const anonymousSessionToken =
    request.headers.get("X-Anonymous-Session") || body?.sessionToken;

  // Try Privy/API key auth first (ensures authenticated users aren't treated as anonymous)
  try {
    const authResult = await requireAuthOrApiKey(request);

    if (authResult.user.is_anonymous) {
      logger.warn(
        "[Stream] User authenticated but marked anonymous - possible migration issue",
      );
    }

    return await userContextService.buildContext({
      ...authResult,
      isAnonymous: false,
      agentMode,
      appId: body?.appId,
      appPromptConfig: body?.appPromptConfig,
    });
  } catch {
    // Fall through to anonymous handling
  }

  // Try provided session token
  if (anonymousSessionToken) {
    const session = await anonymousSessionsService.getByToken(
      anonymousSessionToken,
    );

    if (session && !session.converted_at && session.is_active) {
      const user = await usersService.getById(session.user_id);

      if (user?.is_anonymous) {
        return await userContextService.buildContext({
          user: { ...user, organization: null as never },
          anonymousSession: session,
          isAnonymous: true,
          agentMode,
          appId: body?.appId,
          appPromptConfig: body?.appPromptConfig,
        });
      }
    }
  }

  // Fall back to cookie or create new anonymous session
  let anonData = await getAnonymousUser();

  if (!anonData) {
    const newAnonData = await getOrCreateAnonymousUser();
    anonData = { user: newAnonData.user, session: newAnonData.session };
  }

  if (!anonData.session) {
    throw new Error("Failed to create or retrieve anonymous session");
  }

  return await userContextService.buildContext({
    user: anonData.user,
    anonymousSession: anonData.session,
    isAnonymous: true,
    agentMode,
    appId: body?.appId,
    appPromptConfig: body?.appPromptConfig,
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
