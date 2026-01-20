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
  elizaLogger,
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
import type {
  DiscordEventPayload,
  MessageCreateData,
  DiscordAuthor,
} from "./types";
import {
  DISCORD_API_BASE,
  discordBotHeaders,
} from "@/lib/utils/discord-api";

interface ProcessedMessage {
  roomId: string;
  entityId: string;
  text: string;
  attachments?: Media[];
  metadata: {
    discordMessageId: string;
    discordChannelId: string;
    discordGuildId?: string;
    discordAuthor: DiscordAuthor;
  };
}

/**
 * Route a Discord event to the appropriate handler.
 */
export async function routeDiscordEvent(
  payload: DiscordEventPayload,
): Promise<{ processed: boolean; response?: string }> {
  const { event_type, connection_id, data } = payload;

  logger.info("[DiscordRouter] Routing event", {
    eventType: event_type,
    connectionId: connection_id,
    eventId: payload.event_id,
  });

  switch (event_type) {
    case "MESSAGE_CREATE":
      return handleMessageCreate(payload, data as MessageCreateData);

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
      logger.warn("[DiscordRouter] Unknown event type", { eventType: event_type });
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
      // Only respond if bot is mentioned
      const botMentioned = data.mentions?.some((m) => m.bot);
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
  if (!app || !app.character_id) {
    logger.warn("[DiscordRouter] App or character not found", {
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

  const runtime = await runtimeFactory.createRuntimeForUser(context);
  if (!runtime) {
    logger.error("[DiscordRouter] Failed to get runtime for app", {
      appId: app.id,
      characterId,
    });
    return { processed: false };
  }

  // Process the message
  const processed = processMessage(data, payload);
  const response = await sendToRuntime(runtime, processed);

  // Send response back to Discord if we have one
  if (response) {
    await sendDiscordResponse(
      connection.bot_token_encrypted,
      data.channel_id,
      response,
      data.id,
    );
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
  await runtime.ensureWorldExists({
    id: worldId,
    name: "Discord",
    agentId: runtime.agentId,
    serverId,
  } as World).catch(() => {});

  // Ensure room exists
  await runtime.ensureRoomExists({
    id: roomUuid,
    name: `Discord Channel ${message.metadata.discordChannelId}`,
    type: ChannelType.GROUP,
    channelId: roomUuid,
    worldId,
    serverId,
    agentId: runtime.agentId,
    source: "discord",
  }).catch(() => {});

  // Ensure user entity exists
  const displayName =
    message.metadata.discordAuthor.global_name ||
    message.metadata.discordAuthor.username;

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
  }).catch(() => {});

  // Ensure participants
  await Promise.all([
    runtime.ensureParticipantInRoom(runtime.agentId, roomUuid).catch(() => {}),
    runtime.ensureParticipantInRoom(entityUuid, roomUuid).catch(() => {}),
  ]);

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
      ...(message.attachments?.length ? { attachments: message.attachments } : {}),
    },
    metadata: {
      type: MemoryType.MESSAGE,
      role: "user",
      dialogueType: "message",
      visibility: "visible",
      discord: message.metadata,
    },
  };

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
        await runtime.createMemory(responseMemory, "messages");
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
    content: content.slice(0, 2000), // Discord message limit
  };

  if (replyToMessageId) {
    payload.message_reference = {
      message_id: replyToMessageId,
    };
  }

  const response = await fetch(
    `${DISCORD_API_BASE}/channels/${channelId}/messages`,
    {
      method: "POST",
      headers: discordBotHeaders(botToken),
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    logger.error("[DiscordRouter] Failed to send response", {
      channelId,
      status: response.status,
      error,
    });
  }
}
