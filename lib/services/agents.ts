import { agentRuntime } from "@/lib/eliza/agent-runtime";
import { agentStateCache, type RoomContext } from "@/lib/cache/agent-state-cache";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { agentEventEmitter } from "@/lib/events/agent-events";
import { logger } from "@/lib/utils/logger";
import type { Memory, UUID } from "@elizaos/core";
import { v4 as uuidv4 } from "uuid";
import { ChannelType, stringToUuid } from "@elizaos/core";

export interface SendMessageInput {
  roomId: string;
  entityId: string;
  message: string;
  organizationId: string;
  streaming?: boolean;
  attachments?: Attachment[];
}

export interface Attachment {
  type: "image" | "file";
  url: string;
  filename?: string;
  mimeType?: string;
}

// ElizaOS Media type for compatibility
interface Media {
  type: string;
  url: string;
  filename?: string;
  mimeType?: string;
}

export interface AgentResponse {
  messageId: string;
  content: string;
  roomId: string;
  timestamp: Date;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    model: string;
  };
  streaming?: {
    sseUrl: string;
  };
}

export class AgentService {
  /**
   * Get or create a room for user-agent conversation
   * @param entityId - User entity ID
   * @param agentId - Agent ID (optional, uses org default)
   * @param organizationId - Organization ID
   * @returns Room ID
   */
  async getOrCreateRoom(
    entityId: string,
    agentId: string,
    organizationId: string,
  ): Promise<string> {
    try {
      const runtime = await agentRuntime.getRuntime();
      const entityUUID = stringToUuid(entityId) as UUID;

      // Check if user already has rooms with this agent
      const existingRooms = await runtime.getRoomsForParticipants([entityUUID]);

      if (existingRooms && existingRooms.length > 0) {
        // Return the first existing room
        logger.debug(
          `[Agent Service] Found existing room ${existingRooms[0]} for entity ${entityId}`,
        );
        return existingRooms[0];
      }

      // Create new room
      const roomId = uuidv4();
      await runtime.ensureRoomExists({
        id: roomId as UUID,
        source: "mcp",
        type: ChannelType.DM,
        channelId: roomId,
        serverId: "eliza-server",
        worldId: stringToUuid("eliza-world") as UUID,
        agentId: runtime.agentId,
      });

      // Ensure entity exists
      const adapter = runtime.adapter as unknown as {
        ensureEntityExists: (entity: {
          id: UUID;
          agentId: UUID;
          names: string[];
        }) => Promise<boolean>;
        addParticipant: (entityId: UUID, roomId: UUID) => Promise<boolean>;
      };

      await adapter.ensureEntityExists({
        id: entityUUID,
        agentId: runtime.agentId,
        names: [entityId],
      });

      // Add entity as participant
      await adapter.addParticipant(entityUUID, roomId as UUID);

      logger.info(
        `[Agent Service] Created new room ${roomId} for entity ${entityId}`,
      );
      return roomId;
    } catch (error) {
      logger.error("[Agent Service] Error getting/creating room:", error);
      throw error;
    }
  }

  /**
   * Send a message to agent and get response
   * @param input - Message input parameters
   * @returns Agent response
   */
  async sendMessage(input: SendMessageInput): Promise<AgentResponse> {
    const { roomId, entityId, message, streaming, attachments } = input;

    // Acquire distributed lock with retry for MCP concurrent requests
    // Will retry up to 10 times with exponential backoff (max ~20s wait)
    const lock = await distributedLocks.acquireRoomLockWithRetry(roomId, 60000, {
      maxRetries: 10,
      initialDelayMs: 100,
      maxDelayMs: 2000,
    });

    if (!lock) {
      throw new Error(
        "Room is currently processing another message. Maximum wait time exceeded.",
      );
    }

    try {
      const runtime = await agentRuntime.getRuntime();

      // Get room context (check cache first)
      const context = await this.getRoomContext(roomId);

      // Process message with agent using full ElizaOS event pipeline
      await agentEventEmitter.emitResponseStarted(roomId, runtime.agentId);

      // Use agentRuntime.handleMessage() for real ElizaOS processing
      // This handles user message creation, saving, and agent response generation
      const { message: agentMessage, usage: messageUsage } = await agentRuntime.handleMessage(
        roomId,
        entityId,
        {
          text: message,
          attachments: attachments || [],
        }
      );

      // Emit response complete event
      await agentEventEmitter.emitResponseComplete(roomId, agentMessage, messageUsage || {
        inputTokens: Math.ceil(message.length / 4),
        outputTokens: Math.ceil(((agentMessage.content.text as string) || "").length / 4),
        model: "eliza-agent",
      });

      // Invalidate room context cache to force fresh fetch on next request
      // This is more reliable than trying to update the cache with new messages
      await agentStateCache.invalidateRoomContext(roomId);

      return {
        messageId: agentMessage.id!,
        content: agentMessage.content.text as string,
        roomId,
        timestamp: new Date(agentMessage.createdAt || Date.now()),
        usage: {
          inputTokens: Math.ceil(message.length / 4),
          outputTokens: Math.ceil(((agentMessage.content.text as string) || "").length / 4),
          model: "eliza-agent",
        },
        ...(streaming && {
          streaming: {
            sseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp/stream?eventType=agent&resourceId=${roomId}`,
          },
        }),
      };
    } finally {
      // Always release lock
      await lock.release();
    }
  }

  /**
   * Get cached room context or fetch from database
   * @param roomId - Room ID
   * @returns Room context
   */
  async getRoomContext(roomId: string): Promise<RoomContext> {
    // Try cache first
    const cached = await agentStateCache.getRoomContext(roomId);
    if (cached) {
      logger.debug(`[Agent Service] Cache hit for room ${roomId}`);
      return cached;
    }

    logger.debug(`[Agent Service] Cache miss for room ${roomId}, fetching from DB`);

    // Fetch from database
    const runtime = await agentRuntime.getRuntime();
    const roomUUID = roomId as UUID;

    // Get recent messages (last 20)
    const adapter = runtime.adapter as unknown as {
      getMemoriesByRoomIds: (params: {
        tableName: string;
        roomIds: UUID[];
        limit: number;
      }) => Promise<Memory[]>;
      getParticipantsForRoom: (roomId: UUID) => Promise<UUID[]>;
    };

    const messages = await adapter.getMemoriesByRoomIds({
      tableName: "messages",
      roomIds: [roomUUID],
      limit: 20,
    });

    const participants = await adapter.getParticipantsForRoom(roomUUID);

    const context: RoomContext = {
      roomId,
      messages,
      participants: participants.map((p) => p.toString()),
      metadata: {},
      lastActivity: new Date(),
    };

    // Cache for future requests
    await agentStateCache.setRoomContext(roomId, context);

    return context;
  }

  /**
   * Update room context in cache after new message
   * @param roomId - Room ID
   * @param newMessage - New message to add
   */
  private async updateRoomContext(
    roomId: string,
    newMessage: Memory,
  ): Promise<void> {
    try {
      const context = await this.getRoomContext(roomId);

      // Add new message to context (keep last 20)
      context.messages.push(newMessage);
      if (context.messages.length > 20) {
        context.messages = context.messages.slice(-20);
      }

      context.lastActivity = new Date();

      await agentStateCache.setRoomContext(roomId, context);
    } catch (error) {
      logger.error(
        `[Agent Service] Error updating room context for ${roomId}:`,
        error,
      );
      // Non-fatal error, continue
    }
  }
}

// Export singleton instance
export const agentService = new AgentService();
