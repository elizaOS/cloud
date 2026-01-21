/**
 * Discord Event Router
 *
 * Routes Discord events to the appropriate Eliza agent runtime.
 */

import { v4 as uuidv4 } from "uuid";
import {
  AgentRuntime,
  ChannelType,
  EventType,
  Memory,
  MemoryType,
  stringToUuid,
  createUniqueUuid,
  type UUID,
  type Content,
  type Media,
  type World,
} from "@elizaos/core";
import { logger } from "@/lib/utils/logger";
import { discordConnectionsRepository, appsRepository } from "@/db/repositories";
import { runtimeFactory } from "@/lib/eliza/runtime-factory";
import { userContextService } from "@/lib/eliza/user-context";
import { AgentMode } from "@/lib/eliza/agent-mode-types";
import type { DiscordEventPayload, MessageCreateData } from "./schemas";
import { MessageCreateDataSchema, DiscordAuthorSchema } from "./schemas";
import { DISCORD_API_BASE, discordBotHeaders } from "@/lib/utils/discord-api";
import { getEncryptionService } from "@/lib/services/secrets/encryption";

// ============================================
// Constants
// ============================================

/** Maximum Discord message length */
const MAX_DISCORD_MESSAGE_LENGTH = 2000;

/**
 * Truncate a string to a maximum UTF-16 code unit length (Discord's limit).
 * Avoids breaking surrogate pairs (emoji, etc.) by backing up if needed.
 */
function truncateUtf16Safe(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }

  // Truncate to maxLength
  let truncated = str.slice(0, maxLength);

  // Check if we cut in the middle of a surrogate pair
  // High surrogate: 0xD800-0xDBFF, Low surrogate: 0xDC00-0xDFFF
  const lastChar = truncated.charCodeAt(truncated.length - 1);
  if (lastChar >= 0xd800 && lastChar <= 0xdbff) {
    // Last char is a high surrogate without its low surrogate - remove it
    truncated = truncated.slice(0, -1);
  }

  return truncated;
}

/** HTTP request timeout for Discord API calls */
const DISCORD_API_TIMEOUT_MS = 10_000;

// ============================================
// Types
// ============================================

interface ProcessedMessage {
  roomId: string;
  entityId: string;
  text: string;
  attachments?: Media[];
  metadata: {
    discordMessageId: string;
    discordChannelId: string;
    discordGuildId?: string;
    discordAuthor: {
      id: string;
      username: string;
      discriminator?: string;
      avatar?: string | null;
      bot?: boolean;
      global_name?: string | null;
    };
  };
}

// ============================================
// Main Router
// ============================================

/**
 * Route a Discord event to the appropriate handler.
 */
export async function routeDiscordEvent(
  payload: DiscordEventPayload,
): Promise<{ processed: boolean; response?: string }> {
  const { event_type, connection_id } = payload;

  logger.info("[DiscordRouter] Routing event", {
    eventType: event_type,
    connectionId: connection_id,
    eventId: payload.event_id,
  });

  switch (event_type) {
    case "MESSAGE_CREATE": {
      // Validate message data
      const parsed = MessageCreateDataSchema.safeParse(payload.data);
      if (!parsed.success) {
        logger.warn("[DiscordRouter] Invalid MESSAGE_CREATE data", {
          errors: parsed.error.errors,
        });
        return { processed: false };
      }
      return handleMessageCreate(payload, parsed.data);
    }

    case "MESSAGE_UPDATE":
    case "MESSAGE_DELETE":
    case "MESSAGE_REACTION_ADD":
    case "GUILD_MEMBER_ADD":
    case "GUILD_MEMBER_REMOVE":
    case "INTERACTION_CREATE":
      // Log but don't process these yet
      logger.debug("[DiscordRouter] Event type not fully implemented", {
        eventType: event_type,
      });
      return { processed: true };

    default:
      logger.warn("[DiscordRouter] Unknown event type", {
        eventType: event_type,
      });
      return { processed: false };
  }
}

/**
 * Handle MESSAGE_CREATE events.
 */
async function handleMessageCreate(
  payload: DiscordEventPayload,
  data: MessageCreateData,
): Promise<{ processed: boolean; response?: string }> {
  // Skip bot messages
  if (data.author.bot) {
    return { processed: true };
  }

  // Get connection to find the associated app
  const connection = await discordConnectionsRepository.findById(
    payload.connection_id,
  );
  if (!connection) {
    logger.error("[DiscordRouter] Connection not found", {
      connectionId: payload.connection_id,
    });
    return { processed: false };
  }

  // Check if we should respond based on connection metadata
  const metadata = connection.metadata;
  if (metadata) {
    // Check channel filtering
    if (
      metadata.enabledChannels?.length &&
      !metadata.enabledChannels.includes(data.channel_id)
    ) {
      return { processed: true }; // Skip - channel not enabled
    }
    if (metadata.disabledChannels?.includes(data.channel_id)) {
      return { processed: true }; // Skip - channel disabled
    }

    // Check response mode
    if (metadata.responseMode === "mention") {
      // Only respond if THIS bot is mentioned
      // Note: bot_user_id is the actual Discord user ID, different from application_id
      const botUserId = connection.bot_user_id;
      if (!botUserId) {
        logger.warn("[Discord Event Router] Bot user ID not set, skipping mention check", {
          connectionId: connection.id,
        });
        return { processed: true };
      }
      const botMentioned = data.mentions?.some((m) => m.id === botUserId);
      if (!botMentioned) {
        return { processed: true };
      }
    } else if (metadata.responseMode === "keyword") {
      // Only respond if message contains keywords
      const hasKeyword = metadata.keywords?.some((k) =>
        data.content.toLowerCase().includes(k.toLowerCase()),
      );
      if (!hasKeyword) {
        return { processed: true };
      }
    }
  }

  // Get the app to find the character/agent
  if (!connection.app_id) {
    logger.warn("[DiscordRouter] Connection has no associated app", {
      connectionId: connection.id,
    });
    return { processed: false };
  }

  const app = await appsRepository.findById(connection.app_id);
  if (!app) {
    logger.warn("[DiscordRouter] App not found", {
      appId: connection.app_id,
    });
    return { processed: false };
  }

  // Get runtime for this app's first linked character
  const characterId = app.linked_character_ids?.[0];
  if (!characterId) {
    logger.warn("[DiscordRouter] App has no linked characters", {
      appId: app.id,
    });
    return { processed: false };
  }

  // Create a system context for Discord
  const context = userContextService.createSystemContext(AgentMode.CHAT);
  context.characterId = characterId;
  context.organizationId = app.organization_id;

  let runtime: AgentRuntime;
  try {
    runtime = await runtimeFactory.createRuntimeForUser(context);
  } catch (error) {
    logger.error("[DiscordRouter] Failed to create runtime", {
      appId: app.id,
      characterId,
      error: error instanceof Error ? error.message : String(error),
    });
    return { processed: false };
  }

  // Process the message
  const processed = processMessage(data, payload);
  let response: string | undefined;

  try {
    response = await sendToRuntime(runtime, processed);
  } catch (error) {
    logger.error("[DiscordRouter] Failed to process message through runtime", {
      connectionId: connection.id,
      messageId: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return { processed: false };
  }

  // Send response back to Discord if we have one
  if (response) {
    try {
      // Decrypt the bot token
      const encryption = getEncryptionService();
      const botToken = await encryption.decrypt({
        encryptedValue: connection.bot_token_encrypted,
        encryptedDek: connection.encrypted_dek,
        nonce: connection.token_nonce,
        authTag: connection.token_auth_tag,
      });

      await sendDiscordResponse(botToken, data.channel_id, response, data.id);
    } catch (error) {
      logger.error("[DiscordRouter] Failed to send Discord response", {
        connectionId: connection.id,
        channelId: data.channel_id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { processed: true, response };
}

/**
 * Process Discord message data into a format for the runtime.
 */
function processMessage(
  data: MessageCreateData,
  payload: DiscordEventPayload,
): ProcessedMessage {
  // Create a room ID based on channel
  const roomId = stringToUuid(
    `discord-${payload.organization_id}-${data.channel_id}`,
  ) as string;

  // Create entity ID for the Discord user
  const entityId = stringToUuid(`discord-user-${data.author.id}`) as string;

  // Process attachments
  const attachments: Media[] = [];

  // Regular attachments
  if (data.attachments?.length) {
    for (const att of data.attachments) {
      attachments.push({
        url: att.url,
        contentType: att.content_type || undefined,
        title: att.filename || undefined,
      });
    }
  }

  // Voice attachments (processed by gateway)
  if (data.voice_attachments?.length) {
    for (const va of data.voice_attachments) {
      attachments.push({
        url: va.url,
        contentType: va.content_type,
        title: va.filename,
      });
    }
  }

  return {
    roomId,
    entityId,
    text: data.content,
    attachments: attachments.length > 0 ? attachments : undefined,
    metadata: {
      discordMessageId: data.id,
      discordChannelId: data.channel_id,
      discordGuildId: data.guild_id ?? undefined,
      discordAuthor: data.author,
    },
  };
}

/**
 * Send a processed message to the Eliza runtime and get a response.
 */
async function sendToRuntime(
  runtime: AgentRuntime,
  message: ProcessedMessage,
): Promise<string | undefined> {
  const roomUuid = message.roomId as UUID;
  const entityUuid = message.entityId as UUID;
  const worldId = stringToUuid("discord-world") as UUID;
  const serverId = stringToUuid("discord-server") as UUID;

  // Ensure world exists
  try {
    await runtime.ensureWorldExists({
      id: worldId,
      name: "Discord",
      agentId: runtime.agentId,
      serverId,
    } as World);
  } catch (error) {
    logger.debug("[DiscordRouter] World may already exist", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Ensure room exists
  try {
    await runtime.ensureRoomExists({
      id: roomUuid,
      name: `Discord Channel ${message.metadata.discordChannelId}`,
      type: ChannelType.GROUP,
      channelId: roomUuid,
      worldId,
      serverId,
      agentId: runtime.agentId,
      source: "discord",
    });
  } catch (error) {
    logger.debug("[DiscordRouter] Room may already exist", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Ensure user entity exists
  const displayName =
    message.metadata.discordAuthor.global_name ||
    message.metadata.discordAuthor.username;

  try {
    await runtime.createEntity({
      id: entityUuid,
      agentId: runtime.agentId,
      names: [displayName, message.metadata.discordAuthor.username],
      metadata: {
        discord: {
          id: message.metadata.discordAuthor.id,
          username: message.metadata.discordAuthor.username,
          discriminator: message.metadata.discordAuthor.discriminator,
          avatar: message.metadata.discordAuthor.avatar,
          globalName: message.metadata.discordAuthor.global_name,
        },
      },
    });
  } catch (error) {
    logger.debug("[DiscordRouter] Entity may already exist", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Ensure participants
  try {
    await Promise.all([
      runtime.ensureParticipantInRoom(runtime.agentId, roomUuid),
      runtime.ensureParticipantInRoom(entityUuid, roomUuid),
    ]);
  } catch (error) {
    logger.debug("[DiscordRouter] Participants may already exist", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // Create user message
  const userMessage: Memory = {
    id: uuidv4() as UUID,
    roomId: roomUuid,
    entityId: entityUuid,
    agentId: runtime.agentId as UUID,
    createdAt: Date.now(),
    content: {
      text: message.text,
      source: "discord",
      ...(message.attachments?.length
        ? { attachments: message.attachments }
        : {}),
    },
    metadata: {
      type: MemoryType.MESSAGE,
      role: "user",
      dialogueType: "message",
      visibility: "visible",
      discord: message.metadata,
    },
  };

  // Save user message to maintain conversation history
  try {
    await runtime.createMemory(userMessage, "messages");
  } catch (error) {
    logger.error("[DiscordRouter] Failed to save user message memory", {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  let responseText: string | undefined;

  // Emit message event and capture response
  await runtime.emitEvent(EventType.MESSAGE_RECEIVED, {
    runtime,
    message: userMessage,
    callback: async (content: Content) => {
      if (content.text) {
        responseText = content.text;

        // Create response memory
        const responseMemory: Memory = {
          id: createUniqueUuid(runtime, userMessage.id as UUID),
          entityId: runtime.agentId,
          agentId: runtime.agentId,
          roomId: roomUuid,
          createdAt: Date.now(),
          content: {
            ...content,
            source: "agent",
            inReplyTo: userMessage.id,
          },
          metadata: {
            type: MemoryType.MESSAGE,
            role: "agent",
            dialogueType: "message",
            visibility: "visible",
          },
        };

        try {
          await runtime.createMemory(responseMemory, "messages");
        } catch (error) {
          logger.error("[DiscordRouter] Failed to save response memory", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return [];
    },
  });

  return responseText;
}

/**
 * Send a response message back to Discord.
 */
async function sendDiscordResponse(
  botToken: string,
  channelId: string,
  content: string,
  replyToMessageId?: string,
): Promise<void> {
  const payload: Record<string, unknown> = {
    content: truncateUtf16Safe(content, MAX_DISCORD_MESSAGE_LENGTH),
  };

  if (replyToMessageId) {
    payload.message_reference = {
      message_id: replyToMessageId,
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    DISCORD_API_TIMEOUT_MS,
  );

  try {
    const response = await fetch(
      `${DISCORD_API_BASE}/channels/${channelId}/messages`,
      {
        method: "POST",
        headers: discordBotHeaders(botToken),
        body: JSON.stringify(payload),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      logger.error("[DiscordRouter] Discord API error", {
        channelId,
        status: response.status,
        error,
      });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
