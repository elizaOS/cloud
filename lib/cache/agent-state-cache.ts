import { cache as cacheClient } from "./client";
import { CacheKeys, CacheTTL } from "./keys";
import { logger } from "@/lib/utils/logger";
import type { Memory, UUID } from "@elizaos/core";
import type { ElizaCharacter } from "@/lib/types";

export interface SerializableMessage {
  id: string;
  entityId: string;
  agentId: string;
  roomId: string;
  content: {
    text?: string;
    action?: string;
    source?: string;
  };
  createdAt: number;
}

export interface RoomContext {
  roomId: string;
  messages: Memory[];
  participants: string[];
  metadata: Record<string, unknown>;
  lastActivity: Date;
}

interface SerializableRoomContext {
  roomId: string;
  messages: SerializableMessage[];
  participants: string[];
  metadata: Record<string, unknown>;
  lastActivity: string;
}

export interface UserSession {
  entityId: string;
  preferences: Record<string, unknown>;
  activeRooms: string[];
  lastActivity: Date;
}

export interface AgentStats {
  agentId: string;
  messageCount: number;
  roomCount: number;
  lastActiveAt: Date | null;
  uptime: number;
  status: "deployed" | "stopped" | "draft";
}

export class AgentStateCache {
  /**
   * Get cached room context for agent conversations
   * @param roomId - Room/conversation ID
   * @returns Cached context or null if not found
   */
  async getRoomContext(roomId: string): Promise<RoomContext | null> {
    const key = CacheKeys.agent.roomContext(roomId);

    try {
      // Cache client now handles JSON.parse internally
      const cached = await cacheClient.get<SerializableRoomContext>(key);
      if (!cached) return null;

      const serialized = cached;

      // Convert back to RoomContext with Memory objects
      const context: RoomContext = {
        roomId: serialized.roomId,
        messages: serialized.messages.map(
          (msg) =>
            ({
              id: msg.id as UUID,
              entityId: msg.entityId as UUID,
              agentId: msg.agentId as UUID,
              roomId: msg.roomId as UUID,
              content: msg.content,
              createdAt: msg.createdAt,
            }) as Memory,
        ),
        participants: serialized.participants,
        metadata: serialized.metadata,
        lastActivity: new Date(serialized.lastActivity),
      };

      return context;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error getting room context for ${roomId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache room context for fast retrieval
   * @param roomId - Room/conversation ID
   * @param context - Room context data
   */
  async setRoomContext(roomId: string, context: RoomContext): Promise<boolean> {
    const key = CacheKeys.agent.roomContext(roomId);

    try {
      // Convert Memory objects to serializable format
      const serializable: SerializableRoomContext = {
        roomId: context.roomId,
        messages: context.messages.map((msg) => ({
          id: msg.id?.toString() || "",
          entityId: msg.entityId?.toString() || "",
          agentId: msg.agentId?.toString() || "",
          roomId: msg.roomId?.toString() || "",
          content: {
            text:
              typeof msg.content === "object" && msg.content !== null
                ? (msg.content as { text?: string }).text
                : String(msg.content),
            action:
              typeof msg.content === "object" && msg.content !== null
                ? (msg.content as { action?: string }).action
                : undefined,
            source:
              typeof msg.content === "object" && msg.content !== null
                ? (msg.content as { source?: string }).source
                : undefined,
          },
          createdAt: msg.createdAt || Date.now(),
        })),
        participants: context.participants,
        metadata: context.metadata,
        lastActivity: context.lastActivity.toISOString(),
      };

      // Cache client now handles JSON.stringify internally
      await cacheClient.set(key, serializable, CacheTTL.agent.roomContext);
      logger.debug(`[Agent State Cache] Cached room context for ${roomId}`);
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error caching room context for ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Invalidate room context cache
   * @param roomId - Room to invalidate
   */
  async invalidateRoomContext(roomId: string): Promise<boolean> {
    const key = CacheKeys.agent.roomContext(roomId);

    try {
      await cacheClient.del(key);
      logger.debug(
        `[Agent State Cache] Invalidated room context for ${roomId}`,
      );
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error invalidating room context for ${roomId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get cached character data (expensive to load from DB)
   * @param agentId - Agent/character ID
   * @returns Cached character or null if not found
   */
  async getCharacterData(agentId: string): Promise<ElizaCharacter | null> {
    const key = CacheKeys.agent.characterData(agentId);

    try {
      const cached = await cacheClient.get<ElizaCharacter>(key);
      if (!cached) return null;

      return cached;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error getting character data for ${agentId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache character data for fast retrieval
   * @param agentId - Agent/character ID
   * @param character - Character data
   */
  async setCharacterData(
    agentId: string,
    character: ElizaCharacter,
  ): Promise<boolean> {
    const key = CacheKeys.agent.characterData(agentId);

    try {
      await cacheClient.set(key, character, CacheTTL.agent.characterData);
      logger.debug(`[Agent State Cache] Cached character data for ${agentId}`);
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error caching character data for ${agentId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Invalidate character data cache
   * @param agentId - Agent to invalidate
   */
  async invalidateCharacterData(agentId: string): Promise<boolean> {
    const key = CacheKeys.agent.characterData(agentId);

    try {
      await cacheClient.del(key);
      logger.debug(
        `[Agent State Cache] Invalidated character data for ${agentId}`,
      );
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error invalidating character data for ${agentId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get cached user session state
   * @param entityId - User/entity ID
   * @returns Cached session or null if not found
   */
  async getUserSession(entityId: string): Promise<UserSession | null> {
    const key = CacheKeys.agent.userSession(entityId);

    try {
      const cached = await cacheClient.get<
        UserSession & { lastActivity: string }
      >(key);
      if (!cached) return null;

      const session: UserSession = {
        ...cached,
        lastActivity: new Date(cached.lastActivity),
      };
      return session;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error getting user session for ${entityId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache user session state
   * @param entityId - User/entity ID
   * @param session - Session data
   */
  async setUserSession(
    entityId: string,
    session: UserSession,
  ): Promise<boolean> {
    const key = CacheKeys.agent.userSession(entityId);

    try {
      await cacheClient.set(key, session, CacheTTL.agent.userSession);
      logger.debug(`[Agent State Cache] Cached user session for ${entityId}`);
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error caching user session for ${entityId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get cached agent statistics
   * @param agentId - Agent ID
   * @returns Cached stats or null if not found
   */
  async getAgentStats(agentId: string): Promise<AgentStats | null> {
    const key = CacheKeys.agent.agentStats(agentId);

    try {
      const cached = await cacheClient.get<
        AgentStats & { lastActiveAt: string | null }
      >(key);
      if (!cached) return null;

      const stats: AgentStats = {
        ...cached,
        lastActiveAt: cached.lastActiveAt
          ? new Date(cached.lastActiveAt)
          : null,
      };
      return stats;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error getting agent stats for ${agentId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache agent statistics
   * @param agentId - Agent ID
   * @param stats - Statistics data
   */
  async setAgentStats(agentId: string, stats: AgentStats): Promise<boolean> {
    const key = CacheKeys.agent.agentStats(agentId);

    try {
      await cacheClient.set(key, stats, CacheTTL.agent.agentStats);
      logger.debug(`[Agent State Cache] Cached agent stats for ${agentId}`);
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error caching agent stats for ${agentId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Get cached agent list
   * @param orgId - Organization ID
   * @param filterHash - Hash of filter parameters
   * @returns Cached agent list or null if not found
   */
  async getAgentList(
    orgId: string,
    filterHash: string,
  ): Promise<unknown[] | null> {
    const key = CacheKeys.agent.agentList(orgId, filterHash);

    try {
      const cached = await cacheClient.get<unknown[]>(key);
      if (!cached) return null;

      return cached;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error getting agent list for ${orgId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Cache agent list
   * @param orgId - Organization ID
   * @param filterHash - Hash of filter parameters
   * @param agents - Agent list data
   */
  async setAgentList(
    orgId: string,
    filterHash: string,
    agents: unknown[],
  ): Promise<boolean> {
    const key = CacheKeys.agent.agentList(orgId, filterHash);

    try {
      await cacheClient.set(key, agents, CacheTTL.agent.agentList);
      logger.debug(
        `[Agent State Cache] Cached agent list for ${orgId} (${agents.length} agents)`,
      );
      return true;
    } catch (error) {
      logger.error(
        `[Agent State Cache] Error caching agent list for ${orgId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Invalidate agent list cache for organization
   * @param orgId - Organization ID
   */
  async invalidateAgentList(orgId: string): Promise<boolean> {
    // Need to invalidate all variations of filter hashes
    // In production, you might want to track filter hashes or use a pattern delete
    logger.debug(
      `[Agent State Cache] Invalidating agent lists for org ${orgId}`,
    );
    // For now, we rely on TTL expiry
    // Could implement pattern matching delete if needed
    return true;
  }
}

// Export singleton instance
export const agentStateCache = new AgentStateCache();
