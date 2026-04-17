/**
 * Eliza App - Discord Webhook
 *
 * Receives messages from Discord Gateway and routes them to the default Eliza agent.
 * Requires users to have completed OAuth first (sends welcome message if not).
 * Uses ASSISTANT mode for full multi-step action execution.
 * DM-only - server/guild messages are filtered by gateway.
 *
 * POST /api/eliza-app/webhook/discord
 */

import type { Media } from "@elizaos/core";
import { getContentTypeFromMimeType } from "@elizaos/core";
import { NextRequest, NextResponse } from "next/server";
import { withInternalAuth } from "@/lib/auth/internal-api";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import { createMessageHandler } from "@/lib/eliza/message-handler";
import { mergeModelPreferences } from "@/lib/eliza/model-preferences";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { roomsService } from "@/lib/services/agents/rooms";
import {
  connectionEnforcementService,
  elizaAppUserService,
} from "@/lib/services/eliza-app";
import { elizaAppConfig } from "@/lib/services/eliza-app/config";
import { generateElizaAppRoomId } from "@/lib/utils/deterministic-uuid";
import {
  releaseProcessingClaim,
  tryClaimForProcessing,
} from "@/lib/utils/idempotency";
import { logger } from "@/lib/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const { defaultAgentId: DEFAULT_AGENT_ID } = elizaAppConfig;

/**
 * Room lock TTL in milliseconds.
 * Must be greater than maxDuration (120s) with safety margin to prevent
 * lock expiry during long-running agent processing.
 */
const ROOM_LOCK_TTL_MS = 150_000;

interface DiscordAuthor {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
  bot?: boolean;
}

interface DiscordAttachment {
  id?: string;
  url: string;
  content_type?: string;
  filename?: string;
}

interface DiscordVoiceAttachment {
  url: string;
  content_type: string;
  filename: string;
}

interface DiscordMessageData {
  id: string;
  channel_id: string;
  guild_id?: string | null;
  author: DiscordAuthor;
  content: string;
  attachments?: DiscordAttachment[];
  voice_attachments?: DiscordVoiceAttachment[];
}

interface DiscordEventPayload {
  event_type: string;
  event_id: string;
  data: DiscordMessageData;
}

/**
 * Send message to Discord with retry logic for rate limits and transient errors.
 * Retries on 429 (rate limit) and 5xx (server errors) with exponential backoff.
 */
async function sendDiscordMessage(
  channelId: string,
  content: string,
  replyToMessageId?: string,
): Promise<boolean> {
  const { botToken } = elizaAppConfig.discord;

  if (!botToken) {
    logger.error(
      "[ElizaApp DiscordWebhook] Cannot send message - bot token not configured",
    );
    return false;
  }

  const DISCORD_MESSAGE_LIMIT = 2000;
  const truncatedContent = content.slice(0, DISCORD_MESSAGE_LIMIT);

  if (content.length > DISCORD_MESSAGE_LIMIT) {
    logger.warn("[ElizaApp DiscordWebhook] Message truncated", {
      channelId,
      originalLength: content.length,
      truncatedTo: DISCORD_MESSAGE_LIMIT,
    });
  }

  const makeRequest = async () => {
    return fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: truncatedContent,
        message_reference: replyToMessageId
          ? { message_id: replyToMessageId }
          : undefined,
      }),
    });
  };

  const maxRetries = 3;
  let lastError: string | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await makeRequest();

    // Success
    if (response.ok) {
      return true;
    }

    // Rate limit - use Retry-After header
    if (response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitMs = retryAfter ? parseFloat(retryAfter) * 1000 : 1000;
      logger.warn("[ElizaApp DiscordWebhook] Rate limited, retrying", {
        channelId,
        waitMs,
        attempt,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    // Server error - exponential backoff
    if (response.status >= 500) {
      const waitMs = Math.min(1000 * 2 ** attempt, 10000);
      logger.warn("[ElizaApp DiscordWebhook] Server error, retrying", {
        channelId,
        status: response.status,
        waitMs,
        attempt,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      continue;
    }

    // Client error (4xx except 429) - don't retry
    lastError = await response.text();
    logger.error("[ElizaApp DiscordWebhook] Failed to send message", {
      channelId,
      status: response.status,
      error: lastError,
    });
    return false;
  }

  logger.error("[ElizaApp DiscordWebhook] Failed after retries", {
    channelId,
    lastError,
  });
  return false;
}

function processDiscordAttachments(data: DiscordMessageData): Media[] {
  const attachments: Media[] = [];

  // Regular attachments
  if (data.attachments?.length) {
    for (const att of data.attachments) {
      attachments.push({
        id: att.id || att.url,
        url: att.url,
        contentType: att.content_type
          ? getContentTypeFromMimeType(att.content_type)
          : undefined,
        title: att.filename,
      });
    }
  }

  // Voice attachments (from gateway)
  if (data.voice_attachments?.length) {
    for (const va of data.voice_attachments) {
      attachments.push({
        id: va.url,
        url: va.url,
        contentType: va.content_type
          ? getContentTypeFromMimeType(va.content_type)
          : undefined,
        title: va.filename,
      });
    }
  }

  return attachments;
}

/**
 * PERF: Send "typing" indicator to Discord channel.
 * Shows the user the bot is processing their message.
 * Discord typing indicator lasts ~10 seconds.
 */
async function sendDiscordTypingAction(channelId: string): Promise<void> {
  const { botToken } = elizaAppConfig.discord;
  if (!botToken) return;

  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/typing`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
      },
    });
  } catch (error) {
    logger.debug("[ElizaApp DiscordWebhook] Failed to send typing action", {
      channelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Start a periodic typing indicator for Discord.
 * Returns a cleanup function to stop the interval.
 * Discord typing lasts ~10s, so we refresh every 8s.
 */
function startDiscordTypingIndicator(channelId: string): () => void {
  sendDiscordTypingAction(channelId);
  const interval = setInterval(() => sendDiscordTypingAction(channelId), 8000);
  return () => clearInterval(interval);
}

async function handleDiscordWebhook(
  request: NextRequest,
): Promise<NextResponse> {
  const payload: DiscordEventPayload = await request.json();

  // Only handle MESSAGE_CREATE events
  if (payload.event_type !== "MESSAGE_CREATE") {
    return NextResponse.json({ ok: true, status: "event_type_not_handled" });
  }

  const { data } = payload;

  // Skip bot messages
  if (data.author.bot) {
    return NextResponse.json({ ok: true, status: "bot_message_skipped" });
  }

  // DM-only: Skip server/guild messages (should be filtered by gateway, but double-check)
  if (data.guild_id) {
    return NextResponse.json({ ok: true, status: "server_message_skipped" });
  }

  // Skip empty messages (unless they have attachments)
  if (
    !data.content.trim() &&
    !data.attachments?.length &&
    !data.voice_attachments?.length
  ) {
    return NextResponse.json({ ok: true, status: "empty_message_skipped" });
  }

  const discordUserId = data.author.id;
  const discordUsername = data.author.username;
  const discordGlobalName = data.author.global_name;
  const _discordAvatar = data.author.avatar;
  const text = data.content.trim();

  // Validate Discord user data
  if (!discordUserId?.trim()) {
    logger.warn("[ElizaApp DiscordWebhook] Missing Discord user ID");
    return NextResponse.json(
      { ok: false, error: "Invalid user data" },
      { status: 400 },
    );
  }
  if (!discordUsername?.trim()) {
    logger.warn("[ElizaApp DiscordWebhook] Missing Discord username", {
      discordUserId,
    });
    return NextResponse.json(
      { ok: false, error: "Invalid username" },
      { status: 400 },
    );
  }

  // Atomic idempotency claim - prevents duplicate processing from concurrent requests.
  // Uses INSERT ... ON CONFLICT DO NOTHING so only one caller wins the race.
  const idempotencyKey = `discord:eliza-app:${payload.event_id}`;
  const claimed = await tryClaimForProcessing(
    idempotencyKey,
    "discord-eliza-app",
  );
  if (!claimed) {
    logger.info("[ElizaApp DiscordWebhook] Duplicate event skipped", {
      eventId: payload.event_id,
      discordUserId,
    });
    return NextResponse.json({ ok: true, status: "already_processed" });
  }

  // PERF: Start typing indicator immediately for instant user feedback.
  // Discord typing lasts 10s, so we refresh every 8s.
  const stopTyping = startDiscordTypingIndicator(data.channel_id);

  try {
    // Look up user - they must have completed OAuth first
    const userWithOrg = await elizaAppUserService.getByDiscordId(discordUserId);
    if (!userWithOrg?.organization) {
      await sendDiscordMessage(
        data.channel_id,
        `Welcome! To chat with Eliza, please connect your Discord account first:\n\n${elizaAppConfig.appUrl}/get-started`,
      );
      return NextResponse.json({ ok: true });
    }
    const { organization } = userWithOrg;

    const hasRequiredConnection =
      await connectionEnforcementService.hasRequiredConnection(
        organization.id,
        userWithOrg.id,
      );
    if (!hasRequiredConnection) {
      const nudgeText =
        await connectionEnforcementService.generateNudgeResponse({
          userMessage: text,
          platform: "discord",
          organizationId: organization.id,
          userId: userWithOrg.id,
        });
      await sendDiscordMessage(data.channel_id, nudgeText, data.id);
      return NextResponse.json({ ok: true });
    }

    // Generate room ID (deterministic)
    const roomId = generateElizaAppRoomId(
      "discord",
      DEFAULT_AGENT_ID,
      discordUserId,
    );
    const entityId = userWithOrg.id; // Use userId as entityId for unified memory

    // Create room with participant atomically (prevents race condition)
    const existingRoom = await roomsService.getRoomSummary(roomId);
    if (!existingRoom) {
      try {
        await roomsService.createRoomWithParticipant(
          {
            id: roomId,
            agentId: DEFAULT_AGENT_ID,
            entityId,
            source: "discord",
            type: "DM",
            name: `Discord: ${discordGlobalName || discordUsername}`,
            metadata: {
              channel: "discord",
              discordUserId,
              discordChannelId: data.channel_id,
              userId: entityId,
              organizationId: organization.id,
            },
          },
          entityId,
        );
      } catch (error) {
        // Handle unique constraint violation (room already created by concurrent request)
        const isUniqueViolation = (error as { code?: string }).code === "23505";
        if (!isUniqueViolation) {
          await releaseProcessingClaim(idempotencyKey);
          throw error;
        }
        logger.debug(
          "[ElizaApp DiscordWebhook] Room already exists (concurrent creation)",
          {
            roomId,
          },
        );
      }
    }

    const lock = await distributedLocks.acquireRoomLockWithRetry(
      roomId,
      ROOM_LOCK_TTL_MS,
      {
        maxRetries: 10,
        initialDelayMs: 100,
        maxDelayMs: 2000,
      },
    );

    if (!lock) {
      logger.error("[ElizaApp DiscordWebhook] Failed to acquire room lock", {
        roomId,
      });
      await releaseProcessingClaim(idempotencyKey);
      return NextResponse.json(
        { ok: false, error: "Service temporarily unavailable" },
        { status: 503 },
      );
    }

    try {
      const userContext = await userContextService.buildContext({
        user: { ...userWithOrg, organization } as never,
        isAnonymous: false,
        agentMode: AgentMode.ASSISTANT,
      });
      userContext.characterId = DEFAULT_AGENT_ID;
      userContext.webSearchEnabled = true;
      userContext.modelPreferences = mergeModelPreferences(
        userContext.modelPreferences,
        elizaAppConfig.modelPreferences,
      );

      logger.info("[ElizaApp DiscordWebhook] Processing message", {
        userId: entityId,
        roomId,
        mode: "assistant",
      });

      const runtime = await runtimeFactory.createRuntimeForUser(userContext);
      const messageHandler = createMessageHandler(runtime, userContext);

      // Process attachments (including voice)
      const attachments = processDiscordAttachments(data);

      const result = await messageHandler.process({
        roomId,
        text,
        attachments: attachments.length > 0 ? attachments : undefined,
        agentModeConfig: { mode: AgentMode.ASSISTANT },
      });

      const responseContent = result.message.content;
      const responseText =
        typeof responseContent === "string"
          ? responseContent
          : responseContent?.text || "";

      if (responseText) {
        await sendDiscordMessage(data.channel_id, responseText, data.id);
      } else {
        logger.warn("[ElizaApp DiscordWebhook] Empty agent response", {
          roomId,
          userId: entityId,
          messageId: data.id,
        });
      }

      return NextResponse.json({ ok: true });
    } catch (error) {
      logger.error("[ElizaApp DiscordWebhook] Agent failed", {
        error: error instanceof Error ? error.message : String(error),
        roomId,
      });
      await releaseProcessingClaim(idempotencyKey);
      return NextResponse.json(
        { ok: false, error: "Agent processing failed" },
        { status: 500 },
      );
    } finally {
      stopTyping();
      await lock.release();
    }
  } finally {
    stopTyping();
  }
}

export const POST = withInternalAuth(handleDiscordWebhook);
