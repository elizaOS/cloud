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
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { appCreditsService } from "@/lib/services/app-credits";
import { charactersService } from "@/lib/services/characters/characters";
import { contentModerationService } from "@/lib/services/content-moderation";
import { organizationsService } from "@/lib/services/organizations";
import { logger } from "@/lib/utils/logger";
import type { NextRequest } from "next/server";
import { z } from "zod";
import {
  IMAGE_GENERATION_VIBES,
  DEFAULT_VIBE,
} from "@/lib/constants/image-generation";

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
 *
 * Security: entityId is derived from authenticated user, not client-supplied
 */
export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ roomId: string }> }
) {
  const encoder = new TextEncoder();

  try {
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
    } = body;

    // App ID can come from body OR X-App-Id header (miniapp proxy uses header)
    const appId = bodyAppId || request.headers.get("X-App-Id");

    if (!roomId || !text?.trim()) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Validate appPromptConfig if provided
    if (appPromptConfig) {
      // Sanitization helper to prevent prompt injection
      const sanitizePromptString = (val: string) => {
        // Check length - reject suspiciously long prompts
        if (val.length > 2000) {
          return false;
        }

        // Dangerous literal patterns (case-insensitive)
        const dangerousPatterns = [
          "</system>",
          "<|im_end|>",
          "<|endoftext|>",
          "[INST]",
          "[/INST]",
          "### Instruction:",
          "### Response:",
          "<|assistant|>",
          "<|user|>",
          "\\n\\nHuman:",
          "\\n\\nAssistant:",
        ];

        const lowerVal = val.toLowerCase();
        for (const pattern of dangerousPatterns) {
          if (lowerVal.includes(pattern.toLowerCase())) {
            return false;
          }
        }

        // Check for encoded versions that could bypass literal checks
        const encodedPatterns = [
          /%3C%7C/i, // <|
          /%5D%5D/i, // ]]
          /\\u003c/i, // unicode <
          /\\x3c/i, // hex <
        ];

        for (const pattern of encodedPatterns) {
          if (pattern.test(val)) {
            return false;
          }
        }

        // Reject excessive whitespace or control characters
        if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(val)) {
          return false;
        }

        return true;
      };

      const AppPromptConfigSchema = z
        .object({
          systemPrefix: z
            .string()
            .max(2000)
            .refine(sanitizePromptString, {
              message: "Invalid characters or patterns in systemPrefix",
            })
            .optional(),
          systemSuffix: z
            .string()
            .max(2000)
            .refine(sanitizePromptString, {
              message: "Invalid characters or patterns in systemSuffix",
            })
            .optional(),
          responseStyle: z
            .string()
            .max(1000)
            .refine(sanitizePromptString, {
              message: "Invalid characters or patterns in responseStyle",
            })
            .optional(),
        })
        .strict();

      const validated = AppPromptConfigSchema.safeParse(appPromptConfig);
      if (!validated.success) {
        return new Response(
          JSON.stringify({
            error: "Invalid appPromptConfig format",
            details: validated.error.errors,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
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
      { sessionToken, appId, appPromptConfig }
    );

    logger.info("[Stream] 📊 UserContext after auth:", {
      isAnonymous: userContext.isAnonymous,
      hasSessionToken: !!userContext.sessionToken,
      sessionTokenPreview: `${userContext.sessionToken?.slice(0, 8)}...`,
      userId: userContext.userId,
    });

    // Step 2.5: Check if user is blocked due to moderation violations
    if (await contentModerationService.shouldBlockUser(userContext.userId)) {
      logger.warn("[Stream] User blocked due to moderation violations", {
        userId: userContext.userId,
      });
      return new Response(
        JSON.stringify({
          error:
            "Your account has been suspended due to policy violations. Please contact support.",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 2.6: Start content moderation in parallel (non-blocking race pattern)
    // Moderation runs alongside processing - if it flags content BEFORE we start streaming, we block
    // If streaming starts first, moderation continues in background and tracks violations
    const moderationCheck = contentModerationService.startModerationCheck(
      text,
      userContext.userId,
      roomId
    );

    // The moderation continues in background - violations are logged and tracked
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
      const monetizationSettings =
        await appCreditsService.getMonetizationSettings(userContext.appId);

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
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // Step 4.5: Check if this is an affiliate character and switch to ASSISTANT mode
    // Affiliate characters need ASSISTANT mode for image generation capability
    // Check both character_data.affiliate (legacy) and settings.affiliateData (miniapp)
    if (characterId && agentModeConfig.mode === AgentMode.CHAT) {
      try {
        const character = await charactersService.getById(characterId);
        if (character) {
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
              "[Stream] 🎭 Detected affiliate character - switching to ASSISTANT mode for image generation",
              {
                hasAutoImage: affiliateData.autoImage,
                hasImageUrls: !!(affiliateData.imageUrls as unknown[])?.length,
              }
            );
            agentModeConfig = { mode: AgentMode.ASSISTANT };
            // CRITICAL: Also update userContext so runtime loads correct plugins
            userContext.agentMode = AgentMode.ASSISTANT;
          }
        }
      } catch (error) {
        logger.error("[Stream] Failed to check affiliate status:", error);
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
        `[Stream] BUILD mode - Using character from metadata: ${characterId}`
      );

      // Update room agentId for build mode (proper column, not metadata)
      if (characterId && room && room.agentId !== characterId) {
        try {
          await roomsRepository.update(roomId, { agentId: characterId });
          logger.info(
            `[Stream] BUILD mode - Updated room agentId: room ${roomId} → agent ${characterId}`
          );
        } catch (error) {
          logger.error(
            "[Stream] BUILD mode - Failed to update room agentId:",
            error
          );
        }
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

    // Step 6: Create runtime with user context (clean, no key fetching here!)
    const runtime = await runtimeFactory.createRuntimeForUser(userContext);

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
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }
      throw error;
    }

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

          // Process message and get response (using user's actual ID)
          logger.info("[Stream Messages] Processing message...");
          const result = await messageHandler.process({
            roomId,
            text,
            model,
            agentModeConfig,
            attachments,
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
          if (
            typeof messageContent === "object" &&
            messageContent?.attachments
          ) {
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
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
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
  body?: {
    sessionToken?: string;
    appId?: string;
    appPromptConfig?: Record<string, unknown>;
  }
) {
  const headerToken = request.headers.get("X-Anonymous-Session");
  const bodyToken = body?.sessionToken;
  const anonymousSessionToken = headerToken || bodyToken;

  logger.info("[Stream Auth] Starting authentication", {
    hasSessionToken: !!anonymousSessionToken,
    tokenPreview: anonymousSessionToken
      ? `${anonymousSessionToken.slice(0, 8)}...`
      : "N/A",
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
      appPromptConfig: body?.appPromptConfig,
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

        if (user?.is_anonymous) {
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
            appPromptConfig: body?.appPromptConfig,
          });
        }

        logger.warn(
          "[Stream] ⚠️ User not found or not anonymous for session:",
          session.id
        );
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
