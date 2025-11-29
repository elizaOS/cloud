/**
 * Agent Runtime Service
 * 
 * This service deals ONLY with runtime agents (agents table - ElizaOS framework).
 * 
 * Domain: Agents (agents table - DO NOT MODIFY, ElizaOS framework)
 * - Runtime agent information
 * - Room/message operations
 * - Agent-to-room communication
 * 
 * What this service DOES NOT do:
 * - Character management (use charactersService)
 * - Deployment operations (use deploymentsService)
 * - Character discovery (use characterDeploymentDiscoveryService)
 * 
 * Key Distinction:
 * - Agent = Running instance from ElizaOS (agents table)
 * - Character = User-created definition (user_characters table)
 * - When you deploy a character, it becomes an agent
 */

import { agentsRepository, type AgentInfo } from "@/db/repositories/agents";
import { logger } from "@/lib/utils/logger";
import { agentRuntime } from "@/lib/eliza/agent-runtime";
import {
  agentStateCache,
  type RoomContext,
} from "@/lib/cache/agent-state-cache";
import { distributedLocks } from "@/lib/cache/distributed-locks";
import { agentEventEmitter } from "@/lib/events/agent-events";
import { roomsService } from "./rooms";

// Re-export AgentInfo type
export type { AgentInfo };

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

class AgentsService {
  // ============================================
  // Agent Info Operations (Pure DB, no runtime)
  // ============================================

  /**
   * Get agent by ID
   * Returns agent info without spinning up runtime
   */
  async getById(agentId: string): Promise<AgentInfo | null> {
    try {
      // TODO: Add caching here
      const agent = await agentsRepository.findById(agentId);
      return agent;
    } catch (error) {
      logger.error(`[Agents Service] Error getting agent ${agentId}:`, error);
      throw error;
    }
  }

  /**
   * Get multiple agents by IDs
   */
  async getByIds(agentIds: string[]): Promise<AgentInfo[]> {
    try {
      if (agentIds.length === 0) return [];
      return await agentsRepository.findByIds(agentIds);
    } catch (error) {
      logger.error(`[Agents Service] Error getting agents:`, error);
      throw error;
    }
  }

  /**
   * Check if agent exists
   */
  async exists(agentId: string): Promise<boolean> {
    try {
      return await agentsRepository.exists(agentId);
    } catch (error) {
      logger.error(`[Agents Service] Error checking agent existence:`, error);
      return false;
    }
  }

  /**
   * Get agent display info (id, name, avatarUrl)
   * Useful for UI without loading full agent data
   */
  async getDisplayInfo(agentId: string): Promise<{
    id: string;
    name: string;
    avatarUrl?: string;
  } | null> {
    try {
      return await agentsRepository.getDisplayInfo(agentId);
    } catch (error) {
      logger.error(`[Agents Service] Error getting agent display info:`, error);
      return null;
    }
  }

  /**
   * Get agent name
   */
  async getName(agentId: string): Promise<string | null> {
    try {
      const agent = await this.getById(agentId);
      return agent?.name || null;
    } catch (error) {
      logger.error(`[Agents Service] Error getting agent name:`, error);
      return null;
    }
  }

  /**
   * Get agent avatar URL
   */
  async getAvatarUrl(agentId: string): Promise<string | undefined> {
    try {
      return await agentsRepository.getAvatarUrl(agentId);
    } catch (error) {
      logger.error(`[Agents Service] Error getting agent avatar:`, error);
      return undefined;
    }
  }

  // ============================================
  // Room/Message Operations (Uses runtime - for MCP)
  // ============================================

  /**
   * Get or create a room for user-agent conversation
   * @param entityId - User entity ID
   * @param agentId - Agent ID (optional, uses org default)
   * @returns Room ID
   */
  async getOrCreateRoom(entityId: string, agentId: string): Promise<string> {
    try {
      // Use repository to check for existing rooms
      const { participantsRepository } = await import("@/db/repositories");
      const existingRoomIds =
        await participantsRepository.findRoomsByEntityId(entityId);

      if (existingRoomIds && existingRoomIds.length > 0) {
        logger.debug(
          `[Agents Service] Found existing room ${existingRoomIds[0]} for entity ${entityId}`,
        );
        return existingRoomIds[0];
      }

      const room = await roomsService.createRoom({
        agentId,
        entityId,
        source: "chat",
        type: "DM",
      });

      logger.info(
        `[Agents Service] Created new room ${room.id} for entity ${entityId}`,
      );
      return room.id;
    } catch (error) {
      logger.error("[Agents Service] Error getting/creating room:", error);
      throw error;
    }
  }

  /**
   * Send a message to agent and get response
   * NOTE: This uses runtime - only for MCP tool compatibility
   * For web chat, use the streaming endpoint directly
   */
  async sendMessage(input: SendMessageInput): Promise<AgentResponse> {
    const { roomId, message, streaming, attachments } = input;

    // Acquire distributed lock with retry
    const lock = await distributedLocks.acquireRoomLockWithRetry(
      roomId,
      60000,
      {
        maxRetries: 10,
        initialDelayMs: 100,
        maxDelayMs: 2000,
      },
    );

    if (!lock) {
      throw new Error(
        "Room is currently processing another message. Maximum wait time exceeded.",
      );
    }

    try {
      const runtime = await agentRuntime.getRuntime();

      await agentEventEmitter.emitResponseStarted(roomId, runtime.agentId);

      const { message: agentMessage, usage: messageUsage } =
        await agentRuntime.handleMessage(roomId, {
          text: message,
          attachments: attachments || [],
        });

      await agentEventEmitter.emitResponseComplete(
        roomId,
        agentMessage,
        messageUsage || {
          inputTokens: Math.ceil(message.length / 4),
          outputTokens: Math.ceil(
            ((agentMessage.content.text as string) || "").length / 4,
          ),
          model: "eliza-agent",
        },
      );

      await agentStateCache.invalidateRoomContext(roomId);

      return {
        messageId: agentMessage.id!,
        content: agentMessage.content.text as string,
        roomId,
        timestamp: new Date(agentMessage.createdAt || Date.now()),
        usage: {
          inputTokens: Math.ceil(message.length / 4),
          outputTokens: Math.ceil(
            ((agentMessage.content.text as string) || "").length / 4,
          ),
          model: "eliza-agent",
        },
        ...(streaming && {
          streaming: {
            sseUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/mcp/stream?eventType=agent&resourceId=${roomId}`,
          },
        }),
      };
    } finally {
      await lock.release();
    }
  }

  /**
   * Get cached room context or fetch from database
   */
  async getRoomContext(roomId: string): Promise<RoomContext> {
    const cached = await agentStateCache.getRoomContext(roomId);
    if (cached) {
      logger.debug(`[Agents Service] Cache hit for room ${roomId}`);
      return cached;
    }

    logger.debug(
      `[Agents Service] Cache miss for room ${roomId}, fetching from DB`,
    );

    const { memoriesRepository, participantsRepository } = await import(
      "@/db/repositories"
    );

    const messages = await memoriesRepository.findMessages(roomId, {
      limit: 20,
    });
    const participantIds =
      await participantsRepository.getEntityIdsByRoomId(roomId);

    const context: RoomContext = {
      roomId,
      messages,
      participants: participantIds,
      metadata: {},
      lastActivity: new Date(),
    };

    await agentStateCache.setRoomContext(roomId, context);

    return context;
  }
}

// Export singleton instance
export const agentsService = new AgentsService();

// Also export as agentService for backward compatibility with MCP route
export const agentService = agentsService;
